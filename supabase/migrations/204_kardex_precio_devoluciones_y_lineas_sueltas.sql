-- ###########################################################################
-- 204 · EL KARDEX DICE A CUÁNTO TAMBIÉN LO DE ESTE SISTEMA, Y COMPLETA EL
--       HISTORIAL ANTERIOR
-- ###########################################################################
--
-- Luis (23/11), sobre lo que quedó fuera de la 203: *«vale, termina lo
-- demás»*. Eran tres cosas:
--
-- 1. LAS VENTAS DE ESTE SISTEMA NO DECÍAN A CUÁNTO. Desde la 203 las del
--    sistema anterior dicen «a $ 166.80 c/u» y las de ahora solo a quién.
--    La salida es la GUÍA, y la guía no lleva precio; pero cada línea de
--    guía viene de una línea de cotización (`guia_items.cotizacion_item_id`,
--    las 55 que hay), y ahí está el precio pactado, con su descuento y su
--    moneda. La recepción dice su costo, que es lo que se pagó: en dólares,
--    como todo el costo del kardex. Si algún día una factura mueve stock
--    (`referencia_tipo = 'comprobante'`; hoy ninguna), se lee de la factura.
--
-- 2. 58 LÍNEAS DE FACTURAS ANTIGUAS SIN PRODUCTO. Al cargar el histórico no
--    se enlazaron, pero casi todas traen un código que existe tal cual en el
--    catálogo. Se enlazan AQUÍ, en la vista, y no escribiendo en
--    `comprobante_items`: son facturas emitidas y no se tocan. Solo cuando el
--    código lo tiene UN producto: con dos (mismo código, otra marca) no se
--    adivina cuál era.
--
-- 3. LAS 4 NOTAS DE CRÉDITO ANTIGUAS (FC02-1 a 4). Las cuatro son motivo 06,
--    «devolución total»: la mercadería volvió. Salen como ENTRADAS del
--    sistema anterior, «Devolución del sistema anterior», con el cliente que
--    la devolvió y el precio de la nota.
--
-- Las columnas de `v_kardex` no cambian, así que basta con reemplazarla.
-- ###########################################################################

