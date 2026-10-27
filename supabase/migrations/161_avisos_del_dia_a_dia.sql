-- ###########################################################################
-- 161 · LOS AVISOS DEL DÍA A DÍA (27/10)
-- ###########################################################################
--
-- Luis, 27/10: *«que me avise que tengo cotizaciones sin cerrar o aprobar,
-- que no se haya sacado una guía… que el app sea interactivo y ayude al sr
-- Willy en su día a día»*. Y: *«tenemos que tener notificaciones de lo que se
-- va a vencer… trazabilidad de todo por pedido, si ya se facturó, si se hizo
-- la guía, todo tiene que cuadrar»*.
--
-- El problema: hasta la 159, `generar_alertas()` solo avisaba de lo que FALLA
-- (stock, SUNAT, cartera vencida, copia de seguridad). De lo que SE QUEDA
-- ATRÁS —lo que nadie ha hecho todavía y nadie va a pedir— no avisaba nada:
--
--   - una guía que salió y no se facturó es mercadería entregada que no se
--     va a cobrar nunca si nadie se acuerda. La lista de guías la cuenta
--     (108) y nadie entra a mirarla si todo va bien;
--   - un pedido confirmado sin guía, o con la mercadería ya recibida y sin
--     guía, es un cliente esperando;
--   - un pedido al que le salió una parte se daba por «entregado · por
--     facturar» con la primera guía, aunque faltara la mitad (etapa.ts);
--   - una cotización enviada sin respuesta es una venta que se enfría, y una
--     en borrador es una que el cliente ni ha visto;
--   - una compra que no llega es un pedido que no se va a poder despachar.
--
-- La solución son siete tipos de aviso nuevos, con la misma mecánica de la
-- 151 y la 159: huella para no repetirse, y archivado automático cuando deja
-- de ser verdad. Los umbrales en días son constantes al principio de la
-- función, con su porqué.
--
--   guia_sin_facturar         guía de venta emitida, sin factura, ≥ 7 días
--   pedido_sin_guia           sin ninguna guía: ya llegó lo comprado, o
--                             (sin compras) ≥ 3 días desde que se confirmó
--   pedido_por_despachar      salió una parte y lo demás lleva ≥ 7 días
--   cotizacion_sin_respuesta  enviada hace ≥ 5 días y todavía vigente
--   cotizaciones_sin_cerrar   UNA sola, con la cuenta: las enviadas que
--                             vencieron sin que nadie dijera sí o no
--   cotizacion_borrador       en borrador ≥ 3 días
--   compra_sin_recibir        pasada su `fecha_estimada`; sin ella (no la
--                             llena nadie hoy: 0 de 17 compras), 7 días si
--                             es local y 60 si es importación
--
-- Las vencidas sin cerrar van en UN aviso y no en uno por cotización: el
-- 27/10 había 19 enviadas del sistema anterior ya vencidas, y diecinueve
-- avisos iguales tapan los que importan.
--
-- La cuenta de lo despachado y lo facturado de cada pedido queda en una vista,
-- `v_pedido_avance`, que leen el aviso y la ficha del pedido: si las dos
-- contaran por su lado, acabarían discrepando. Cuenta como
-- `despacho_por_item` (115): una pieza de kit vale «cantidad / lo que lleva
-- el kit», solo las guías EMITIDAS, y cada línea topada en lo confirmado
-- (que sobre de una no tapa lo que falta de otra).
--
-- Se reescribe `generar_alertas()` entera, partiendo del texto de la 159 (el
-- vivo el 27/10, comprobado), con los avisos nuevos añadidos antes del
-- certificado.

set search_path = public, extensions;

