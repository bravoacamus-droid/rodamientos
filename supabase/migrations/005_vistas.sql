-- ============================================================================
-- RODATECH ERP v2 · 004 · Vistas analíticas
-- ----------------------------------------------------------------------------
-- Las vistas se declaran `security_invoker = true`: sin eso, una vista es
-- propiedad de `postgres` y LEE SALTÁNDOSE EL RLS de las tablas de base, que
-- es un agujero clásico de Supabase. Con security_invoker, la vista aplica las
-- políticas del usuario que consulta.
-- ============================================================================

set search_path = public, extensions;
-- ---------------------------------------------------------------------------
-- Por qué esto empieza tirando las vistas
-- ---------------------------------------------------------------------------
-- Volver a aplicar este archivo sobre una base YA migrada fallaba con
-- `42P16: cannot drop columns from view`, y el fallo cortaba la aplicación
-- entera en el quinto archivo de treinta y tres.
--
-- El motivo: migraciones posteriores ENSANCHAN tres de estas vistas —la 023
-- le añade columnas a `v_ventas_mensuales` y `v_top_productos`, la 025 a
-- `v_productos_stock`—. `create or replace view` sabe AÑADIR columnas por el
-- final, pero no sabe quitarlas, así que reaplicar la versión estrecha de aquí
-- encima de la ancha de allí es justamente lo que Postgres prohíbe.
--
-- Tirarlas primero lo arregla y no cuesta nada: son vistas, no tienen datos.
-- En una pasada completa se recrean aquí en su versión de la 005 y las
-- posteriores las vuelven a ensanchar, que es el orden correcto.
--
-- `v_reposicion` va PRIMERO porque lee de `v_productos_stock`: es la única
-- dependencia entre vistas de todo el esquema, y al revés el drop falla.
--
-- Los permisos los repone la 006 (`grant select on all tables in schema
-- public`), que corre justo después. Aplicar SOLO este archivo deja las vistas
-- sin grant hasta que se aplique la 006.
drop view if exists v_reposicion;
drop view if exists v_productos_stock;
drop view if exists v_valorizacion_inventario;
drop view if exists v_kardex;
drop view if exists v_cartera;
drop view if exists v_resumen_clientes;
drop view if exists v_ventas_mensuales;
drop view if exists v_top_productos;
drop view if exists v_historial_precios;
drop view if exists v_trazabilidad_venta;


-- ---------------------------------------------------------------------------
-- Catálogo con stock, jerarquía y semáforo de reposición
-- ---------------------------------------------------------------------------
create or replace view v_productos_stock
with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.codigo_norm,
  p.codigo_fabricante,
  p.descripcion,
  m.nombre                       as marca,
  m.segmento                     as marca_segmento,
  c.nombre                       as familia,
  f.nombre                       as subfamilia,
  sf.nombre                      as tipo,
  p.familia_id, p.subfamilia_id, p.tipo_id, p.marca_id,
  p.unidad_codigo,
  u.abreviatura                  as unidad,
  coalesce(s.cantidad, 0)        as stock,
  coalesce(s.reservado, 0)       as reservado,
  coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible,
  p.stock_minimo,
  p.stock_maximo,
  p.costo_promedio,
  p.ultimo_costo,
  p.precio_promedio,
  p.precio_venta,
  round(coalesce(s.valorizado, 0), 2) as valorizado,
  case when p.costo_promedio > 0
       then round((p.precio_venta - p.costo_promedio) / p.costo_promedio * 100, 2)
       else null end             as margen_pct,
  case
    when coalesce(s.cantidad, 0) < 0 then 'negativo'
    when coalesce(s.cantidad, 0) = 0 then 'sin_stock'
    when p.stock_minimo > 0 and coalesce(s.cantidad, 0) <= p.stock_minimo then 'critico'
    when p.stock_maximo > 0 and coalesce(s.cantidad, 0) > p.stock_maximo then 'sobrestock'
    else 'normal'
  end                            as estado_stock,
  p.ubicacion,
  p.peso_kg,
  p.archivado,
  p.creado_en,
  p.actualizado_en
from productos p
join marcas m        on m.id  = p.marca_id
join familias c    on c.id  = p.familia_id
join subfamilias f      on f.id  = p.subfamilia_id
left join tipos sf on sf.id = p.tipo_id
join unidades_medida u on u.codigo = p.unidad_codigo
left join stock s    on s.producto_id = p.id;

