-- ###########################################################################
-- 073 · UNA ALERTA POR COMPROBANTE, NO UNA POR DÍA
-- ###########################################################################
--
-- El tablero del 09/09 enseñaba esto, con **un solo** comprobante emitido:
--
--     Alta · Comprobante sin llegar a SUNAT · F001-00000001 …
--     Alta · Comprobante sin llegar a SUNAT · F001-00000001 …
--     Alta · Comprobante sin llegar a SUNAT · F001-00000001 …
--     Alta · Comprobante sin llegar a SUNAT · F001-00000001 …
--     Alta · Comprobante sin llegar a SUNAT · F001-00000001 …
--
-- Cinco avisos idénticos del mismo documento, uno por cada día que llevaba
-- sin enviarse. En un mes serían treinta, y con tres comprobantes atascados
-- —lo normal mientras no haya certificado— serían noventa.
--
-- ---------------------------------------------------------------------------
-- La causa: la huella llevaba el día dentro
-- ---------------------------------------------------------------------------
-- La 052 la construía así, y dejó escrito el porqué:
--
--     'sunat_atascado:' || p.id || ':' || current_date
--     -- La huella lleva el día: si sigue atascado mañana vuelve a avisar,
--     -- pero no una vez cada cuarto de hora.
--
-- La intención era buena —el barrendero corre cada cuarto de hora y sin nada
-- que lo frenara avisaría 96 veces al día— y el remedio elegido rompe lo
-- único que la huella sirve para hacer: **ser única por problema**. Con la
-- fecha dentro, cada día es un problema nuevo para la base y el mismo
-- problema para quien mira.
--
-- Y el panel de alertas es de las pocas pantallas donde el ruido no es
-- incomodidad sino avería: cinco copias de lo mismo enseñan a no leerlas, y
-- entonces la que sí importa tampoco se lee.
--
-- ---------------------------------------------------------------------------
-- El arreglo: una alerta que se refresca en vez de multiplicarse
-- ---------------------------------------------------------------------------
-- La huella pierde el día. Si el comprobante sigue atascado, no hace falta un
-- aviso nuevo: hace falta que el que ya está siga ahí y esté al día. Así que
-- cuando la alerta ya existe se ACTUALIZA:
--
--   · el mensaje dice cuántos días lleva, que es lo que decide si esto es un
--     descuido de esta mañana o algo que lleva parado dos semanas;
--   · y vuelve a marcarse como no leída, que es lo que la 052 quería
--     conseguir con la fecha —volver a avisar mañana— pero sin dejar rastro.
--
-- Se borra sola cuando el comprobante llega a SUNAT: eso ya lo hacía la 052.
--
-- ---------------------------------------------------------------------------
-- Y se limpian las que ya se acumularon
-- ---------------------------------------------------------------------------
-- Se deja la más reciente de cada comprobante y se borran las demás. No se
-- borran todas para volver a crearlas: si alguna estaba leída o archivada,
-- recrearla la devolvería a la bandeja de alguien que ya la había atendido.
-- ###########################################################################

set local search_path = public, extensions;

-- ###########################################################################
-- 1 · Las duplicadas que ya existen
-- ###########################################################################
with ordenadas as (
  select id,
         row_number() over (
           partition by entidad_id
           order by generada_en desc
         ) as puesto
    from alertas
   where tipo = 'sunat_atascado'
)
delete from alertas a
 using ordenadas o
 where a.id = o.id
   and o.puesto > 1;

-- La que sobrevive se queda con la huella nueva, sin fecha, para que el
-- `on conflict` la reconozca a partir de ahora en vez de crear otra.
update alertas
   set huella = 'sunat_atascado:' || entidad_id
 where tipo = 'sunat_atascado'
   and huella <> 'sunat_atascado:' || entidad_id;

-- ###########################################################################
-- 2 · Que no vuelvan a acumularse
-- ###########################################################################
create or replace function public.rescatar_envios_sunat()
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_rescatados int;
  v_avisados   int;
begin
  -- 1 · Los envíos que se quedaron a medias vuelven a la cola.
  with atascados as (
    update comprobantes
       set estado_sunat = 'pendiente', sunat_enviado_en = null
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
    select c.id, c.numero, c.total, c.fecha_emision, c.creado_en
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
           p.numero || ' se emitió el ' || p.fecha_emision || ' y lleva ' ||
             greatest(1, (current_date - p.creado_en::date)) ||
             case when (current_date - p.creado_en::date) = 1
                  then ' día sin respuesta de SUNAT.'
                  else ' días sin respuesta de SUNAT.' end,
           'comprobante', p.id, p.numero, p.total,
           '/facturacion/' || p.id,
           -- SIN el día (073). Una alerta por comprobante: si mañana sigue
           -- atascado se actualiza la que hay, no se añade otra.
           'sunat_atascado:' || p.id
      from pendientes p
    on conflict (huella) do update
       -- Se refresca en vez de duplicarse: el mensaje trae los días que lleva
       -- —que es lo que distingue un descuido de esta mañana de algo parado
       -- dos semanas— y vuelve a la bandeja aunque ya se hubiera leído, que
       -- es lo que la 052 buscaba metiendo la fecha en la huella.
       set mensaje    = excluded.mensaje,
           valor      = excluded.valor,
           severidad  = excluded.severidad,
           generada_en = now(),
           leida      = false,
           archivada  = false
     where alertas.mensaje is distinct from excluded.mensaje
        or alertas.leida
        or alertas.archivada
    returning 1
  )
  select count(*) into v_avisados from nuevas;

  return jsonb_build_object('rescatados', v_rescatados, 'avisados', v_avisados);
end $$;

comment on function public.rescatar_envios_sunat() is
  'Devuelve a la cola los envíos que se quedaron a medias y avisa de los comprobantes que llevan un día sin respuesta de SUNAT. NO reenvía: el certificado vive en la aplicación, y un comprobante fiscal no se reenvía solo. Desde la 073 la alerta es UNA por comprobante y se refresca con los días que lleva, en vez de acumular una por día.';

-- ###########################################################################
-- Centinela
-- ###########################################################################
do $$
declare
  v_def text;
  v_n   int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rescatar_envios_sunat';

  -- La huella no puede volver a llevar la fecha. Es el fallo entero.
  if v_def like '%p.id || '':'' || current_date%' then
    raise exception 'La huella de sunat_atascado volvió a llevar el día: se acumularía una alerta diaria';
  end if;

  if v_def not like '%on conflict (huella) do update%' then
    raise exception 'rescatar_envios_sunat ya no refresca la alerta existente';
  end if;

  -- Y que no quede ninguna duplicada tras la limpieza.
  select count(*) into v_n
    from (
      select entidad_id
        from alertas
       where tipo = 'sunat_atascado'
       group by entidad_id
      having count(*) > 1
    ) d;
  if v_n > 0 then
    raise exception 'Quedan % comprobantes con más de una alerta de sunat_atascado', v_n;
  end if;
end $$;