alter table public.alertas drop constraint if exists alerta_tipo_ok;
alter table public.alertas add constraint alerta_tipo_ok check (tipo = any (array[
  'quiebre_stock', 'stock_bajo', 'sobrestock', 'stock_negativo', 'credito_por_vencer',
  'credito_vencido', 'linea_credito', 'cotizacion_por_vencer', 'sunat_rechazo',
  'sin_rotacion', 'margen_bajo', 'sunat_atascado', 'certificado_por_vencer',
  -- 159
  'respaldo_atrasado', 'gre_rechazo', 'baja_rechazada', 'fallos_pendientes',
  -- 161
  'guia_sin_facturar', 'pedido_sin_guia', 'pedido_por_despachar',
  'cotizacion_sin_respuesta', 'cotizaciones_sin_cerrar', 'cotizacion_borrador',
  'compra_sin_recibir']));

-- ---------------------------------------------------------------------------
-- Cuánto salió y cuánto se facturó de cada pedido
-- ---------------------------------------------------------------------------
-- En unidades y no en dinero: «faltan 4 de 10» es lo que Willy cuenta en el
-- almacén. Facturado = lo que va en guías emitidas que algún comprobante
-- vigente ampara (la misma regla que «sin facturar» en la 108), porque desde
-- la 089 no hay factura sin guía.
create or replace view public.v_pedido_avance
with (security_invoker = true) as
with conf as (
  select v.pedido_id, v.cotizacion_item_id, v.cantidad
    from v_pedido_lineas v
   where v.cantidad > 0
), filas as (
  select g.pedido_id, g.id as guia_id, gi.cotizacion_item_id,
         (exists (select 1 from comprobante_guias cg
                    join comprobantes c on c.id = cg.comprobante_id
                   where cg.guia_id = g.id and c.estado <> 'anulado')
          or exists (select 1 from comprobantes c
                      where c.guia_id = g.id and c.estado <> 'anulado')) as facturada,
         case when coalesce(p.es_kit, false)
              then gi.cantidad / nullif(kc.cantidad, 0)
              else gi.cantidad end as unidades,
         coalesce(p.es_kit, false) as es_kit
    from guias_remision g
    join guia_items gi on gi.guia_id = g.id
    join cotizacion_items ci on ci.id = gi.cotizacion_item_id
    left join productos p on p.id = ci.producto_id
    left join kit_componentes kc on kc.kit_id = ci.producto_id and kc.producto_id = gi.producto_id
   where g.estado = 'emitida' and g.pedido_id is not null
), por_guia as (
  -- En un kit todas sus piezas dicen el mismo número de kits: se toma uno.
  select pedido_id, guia_id, cotizacion_item_id, bool_or(facturada) as facturada,
         case when bool_or(es_kit) then max(unidades) else sum(unidades) end as unidades
    from filas
   group by pedido_id, guia_id, cotizacion_item_id
), salido as (
  select pedido_id, cotizacion_item_id,
         sum(unidades) as despachado,
         coalesce(sum(unidades) filter (where facturada), 0) as facturado
    from por_guia
   group by pedido_id, cotizacion_item_id
), por_pedido as (
  select c.pedido_id,
         sum(c.cantidad) as confirmado,
         sum(least(c.cantidad, coalesce(s.despachado, 0))) as despachado,
         sum(least(c.cantidad, coalesce(s.facturado, 0))) as facturado
    from conf c
    left join salido s on s.pedido_id = c.pedido_id and s.cotizacion_item_id = c.cotizacion_item_id
   group by c.pedido_id
)
select p.id as pedido_id,
       round(coalesce(x.confirmado, 0), 2) as confirmado,
       round(coalesce(x.despachado, 0), 2) as despachado,
       round(coalesce(x.facturado, 0), 2) as facturado,
       (select max(g.fecha_emision) from guias_remision g
         where g.pedido_id = p.id and g.estado = 'emitida') as ultima_guia,
       (select count(*) from guias_remision g
         where g.pedido_id = p.id and g.estado = 'borrador')::int as guias_borrador,
       (select count(*) from compras k
         where k.pedido_id = p.id and k.estado <> 'anulada')::int as compras,
       (select count(*) from compras k
         where k.pedido_id = p.id and k.estado = 'recibida')::int as compras_recibidas
  from pedidos p
  left join por_pedido x on x.pedido_id = p.id;

