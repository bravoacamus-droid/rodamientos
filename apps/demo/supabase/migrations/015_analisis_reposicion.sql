-- ============================================================================
-- ERP RODATECH · Análisis de reposición
--
-- El motor de alertas dice qué reponer; estas funciones explican por qué, con
-- los mismos números que sustentan la recomendación. Sin esa justificación el
-- comprador no puede juzgar si la sugerencia es coherente con lo que sabe del
-- negocio, y termina ignorándola o comprando a ciegas.
-- ============================================================================

/**
 * Panorama de reposición de todo el catálogo con rotación reciente.
 *
 * La cobertura es la relación entre el stock disponible y el consumo diario
 * promedio de los últimos 90 días. La cantidad sugerida repone hasta el
 * horizonte objetivo (45 días por defecto) más el tiempo que tarda el
 * proveedor en entregar, descontando lo que ya está pedido y no ha llegado.
 */
create or replace function public.analisis_reposicion(
  p_horizonte_dias int default 45,
  p_limite int default 120
)
returns table (
  producto_id       uuid,
  sku               text,
  descripcion       text,
  marca             text,
  categoria         text,
  unidad            text,
  stock_actual      numeric,
  stock_minimo      numeric,
  costo_promedio    numeric,
  precio_mayorista  numeric,
  salidas_30        numeric,
  salidas_90        numeric,
  salidas_180       numeric,
  consumo_diario    numeric,
  cobertura_dias    numeric,
  lead_time_dias    int,
  en_transito       numeric,
  punto_reorden     numeric,
  cantidad_sugerida numeric,
  inversion         numeric,
  clientes_90       int,
  ultima_salida     timestamptz,
  criticidad        text
)
language sql stable security definer set search_path = public
as $$
  with mov as (
    select
      m.producto_id,
      sum(m.cantidad) filter (where m.fecha > now() - interval '30 days')  as s30,
      sum(m.cantidad) filter (where m.fecha > now() - interval '90 days')  as s90,
      sum(m.cantidad) filter (where m.fecha > now() - interval '180 days') as s180,
      max(m.fecha)                                                         as ultima
    from movimientos_inventario m
    where m.tipo = 'salida' and m.fecha > now() - interval '180 days'
    group by m.producto_id
  ),
  clientes as (
    select ci.producto_id, count(distinct c.cliente_id)::int as n
    from comprobante_items ci
    join comprobantes c on c.id = ci.comprobante_id
    where c.estado <> 'anulado' and c.fecha_emision > current_date - 90
    group by ci.producto_id
  ),
  transito as (
    -- Lo ya pedido al proveedor y aún no recibido
    select oi.producto_id, sum(oi.cantidad - oi.cantidad_recibida) as pendiente
    from oc_items oi
    join ordenes_compra o on o.id = oi.orden_compra_id
    where o.estado in ('enviada','confirmada','transito','recibida_parcial')
      and oi.cantidad > oi.cantidad_recibida
    group by oi.producto_id
  ),
  lead as (
    -- Lead time del proveedor que más veces surtió este ítem
    select distinct on (oi.producto_id) oi.producto_id, p.lead_time_dias
    from oc_items oi
    join ordenes_compra o on o.id = oi.orden_compra_id
    join proveedores p on p.id = o.proveedor_id
    order by oi.producto_id, o.fecha desc
  ),
  base as (
    select
      v.id, v.sku, v.descripcion, v.marca, v.categoria, v.unidad,
      v.stock_total, v.stock_minimo, v.costo_promedio, v.precio_mayorista,
      coalesce(mov.s30, 0)  as s30,
      coalesce(mov.s90, 0)  as s90,
      coalesce(mov.s180, 0) as s180,
      mov.ultima,
      coalesce(cl.n, 0)            as clientes,
      coalesce(tr.pendiente, 0)    as transito,
      coalesce(le.lead_time_dias, 7) as lead,
      round(coalesce(mov.s90, 0) / 90.0, 4) as diario
    from v_stock_productos v
    join mov on mov.producto_id = v.id
    left join clientes cl on cl.producto_id = v.id
    left join transito tr on tr.producto_id = v.id
    left join lead le on le.producto_id = v.id
    where v.activo and coalesce(mov.s90, 0) > 0
  )
  select
    b.id, b.sku, b.descripcion, b.marca, b.categoria, b.unidad,
    b.stock_total, b.stock_minimo, b.costo_promedio, b.precio_mayorista,
    b.s30, b.s90, b.s180,
    b.diario,
    case when b.diario > 0 then round(b.stock_total / b.diario, 1) else 999 end as cobertura,
    b.lead::int,
    b.transito,
    -- Punto de reorden: consumo durante el lead time más un colchón de 7 días
    round(b.diario * (b.lead + 7), 0) as reorden,
    greatest(
      round(b.diario * (p_horizonte_dias + b.lead) - b.stock_total - b.transito, 0),
      0
    ) as sugerida,
    round(
      greatest(b.diario * (p_horizonte_dias + b.lead) - b.stock_total - b.transito, 0)
      * b.costo_promedio, 2
    ) as inversion,
    b.clientes,
    b.ultima,
    case
      when b.stock_total <= 0                            then 'quiebre'
      when b.stock_total / nullif(b.diario, 0) < b.lead  then 'urgente'
      when b.stock_total / nullif(b.diario, 0) < 30      then 'proximo'
      else 'holgado'
    end as criticidad
  from base b
  where greatest(b.diario * (p_horizonte_dias + b.lead) - b.stock_total - b.transito, 0) > 0
  order by
    case
      when b.stock_total <= 0 then 0
      when b.stock_total / nullif(b.diario, 0) < b.lead then 1
      else 2
    end,
    b.s90 * b.costo_promedio desc
  limit p_limite;
