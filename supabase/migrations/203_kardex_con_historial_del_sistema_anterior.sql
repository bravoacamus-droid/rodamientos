-- ###########################################################################
-- 203 · EL KARDEX ENSEÑA TAMBIÉN LO DEL SISTEMA ANTERIOR
-- ###########################################################################
--
-- Luis (23/11): *«con todos esos datos que importamos, ¿no podemos tener
-- también en kardex el historial, es decir lo que se vendió, a quién, a
-- cuánto el precio?… el kardex general, con fecha y todo eso»*. Y al
-- proponerle una pantalla aparte: *«la idea es que aparezca ahí igual…
-- ponerlo que fue el otro sistema»*.
--
-- EL PROBLEMA. El kardex empieza el 28/10, con la carga del stock contado
-- (AJU-26-00001). Lo de antes —515 facturas F002 desde 09/2024 y 822
-- compras desde 01/2025, cargadas del sistema de Willy— está en la base con
-- su cliente, su proveedor y su precio, pero nunca movió stock en este
-- sistema, así que el kardex no lo enseñaba.
--
-- POR QUÉ NO SE ESCRIBE EN `movimientos_inventario`. El saldo del kardex
-- parte del CONTEO del 28/10, no de la suma de dos años de papeles: meter
-- esas filas ahí rehacía todos los saldos y el stock dejaba de cuadrar con
-- el almacén. Además cada venta saldría dos veces (guía y factura).
--
-- LO QUE SE HACE.
--
-- 1. `v_kardex` une (UNION ALL), DESPUÉS de los movimientos de verdad, una
--    fila por cada línea de factura y de compra anterior al primer
--    movimiento del kardex:
--      · `sistema_anterior = true`, y el SALDO en null: esas filas no
--        mueven el saldo, lo cuentan. Por eso no se tocan ni el stock ni el
--        costo promedio.
--      · id NEGATIVO, del más reciente (-1) al más antiguo: la lista ordena
--        por id descendente, así que salen debajo de todo lo de este
--        sistema, por fecha, y el «Ver más» sigue funcionando.
--      · `referencia_tipo` 'venta_anterior' / 'compra_anterior', con el id
--        de la factura o de la compra para abrir su ficha.
--      · Las facturas anuladas y las compras anuladas no salen. Las líneas
--        sin producto (58 de 1432) tampoco: el kardex es por producto.
-- 2. Columnas nuevas al FINAL (create or replace view solo añade al final):
--      · `tercero`: a quién se le vendió o a quién se le compró. También en
--        los movimientos de este sistema (guía → cliente, recepción →
--        proveedor, factura → cliente): «a quién se fue» vale para todos.
--      · `precio_unitario` y `moneda`: lo que dice el papel, en su moneda,
--        con el descuento de la línea ya aplicado. El `costo_unitario` sigue
--        en dólares, como en todo el kardex.
--      · `sistema_anterior`.
-- 3. `kardex_resumen` cuenta lo de este sistema en las cifras de siempre
--    (para que «saldo al empezar + entró − salió = saldo al terminar» siga
--    cuadrando) y lo del sistema anterior APARTE, en tres columnas nuevas.
--    Cambia lo que devuelve, así que se borra y se crea otra vez.
-- ###########################################################################

