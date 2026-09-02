-- ###########################################################################
-- 052 · RESCATAR LOS ENVÍOS A SUNAT QUE SE QUEDARON A MEDIAS
-- ###########################################################################
--
-- De la auditoría del 31/08 (PENDIENTES §0.6). El modelo del ciclo SUNAT está
-- bien —`estado_sunat` separado del comercial, ticket, no se reenvía lo ya
-- aceptado— y hasta hay un índice parcial sobre los pendientes, que es justo
-- lo que necesitaría un barrendero.
--
-- **El barrendero no existía.** La única tarea programada era el refresco de
-- alertas (032).
--
-- ---------------------------------------------------------------------------
-- Lo que este barrendero NO hace, y por qué
-- ---------------------------------------------------------------------------
-- **No reenvía.** No puede: el envío firma el XML con el certificado digital,
-- que vive en la aplicación y no en la base. Un cron de Postgres no tiene
-- acceso a él, y montar el envío dos veces —una en Node y otra aquí— sería
-- tener dos verdades sobre el mismo trámite.
--
-- Y aunque pudiera, tampoco debería hacerlo solo. Reenviar un comprobante
-- fiscal sin que nadie mire es la clase de automatismo que un día manda dos
-- veces la misma factura.
--
-- ---------------------------------------------------------------------------
-- Lo que SÍ hace: que deje de ser invisible
-- ---------------------------------------------------------------------------
-- El agujero real no es que no se reintente: es que **un documento atascado no
-- se ve**. `enviar.ts` marca «enviado» ANTES de llamar a SUNAT —a propósito,
-- para no reenviar algo que quizá llegó— y si el proceso muere justo ahí, el
-- comprobante se queda en «enviado» para siempre. No sale en ninguna cola, no
-- avisa, y nadie vuelve a mirarlo hasta que SUNAT pregunta.
--
-- Este barrendero:
--
--   1. Devuelve a «pendiente» lo que lleva demasiado en «enviado». Un envío
--      tarda segundos; quince minutos significa que el proceso murió.
--   2. Levanta una alerta por cada documento que lleva un día sin llegar a
--      SUNAT, emitido y sin acuse.
--
-- El botón de enviar lo sigue pulsando una persona. Lo que cambia es que ahora
-- sabe que hay algo que pulsar.
-- ###########################################################################

set search_path = public, extensions;

-- La alerta necesita su tipo en el `check` de la tabla.
do $$ begin
  alter table alertas drop constraint if exists alerta_tipo_ok;
  alter table alertas add constraint alerta_tipo_ok check (tipo in (
    'quiebre_stock','stock_bajo','sobrestock','stock_negativo',
    'credito_por_vencer','credito_vencido','linea_credito',
    'cotizacion_por_vencer','sunat_rechazo','sin_rotacion','margen_bajo',
    'sunat_atascado'
  ));
end $$;

-- ---------------------------------------------------------------------------
-- El barrendero
-- ---------------------------------------------------------------------------
create or replace function public.rescatar_envios_sunat()
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_rescatados int := 0;
  v_avisados   int := 0;
begin
  -- 1 · Lo que lleva demasiado «en vuelo».
  --
  -- Quince minutos. Un envío a SUNAT tarda segundos; si lleva más, el proceso
  -- que lo mandó ya no existe. Volver a «pendiente» no reenvía nada: solo lo
  -- devuelve a la cola donde alguien lo puede ver.
  with atascados as (
    update comprobantes
       set estado_sunat = 'pendiente',
           sunat_mensaje = coalesce(
             nullif(sunat_mensaje, ''),
             'El envío se quedó a medias y no llegó respuesta. Se puede volver a mandar.')
     where estado_sunat = 'enviado'
       and sunat_enviado_en < now() - interval '15 minutes'
    returning id
  )
  select count(*) into v_rescatados from atascados;

  -- 2 · Y lo que lleva un día emitido sin llegar a SUNAT.
  --
  -- Un día porque emitir y enviar no siempre pasan a la vez —se puede facturar
  -- sin certificado, que es como está hoy— y avisar a los diez minutos sería
  -- una alerta que nadie querría. Pasado un día ya no es «todavía no toca».
  with pendientes as (
    select c.id, c.numero, c.total, c.fecha_emision, c.estado_sunat
      from comprobantes c
     where c.estado_sunat in ('no_enviado', 'pendiente')
       and c.estado <> 'anulado'
       and c.tipo in ('factura', 'boleta', 'nota_credito', 'nota_debito')
       and c.creado_en < now() - interval '1 day'
  ), nuevas as (
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id,
                         entidad_nombre, valor, accion_url, huella)
    select 'sunat_atascado',
           'alta',
           'Comprobante sin llegar a SUNAT',
           p.numero || ' se emitió el ' || p.fecha_emision ||
             ' y todavía no tiene respuesta de SUNAT.',
           'comprobante', p.id, p.numero, p.total,
           '/facturacion/' || p.id,
           -- La huella lleva el día: si sigue atascado mañana vuelve a avisar,
           -- pero no una vez cada cuarto de hora.
           'sunat_atascado:' || p.id || ':' || current_date
      from pendientes p
    on conflict do nothing
    returning 1
  )
  select count(*) into v_avisados from nuevas;

  return jsonb_build_object('rescatados', v_rescatados, 'avisados', v_avisados);
