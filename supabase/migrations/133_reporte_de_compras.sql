-- ###########################################################################
-- 133 · EL REPORTE DE COMPRAS
-- ###########################################################################
--
-- Luis, 15/10: *«en nuestros reportes falta reportes amplio de compras… por
-- productos, ranking de los productos más comprados, cuál fue el mejor
-- proveedor con el mejor precio, etc., algo total que ayude a Willy a ver
-- mejor gráficos e información de compras»*.
--
-- Había una serie de compras (`serie_compras`, en el informe general) y nada
-- más. `tablero_compras` responde, en un viaje, las preguntas de quien compra:
--
--   · Cuánto se compró y por qué vía (local, aérea, marítima), por periodo.
--   · Cuánto cuesta importar: los gastos sobre lo comprado.
--   · A quién: cada proveedor con su monto, su parte y los DÍAS que tarda en
--     entregar (de la compra a la primera recepción).
--   · Qué: los productos más comprados, con su costo promedio y cuántos
--     proveedores los vendieron.
--   · Quién lo deja más barato: por producto, el mejor y el peor último
--     costo conocido (`proveedor_productos`, que se llena con cada compra y
--     cada respuesta de precios, 046), y lo que se habría ahorrado comprando
--     lo del periodo al mejor.
--   · Qué subió: el costo de la última compra contra la anterior.
--   · Qué falta: lo comprado sin recibir y las órdenes sin registrar.
--
-- Todo en DÓLARES y sin IGV, como el resto de reportes: una compra en soles
-- se pasa con SU tipo de cambio. Las anuladas no cuentan.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.tablero_compras(
  p_desde date, p_hasta date, p_grano text default 'mes', p_proveedor uuid default null)