revoke all on public.v_pedido_avance from anon;
grant select on public.v_pedido_avance to authenticated;

comment on view public.v_pedido_avance is
  '161: confirmado, despachado (guías emitidas) y facturado de cada pedido, en unidades, cada línea topada en lo confirmado. Lo leen generar_alertas() y la ficha del pedido.';

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

  -- 161 · Los umbrales de lo que se queda atrás, en días.
  --
  -- Una semana para facturar una guía: la del almacén del cliente vuelve
  -- sellada en unos días (es con lo que Willy factura, ver CLAUDE.md §6).
  c_dias_guia_sin_factura constant int := 7;
  -- Un pedido que sale del almacén (sin compras) debería tener su guía en
  -- tres días. Si tiene compras, el aviso es el de la compra que no llega,
  -- y en cuanto llega todo, el de la guía sale el mismo día.
  c_dias_pedido_sin_guia constant int := 3;
  -- Despachar en partes es deliberado («parte inmediato, el resto hasta 15
  -- días», §AM): se avisa a la semana de la última guía, no al día siguiente.
  c_dias_resto_sin_salir constant int := 7;
  -- Cinco días sin respuesta es cuando conviene llamar; las cotizaciones
  -- valen 15 días, así que queda margen antes del aviso de «por vencer».
  c_dias_cotizacion_sin_respuesta constant int := 5;
  c_dias_cotizacion_en_borrador constant int := 3;
  -- `compras.fecha_estimada` existe y no la llena nadie (0 de 17 el 27/10).
  -- Sin ella: una semana para un proveedor de Lima —el plazo real está
  -- preguntado a Willy (CLAUDE.md §8)— y dos meses para una importación.
  c_dias_orden_local constant int := 7;
  c_dias_orden_importacion constant int := 60;

  v_ultima_copia timestamptz;
  v_huella_copia text;
  v_fallos int;
  v_fallo record;
  v_avisos jsonb;
  v_sin_cerrar record;
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

  -- 161 · Lo que se queda atrás ----------------------------------------------
  -- Se calcula una vez, en una lista, y de ella salen el alta y el archivado:
  -- el aviso que ya no está en la lista dejó de ser verdad. Así la condición
  -- de «se avisa» y la de «se archiva» no pueden discrepar.
  with avance as (
    select p.id, p.numero, p.fecha, cl.razon_social as cliente, a.*
      from pedidos p
      join v_pedido_avance a on a.pedido_id = p.id
      join cotizaciones q on q.id = p.cotizacion_id
      join clientes cl on cl.id = p.cliente_id
     where q.estado not in ('anulada', 'rechazada')
       and a.confirmado > 0
  ), avisos as (
    -- La guía que salió y no se facturó.
    select 'guia_sin_facturar' as tipo, 'alta' as severidad, 'Guía sin facturar' as titulo,
           'La guía ' || g.numero || ' de ' || cl.razon_social || ' salió el ' ||
             to_char(g.fecha_emision, 'DD/MM/YYYY') || ' y todavía no tiene factura.' as mensaje,
           'guia' as entidad_tipo, g.id as entidad_id, g.numero as entidad_nombre,
           (current_date - g.fecha_emision)::numeric as valor,
           '/guias/' || g.id as accion_url,
           'guia_sin_facturar:' || g.id::text as huella
      from guias_remision g
      join clientes cl on cl.id = g.cliente_id
     where g.estado = 'emitida'
       -- Solo las de venta: un traslado entre almacenes no se factura.
       and g.motivo_codigo in ('01', '14')
       and g.fecha_emision <= current_date - c_dias_guia_sin_factura
       and not exists (select 1 from comprobante_guias cg
                         join comprobantes c on c.id = cg.comprobante_id
                        where cg.guia_id = g.id and c.estado <> 'anulado')
       and not exists (select 1 from comprobantes c
                        where c.guia_id = g.id and c.estado <> 'anulado')

    union all
    -- El pedido sin ninguna guía emitida.
    select 'pedido_sin_guia',
           case when x.llego then 'alta' else 'media' end,
           case when x.llego then 'Llegó la mercadería: falta la guía' else 'Pedido sin guía' end,
           case when x.llego
                then 'Ya llegó la mercadería de ' || a.numero || ' (' || a.cliente ||
                     '): falta hacer la guía para entregarla.'
                else a.numero || ' de ' || a.cliente || ' se confirmó el ' ||
                     to_char(a.fecha, 'DD/MM/YYYY') || ' y todavía no tiene guía.' end ||
             case when a.guias_borrador > 0 then ' Hay una guía en borrador: falta emitirla.' else '' end,
           'pedido', a.id, a.numero, a.confirmado,
           '/pedidos/' || a.id,
           'pedido_sin_guia:' || a.id::text || ':' || case when x.llego then 'llego' else 'almacen' end
      from avance a
     cross join lateral (select a.compras > 0 and a.compras_recibidas = a.compras as llego) x
     where a.despachado = 0
       and (x.llego or (a.compras = 0 and a.fecha <= current_date - c_dias_pedido_sin_guia))

    union all
    -- El pedido al que le salió una parte. La huella lleva lo despachado:
    -- con otra guía, el aviso viejo se archiva y sale el de la cifra nueva.
    select 'pedido_por_despachar', 'media', 'Pedido a medio despachar',
           a.numero || ' de ' || a.cliente || ': faltan ' || trim_scale(a.confirmado - a.despachado) ||
             ' de ' || trim_scale(a.confirmado) || ' por despachar. La última guía salió el ' ||
             to_char(a.ultima_guia, 'DD/MM/YYYY') || '.',
           'pedido', a.id, a.numero, a.confirmado - a.despachado,
           '/pedidos/' || a.id,
           'pedido_por_despachar:' || a.id::text || ':' || trim_scale(a.despachado)
      from avance a
     where a.despachado > 0
       and a.despachado < a.confirmado - 0.005
       and a.ultima_guia <= current_date - c_dias_resto_sin_salir

    union all
    -- La cotización enviada que nadie contesta, mientras sigue vigente. En
    -- sus tres últimos días toma el relevo «por vencer»; vencida, pasa a la
    -- cuenta de abajo.
    select 'cotizacion_sin_respuesta', 'media', 'Cotización sin respuesta',
           q.numero || ' de ' || cl.razon_social || ', por $ ' || to_char(q.total, 'FM999,999,990.00') ||
             ', se mandó el ' || to_char(e.enviada, 'DD/MM/YYYY') || ' y el cliente no ha contestado.' ||
             case when q.fecha_vencimiento is not null
                  then ' Vale hasta el ' || to_char(q.fecha_vencimiento, 'DD/MM/YYYY') || '.' else '' end ||
             ' Conviene llamarle.',
           'cotizacion', q.id, q.numero, q.total,
           '/cotizaciones/' || q.id,
           'cotizacion_sin_respuesta:' || q.id::text
      from cotizaciones q
      join clientes cl on cl.id = q.cliente_id
     cross join lateral (select coalesce((q.enviada_en at time zone 'America/Lima')::date, q.fecha) as enviada) e
     where q.estado = 'enviada'
       and e.enviada <= current_date - c_dias_cotizacion_sin_respuesta
       and (q.fecha_vencimiento is null or q.fecha_vencimiento > current_date + 3)

    union all
    -- La cotización que el cliente no ha visto.
    select 'cotizacion_borrador', 'baja', 'Cotización sin mandar',
           q.numero || ' de ' || cl.razon_social || ' está en borrador desde el ' ||
             to_char(e.creada, 'DD/MM/YYYY') || ': falta mandarla al cliente.',
           'cotizacion', q.id, q.numero, q.total,
           '/cotizaciones/' || q.id,
           'cotizacion_borrador:' || q.id::text
      from cotizaciones q
      join clientes cl on cl.id = q.cliente_id
     cross join lateral (select (q.creado_en at time zone 'America/Lima')::date as creada) e
     where q.estado = 'borrador'
       and e.creada <= current_date - c_dias_cotizacion_en_borrador

    union all
    -- La compra que no llega. La huella lleva el estado: si llega una
    -- parte, el aviso cambia de título.
    select 'compra_sin_recibir',
           case when k.pedido_id is not null then 'alta' else 'media' end,
           case when k.estado = 'recibida_parcial' then 'Compra a medio recibir' else 'Compra sin recibir' end,
           k.numero || ' de ' || pr.razon_social || ' se pidió el ' || to_char(k.fecha, 'DD/MM/YYYY') ||
             case when k.fecha_estimada is not null
                  then ', tenía que llegar el ' || to_char(k.fecha_estimada, 'DD/MM/YYYY') else '' end ||
             case when k.estado = 'recibida_parcial' then ' y solo llegó una parte.'
                  else ' y todavía no llega.' end ||
             case when pe.numero is not null
                  then ' Es para ' || pe.numero || ' (' || coalesce(cl.razon_social, 'sin cliente') || ').'
                  else '' end,
           'compra', k.id, k.numero, (current_date - pl.plazo)::numeric,
           '/compras/' || k.id,
           'compra_sin_recibir:' || k.id::text || ':' || k.estado::text
      from compras k
      join proveedores pr on pr.id = k.proveedor_id
      left join pedidos pe on pe.id = k.pedido_id
      left join clientes cl on cl.id = pe.cliente_id
     cross join lateral (
       select coalesce(k.fecha_estimada,
                       k.fecha + case when k.tipo = 'importacion' then c_dias_orden_importacion
                                      else c_dias_orden_local end) as plazo) pl
     where k.estado in ('registrada', 'recibida_parcial')
       and pl.plazo < current_date
  )
  select coalesce(jsonb_agg(to_jsonb(avisos)), '[]'::jsonb) into v_avisos from avisos;

  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select r.tipo, r.severidad::severidad_alerta, r.titulo, r.mensaje, r.entidad_tipo, r.entidad_id,
         r.entidad_nombre, r.valor, r.accion_url, r.huella
    from jsonb_to_recordset(v_avisos) as r(tipo text, severidad text, titulo text, mensaje text,
         entidad_tipo text, entidad_id uuid, entidad_nombre text, valor numeric, accion_url text, huella text)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- 161: las enviadas que vencieron sin respuesta, en UN aviso con la cuenta.
  -- Se refresca como el de errores: lo que importa es cuántas quedan.
  select count(*) as n,
         (array_agg(q.numero order by q.fecha_vencimiento, q.numero))[1] as numero,
         min(q.fecha_vencimiento) as vencio
    into v_sin_cerrar
    from cotizaciones q
   where q.estado = 'enviada' and q.fecha_vencimiento < current_date;
  if v_sin_cerrar.n > 0 then
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
    values ('cotizaciones_sin_cerrar', 'baja', 'Cotizaciones vencidas sin respuesta',
            case when v_sin_cerrar.n = 1
                 then 'Una cotización que se mandó venció sin que el cliente contestara: ' ||
                      v_sin_cerrar.numero || ', el ' || to_char(v_sin_cerrar.vencio, 'DD/MM/YYYY') || '.'
                 else v_sin_cerrar.n || ' cotizaciones que se mandaron vencieron sin que el cliente contestara. ' ||
                      'La más antigua es ' || v_sin_cerrar.numero || ', que venció el ' ||
                      to_char(v_sin_cerrar.vencio, 'DD/MM/YYYY') || '.' end ||
              ' Si ya no van, márcalas como rechazadas; si sí, llama al cliente.',
            null, null, 'Cotizaciones enviadas', v_sin_cerrar.n, '/cotizaciones?estado=enviada',
            'cotizaciones_sin_cerrar')
    on conflict (huella) where not archivada do update
       set mensaje     = excluded.mensaje,
           valor       = excluded.valor,
           generada_en = now(),
           leida       = false
     where alertas.mensaje is distinct from excluded.mensaje;
    get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;
  end if;

  -- 161: lo que dejó de ser verdad se archiva solo.
  update alertas a set archivada = true
   where not a.archivada
     and a.tipo in ('guia_sin_facturar', 'pedido_sin_guia', 'pedido_por_despachar',
                    'cotizacion_sin_respuesta', 'cotizacion_borrador', 'compra_sin_recibir')
     and not exists (select 1 from jsonb_array_elements(v_avisos) e where e ->> 'huella' = a.huella);
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'cotizaciones_sin_cerrar' and v_sin_cerrar.n = 0;

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