comment on view v_productos_stock is 'Catálogo enriquecido: jerarquía resuelta, saldo, valorización y semáforo de reposición en una sola lectura.';

-- ---------------------------------------------------------------------------
-- Valorización de inventario · "su sistema actual no se la da" (24:21)
-- ---------------------------------------------------------------------------
create or replace view v_valorizacion_inventario
with (security_invoker = true) as
select
  c.id                              as familia_id,
  c.nombre                          as familia,
  f.id                              as subfamilia_id,
  f.nombre                          as subfamilia,
  count(*)                          as skus,
  count(*) filter (where coalesce(s.cantidad,0) > 0) as skus_con_stock,
  sum(coalesce(s.cantidad, 0))      as unidades,
  round(sum(coalesce(s.valorizado, 0)), 2) as valor_costo,
  round(sum(coalesce(s.cantidad, 0) * p.precio_venta), 2) as valor_venta,
  round(sum(coalesce(s.cantidad, 0) * p.precio_venta) - sum(coalesce(s.valorizado, 0)), 2) as margen_potencial
from productos p
join familias c on c.id = p.familia_id
join subfamilias f   on f.id = p.subfamilia_id
left join stock s on s.producto_id = p.id
where not p.archivado
group by c.id, c.nombre, f.id, f.nombre;

-- ---------------------------------------------------------------------------
-- Kardex legible
-- ---------------------------------------------------------------------------
create or replace view v_kardex
with (security_invoker = true) as
select
  mi.id,
  mi.fecha,
  mi.producto_id,
  p.codigo,
  p.descripcion,
  mi.tipo,
  case when mi.tipo in ('ingreso','ajuste_positivo') then mi.cantidad else 0 end as entrada,
  case when mi.tipo in ('salida','ajuste_negativo')  then mi.cantidad else 0 end as salida,
  mi.costo_unitario,
  mi.saldo_cantidad,
  round(mi.saldo_valorizado, 2) as saldo_valorizado,
  mi.costo_promedio,
  mi.referencia_tipo,
  mi.referencia_id,
  mi.referencia_numero,
  mi.motivo,
  pf.nombre as usuario
from movimientos_inventario mi
join productos p on p.id = mi.producto_id
left join perfiles pf on pf.id = mi.usuario_id;

-- ---------------------------------------------------------------------------
-- Alertas de reposición y de sobrestock (25:21)
-- ---------------------------------------------------------------------------
create or replace view v_reposicion
with (security_invoker = true) as
select
  v.id, v.codigo, v.descripcion, v.marca, v.familia, v.subfamilia,
  v.stock, v.stock_minimo, v.stock_maximo, v.estado_stock,
  v.costo_promedio, v.precio_venta, v.valorizado,
  greatest(v.stock_maximo - v.stock, 0) as sugerido_comprar,
  -- Consumo diario de los últimos 90 días: base de la cobertura.
  coalesce(cm.consumo_diario, 0) as consumo_diario,
  case when coalesce(cm.consumo_diario, 0) > 0
       then round(v.stock / cm.consumo_diario, 1)
       else null end as dias_cobertura
from v_productos_stock v
left join lateral (
  select sum(mi.cantidad) / 90.0 as consumo_diario
  from movimientos_inventario mi
  where mi.producto_id = v.id
    and mi.tipo = 'salida'
    and mi.fecha >= now() - interval '90 days'
) cm on true
where not v.archivado
  and v.estado_stock in ('negativo','sin_stock','critico','sobrestock');

comment on view v_reposicion is 'Alimenta las alertas de quiebre y de sobrestock. `dias_cobertura` traduce el saldo a tiempo, que es como Willy decide comprar.';

-- ---------------------------------------------------------------------------
-- Cartera con aging
-- ---------------------------------------------------------------------------
create or replace view v_cartera
with (security_invoker = true) as
select
  c.id,
  c.numero,
  c.tipo,
  c.cliente_id,
  cl.razon_social                as cliente,
  cl.numero_documento            as documento,
  c.fecha_emision,
  c.fecha_vencimiento,
  c.condicion_pago,
  c.total,
  c.pagado,
  c.saldo,
  c.estado,
  c.orden_compra_cliente,
  c.detraccion_aplica,
  c.detraccion_monto,
  c.retencion_aplica,
  c.retencion_monto,
  greatest(current_date - c.fecha_vencimiento, 0) as dias_vencido,
  case
    when c.fecha_vencimiento is null           then 'sin_vencimiento'
    when c.fecha_vencimiento >= current_date   then 'por_vencer'
    when current_date - c.fecha_vencimiento <= 30 then '1_30'
    when current_date - c.fecha_vencimiento <= 60 then '31_60'
    when current_date - c.fecha_vencimiento <= 90 then '61_90'
    else 'mas_90'
  end                            as tramo_aging,
  pf.nombre                      as vendedor