create or replace view public.v_kardex
with (security_invoker = true) as
with corte as (
  select coalesce(
    (select (min(fecha) at time zone 'America/Lima')::date from movimientos_inventario),
    current_date + 1
  ) as dia
),
anterior as (
  -- Ventas y devoluciones: líneas de factura y de nota de crédito. La línea
  -- sin producto se enlaza por su código si un solo producto lo tiene (204).
  select
    (c.fecha_emision + time '12:00') at time zone 'America/Lima' as fecha,
    coalesce(ci.producto_id, (
      select min(p.id::text)::uuid from productos p where p.codigo = ci.codigo having count(*) = 1
    )) as producto_id,
    case when c.tipo = 'factura' then 'salida'::tipo_movimiento else 'ingreso'::tipo_movimiento end as tipo,
    case when c.tipo = 'factura' then 0::numeric else ci.cantidad end as entrada,
    case when c.tipo = 'factura' then ci.cantidad else 0::numeric end as salida,
    nullif(ci.costo_unitario, 0) as costo_unitario,
    case when c.tipo = 'factura' then 'venta_anterior'::text
         else 'devolucion_anterior'::text end as referencia_tipo,
    c.id as referencia_id,
    c.numero as referencia_numero,
    case when c.tipo = 'nota_credito' then 'Devolución del cliente (nota de crédito)' end as motivo,
    cl.razon_social as tercero,
    round(ci.valor_unitario * (1 - coalesce(ci.descuento_pct, 0) / 100), 4) as precio_unitario,
    c.moneda::text as moneda,
    ci.id as linea
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  join clientes cl on cl.id = c.cliente_id
  where (c.tipo = 'factura' or (c.tipo = 'nota_credito' and c.motivo_nota_codigo in ('06', '07')))
    and c.estado <> 'anulado'
    and c.fecha_emision < (select dia from corte)
  union all
  select
    (c.fecha + time '12:00') at time zone 'America/Lima',
    ci.producto_id,
    'ingreso'::tipo_movimiento,
    ci.cantidad,
    0::numeric,
    case when c.moneda = 'PEN' and coalesce(c.tipo_cambio, 0) > 0
         then round(ci.costo_unitario / c.tipo_cambio, 4)
         else ci.costo_unitario end,
    'compra_anterior'::text as referencia_tipo,
    c.id,
    c.numero,
    case when c.documento_proveedor is not null then 'Factura del proveedor ' || c.documento_proveedor end,
    pr.razon_social,
    ci.costo_unitario,
    c.moneda::text,
    ci.id
  from compra_items ci
  join compras c on c.id = ci.compra_id
  join proveedores pr on pr.id = c.proveedor_id
  where c.estado <> 'anulada'
    and ci.producto_id is not null
    and c.fecha < (select dia from corte)
)
select
  mi.id,
  mi.fecha,
  mi.producto_id,
  p.codigo,
  p.descripcion,
  mi.tipo,
  case when mi.tipo = any (array['ingreso'::tipo_movimiento, 'ajuste_positivo'::tipo_movimiento])
       then mi.cantidad else 0::numeric end as entrada,
  case when mi.tipo = any (array['salida'::tipo_movimiento, 'ajuste_negativo'::tipo_movimiento])
       then mi.cantidad else 0::numeric end as salida,
  mi.costo_unitario,
  mi.saldo_cantidad,
  round(mi.saldo_valorizado, 2) as saldo_valorizado,
  mi.costo_promedio,
  mi.referencia_tipo,
  mi.referencia_id,
  mi.referencia_numero,
  mi.motivo,
  pf.nombre as usuario,
  p.codigo_fabricante,
  p.unidad_codigo,
  p.marca_id,
  m.nombre as marca,
  p.familia_id,
  f.nombre as familia,
  p.subfamilia_id,
  s.nombre as subfamilia,
  mi.usuario_id,
  case mi.referencia_tipo
    when 'guia' then (
      select cl.razon_social from guias_remision g join clientes cl on cl.id = g.cliente_id
      where g.id = mi.referencia_id)
    when 'comprobante' then (
      select cl.razon_social from comprobantes c join clientes cl on cl.id = c.cliente_id
      where c.id = mi.referencia_id)
    when 'recepcion' then (
      select pr.razon_social from recepciones r join proveedores pr on pr.id = r.proveedor_id
      where r.id = mi.referencia_id)
  end as tercero,
  -- 204: a cuánto. La guía, al precio de su cotización; la factura, al suyo;
  -- la recepción, a su costo en dólares.
  case mi.referencia_tipo
    when 'guia' then pr_guia.precio
    when 'comprobante' then pr_fact.precio
    when 'recepcion' then mi.costo_unitario
  end as precio_unitario,
  case mi.referencia_tipo
    when 'guia' then pr_guia.moneda
    when 'comprobante' then pr_fact.moneda
    when 'recepcion' then 'USD'
  end as moneda,
  false as sistema_anterior
from movimientos_inventario mi
join productos p on p.id = mi.producto_id
left join perfiles pf on pf.id = mi.usuario_id
left join marcas m on m.id = p.marca_id
left join familias f on f.id = p.familia_id
left join subfamilias s on s.id = p.subfamilia_id
left join lateral (
  select round(qi.valor_unitario * (1 - coalesce(qi.descuento_pct, 0) / 100), 4) as precio, q.moneda::text as moneda
  from guia_items gi
  join cotizacion_items qi on qi.id = gi.cotizacion_item_id
  join cotizaciones q on q.id = qi.cotizacion_id
  where mi.referencia_tipo = 'guia' and gi.guia_id = mi.referencia_id and gi.producto_id = mi.producto_id
  order by gi.orden
  limit 1
) pr_guia on true
left join lateral (
  select round(ci.valor_unitario * (1 - coalesce(ci.descuento_pct, 0) / 100), 4) as precio, c.moneda::text as moneda
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  where mi.referencia_tipo = 'comprobante' and ci.comprobante_id = mi.referencia_id and ci.producto_id = mi.producto_id
  order by ci.orden
  limit 1
) pr_fact on true
union all
select
  -(row_number() over (order by a.fecha desc, a.referencia_tipo, a.linea))::bigint,
  a.fecha,
  a.producto_id,
  p.codigo,
  p.descripcion,
  a.tipo,
  a.entrada,
  a.salida,
  a.costo_unitario::numeric(14,4),
  null::numeric(14,2),
  null::numeric,
  null::numeric(14,4),
  a.referencia_tipo,
  a.referencia_id,
  a.referencia_numero,
  a.motivo,
  null::text,
  p.codigo_fabricante,
  p.unidad_codigo,
  p.marca_id,
  m.nombre,
  p.familia_id,
  f.nombre,
  p.subfamilia_id,
  s.nombre,
  null::uuid,
  a.tercero,
  a.precio_unitario,
  a.moneda,
  true
