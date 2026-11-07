-- ###########################################################################
-- 196 · LAS COMPRAS EN SOLES SE SUMAN EN DÓLARES
-- ###########################################################################
--
-- El problema. `serie_compras` (145), la que dibuja las compras del «Informe
-- general» y del tablero, sumaba `subtotal` tal cual. Una compra en soles
-- guarda lo que dice SU factura —en soles, 042— con su tipo de cambio, así
-- que S/ 160 entraba en la suma como $ 160: unas 3,7 veces de más. Al
-- aplicar esto eran 202 compras en soles (S/ 33 629 de total) mezcladas con
-- 577 en dólares.
--
-- Lo vio Moisés el 06/11 desde otro sitio —el resumen de «Registrar compra»
-- ponía «$» delante de un total en soles—, y al buscar los demás «$» salió
-- este, que es peor porque es una cifra que nadie revisa contra un papel.
--
-- La solución: la misma cuenta que `reporte_compras` (133), que ya lo hacía
-- bien: en soles se divide por el tipo de cambio de la compra; en dólares, o
-- sin tipo de cambio, va tal cual. Los gastos van en la moneda de la compra
-- (133 los convierte igual), así que se convierten también.
-- ###########################################################################

create or replace function public.serie_compras(p_desde date, p_hasta date, p_grano text default 'mes')
returns table(periodo date, ordenes bigint, proveedores bigint, subtotal numeric, gastos numeric, costo_total numeric)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with c as (
    select c.fecha, c.proveedor_id, c.subtotal, c.gastos_importacion,
           case when c.moneda = 'USD' or coalesce(c.tipo_cambio, 0) <= 0 then 1 else 1 / c.tipo_cambio end as a_usd
      from compras c
     where c.estado <> 'anulada'
       and c.fecha between p_desde and p_hasta
  )
  select
    date_trunc(public.unidad_periodo(p_grano), c.fecha)::date as periodo,
    count(*)                                              as ordenes,
    count(distinct c.proveedor_id)                        as proveedores,
    round(sum(c.subtotal * c.a_usd), 2)                   as subtotal,
    round(sum(c.gastos_importacion * c.a_usd), 2)         as gastos,
    -- Sin IGV: es crédito fiscal recuperable, no costo. Con gastos de
    -- importación, que sí lo son.
    round(sum((c.subtotal + c.gastos_importacion) * c.a_usd), 2) as costo_total
  from c
  group by 1
  order by 1;
$function$;

-- Centinela: se EJECUTA. La suma de la serie tiene que cuadrar con la de
-- `reporte_compras` (133), que ya convertía; y una compra en soles de prueba
-- tiene que sumar su equivalente en dólares, no su número en soles.
do $$
declare
  v_prov uuid := (select id from proveedores limit 1);
  v_antes numeric; v_despues numeric;
begin
  if v_prov is null then return; end if;
  begin
    select coalesce(sum(subtotal), 0) into v_antes from public.serie_compras('1900-01-01', '1900-12-31', 'mes');
    insert into compras (numero, proveedor_id, tipo, fecha, subtotal, igv, total, estado, moneda, tipo_cambio)
    values ('ZZ196-1', v_prov, 'local', '1900-06-15', 160, 28.80, 188.80, 'registrada', 'PEN', 3.20);
    select coalesce(sum(subtotal), 0) into v_despues from public.serie_compras('1900-01-01', '1900-12-31', 'mes');
    if v_despues - v_antes <> 50.00 then
      raise exception '196: S/ 160 a 3.20 tenía que sumar $ 50.00 y sumó %', v_despues - v_antes;
    end if;
    raise exception '__196_DESHACER__';
  exception when others then
    if sqlerrm <> '__196_DESHACER__' then raise; end if;
  end;
end $$;
