-- ###########################################################################
-- 102 · EL RESCATE DE ENVÍOS A SUNAT LLEVA UN MES FALLANDO CADA CUARTO DE HORA
-- ###########################################################################
--
-- Revisión por módulos del 05/10: el cron «rodatech-sunat-atascados»
-- (rescatar_envios_sunat, cada 15 min) llevaba 2.498 ejecuciones FALLIDAS
-- desde el 09/09, todas con el mismo error:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification
--
-- La 073 cambió la huella de la alerta para que hubiera UNA por comprobante y
-- la escribió como `on conflict (huella) do update`. Pero el índice único es
-- PARCIAL —`ux_alertas_huella … where (not archivada)`—, y para usarlo en un
-- ON CONFLICT hay que repetir su condición. Sin ella la base no lo encuentra,
-- y la sentencia revienta aunque no haya nada que insertar.
--
-- Consecuencia: la alerta «Comprobante sin llegar a SUNAT» no se ha generado
-- NUNCA desde el 09/09. Hoy no ha hecho falta —los 518 comprobantes están
-- aceptados o dados de baja—, pero el día que uno se quede atascado nadie se
-- habría enterado. Y el cron, además, «rescata» envíos en la primera parte de
-- la función: tampoco llegaba a hacer eso, porque la transacción entera caía.
--
-- La 073 lo dio por bueno porque su centinela miraba el TEXTO de la función,
-- no la ejecutaba. Es la lección del CLAUDE.md §2: si es caro de probar, el
-- centinela la EJECUTA. Este lo hace, y prueba además el camino del conflicto.
--
-- El arreglo:
--   · `on conflict (huella) where not archivada`, la condición del índice.
--   · Fuera «volver a abrir una archivada» (archivada = false y el «or
--     alertas.archivada»): con un índice parcial una archivada no choca con
--     nada, así que nunca llegaba aquí. Si alguien archiva el aviso y el
--     comprobante sigue atascado, sale una alerta NUEVA, que es lo que la
--     073 quería: que vuelva a la bandeja.
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.rescatar_envios_sunat()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    -- La condición del índice (ux_alertas_huella es PARCIAL): sin ella la
    -- base no encuentra el índice y la sentencia entera revienta (102).
    on conflict (huella) where not archivada do update
       -- Se refresca en vez de duplicarse: el mensaje trae los días que lleva
       -- —que es lo que distingue un descuido de esta mañana de algo parado
       -- dos semanas— y vuelve a la bandeja aunque ya se hubiera leído, que
       -- es lo que la 052 buscaba metiendo la fecha en la huella.
       set mensaje    = excluded.mensaje,
           valor      = excluded.valor,
           severidad  = excluded.severidad,
           generada_en = now(),
           leida      = false
     where alertas.mensaje is distinct from excluded.mensaje
        or alertas.leida
    returning 1
  )
  select count(*) into v_avisados from nuevas;

  return jsonb_build_object('rescatados', v_rescatados, 'avisados', v_avisados);
end $function$;


-- ###########################################################################
-- Centinela · SE EJECUTA Y SE DESHACE (regla de la 091)
-- ###########################################################################
do $$
declare
  v_r jsonb; v_fallo text; v_veces int; v_mensaje text; v_huella text := 'sunat_atascado:__102__';
begin
  begin
    -- 1. La función entera, de verdad: es lo que fallaba cada 15 minutos.
    v_r := public.rescatar_envios_sunat();

    -- 2. El camino del conflicto, con la MISMA cláusula que la función.
    insert into alertas (tipo, severidad, titulo, mensaje, huella)
    values ('sunat_atascado', 'alta', 'Prueba 102', 'primero', v_huella);
    insert into alertas (tipo, severidad, titulo, mensaje, huella)
    values ('sunat_atascado', 'alta', 'Prueba 102', 'segundo', v_huella)
    on conflict (huella) where not archivada do update set mensaje = excluded.mensaje;
    select count(*), max(mensaje) into v_veces, v_mensaje from alertas where huella = v_huella;

    raise exception using message = '__102_DESHACER__';
  exception when others then
    if sqlerrm <> '__102_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  if v_fallo is not null then
    raise exception '102: el centinela se rompió: %', v_fallo;
  end if;
  if v_r is null or not (v_r ? 'avisados') then
    raise exception '102: rescatar_envios_sunat devolvió %', v_r;
  end if;
  if v_veces <> 1 or v_mensaje <> 'segundo' then
    raise exception '102: el conflicto dejó % filas con «%»', v_veces, v_mensaje;
  end if;
  raise notice '102: rescatar_envios_sunat corre (%), y una alerta repetida se refresca en vez de duplicarse.', v_r;
end $$;