from anterior a
join productos p on p.id = a.producto_id
left join marcas m on m.id = p.marca_id
left join familias f on f.id = p.familia_id
left join subfamilias s on s.id = p.subfamilia_id;

comment on view public.v_kardex is
  'Kardex: movimientos de stock con a quién y a cuánto y, debajo (id negativo, sin saldo), las ventas, devoluciones y compras del sistema anterior (203, 204).';

-- ---------------------------------------------------------------- Centinela --
-- Se EJECUTA:
--  · cada guía del kardex trae su precio (todas vienen de una cotización);
--  · las cuatro devoluciones antiguas están, como entradas;
--  · de las líneas de factura antiguas sin producto, quedan fuera SOLO las
--    que no tienen un código que case con un único producto;
--  · ninguna fila anterior lleva saldo, y los ids siguen siendo únicos.
do $centinela$
declare
  v_dia  date;
  v_n    bigint;
  v_esp  bigint;
begin
  select coalesce((select (min(fecha) at time zone 'America/Lima')::date from movimientos_inventario), current_date + 1)
    into v_dia;

  select count(*) into v_n from public.v_kardex where referencia_tipo = 'guia' and precio_unitario is null;
  if v_n > 0 then
    raise exception '204: % movimientos de guía sin precio', v_n;
  end if;

  select count(*) into v_esp
  from comprobante_items ci join comprobantes c on c.id = ci.comprobante_id
  where c.tipo = 'nota_credito' and c.motivo_nota_codigo in ('06', '07') and c.estado <> 'anulado'
    and c.fecha_emision < v_dia
    and (ci.producto_id is not null
         or (select count(*) from productos p where p.codigo = ci.codigo) = 1);
  select count(*) into v_n from public.v_kardex where referencia_tipo = 'devolucion_anterior';
  if v_n <> v_esp then
    raise exception '204: % devoluciones en el kardex y se esperaban %', v_n, v_esp;
  end if;
  if exists (select 1 from public.v_kardex where referencia_tipo = 'devolucion_anterior' and entrada <= 0) then
    raise exception '204: una devolución no sale como entrada';
  end if;

  select count(*) into v_esp
  from comprobante_items ci join comprobantes c on c.id = ci.comprobante_id
  where c.tipo = 'factura' and c.estado <> 'anulado' and c.fecha_emision < v_dia
    and (ci.producto_id is not null
         or (select count(*) from productos p where p.codigo = ci.codigo) = 1);
  select count(*) into v_n from public.v_kardex where referencia_tipo = 'venta_anterior';
  if v_n <> v_esp then
    raise exception '204: % ventas anteriores y se esperaban %', v_n, v_esp;
  end if;

  if exists (select 1 from public.v_kardex where sistema_anterior and (saldo_cantidad is not null or id >= 0)) then
    raise exception '204: una fila anterior lleva saldo o id no negativo';
  end if;
  if (select count(distinct id) from public.v_kardex) <> (select count(*) from public.v_kardex) then
    raise exception '204: ids repetidos en v_kardex';
  end if;
end
$centinela$;