$$;

grant execute on function public.analisis_reposicion(int, int) to authenticated;

/**
 * Consumo mes a mes de un producto en los últimos 12 meses, para mostrar la
 * tendencia detrás de la sugerencia.
 */
create or replace function public.consumo_mensual(p_producto uuid, p_meses int default 12)
returns table (mes date, etiqueta text, unidades numeric, documentos int)
language sql stable security definer set search_path = public
as $$
  with meses as (
    select generate_series(
      date_trunc('month', current_date) - ((p_meses - 1) || ' months')::interval,
      date_trunc('month', current_date),
      '1 month'
    )::date as mes
  ),
  salidas as (
    select date_trunc('month', m.fecha)::date as mes,
           sum(m.cantidad) as unidades,
           count(*)::int   as documentos
    from movimientos_inventario m
    where m.producto_id = p_producto
      and m.tipo = 'salida'
      and m.fecha >= date_trunc('month', current_date) - ((p_meses - 1) || ' months')::interval
    group by 1
  )
  select
    ms.mes,
    to_char(ms.mes, 'TMMon YY')::text,
    coalesce(s.unidades, 0),
    coalesce(s.documentos, 0)
  from meses ms
  left join salidas s on s.mes = ms.mes
  order by ms.mes;
$$;

grant execute on function public.consumo_mensual(uuid, int) to authenticated;

/** Resumen para las tarjetas del panel de reposición. */
create or replace function public.resumen_reposicion(p_horizonte_dias int default 45)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'items',        count(*),
    'quiebre',      count(*) filter (where criticidad = 'quiebre'),
    'urgente',      count(*) filter (where criticidad = 'urgente'),
    'proximo',      count(*) filter (where criticidad = 'proximo'),
    'inversion',    coalesce(sum(inversion), 0),
    'venta_riesgo', coalesce(sum(consumo_diario * 30 * precio_mayorista)
                             filter (where criticidad in ('quiebre','urgente')), 0),
    'en_transito',  coalesce(sum(en_transito * costo_promedio), 0)
  )
  from analisis_reposicion(p_horizonte_dias, 500);
$$;

grant execute on function public.resumen_reposicion(int) to authenticated;
