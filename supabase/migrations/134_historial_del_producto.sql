-- ###########################################################################
-- 134 · EL HISTORIAL DEL PRODUCTO
-- ###########################################################################
--
-- Luis, 15/10: *«en todos los reportes también se puede dar clic y te lleva
-- como algo personal, único de esa cosa —cliente, proveedor o producto—…
-- falta filtros, mejora de UI/UX»*. Desde los reportes se llega a la ficha
-- de cada uno, y la ficha no tenía historia: el proveedor y el cliente se
-- resuelven con las funciones de los reportes, que ya filtran por ellos; el
-- producto no tenía ninguna.
--
--   · `v_ventas_lineas`: lo vendido línea a línea, con la misma regla que
--     `v_ventas_concretadas` (132): las líneas de cada pedido más las de las
--     cotizaciones atendidas sin pedido de aprobación (el sistema viejo).
--   · `tablero_producto(desde, hasta, grano, producto)`: vendido, facturado
--     y comprado del producto, su precio y su costo promedio, el margen, la
--     serie por periodo, a quién se le vende y a quién se le compra.
--
-- Todo en dólares y sin IGV, como los reportes.
-- ###########################################################################

set local search_path = public, extensions;

create or replace view v_ventas_lineas
with (security_invoker = true) as
select l.pedido_id, p.cotizacion_id, p.cliente_id, p.fecha, l.producto_id, l.codigo,
       l.cantidad, l.importe, l.costo, 'pedido'::text as origen
  from v_pedido_lineas l join pedidos p on p.id = l.pedido_id
 where l.cantidad > 0
union all
select null::uuid, c.id, c.cliente_id, coalesce((c.aprobada_en at time zone 'America/Lima')::date, c.fecha),
       ci.producto_id, ci.codigo,
       coalesce(ci.cantidad_aprobada, ci.cantidad),
       round(coalesce(ci.cantidad_aprobada, ci.cantidad) * ci.valor_unitario * (1 - coalesce(ci.descuento_pct, 0) / 100.0), 2),
       round(coalesce(ci.cantidad_aprobada, ci.cantidad) * coalesce(ci.costo_unitario, 0), 2),
       'historico'
  from cotizaciones c join cotizacion_items ci on ci.cotizacion_id = c.id
 where c.estado in ('aprobada', 'atendida')
   and coalesce(ci.cantidad_aprobada, ci.cantidad) > 0
   and not exists (select 1 from pedidos p where p.cotizacion_id = c.id and p.desde_aprobacion);

grant select on v_ventas_lineas to authenticated;

create or replace function public.tablero_producto(
  p_desde date, p_hasta date, p_grano text default 'mes', p_producto uuid default null)