-- Centinela: se EJECUTA la función sobre la base real, dentro de un bloque que
-- sale por excepción y lo deshace todo, y se comprueba antes y después que no
-- se movió ni un correlativo ni una fila.
--
--   - Con las alertas vivas archivadas, lo que se genera de nuevo lleva las
--     fechas DD/MM/YYYY y ningún «USD».
--   - Una guía emitida, sin su factura y con 9 días, avisa; con 2 días, el
--     aviso se archiva.
--   - Con una línea de esa guía rebajada, su pedido avisa «faltan X de Y».
--   - Un pedido con su compra recibida y sin guía avisa «Ya llegó…», y la
--     compra deja de avisar.
--   - Una compra con `fecha_estimada` futura no avisa; pasada, avisa con ella.
--   - Una cotización enviada hace 6 días y vigente avisa; rechazada, se
--     archiva. La cuenta de vencidas sin cerrar es la de la base.
--   - Toda cotización en borrador de hace ≥ 3 días tiene su aviso.
--
-- Cada caso que necesita un dato que el día de mañana puede no estar (Luis
-- tiene pendiente `limpiar-pruebas`) se salta con un aviso en vez de
-- reventar: la migración tiene que poder reaplicarse.
do $$
declare
  v_antes text; v_despues text;
  v_guia uuid; v_ped uuid; v_ped2 uuid; v_compra uuid; v_cot uuid;
  v_conf numeric; v_desp numeric;
  v_n int; v_malos text; v_esperado int;
  v_fecha_iso constant text := '[0-9]{4}-[0-9]{2}-[0-9]{2}';
  v_huella constant text := $q$
    select md5(coalesce((select string_agg(s::text, '|' order by s::text) from series_documento s), '')) || ':' ||
           (select count(*) from cotizaciones) || ':' || (select count(*) from pedidos) || ':' ||
           (select count(*) from guias_remision) || ':' || (select count(*) from guia_items) || ':' ||
           (select count(*) from comprobantes) || ':' || (select count(*) from compras) || ':' ||
           (select count(*) from recepciones) || ':' || (select count(*) from movimientos_inventario)
  $q$;