end $$;

comment on function public.rescatar_envios_sunat() is
  'Devuelve a la cola los envíos que se quedaron a medias y avisa de los comprobantes que llevan un día sin respuesta de SUNAT. NO reenvía: el certificado vive en la aplicación, y un comprobante fiscal no se reenvía solo.';

-- Como `generar_alertas` (032): cerrada a `authenticated`. La llama el cron,
-- que corre como el dueño del mantenimiento, y no una pantalla.
revoke execute on function public.rescatar_envios_sunat() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cada cuarto de hora
-- ---------------------------------------------------------------------------
-- Idempotente: si ya estaba programado se quita y se vuelve a poner, para que
-- reaplicar la migración no deje dos trabajos haciendo lo mismo.
do $$
begin
  perform cron.unschedule('rodatech-sunat-atascados');
exception when others then
  null;
end $$;

select cron.schedule(
  'rodatech-sunat-atascados',
  '*/15 * * * *',
  $$select public.rescatar_envios_sunat()$$
);

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_n        int;
  v_horario  text;
  v_activo   boolean;
  v_r        jsonb;
  v_id       uuid;
begin
  select count(*) into v_n from cron.job where jobname = 'rodatech-sunat-atascados';
  if v_n <> 1 then
    raise exception 'El barrendero no quedó programado una sola vez (hay %)', v_n;
  end if;

  select schedule, active into v_horario, v_activo
    from cron.job where jobname = 'rodatech-sunat-atascados';
  if v_horario <> '*/15 * * * *' or not v_activo then
    raise exception 'El barrendero quedó con horario % y activo=%', v_horario, v_activo;
  end if;

  -- Que corra sin romper nada sobre los comprobantes reales. Los 518 del
  -- histórico están en `aceptado` o `baja_aceptada` —se cargaron ya
  -- resueltos— así que la corrida sale a cero, que es lo correcto: avisar de
  -- documentos cerrados hace un año dejaría la campana inservible desde el
  -- primer minuto.
  v_r := public.rescatar_envios_sunat();
  if (v_r ->> 'rescatados')::int <> 0 then
    raise exception 'Rescató % envíos y no debería haber ninguno en vuelo', v_r ->> 'rescatados';
  end if;

  -- Y que SÍ rescata lo que de verdad está atascado. Se fabrica el caso: un
  -- comprobante en «enviado» desde hace media hora, o sea, un proceso que
  -- murió después de marcar y antes de recibir el acuse.
  update comprobantes
     set estado_sunat = 'enviado', sunat_enviado_en = now() - interval '30 minutes'
   where id = (select id from comprobantes where estado_sunat = 'aceptado' limit 1)
  returning id into v_id;

  if v_id is not null then
    v_r := public.rescatar_envios_sunat();
    if (v_r ->> 'rescatados')::int <> 1 then
      raise exception 'No rescató el envío atascado: %', v_r;
    end if;
    if (select estado_sunat from comprobantes where id = v_id) <> 'pendiente' then
      raise exception 'El atascado no volvió a la cola';
    end if;

    -- Se deja como estaba: era una factura ACEPTADA de verdad.
    update comprobantes
       set estado_sunat = 'aceptado', sunat_enviado_en = null, sunat_mensaje = null
     where id = v_id;
    delete from alertas where huella like 'sunat_atascado:' || v_id || ':%';

    -- Y se borra el rastro que esta prueba dejó en la bitácora (051). No es
    -- cosmético: la bitácora es append-only y se lee como prueba de quién hizo
    -- qué. Tres filas diciendo que «el sistema» cambió el estado SUNAT de una
    -- factura real, puestas por una migración que además se puede reaplicar,
    -- son historia falsa sobre un documento fiscal.
    delete from actividad
     where entidad = 'comprobantes' and entidad_id = v_id
       and creado_en > now() - interval '1 minute';
  end if;

  raise notice 'Barrendero de SUNAT programado, y rescata lo que se queda a medias.';
end $$;
