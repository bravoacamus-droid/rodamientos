-- ###########################################################################
-- 159 · LOS AVISOS QUE FALTABAN, Y ESCRITOS PARA LEERSE (27/10)
-- ###########################################################################
--
-- La auditoría de trazabilidad del 27/10 (TR-10, UI1-02). Tres problemas en la
-- misma función, `generar_alertas()`, que corre cada mañana en el cron y es lo
-- único que llega al panel de alertas del tablero —lo que Willy ve—:
--
-- 1 · Cuatro cosas que fallan y solo constaban en pantallas donde nadie entra
--     si todo va bien:
--
--       - la copia de seguridad atrasada (147): solo en «Datos de la empresa»;
--       - la guía rechazada u observada por SUNAT (126): solo en /sunat;
--       - la baja rechazada por SUNAT (125): solo en /sunat;
--       - los errores del sistema sin revisar: solo en /actividad.
--
--     Ahora son cuatro tipos de alerta, cada uno con su huella y con su
--     archivado automático como la 151 y la 156: cuando deja de ser verdad, la
--     alerta se va sola.
--
-- 2 · Los mensajes se leían mal. En la misma lista convivían «vence
--     27/09/2026» y «se emitió el 2026-10-14», y los importes salían como
--     «saldo USD 1006.48», sin coma de miles y con un «USD» que el resto del
--     ERP escribe «$». Ahora todas las fechas van DD/MM/YYYY, los importes con
--     separador de miles y el símbolo de su moneda (una factura en soles dice
--     «S/ », y antes decía «USD» con el saldo en soles), y las cantidades sin
--     ceros de relleno («saldo -1», no «saldo -1.00»).
--
--     La fecha cruda salía de `rescatar_envios_sunat()` (102), no de
--     `generar_alertas`, y se arregla aquí también. Esa alerta se refresca
--     cuando cambia el mensaje, así que la de F001-00000001 se reescribe sola
--     en la próxima pasada del rescate.
--
--     LAS ALERTAS YA GENERADAS CONSERVAN SU TEXTO: el mensaje se escribe al
--     crearlas y esta migración no toca filas. Las de cartera, stock y línea
--     de crédito llevan la semana en la huella y se renuevan solas el lunes;
--     la 151 archiva entonces la vieja.
--
-- 3 · Las rutas de la 021 no estaban en la base. La 021 corrigió tres enlaces
--     que llevaban a un 404 (/inventario/productos/{id}, /inventario/ajustes y
--     /cobranzas/{id}) y la función viva el 27/10 seguía guardándolos: diez
--     alertas de cartera abiertas apuntaban a /cobranzas/{id}, que no existe.
--     Es el «¿cuántas más faltan?» de CLAUDE.md §4. Como esto reescribe la
--     función entera, vuelven las rutas buenas. Las alertas abiertas con la
--     ruta rota se quedan como están (ver el informe de la 159 para Luis).
--
-- Se reescribe la función entera, partiendo del texto vivo del 27/10 (con la
-- 151 y la 156 dentro), porque cambia casi cada mensaje: un parche por ancla
-- por cada uno sería más frágil que el texto completo.

set search_path = public, extensions;

alter table public.alertas drop constraint if exists alerta_tipo_ok;
alter table public.alertas add constraint alerta_tipo_ok check (tipo = any (array[
  'quiebre_stock', 'stock_bajo', 'sobrestock', 'stock_negativo', 'credito_por_vencer',
  'credito_vencido', 'linea_credito', 'cotizacion_por_vencer', 'sunat_rechazo',
  'sin_rotacion', 'margen_bajo', 'sunat_atascado', 'certificado_por_vencer',
  -- 159
  'respaldo_atrasado', 'gre_rechazo', 'baja_rechazada', 'fallos_pendientes']));

create or replace function public.generar_alertas()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_nuevas int := 0; v_n int;
  -- 159: los mismos siete días que `DIAS_MAXIMOS_SIN_COPIA` en
  -- apps/web/src/modules/configuracion/dominio/respaldo.ts. Si cambia uno,
  -- cambia el otro: es lo que «Datos de la empresa» llama «atrasada».
  c_dias_sin_copia constant int := 7;
  v_ultima_copia timestamptz;
  v_huella_copia text;
  v_fallos int;
  v_fallo record;