create or replace view public.v_kardex
with (security_invoker = true) as
with corte as (
  -- El día del primer movimiento, en hora de Lima. Sin movimientos, todo es
  -- anterior.
  select coalesce(
    (select (min(fecha) at time zone 'America/Lima')::date from movimientos_inventario),
    current_date + 1
  ) as dia
),
anterior as (
  -- Ventas: líneas de factura.
  select
    (c.fecha_emision + time '12:00') at time zone 'America/Lima' as fecha,
    ci.producto_id,
    'salida'::tipo_movimiento as tipo,
    0::numeric as entrada,
    ci.cantidad as salida,
    nullif(ci.costo_unitario, 0) as costo_unitario,
    'venta_anterior'::text as referencia_tipo,
    c.id as referencia_id,
    c.numero as referencia_numero,
    null::text as motivo,
    cl.razon_social as tercero,
    round(ci.valor_unitario * (1 - coalesce(ci.descuento_pct, 0) / 100), 4) as precio_unitario,
    c.moneda::text as moneda,
    ci.id as linea
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  join clientes cl on cl.id = c.cliente_id
  where c.tipo = 'factura'
    and c.estado <> 'anulado'
    and ci.producto_id is not null
    and c.fecha_emision < (select dia from corte)
  union all
  -- Compras: líneas de la compra, con el costo en dólares como el resto del
  -- kardex (la compra en soles se pasa con SU tipo de cambio).
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
  -- 203
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
  null::numeric as precio_unitario,
  null::text as moneda,
  false as sistema_anterior
from movimientos_inventario mi
join productos p on p.id = mi.producto_id
left join perfiles pf on pf.id = mi.usuario_id
left join marcas m on m.id = p.marca_id
left join familias f on f.id = p.familia_id
left join subfamilias s on s.id = p.subfamilia_id
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
  -- Con los mismos tipos que las columnas de la vista: Postgres no deja
  -- cambiarlos al reemplazarla.
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
  'Kardex: movimientos de stock y, debajo (id negativo, sin saldo), las ventas y compras del sistema anterior (203).';

-- El resumen: lo de este sistema como siempre, lo anterior aparte.
drop function if exists public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz);

create function public.kardex_resumen(
  p_producto   uuid default null,
  p_familia    uuid default null,
  p_subfamilia uuid default null,
  p_marca      uuid default null,
  p_tipo       text default null,
  p_referencia text default null,
  p_usuario    uuid default null,
  p_texto      text default null,
  p_desde      timestamptz default null,
  p_hasta      timestamptz default null
)
returns table (
  movimientos           bigint,
  productos             bigint,
  entradas              numeric,
  salidas               numeric,
  valor_entradas        numeric,
  valor_salidas         numeric,
  saldo_inicial         numeric,
  saldo_final           numeric,
  anteriores            bigint,
  anteriores_entradas   numeric,
  anteriores_salidas    numeric
)
language sql
stable
security invoker
set search_path to 'public', 'extensions'
as $function$
  with filtrado as (
    select k.*
    from v_kardex k
    where (p_producto is null or k.producto_id = p_producto)
      and (p_familia is null or k.familia_id = p_familia)
      and (p_subfamilia is null or k.subfamilia_id = p_subfamilia)
      and (p_marca is null or k.marca_id = p_marca)
      and (p_tipo is null or k.tipo::text = p_tipo)
      and (p_referencia is null or k.referencia_tipo = p_referencia)
      and (p_usuario is null or k.usuario_id = p_usuario)
      and (p_desde is null or k.fecha >= p_desde)
      and (p_hasta is null or k.fecha <= p_hasta)
      and (
        coalesce(btrim(p_texto), '') = ''
        or k.codigo ilike '%' || btrim(p_texto) || '%'
        or k.descripcion ilike '%' || btrim(p_texto) || '%'
        or coalesce(k.codigo_fabricante, '') ilike '%' || btrim(p_texto) || '%'
        or coalesce(k.referencia_numero, '') ilike '%' || btrim(p_texto) || '%'
        or coalesce(k.tercero, '') ilike '%' || btrim(p_texto) || '%'
      )
  )
  select
    count(*) filter (where not sistema_anterior)::bigint,
    count(distinct producto_id) filter (where not sistema_anterior)::bigint,
    coalesce(sum(entrada) filter (where not sistema_anterior), 0),
    coalesce(sum(salida) filter (where not sistema_anterior), 0),
    round(coalesce(sum(entrada * costo_unitario) filter (where not sistema_anterior), 0), 2),
    round(coalesce(sum(salida * costo_unitario) filter (where not sistema_anterior), 0), 2),
    -- Los saldos solo tienen sentido para UN producto, y solo los de este
    -- sistema: las filas anteriores no tienen saldo.
    case when p_producto is null then null else coalesce((
      select k.saldo_cantidad from v_kardex k
      where k.producto_id = p_producto and not k.sistema_anterior
        and p_desde is not null and k.fecha < p_desde
      order by k.id desc limit 1), 0) end,
    case when p_producto is null then null else coalesce((
      select k.saldo_cantidad from v_kardex k
      where k.producto_id = p_producto and not k.sistema_anterior
        and (p_hasta is null or k.fecha <= p_hasta)
      order by k.id desc limit 1), 0) end,
    count(*) filter (where sistema_anterior)::bigint,
    coalesce(sum(entrada) filter (where sistema_anterior), 0),
    coalesce(sum(salida) filter (where sistema_anterior), 0)
  from filtrado