from comprobantes c
join clientes cl on cl.id = c.cliente_id
left join perfiles pf on pf.id = c.vendedor_id
where c.estado in ('emitido','parcial','vencido')
  and c.saldo > 0
  and c.tipo in ('factura','boleta');

comment on view v_cartera is 'Aging de cartera en tramos 0/1-30/31-60/61-90/90+. Solo comprobantes con saldo vivo: el índice ix_comp_cartera cubre exactamente este filtro.';

-- ---------------------------------------------------------------------------
-- Resumen por cliente · línea de crédito disponible
-- ---------------------------------------------------------------------------
create or replace view v_resumen_clientes
with (security_invoker = true) as
select
  cl.id,
  cl.codigo,
  cl.razon_social,
  cl.numero_documento,
  cl.linea_credito,
  cl.dias_credito,
  cl.bloqueado,
  coalesce(x.expuesto, 0)                             as expuesto,
  cl.linea_credito - coalesce(x.expuesto, 0)          as linea_disponible,
  case when cl.linea_credito > 0
       then round(coalesce(x.expuesto, 0) / cl.linea_credito * 100, 1)
       else null end                                  as uso_linea_pct,
  coalesce(x.vencido, 0)                              as vencido,
  coalesce(y.ventas_12m, 0)                           as ventas_12m,
  y.ultima_venta,
  pf.nombre                                           as vendedor
from clientes cl
left join lateral (
  select sum(c.saldo) as expuesto,
         sum(c.saldo) filter (where c.fecha_vencimiento < current_date) as vencido
  from comprobantes c
  where c.cliente_id = cl.id and c.estado in ('emitido','parcial','vencido')
) x on true
left join lateral (
  select sum(c.total) as ventas_12m, max(c.fecha_emision) as ultima_venta
  from comprobantes c
  where c.cliente_id = cl.id and c.estado <> 'anulado'
    and c.tipo in ('factura','boleta')
    and c.fecha_emision >= current_date - interval '12 months'
) y on true
left join perfiles pf on pf.id = cl.vendedor_id;

-- ---------------------------------------------------------------------------
-- Ventas mensuales
-- ---------------------------------------------------------------------------
create or replace view v_ventas_mensuales
with (security_invoker = true) as
select
  date_trunc('month', c.fecha_emision)::date as mes,
  count(*)                                   as documentos,
  sum(c.op_gravada)                          as venta_neta,
  sum(c.igv)                                 as igv,
  sum(c.total)                               as total,
  sum(c.costo_total)                         as costo,
  sum(c.op_gravada) - sum(c.costo_total)     as margen,
  case when sum(c.op_gravada) > 0
       then round((sum(c.op_gravada) - sum(c.costo_total)) / sum(c.op_gravada) * 100, 2)
       else 0 end                            as margen_pct
from comprobantes c
where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
group by 1;

-- ---------------------------------------------------------------------------
-- Top de productos vendidos
-- ---------------------------------------------------------------------------
create or replace view v_top_productos
with (security_invoker = true) as
select
  ci.producto_id,
  p.codigo,
  p.descripcion,
  m.nombre                    as marca,
  f.nombre                    as subfamilia,
  sum(ci.cantidad)            as unidades,
  round(sum(ci.importe), 2)   as venta,
  round(sum(ci.cantidad * ci.costo_unitario), 2) as costo,
  round(sum(ci.importe) - sum(ci.cantidad * ci.costo_unitario), 2) as margen,
  count(distinct c.cliente_id) as clientes,
  max(c.fecha_emision)        as ultima_venta
from comprobante_items ci
join comprobantes c on c.id = ci.comprobante_id
join productos p    on p.id = ci.producto_id
join marcas m       on m.id = p.marca_id
join subfamilias f     on f.id = p.subfamilia_id
where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
group by ci.producto_id, p.codigo, p.descripcion, m.nombre, f.nombre;