begin
  -- Quiebre y stock bajo -----------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select case when coalesce(s.cantidad,0) <= 0 then 'quiebre_stock' else 'stock_bajo' end,
         case when coalesce(s.cantidad,0) <= 0 then 'critica'::severidad_alerta else 'alta'::severidad_alerta end,
         case when coalesce(s.cantidad,0) <= 0 then 'Quiebre de stock' else 'Stock bajo el mínimo' end,
         p.codigo || ' · ' || p.descripcion || ' — quedan ' || trim_scale(coalesce(s.cantidad,0)) ||
           ' (mínimo ' || trim_scale(p.stock_minimo) || ')',
         'producto', p.id, p.codigo, coalesce(s.cantidad,0),
         '/productos/' || p.id,
         'stock:' || p.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from productos p
  left join stock s on s.producto_id = p.id
  where not p.archivado
    and p.stock_minimo > 0
    and coalesce(s.cantidad, 0) <= p.stock_minimo
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Sobrestock / capital inmovilizado (25:21) ---------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'sobrestock', 'media',
         'Sobrestock · capital inmovilizado',
         p.codigo || ' · ' || p.descripcion || ' — ' || trim_scale(s.cantidad) || ' unidades (máximo ' ||
           trim_scale(p.stock_maximo) || '), valen $ ' || to_char(round(s.valorizado, 2), 'FM999,999,990.00'),
         'producto', p.id, p.codigo, round(s.valorizado, 2),
         '/productos/' || p.id,
         'sobrestock:' || p.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from productos p
  join stock s on s.producto_id = p.id
  where not p.archivado and p.stock_maximo > 0 and s.cantidad > p.stock_maximo
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Saldo negativo: siempre es un error de operación que hay que cuadrar.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'stock_negativo', 'critica', 'Saldo negativo en almacén',
         p.codigo || ' · saldo ' || trim_scale(s.cantidad) || '. Hay que cuadrarlo con un ajuste de inventario.',
         'producto', p.id, p.codigo, s.cantidad, '/inventario/ajuste',
         'negativo:' || p.id::text || ':' || to_char(current_date, 'YYYY-MM-DD')
  from stock s join productos p on p.id = s.producto_id
  where s.cantidad < 0
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Cartera vencida y por vencer ----------------------------------------------
  -- El saldo va en la moneda de la factura: antes decía «USD» también en las
  -- de soles.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select case when c.fecha_vencimiento < current_date then 'credito_vencido' else 'credito_por_vencer' end,
         case when c.fecha_vencimiento < current_date - 30 then 'critica'::severidad_alerta
              when c.fecha_vencimiento < current_date then 'alta'::severidad_alerta
              else 'media'::severidad_alerta end,
         case when c.fecha_vencimiento < current_date then 'Factura vencida' else 'Factura por vencer' end,
         c.numero || ' · ' || cl.razon_social || ' — debe ' ||
           case when c.moneda = 'PEN' then 'S/ ' else '$ ' end ||
           to_char(c.saldo, 'FM999,999,990.00') ||
           case when c.fecha_vencimiento < current_date then ', venció el ' else ', vence el ' end ||
           to_char(c.fecha_vencimiento, 'DD/MM/YYYY'),
         'comprobante', c.id, c.numero, c.saldo, '/facturacion/' || c.id,
         'cartera:' || c.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.estado in ('emitido','parcial','vencido')
    and c.saldo > 0
    and c.fecha_vencimiento is not null
    and c.fecha_vencimiento <= current_date + 7
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Línea de crédito excedida --------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'linea_credito', 'alta', 'Línea de crédito excedida',
         cl.razon_social || ' — debe $ ' || to_char(round(x.saldo, 2), 'FM999,999,990.00') ||
           ' y su línea de crédito es de $ ' || to_char(cl.linea_credito, 'FM999,999,990.00'),
         'cliente', cl.id, cl.razon_social, round(x.saldo, 2), '/clientes/' || cl.id,
         'linea:' || cl.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from clientes cl
  join lateral (
    select coalesce(sum(c.saldo), 0) as saldo
    from comprobantes c
    where c.cliente_id = cl.id and c.estado in ('emitido','parcial','vencido')
  ) x on true
  where cl.linea_credito > 0 and x.saldo > cl.linea_credito
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Cotizaciones por vencer -----------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'cotizacion_por_vencer', 'baja', 'Cotización por vencer',
         q.numero || ' · ' || cl.razon_social || ' — vence el ' || to_char(q.fecha_vencimiento, 'DD/MM/YYYY'),
         'cotizacion', q.id, q.numero, q.total, '/cotizaciones/' || q.id,
         'cotiz:' || q.id::text
  from cotizaciones q join clientes cl on cl.id = q.cliente_id
  where q.estado in ('enviada','aprobada')
    and q.fecha_vencimiento between current_date and current_date + 3
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Rechazos de SUNAT -----------------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'sunat_rechazo', 'critica', 'Comprobante rechazado por SUNAT',
         c.numero || ' — ' || coalesce(c.sunat_codigo_respuesta, '') || ' ' || coalesce(c.sunat_mensaje, ''),
         'comprobante', c.id, c.numero, c.total, '/facturacion/' || c.id,
         'sunat:' || c.id::text || ':' || coalesce(c.sunat_codigo_respuesta, 'x')
  from comprobantes c
  where c.estado_sunat in ('rechazado','observado')
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- 159: guías rechazadas u observadas por SUNAT (126). Solo se veían en /sunat.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'gre_rechazo',
         case when g.estado_sunat = 'rechazado' then 'critica'::severidad_alerta
              else 'alta'::severidad_alerta end,
         case when g.estado_sunat = 'rechazado' then 'Guía rechazada por SUNAT'
              else 'Guía observada por SUNAT' end,
         g.numero || ' del ' || to_char(g.fecha_emision, 'DD/MM/YYYY') || ' — ' ||
           coalesce(nullif(trim(coalesce(g.sunat_codigo_respuesta, '') || ' ' || coalesce(g.sunat_mensaje, '')), ''),
                    'SUNAT no dio el motivo.'),
         'guia', g.id, g.numero, null, '/guias/' || g.id,
         'gre:' || g.id::text || ':' || coalesce(g.sunat_codigo_respuesta, 'x')
  from guias_remision g
  where g.estado_sunat in ('rechazado','observado')
    and g.estado <> 'anulada'
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- 159: bajas que SUNAT rechazó (125). Mientras no se acepte la baja, para
  -- SUNAT esos comprobantes siguen vigentes.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'baja_rechazada', 'critica', 'SUNAT rechazó una baja',
         b.identificador || ' del ' || to_char(b.fecha_comunicacion, 'DD/MM/YYYY') || ' — ' ||
           cardinality(b.comprobantes) ||
           case when cardinality(b.comprobantes) = 1 then ' comprobante que sigue vigente ante SUNAT. '
                else ' comprobantes que siguen vigentes ante SUNAT. ' end ||
           coalesce(nullif(trim(coalesce(b.codigo, '') || ' ' || coalesce(b.mensaje, '')), ''),
                    'SUNAT no dio el motivo.'),
         'baja', b.id, b.identificador, cardinality(b.comprobantes), '/sunat',
         'baja:' || b.id::text
  from sunat_bajas b
  where b.estado = 'rechazada'
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- 159: la copia de seguridad (147). Atrasada es lo mismo que en «Datos de la
  -- empresa»: ninguna buena en los últimos siete días, o ninguna nunca. La
  -- huella lleva el día de la última buena: al hacer otra, la vieja sobra.
  select max(r.fecha) into v_ultima_copia from respaldos r where r.ok;
  if v_ultima_copia is null or v_ultima_copia < now() - make_interval(days => c_dias_sin_copia) then
    v_huella_copia := 'respaldo:' || coalesce(to_char(v_ultima_copia at time zone 'America/Lima', 'YYYY-MM-DD'), 'nunca');
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
    values ('respaldo_atrasado', 'alta',
            case when v_ultima_copia is null then 'No hay ninguna copia de seguridad'
                 else 'La copia de seguridad está atrasada' end,
            case when v_ultima_copia is null
                 then 'Nunca se hizo una copia de seguridad que saliera bien. Si hoy se rompe algo, se pierde todo.'
                 else 'La última copia que salió bien es del ' ||
                      to_char(v_ultima_copia at time zone 'America/Lima', 'DD/MM/YYYY') ||
                      '. Si hoy se rompe algo, se pierde todo lo hecho desde ese día.' end,
            null, null, 'Copia de seguridad',
            case when v_ultima_copia is null then null
                 else (current_date - (v_ultima_copia at time zone 'America/Lima')::date) end,
            '/configuracion/empresa', v_huella_copia)
    on conflict do nothing;
    get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;
  end if;

  -- 159: errores del sistema sin revisar de la última semana. Una sola alerta
  -- viva, que se refresca con la cuenta (como la del rescate de SUNAT, 102):
  -- lo que importa es cuántos hay y el último, no uno por error.
  select count(*) into v_fallos
    from fallos f where not f.revisado and f.ultima_vez > now() - interval '7 days';
  if v_fallos > 0 then
    select f.ultima_vez, f.mensaje into v_fallo
      from fallos f where not f.revisado and f.ultima_vez > now() - interval '7 days'
     order by f.ultima_vez desc limit 1;
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
    values ('fallos_pendientes', 'media', 'Errores del sistema sin revisar',
            v_fallos || case when v_fallos = 1 then ' error sin revisar' else ' errores sin revisar' end ||
              ' en los últimos 7 días. El último, el ' ||
              to_char(v_fallo.ultima_vez at time zone 'America/Lima', 'DD/MM/YYYY') || ': «' ||
              left(coalesce(v_fallo.mensaje, ''), 120) || '».',
            null, null, 'Errores del sistema', v_fallos, '/actividad', 'fallos_pendientes')
    on conflict (huella) where not archivada do update
       set mensaje     = excluded.mensaje,
           valor       = excluded.valor,
           generada_en = now(),
           leida       = false
     where alertas.mensaje is distinct from excluded.mensaje;
    get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;
  end if;

  -- 156: el certificado digital, desde 30 días antes de caducar.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'certificado_por_vencer',
         case when cs.certificado_caduca_en <= current_date + 7 then 'critica'::severidad_alerta
              else 'alta'::severidad_alerta end,
         case when cs.certificado_caduca_en < current_date then 'El certificado digital caducó'
              else 'El certificado digital va a caducar' end,
         'Caduca el ' || to_char(cs.certificado_caduca_en, 'DD/MM/YYYY') ||
           '. Sin certificado vigente SUNAT rechaza todas las facturas: hay que renovarlo y subir el nuevo.',
         null, null, coalesce(cs.certificado_nombre, 'Certificado digital'),
         (cs.certificado_caduca_en - current_date), '/configuracion/sunat',
         'certificado:' || to_char(cs.certificado_caduca_en, 'YYYY-MM-DD')
    from config_sunat cs
   where cs.certificado_caduca_en is not null
     and cs.certificado_caduca_en <= current_date + 30
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- 156: al subir otro certificado, el aviso del anterior sobra.
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'certificado_por_vencer'
     and not exists (select 1 from config_sunat cs
                      where cs.certificado_caduca_en <= current_date + 30
                        and a.huella = 'certificado:' || to_char(cs.certificado_caduca_en, 'YYYY-MM-DD'));

  -- 159: lo de los cuatro avisos nuevos que dejó de ser verdad.
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'gre_rechazo'
     and not exists (select 1 from guias_remision g
                      where g.id = a.entidad_id and g.estado_sunat in ('rechazado','observado')
                        and g.estado <> 'anulada');
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'baja_rechazada'
     and not exists (select 1 from sunat_bajas b where b.id = a.entidad_id and b.estado = 'rechazada');
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'respaldo_atrasado'
     and a.huella is distinct from v_huella_copia;
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'fallos_pendientes' and v_fallos = 0;

  -- 151 · 1: lo que dejó de ser verdad se archiva solo.
  update alertas a set archivada = true
   where not a.archivada and a.tipo in ('credito_vencido', 'credito_por_vencer')
     and not exists (select 1 from comprobantes c
                      where c.id = a.entidad_id and c.estado in ('emitido','parcial','vencido') and c.saldo > 0);
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'cotizacion_por_vencer'
     and not exists (select 1 from cotizaciones q
                      where q.id = a.entidad_id and q.estado in ('enviada','aprobada')
                        and q.fecha_vencimiento >= current_date);
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'stock_negativo'
     and not exists (select 1 from stock s where s.producto_id = a.entidad_id and s.cantidad < 0);
  update alertas a set archivada = true
   where not a.archivada and a.tipo in ('quiebre_stock', 'stock_bajo')
     and not exists (select 1 from productos p left join stock s on s.producto_id = p.id
                      where p.id = a.entidad_id and not p.archivado and p.stock_minimo > 0
                        and coalesce(s.cantidad, 0) <= p.stock_minimo);

  -- 151 · 2: de lo vivo, una por cosa: la más reciente.
  update alertas a set archivada = true
   where not a.archivada and a.entidad_id is not null
     and exists (select 1 from alertas b
                  where not b.archivada and b.entidad_id = a.entidad_id
                    and split_part(b.huella, ':', 1) = split_part(a.huella, ':', 1)
                    and (b.generada_en, b.id) > (a.generada_en, a.id));

  return jsonb_build_object('nuevas', v_nuevas, 'generado_en', now());