$function$;

comment on function public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz) is
  'Totales del kardex con los mismos filtros que la lista; lo del sistema anterior aparte (203).';

revoke all on function public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- Centinela --
-- Se EJECUTA:
--  · las filas anteriores son tantas como las líneas que deben ser;
--  · ninguna lleva saldo, y todas tienen id negativo y único;
--  · el resumen de un producto sigue cuadrando con SU kardex de verdad
--    (entradas − salidas = saldo final), aunque tenga historial anterior.
do $centinela$
declare
  v_dia      date;
  v_esperado bigint;
  v_hay      bigint;
  v_prod     uuid;
  v_r        record;
  v_ult      numeric;
begin
  select coalesce((select (min(fecha) at time zone 'America/Lima')::date from movimientos_inventario), current_date + 1)
    into v_dia;
  select
    (select count(*) from comprobante_items ci join comprobantes c on c.id = ci.comprobante_id
       join clientes cl on cl.id = c.cliente_id
      where c.tipo = 'factura' and c.estado <> 'anulado' and ci.producto_id is not null and c.fecha_emision < v_dia)
    + (select count(*) from compra_items ci join compras c on c.id = ci.compra_id
       join proveedores pr on pr.id = c.proveedor_id
      where c.estado <> 'anulada' and ci.producto_id is not null and c.fecha < v_dia)
    into v_esperado;
  select count(*) into v_hay from public.v_kardex where sistema_anterior;
  if v_hay <> v_esperado then
    raise exception '203: % filas anteriores y se esperaban %', v_hay, v_esperado;
  end if;
  if exists (select 1 from public.v_kardex where sistema_anterior and (saldo_cantidad is not null or id >= 0)) then
    raise exception '203: una fila anterior lleva saldo o id no negativo';
  end if;
  if (select count(distinct id) from public.v_kardex) <> (select count(*) from public.v_kardex) then
    raise exception '203: ids repetidos en v_kardex';
  end if;

  -- Un producto con kardex de verdad Y con historial anterior, si lo hay.
  select k.producto_id into v_prod
  from public.v_kardex k
  where k.sistema_anterior
    and exists (select 1 from movimientos_inventario mi where mi.producto_id = k.producto_id)
  limit 1;
  if v_prod is null then
    select producto_id into v_prod from movimientos_inventario order by id desc limit 1;
  end if;
  if v_prod is null then
    return;
  end if;
  select * into v_r from public.kardex_resumen(p_producto => v_prod);
  select saldo_cantidad into v_ult from movimientos_inventario where producto_id = v_prod order by id desc limit 1;
  if v_r.saldo_final is distinct from v_ult then
    raise exception '203: saldo final % y último saldo % no coinciden', v_r.saldo_final, v_ult;
  end if;
  if v_r.entradas - v_r.salidas is distinct from v_ult then
    raise exception '203: entradas - salidas (%) no da el saldo (%)', v_r.entradas - v_r.salidas, v_ult;
  end if;
end
$centinela$;