-- ---------------------------------------------------------------------------
-- Historial de precios por producto y cliente
-- ---------------------------------------------------------------------------
-- Es lo que permite responderle al vendedor "a este cliente ya le vendiste
-- esto a X" antes de cotizar, y también alimenta el precio promedio (28:30).
create or replace view v_historial_precios
with (security_invoker = true) as
select
  ci.producto_id,
  q.cliente_id,
  cl.razon_social      as cliente,
  q.fecha              as fecha,
  q.numero             as documento,
  'cotizacion'::text   as origen,
  ci.cantidad,
  ci.valor_unitario,
  ci.descuento_pct,
  q.estado::text       as estado
from cotizacion_items ci
join cotizaciones q on q.id = ci.cotizacion_id
join clientes cl    on cl.id = q.cliente_id
where ci.producto_id is not null
union all
select
  di.producto_id,
  d.cliente_id,
  cl.razon_social,
  d.fecha_emision,
  d.numero,
  'venta'::text,
  di.cantidad,
  di.valor_unitario,
  di.descuento_pct,
  d.estado::text
from comprobante_items di
join comprobantes d on d.id = di.comprobante_id
join clientes cl    on cl.id = d.cliente_id
where di.producto_id is not null and d.estado <> 'anulado';

-- ---------------------------------------------------------------------------
-- Trazabilidad comercial de punta a punta
-- ---------------------------------------------------------------------------
-- Cotización → guía → factura, con la OC del cliente como hilo conductor.
-- Es la vista que responde "¿qué pasó con la orden de compra 4500123456?".
create or replace view v_trazabilidad_venta
with (security_invoker = true) as
select
  q.id                    as cotizacion_id,
  q.numero                as cotizacion,
  q.fecha                 as fecha_cotizacion,
  q.estado                as estado_cotizacion,
  q.orden_compra_cliente,
  cl.id                   as cliente_id,
  cl.razon_social         as cliente,
  q.total                 as total_cotizado,
  g.id                    as guia_id,
  g.numero                as guia,
  g.fecha_traslado,
  g.estado                as estado_guia,
  g.peso_bruto_kg,
  c.id                    as comprobante_id,
  c.numero                as comprobante,
  c.fecha_emision,
  c.total                 as total_facturado,
  c.estado                as estado_comprobante,
  c.estado_sunat,
  c.saldo
from cotizaciones q
join clientes cl on cl.id = q.cliente_id
left join guias_remision g on g.cotizacion_id = q.id and g.estado <> 'anulada'
left join comprobantes c   on c.cotizacion_id = q.id and c.estado <> 'anulado';

comment on view v_trazabilidad_venta is
  'Cotización → guía → factura con la OC del cliente como hilo. Willy pidió que la factura arrastre los tres números (09:10).';

-- La vista de cuota de consultas RUC/DNI (`v_cuota_consultas`) vive en
-- 007_consultas.sql, junto con las tablas de caché que la alimentan: son
-- propiedad del paquete @rodatech/consultas.

-- ---------------------------------------------------------------------------
-- KPIs de tablero
-- ---------------------------------------------------------------------------
create or replace function public.kpis_dashboard(
  p_desde date default null,
  p_hasta date default null
) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with rango as (
    select coalesce(p_desde, date_trunc('month', current_date)::date) as d,
           coalesce(p_hasta, current_date) as h
  )
  select jsonb_build_object(
    'ventas',            (select coalesce(sum(c.total), 0) from comprobantes c, rango r
                            where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
                              and c.fecha_emision between r.d and r.h),
    'documentos',        (select count(*) from comprobantes c, rango r
                            where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
                              and c.fecha_emision between r.d and r.h),
    'margen',            (select coalesce(sum(c.op_gravada - c.costo_total), 0) from comprobantes c, rango r
                            where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
                              and c.fecha_emision between r.d and r.h),
    'por_cobrar',        (select coalesce(sum(saldo), 0) from v_cartera),
    'vencido',           (select coalesce(sum(saldo), 0) from v_cartera where dias_vencido > 0),
    'cotizaciones_abiertas', (select count(*) from cotizaciones where estado in ('borrador','enviada','aprobada')),
    'valor_inventario',  (select coalesce(round(sum(valorizado), 2), 0) from v_productos_stock where not archivado),
    'skus_activos',      (select count(*) from productos where not archivado),
    'quiebres',          (select count(*) from v_productos_stock where not archivado and estado_stock in ('sin_stock','negativo')),
    'sobrestock',        (select count(*) from v_productos_stock where not archivado and estado_stock = 'sobrestock'),
    'alertas_pendientes', (select count(*) from alertas where not archivada and not leida)
  );
$$;