returns jsonb
language sql stable set search_path = public, extensions as $$
  with v as (
    select * from v_ventas_lineas
     where producto_id = p_producto and fecha between p_desde and p_hasta
  ),
  f as (
    select ci.cantidad, ci.importe, co.fecha_emision as fecha
      from comprobante_items ci join comprobantes co on co.id = ci.comprobante_id
     where ci.producto_id = p_producto and co.tipo in ('factura', 'boleta') and co.estado <> 'anulado'
       and co.fecha_emision between p_desde and p_hasta
  ),
  k as (
    select ci.cantidad, co.fecha, co.proveedor_id,
           ci.costo_unitario * case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end as costo,
           ci.importe * case when co.moneda = 'USD' or coalesce(co.tipo_cambio, 0) <= 0 then 1 else 1 / co.tipo_cambio end as importe
      from compra_items ci join compras co on co.id = ci.compra_id
     where ci.producto_id = p_producto and co.estado <> 'anulada'
       and co.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'vendido_unidades', (select coalesce(round(sum(cantidad), 2), 0) from v),
      'vendido',          (select coalesce(round(sum(importe), 2), 0) from v),
      'ventas',           (select count(*) from v),
      'clientes',         (select count(distinct cliente_id) from v),
      'precio_promedio',  (select round(sum(importe) / nullif(sum(cantidad), 0), 4) from v),
      -- El margen, solo con lo vendido que tiene costo analizado (023).
      'venta_con_costo',  (select coalesce(round(sum(importe), 2), 0) from v where costo > 0),
      'costo_vendido',    (select coalesce(round(sum(costo), 2), 0) from v where costo > 0),
      'facturado_unidades', (select coalesce(round(sum(cantidad), 2), 0) from f),
      'facturado',        (select coalesce(round(sum(importe), 2), 0) from f),
      'comprado_unidades', (select coalesce(round(sum(cantidad), 2), 0) from k),
      'comprado',         (select coalesce(round(sum(importe), 2), 0) from k),
      'costo_promedio',   (select round(sum(importe) / nullif(sum(cantidad), 0), 4) from k),
      'proveedores',      (select count(distinct proveedor_id) from k)
    ),
    'serie', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.periodo)
        from (
          select periodo,
                 coalesce(round(sum(vu), 2), 0) as vendido_unidades,
                 coalesce(round(sum(vm), 2), 0) as vendido,
                 coalesce(round(sum(cu), 2), 0) as comprado_unidades,
                 coalesce(round(sum(cm), 2), 0) as comprado
            from (
              select date_trunc(unidad_periodo(p_grano), fecha)::date as periodo, cantidad as vu, importe as vm, 0 as cu, 0 as cm from v
              union all
              select date_trunc(unidad_periodo(p_grano), fecha)::date, 0, 0, cantidad, importe from k
            ) x
           group by periodo
        ) s
    ), '[]'::jsonb),
    'clientes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.vendido desc)
        from (
          select v.cliente_id as id, cl.razon_social as cliente,
                 round(sum(v.cantidad), 2) as unidades, round(sum(v.importe), 2) as vendido,
                 count(*) as ventas, max(v.fecha) as ultima,
                 round(sum(v.importe) / nullif(sum(v.cantidad), 0), 4) as precio
            from v join clientes cl on cl.id = v.cliente_id
           group by v.cliente_id, cl.razon_social
           order by vendido desc
           limit 15
        ) x
    ), '[]'::jsonb),
    -- A quién se le compra: lo del periodo y, de todos los que lo venden, su
    -- último costo conocido (046), aunque en el periodo no se le comprara.
    'proveedores', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ultimo_costo nulls last)
        from (
          select pr.id, pr.razon_social as proveedor,
                 pp.ultimo_costo_usd as ultimo_costo, pp.ultima_compra,
                 (select round(sum(k.cantidad), 2) from k where k.proveedor_id = pr.id) as unidades,
                 (select round(sum(k.importe) / nullif(sum(k.cantidad), 0), 4) from k where k.proveedor_id = pr.id) as costo_promedio,
                 (select count(*) from k where k.proveedor_id = pr.id) as compras
            from proveedor_productos pp join proveedores pr on pr.id = pp.proveedor_id
           where pp.producto_id = p_producto
           order by pp.ultimo_costo_usd nulls last
           limit 15
        ) x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.tablero_producto(date, date, text, uuid) to authenticated;

do $$
declare r jsonb; p uuid;
begin
  select ci.producto_id into p from compra_items ci join compras co on co.id = ci.compra_id
   where co.estado <> 'anulada' and ci.producto_id is not null limit 1;
  if p is null then
    raise notice '134: sin compras para probar; no se ejecuta.';
    return;
  end if;
  r := public.tablero_producto('2000-01-01', '2100-01-01', 'mes', p);
  if (r -> 'resumen' ->> 'comprado_unidades')::numeric <>
     (select sum(ci.cantidad) from compra_items ci join compras co on co.id = ci.compra_id
       where ci.producto_id = p and co.estado <> 'anulada') then
    raise exception '134: tablero_producto no suma lo comprado del producto';
  end if;
  raise notice '134: historial del producto: %', r -> 'resumen';
end $$;