end $function$;

-- La fecha cruda de «se emitió el 2026-10-14» salía del rescate (102).
do $$
declare
  v_def text := replace(pg_get_functiondef('public.rescatar_envios_sunat()'::regprocedure), E'\r\n', E'\n');
  v_viejo text := $a$p.numero || ' se emitió el ' || p.fecha_emision || ' y lleva ' ||$a$;
begin
  if position(v_viejo in v_def) = 0 then
    if position($a$to_char(p.fecha_emision, 'DD/MM/YYYY')$a$ in v_def) > 0 then
      raise notice '159: el rescate ya escribía la fecha DD/MM/YYYY.';
      return;
    end if;
    raise exception '159: no encontré la fecha del rescate de SUNAT';
  end if;
  v_def := replace(v_def, v_viejo,
    $a$p.numero || ' se emitió el ' || to_char(p.fecha_emision, 'DD/MM/YYYY') || ' y lleva ' ||$a$);
  execute v_def;
end $$;

-- Centinela: se EJECUTAN las dos funciones sobre la base real, dentro de un
-- bloque que sale por excepción y lo deshace todo.
--
--   - Con las alertas vivas archivadas, todo lo que se genera de nuevo lleva
--     las fechas DD/MM/YYYY y ningún «USD».
--   - Una guía forzada a «rechazado» avisa, con su fecha en DD/MM/YYYY, y al
--     volver a «pendiente» el aviso se archiva.
--   - Una baja rechazada avisa y, aceptada, se archiva.
--   - Sin copia buena en una semana avisa; con una copia de hoy, se archiva.
--   - Con un error sin revisar avisa; revisados todos, se archiva.
--   - El rescate de SUNAT ya no escribe la fecha cruda.
do $$
declare
  v_guia uuid; v_baja uuid; v_n int; v_malos text;
  v_fecha_iso constant text := '[0-9]{4}-[0-9]{2}-[0-9]{2}';