returns jsonb
language sql stable set search_path = public, extensions as $$
  with c as (
    select co.id, co.numero, co.fecha, co.proveedor_id, co.estado, co.falta_factura,
           case when co.tipo = 'local' then 'local' else coalesce(co.via_importacion, 'importacion') end as via,
           -- A dólares con el cambio de la propia compra (042).
           case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end as a_usd,
           co.subtotal, co.gastos_importacion,
           (select min(r.fecha) from recepciones r where r.compra_id = co.id and not r.anulada) as recibida
      from compras co
     where co.estado <> 'anulada'
       and co.fecha between p_desde and p_hasta
       and (p_proveedor is null or co.proveedor_id = p_proveedor)
  ),
  it as (
    select ci.producto_id, ci.cantidad, ci.costo_unitario * c.a_usd as costo_usd,
           ci.importe * c.a_usd as importe_usd, c.proveedor_id, c.fecha, c.id as compra_id
      from compra_items ci join c on c.id = ci.compra_id
  ),
  -- El último costo conocido de cada proveedor por cada producto, en dólares.
  pp as (
    select producto_id, proveedor_id, ultimo_costo_usd as costo, ultima_compra
      from proveedor_productos
     where coalesce(ultimo_costo_usd, 0) > 0
  ),
  mejor as (
    select producto_id, min(costo) as mejor, max(costo) as peor, count(*) as proveedores
      from pp group by producto_id
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'compras',      (select count(*) from c),
      'proveedores',  (select count(distinct proveedor_id) from c),
      'comprado',     (select coalesce(round(sum(subtotal * a_usd), 2), 0) from c),
      'gastos',       (select coalesce(round(sum(gastos_importacion * a_usd), 2), 0) from c),
      'importado',    (select coalesce(round(sum(subtotal * a_usd), 2), 0) from c where via <> 'local'),
      'gastos_importacion', (select coalesce(round(sum(gastos_importacion * a_usd), 2), 0) from c where via <> 'local'),
      'dias_entrega', (select round(avg(recibida - fecha), 1) from c where recibida is not null),
      'productos',    (select count(distinct producto_id) from it),
      'unidades',     (select coalesce(round(sum(cantidad), 2), 0) from it),
      -- Lo que se habría ahorrado comprando cada línea al mejor último costo
      -- conocido de ese producto (solo donde se pagó más que ese mejor).
      'ahorro_posible', (select coalesce(round(sum(greatest(it.costo_usd - m.mejor, 0) * it.cantidad), 2), 0)
                           from it join mejor m on m.producto_id = it.producto_id where m.proveedores > 1),
      -- Lo pendiente NO depende del periodo: es lo que está abierto hoy.
      'por_recibir',  (select count(*) from compras co where co.estado in ('registrada', 'recibida_parcial')
                         and not co.falta_factura and (p_proveedor is null or co.proveedor_id = p_proveedor)),
      'monto_por_recibir', (select coalesce(round(sum(co.subtotal * case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end), 2), 0)
                         from compras co where co.estado in ('registrada', 'recibida_parcial')
                         and not co.falta_factura and (p_proveedor is null or co.proveedor_id = p_proveedor)),
      'sin_registrar', (select count(*) from compras co where co.estado = 'registrada' and co.falta_factura
                         and (p_proveedor is null or co.proveedor_id = p_proveedor))
    ),

    'serie', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.periodo)
        from (
          select date_trunc(unidad_periodo(p_grano), c.fecha)::date as periodo,
                 count(*) as compras,
                 coalesce(round(sum(c.subtotal * c.a_usd) filter (where c.via = 'local'), 2), 0) as local,
                 coalesce(round(sum(c.subtotal * c.a_usd) filter (where c.via = 'aerea'), 2), 0) as aerea,
                 coalesce(round(sum(c.subtotal * c.a_usd) filter (where c.via in ('maritima', 'importacion')), 2), 0) as maritima,
                 coalesce(round(sum(c.gastos_importacion * c.a_usd), 2), 0) as gastos
            from c group by 1
        ) s
    ), '[]'::jsonb),

    'por_via', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.monto desc)
        from (
          select via, count(*) as compras,
                 round(sum(subtotal * a_usd), 2) as monto,
                 round(sum(gastos_importacion * a_usd), 2) as gastos
            from c group by via
        ) v
    ), '[]'::jsonb),

    'proveedores', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monto desc)
        from (
          select c.proveedor_id as id, pr.razon_social as proveedor,
                 count(*) as compras,
                 round(sum(c.subtotal * c.a_usd), 2) as monto,
                 round(avg(c.recibida - c.fecha) filter (where c.recibida is not null), 1) as dias_entrega,
                 count(*) filter (where c.recibida is not null) as recibidas,
                 max(c.fecha) as ultima
            from c join proveedores pr on pr.id = c.proveedor_id
           group by c.proveedor_id, pr.razon_social
           order by monto desc
           limit 15
        ) x
    ), '[]'::jsonb),

    'productos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monto desc)
        from (
          select it.producto_id as id, p.codigo, p.descripcion, m.nombre as marca,
                 round(sum(it.cantidad), 2) as unidades,
                 round(sum(it.importe_usd), 2) as monto,
                 count(distinct it.compra_id) as veces,
                 count(distinct it.proveedor_id) as proveedores,
                 round(sum(it.importe_usd) / nullif(sum(it.cantidad), 0), 4) as costo_promedio
            from it
            join productos p on p.id = it.producto_id
            left join marcas m on m.id = p.marca_id
           group by it.producto_id, p.codigo, p.descripcion, m.nombre
           order by monto desc
           limit 15
        ) x
    ), '[]'::jsonb),

    -- Quién lo deja más barato, de lo que se compró en el periodo y tiene
    -- más de un proveedor conocido. Sin periodo no habría por dónde empezar.
    'mejor_precio', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.diferencia desc)
        from (
          select p.id, p.codigo, p.descripcion,
                 bm.mejor, bm.peor, bm.proveedores,
                 (select pr.razon_social from pp join proveedores pr on pr.id = pp.proveedor_id
                   where pp.producto_id = p.id order by pp.costo, pp.ultima_compra desc nulls last limit 1) as proveedor_mejor,
                 (select pr.razon_social from pp join proveedores pr on pr.id = pp.proveedor_id
                   where pp.producto_id = p.id order by pp.costo desc limit 1) as proveedor_peor,
                 round((bm.peor - bm.mejor) / nullif(bm.mejor, 0) * 100, 1) as diferencia
            from mejor bm
            join productos p on p.id = bm.producto_id
           where bm.proveedores > 1
             and (exists (select 1 from it where it.producto_id = bm.producto_id) or p_proveedor is null)
           order by diferencia desc
           limit 12
        ) x
    ), '[]'::jsonb),

    -- Qué subió: la última compra de cada producto contra la anterior.
    'alzas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.variacion desc)
        from (
          select p.codigo, p.descripcion, h.ultimo, h.anterior,
                 round((h.ultimo - h.anterior) / nullif(h.anterior, 0) * 100, 1) as variacion,
                 h.fecha
            from (
              select distinct on (ci.producto_id) ci.producto_id,
                     ci.costo_unitario * case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end as ultimo,
                     lag(ci.costo_unitario * case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end)
                       over (partition by ci.producto_id order by co.fecha, co.numero) as anterior,
                     co.fecha
                from compra_items ci join compras co on co.id = ci.compra_id
               where co.estado <> 'anulada' and co.fecha <= p_hasta
                 and (p_proveedor is null or co.proveedor_id = p_proveedor)
               order by ci.producto_id, co.fecha desc, co.numero desc
            ) h
            join productos p on p.id = h.producto_id
           where h.anterior > 0 and h.ultimo > h.anterior and h.fecha >= p_desde
           order by variacion desc
           limit 10
        ) x
    ), '[]'::jsonb),

    'pendientes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.fecha)
        from (
          select co.id, co.numero, co.fecha, pr.razon_social as proveedor, co.falta_factura,
                 round(co.subtotal * case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end, 2) as monto,
                 (current_date - co.fecha) as dias
            from compras co join proveedores pr on pr.id = co.proveedor_id
           where co.estado in ('registrada', 'recibida_parcial')
             and (p_proveedor is null or co.proveedor_id = p_proveedor)
           order by co.fecha
           limit 15
        ) x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.tablero_compras(date, date, text, uuid) to authenticated;

do $$
declare r jsonb;
begin
  r := public.tablero_compras('2000-01-01', '2100-01-01', 'mes', null);
  if (r -> 'resumen' ->> 'compras')::int <> (select count(*) from compras where estado <> 'anulada') then
    raise exception '133: tablero_compras no cuenta las compras vigentes';
  end if;
  raise notice '133: % compras, comprado %, % proveedores.', r -> 'resumen' ->> 'compras',
    r -> 'resumen' ->> 'comprado', r -> 'resumen' ->> 'proveedores';
end $$;
