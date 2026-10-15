-- ###########################################################################
-- 131 · EL PEDIDO CON SU IMPORTE Y SU COSTO
-- ###########################################################################
--
-- Luis, 15/10, sobre la lista de pedidos: *«ahí podemos manejar también en
-- la tabla, aparte del total, margen, estados»*. `v_pedido_lineas` (130)
-- daba la cantidad de cada pedido, pero no el dinero: para el total y el
-- margen hace falta el importe de la línea y su costo.
--
-- El costo es el ANALIZADO al cotizar (`cotizacion_items.costo_unitario`,
-- §BC): es con el que se fijó el precio y con el que se calcula el margen en
-- la cotización. El margen va sobre el costo, como en todo el ERP (023).
--
-- `create or replace view` solo añade columnas al final.
-- ###########################################################################

set local search_path = public, extensions;

create or replace view v_pedido_lineas
with (security_invoker = true) as
select p.id as pedido_id, ci.id as cotizacion_item_id, ci.orden, ci.producto_id, ci.codigo, ci.descripcion,
       ci.unidad_codigo, ci.valor_unitario, ci.descuento_pct,
       q.cantidad,
       ci.costo_unitario,
       round(q.cantidad * ci.valor_unitario * (1 - coalesce(ci.descuento_pct, 0) / 100.0), 2) as importe,
       round(q.cantidad * coalesce(ci.costo_unitario, 0), 2) as costo
  from pedidos p
  join cotizacion_items ci on ci.cotizacion_id = p.cotizacion_id
  left join pedido_items pi on pi.pedido_id = p.id and pi.cotizacion_item_id = ci.id
  cross join lateral (
    select case
             when p.desde_aprobacion then greatest(coalesce(ci.cantidad_aprobada, 0) - coalesce((
               select sum(o2.cantidad) from pedido_items o2 join pedidos o on o.id = o2.pedido_id
                where o2.cotizacion_item_id = ci.id and o.id <> p.id), 0), 0)
             else coalesce(pi.cantidad, 0)
           end as cantidad
  ) q;

grant select on v_pedido_lineas to authenticated;

do $$
declare x record;
begin
  -- El importe de la línea es el de la cotización a esa cantidad.
  select count(*) filter (where importe <> round(cantidad * valor_unitario * (1 - coalesce(descuento_pct, 0) / 100.0), 2)) malos,
         count(*) total
    into x from v_pedido_lineas;
  if x.malos > 0 then
    raise exception '131: % líneas con el importe mal', x.malos;
  end if;
  raise notice '131: % líneas de pedido con importe y costo.', x.total;
end $$;