begin
  begin
    update alertas set archivada = true where not archivada;
    perform public.generar_alertas();

    select string_agg(mensaje, ' | ') into v_malos
      from alertas where not archivada and (mensaje ~ v_fecha_iso or mensaje like '%USD%');
    if v_malos is not null then raise exception '159: mensajes sin formatear: %', v_malos; end if;

    -- La guía rechazada.
    select id into v_guia from guias_remision where estado <> 'anulada' order by creado_en limit 1;
    if v_guia is null then raise exception '159: no hay ninguna guía para la prueba'; end if;
    update guias_remision set estado_sunat = 'rechazado', sunat_codigo_respuesta = '2800',
           sunat_mensaje = 'Prueba 159' where id = v_guia;
    perform public.generar_alertas();
    select count(*) into v_n from alertas
     where not archivada and tipo = 'gre_rechazo' and entidad_id = v_guia and severidad = 'critica'
       and accion_url = '/guias/' || v_guia
       and mensaje ~ ' del [0-9]{2}/[0-9]{2}/[0-9]{4} — 2800 Prueba 159$';
    if v_n <> 1 then raise exception '159: la guía rechazada dio % alertas bien escritas', v_n; end if;

    update guias_remision set estado_sunat = 'pendiente' where id = v_guia;
    perform public.generar_alertas();
    select count(*) into v_n from alertas where not archivada and tipo = 'gre_rechazo';
    if v_n <> 0 then raise exception '159: el aviso de la guía no se archivó al dejar de estar rechazada'; end if;

    -- La baja rechazada.
    insert into sunat_bajas (fecha_comunicacion, correlativo, identificador, fecha_documentos, comprobantes, estado, codigo, mensaje)
    values (current_date, 99999, 'RA-PRUEBA-159', current_date, array[gen_random_uuid()], 'rechazada', '2324', 'Prueba 159')
    returning id into v_baja;
    perform public.generar_alertas();
    select count(*) into v_n from alertas
     where not archivada and tipo = 'baja_rechazada' and entidad_id = v_baja
       and mensaje like '% 1 comprobante que sigue vigente ante SUNAT. 2324 Prueba 159';
    if v_n <> 1 then raise exception '159: la baja rechazada dio % alertas', v_n; end if;
    update sunat_bajas set estado = 'aceptada' where id = v_baja;
    perform public.generar_alertas();
    select count(*) into v_n from alertas where not archivada and tipo = 'baja_rechazada';
    if v_n <> 0 then raise exception '159: el aviso de la baja no se archivó'; end if;

    -- La copia de seguridad.
    update respaldos set fecha = fecha - interval '30 days';
    perform public.generar_alertas();
    select count(*) into v_n from alertas
     where not archivada and tipo = 'respaldo_atrasado' and accion_url = '/configuracion/empresa'
       and mensaje ~ '[0-9]{2}/[0-9]{2}/[0-9]{4}|Nunca';
    if v_n <> 1 then raise exception '159: la copia atrasada dio % alertas', v_n; end if;
    insert into respaldos (fecha, ok, tablas, filas, archivos) values (now(), true, 1, 1, 0);
    perform public.generar_alertas();
    select count(*) into v_n from alertas where not archivada and tipo = 'respaldo_atrasado';
    if v_n <> 0 then raise exception '159: el aviso de la copia no se archivó con una copia de hoy'; end if;

    -- Los errores sin revisar.
    insert into fallos (origen, mensaje, huella, ultima_vez) values ('servidor', 'Prueba 159', 'prueba-159', now());
    perform public.generar_alertas();
    select count(*) into v_n from alertas
     where not archivada and tipo = 'fallos_pendientes' and accion_url = '/actividad'
       and mensaje like '%«Prueba 159».';
    if v_n <> 1 then raise exception '159: los errores sin revisar dieron % alertas', v_n; end if;
    update fallos set revisado = true where not revisado;
    perform public.generar_alertas();
    select count(*) into v_n from alertas where not archivada and tipo = 'fallos_pendientes';
    if v_n <> 0 then raise exception '159: el aviso de errores no se archivó'; end if;

    -- El rescate de SUNAT.
    perform public.rescatar_envios_sunat();
    select string_agg(mensaje, ' | ') into v_malos
      from alertas where not archivada and tipo = 'sunat_atascado' and mensaje ~ v_fecha_iso;
    if v_malos is not null then raise exception '159: el rescate sigue con la fecha cruda: %', v_malos; end if;

    raise exception '__159_DESHACER__';
  exception when others then
    if sqlerrm <> '__159_DESHACER__' then raise; end if;
  end;
  raise notice '159: avisos de copia, guía, baja y errores; fechas e importes legibles.';
end $$;