begin
  execute v_huella into v_antes;

  begin
    update alertas set archivada = true where not archivada;
    perform public.generar_alertas();

    select string_agg(mensaje, ' | ') into v_malos
      from alertas where not archivada and (mensaje ~ v_fecha_iso or mensaje like '%USD%');
    if v_malos is not null then raise exception '161: mensajes sin formatear: %', v_malos; end if;

    select string_agg(accion_url, ' | ') into v_malos
      from alertas where not archivada and tipo in ('guia_sin_facturar', 'pedido_sin_guia',
        'pedido_por_despachar', 'cotizacion_sin_respuesta', 'cotizaciones_sin_cerrar',
        'cotizacion_borrador', 'compra_sin_recibir') and accion_url is null;
    if v_malos is not null then raise exception '161: hay avisos nuevos sin enlace'; end if;

    -- La guía sin facturar, y su pedido a medio despachar.
    select g.id, g.pedido_id into v_guia, v_ped
      from guias_remision g
     where g.estado = 'emitida' and g.motivo_codigo = '01' and g.pedido_id is not null
     order by g.creado_en limit 1;
    if v_guia is null then
      raise notice '161: no hay ninguna guía emitida de un pedido; no se prueba la guía sin facturar.';
    else
      delete from comprobante_guias where guia_id = v_guia;
      update comprobantes set guia_id = null where guia_id = v_guia;
      update guias_remision set fecha_emision = current_date - 9 where id = v_guia;
      perform public.generar_alertas();
      select count(*) into v_n from alertas
       where not archivada and tipo = 'guia_sin_facturar' and entidad_id = v_guia
         and accion_url = '/guias/' || v_guia
         and mensaje ~ '^La guía .+ de .+ salió el [0-9]{2}/[0-9]{2}/[0-9]{4} y todavía no tiene factura\.$';
      if v_n <> 1 then raise exception '161: la guía sin facturar dio % avisos bien escritos', v_n; end if;

      select confirmado, despachado into v_conf, v_desp from v_pedido_avance where pedido_id = v_ped;
      if v_desp <> v_conf then
        raise notice '161: el pedido de la guía no salió entero (% de %); no se prueba el medio despacho.', v_desp, v_conf;
      else
        update guia_items set cantidad = cantidad - 1
         where id = (select gi.id from guia_items gi where gi.guia_id = v_guia and gi.cantidad >= 2
                      order by gi.orden limit 1);
        perform public.generar_alertas();
        select count(*) into v_n from alertas
         where not archivada and tipo = 'pedido_por_despachar' and entidad_id = v_ped
           and accion_url = '/pedidos/' || v_ped
           and mensaje like '%: faltan 1 de ' || trim_scale(v_conf) || ' por despachar. La última guía salió el %';
        if v_n <> 1 then raise exception '161: el pedido a medio despachar dio % avisos', v_n; end if;
      end if;

      update guias_remision set fecha_emision = current_date - 2 where id = v_guia;
      perform public.generar_alertas();
      select count(*) into v_n from alertas
       where not archivada and tipo in ('guia_sin_facturar', 'pedido_por_despachar') and entidad_id in (v_guia, v_ped);
      if v_n <> 0 then raise exception '161: % avisos de la guía no se archivaron al dejar de ser verdad', v_n; end if;
    end if;

    -- El pedido cuya mercadería ya llegó.
    select a.pedido_id into v_ped2
      from v_pedido_avance a join pedidos p on p.id = a.pedido_id
      join cotizaciones q on q.id = p.cotizacion_id
     where a.confirmado > 0 and a.despachado = 0 and a.compras > 0
       and q.estado not in ('anulada', 'rechazada')
     order by p.fecha limit 1;
    if v_ped2 is null then
      raise notice '161: no hay pedido sin guía con compras; no se prueba «Ya llegó la mercadería».';
    else
      select k.id into v_compra from compras k
       where k.pedido_id = v_ped2 and k.estado in ('registrada', 'recibida_parcial') limit 1;
      update compras set fecha = current_date - 30, fecha_estimada = null
       where pedido_id = v_ped2 and estado in ('registrada', 'recibida_parcial');
      perform public.generar_alertas();
      if v_compra is not null then
        select count(*) into v_n from alertas
         where not archivada and tipo = 'compra_sin_recibir' and entidad_id = v_compra
           and severidad = 'alta' and accion_url = '/compras/' || v_compra
           and mensaje like '% y todavía no llega. Es para PED-% (%).';
        if v_n <> 1 then raise exception '161: la compra que no llega dio % avisos', v_n; end if;

        update compras set fecha_estimada = current_date + 5 where id = v_compra;
        perform public.generar_alertas();
        select count(*) into v_n from alertas
         where not archivada and tipo = 'compra_sin_recibir' and entidad_id = v_compra;
        if v_n <> 0 then raise exception '161: la compra con fecha futura sigue avisando'; end if;

        update compras set fecha_estimada = current_date - 1 where id = v_compra;
        perform public.generar_alertas();
        select count(*) into v_n from alertas
         where not archivada and tipo = 'compra_sin_recibir' and entidad_id = v_compra
           and mensaje like '%, tenía que llegar el __/__/____ y todavía no llega.%';
        if v_n <> 1 then raise exception '161: la compra con fecha pasada dio % avisos', v_n; end if;
      end if;

      update compras set estado = 'recibida' where pedido_id = v_ped2 and estado <> 'anulada';
      perform public.generar_alertas();
      select count(*) into v_n from alertas
       where not archivada and tipo = 'pedido_sin_guia' and entidad_id = v_ped2 and severidad = 'alta'
         and accion_url = '/pedidos/' || v_ped2
         and mensaje like 'Ya llegó la mercadería de %: falta hacer la guía para entregarla.%';
      if v_n <> 1 then raise exception '161: el pedido con la mercadería dentro dio % avisos', v_n; end if;
      select count(*) into v_n from alertas
       where not archivada and tipo = 'compra_sin_recibir'
         and entidad_id in (select id from compras where pedido_id = v_ped2);
      if v_n <> 0 then raise exception '161: la compra recibida sigue avisando'; end if;
    end if;

    -- La cotización sin respuesta, y la cuenta de las vencidas.
    select id into v_cot from cotizaciones where estado = 'enviada' order by fecha limit 1;
    if v_cot is null then
      raise notice '161: no hay ninguna cotización enviada; no se prueba la que no contesta.';
    else
      update cotizaciones set enviada_en = now() - interval '6 days', fecha = current_date - 6, validez_dias = 15
       where id = v_cot;
      perform public.generar_alertas();
      select count(*) into v_n from alertas
       where not archivada and tipo = 'cotizacion_sin_respuesta' and entidad_id = v_cot
         and accion_url = '/cotizaciones/' || v_cot
         and mensaje ~ ', por \$ [0-9,]+\.[0-9]{2}, se mandó el [0-9]{2}/[0-9]{2}/[0-9]{4} y el cliente no ha contestado\. Vale hasta el [0-9]{2}/[0-9]{2}/[0-9]{4}\. Conviene llamarle\.$';
      if v_n <> 1 then raise exception '161: la cotización sin respuesta dio % avisos', v_n; end if;

      update cotizaciones set estado = 'rechazada' where id = v_cot;
      perform public.generar_alertas();
      select count(*) into v_n from alertas
       where not archivada and tipo = 'cotizacion_sin_respuesta' and entidad_id = v_cot;
      if v_n <> 0 then raise exception '161: la cotización rechazada sigue avisando'; end if;
    end if;

    select count(*) into v_esperado from cotizaciones
     where estado = 'enviada' and fecha_vencimiento < current_date;
    select count(*) into v_n from alertas
     where not archivada and tipo = 'cotizaciones_sin_cerrar'
       and valor = v_esperado and accion_url = '/cotizaciones?estado=enviada';
    if v_n <> (case when v_esperado > 0 then 1 else 0 end) then
      raise exception '161: la cuenta de vencidas sin cerrar no cuadra (% en la base)', v_esperado;
    end if;

    -- Las cotizaciones en borrador.
    select count(*) into v_esperado from cotizaciones
     where estado = 'borrador' and (creado_en at time zone 'America/Lima')::date <= current_date - 3;
    select count(*) into v_n from alertas
     where not archivada and tipo = 'cotizacion_borrador'
       and mensaje like '% está en borrador desde el __/__/____: falta mandarla al cliente.';
    if v_n <> v_esperado then
      raise exception '161: % borradores viejos y % avisos', v_esperado, v_n;
    end if;

    raise exception '__161_DESHACER__';
  exception when others then
    if sqlerrm <> '__161_DESHACER__' then raise; end if;
  end;

  execute v_huella into v_despues;
  if v_antes <> v_despues then
    raise exception '161: el centinela dejó rastro (antes %, después %)', v_antes, v_despues;
  end if;
  raise notice '161: avisos de guía sin facturar, pedido sin guía o a medias, cotización sin respuesta o en borrador y compra que no llega.';
end $$;
