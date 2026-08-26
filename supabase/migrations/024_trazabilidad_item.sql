-- ###########################################################################
-- 024 · TRAZABILIDAD POR ÍTEM
-- ###########################################################################
--
-- Willy, 26/08 (30:29 y 32:45). Le pasó esa misma mañana: un cliente le armó
-- una orden con cinco ítems sacados de cotizaciones viejas distintas, y él
-- tuvo que *«rebuscar, rebuscar, rebuscar el celular, el WhatsApp»*.
--
-- Lo que pidió, para un código cualquiera:
--
--   «Quería saber uno de los ítems. ¿A qué precio le he cotizado antes? ¿Y a
--    quién le he comprado? ¿Y a qué precio?»
--
-- Y el motivo, que es el que manda:
--
--   «Si lo he comprado ahí es porque ya lo he analizado y he visto que es el
--    mejor precio del mercado. La idea es no volver a hacer ese estudio de
--    mercado.»
--
-- O sea que esto no es un informe: es lo que evita repetir el trabajo caro.
--
-- ---------------------------------------------------------------------------
-- Por qué una vista nueva y no ampliar las que ya hay
-- ---------------------------------------------------------------------------
-- Las dos mitades existían por separado y ninguna estaba unida:
--
--   · `v_historial_precios` da el lado de la VENTA (cotización + factura, con
--     cliente y precio), pero no sabe nada de compras.
--   · `v_trazabilidad_venta` sigue el hilo cotización → guía → factura, pero
--     por DOCUMENTO. Sirve para «¿qué pasó con la OC 4500123456?», no para
--     «¿qué ha pasado con este rodamiento?».
--
-- Esta vista es una LÍNEA DE TIEMPO por producto: cuatro tipos de evento con
-- la misma forma, para poder leerlos de arriba abajo en una sola tabla.
--
-- ---------------------------------------------------------------------------
-- El detalle que importa: cuál es «el costo»
-- ---------------------------------------------------------------------------
-- Para la recepción, el unitario NO sale de `recepcion_items` sino del KARDEX.
-- Son distintos a propósito: `recepcion_items.costo_unitario` es lo que dice
-- la factura del proveedor, y el del kardex es ese mismo costo YA con el
-- prorrateo de los gastos de importación (022). El segundo es el costo puesto
-- en almacén, que es el que hay que mirar para decidir a cuánto vender.
--
-- Los dos aparecen: la fila de `compra` enseña lo pactado y la de `recepcion`
-- lo que costó de verdad. Ver las dos juntas es media respuesta a «¿me salió
-- caro el flete?».
--
-- ---------------------------------------------------------------------------
-- Dos cosas que se vieron mal en la primera versión, con datos de verdad
-- ---------------------------------------------------------------------------
-- 1 · Las NOTAS DE CRÉDITO salían como ventas. `comprobantes` guarda facturas,
--     boletas y notas en la misma tabla, y meterlas todas bajo el evento
--     `factura` hacía que una devolución de 20 unidades se leyera como una
--     venta de 20 más. En la prueba, «unidades vendidas» decía 41 donde eran
--     21. Ahora las notas llevan su propio evento: se VEN —una devolución es
--     parte de la historia del código y ocultarla sería peor— pero no cuentan
--     como venta ni entran en «última venta».
--
-- 2 · El orden dentro del mismo día era aleatorio. `compras.fecha` y
--     `cotizaciones.fecha` son DATE (medianoche) mientras que el kardex lleva
--     hora real, así que cinco eventos del 25/08 salían mezclados: primero la
--     factura, luego la cotización, luego la compra. Se añaden dos columnas:
--     `dia` (la fecha sin hora) y `secuencia`, que ordena por el flujo del
--     negocio —compra, recepción, cotización, venta, nota—. La pantalla ordena
--     por `dia` y luego por `secuencia`, no por `fecha`: con `fecha` a secas la
--     recepción se iba al final del día porque es la única con hora real.

set search_path = public, extensions;

create or replace view v_trazabilidad_item
with (security_invoker = true) as

-- 1 · COMPRA · lo que se le pidió al proveedor y a qué precio se pactó.
select
  ci.producto_id,
  c.fecha::timestamptz            as fecha,
  'compra'::text                  as lado,
  'compra'::text                  as evento,
  c.id                            as documento_id,
  c.numero                        as documento,
  pr.id                           as contraparte_id,
  pr.razon_social                 as contraparte,
  pr.numero_documento             as contraparte_doc,
  ci.cantidad,
  ci.costo_unitario               as unitario,
  ci.importe,
  c.estado::text                  as estado,
  c.documento_proveedor           as referencia,
  1::smallint                     as secuencia,
  c.fecha                         as dia
from compra_items ci
join compras c      on c.id = ci.compra_id
join proveedores pr on pr.id = c.proveedor_id
where c.estado <> 'anulada'

union all

-- 2 · RECEPCIÓN · lo que entró y a cuánto quedó puesto en almacén.
select
  m.producto_id,
  m.fecha,
  'compra',
  'recepcion',
  r.id,
  r.numero,
  pr.id,
  pr.razon_social,
  pr.numero_documento,
  m.cantidad,
  m.costo_unitario,
  round(m.cantidad * m.costo_unitario, 2),
  'recibida',
  coalesce(r.factura_proveedor, r.guia_proveedor),
  2,
  m.fecha::date
from movimientos_inventario m
join recepciones r       on r.id = m.referencia_id
left join proveedores pr on pr.id = r.proveedor_id
where m.referencia_tipo = 'recepcion' and m.tipo = 'ingreso'

union all

-- 3 · COTIZACIÓN · a quién se le ofreció y a qué precio. Entran TODAS, también
--     las rechazadas y las vencidas: saber a cuánto se cotizó y que el cliente
--     dijo que no es justo el dato que evita repetir el precio que ya falló.
select
  qi.producto_id,
  q.fecha::timestamptz,
  'venta',
  'cotizacion',
  q.id,
  q.numero,
  cl.id,
  cl.razon_social,
  cl.numero_documento,
  qi.cantidad,
  qi.valor_unitario,
  qi.importe,
  q.estado::text,
  q.orden_compra_cliente,
  3,
  q.fecha
from cotizacion_items qi
join cotizaciones q on q.id = qi.cotizacion_id
join clientes cl    on cl.id = q.cliente_id
where qi.producto_id is not null

union all

-- 4 · VENTA · lo que se facturó de verdad, y las notas que la corrigen.
--
--     Las anuladas se quedan fuera: un comprobante anulado no dice a qué
--     precio se vendió, dice que no se vendió.
--
--     Las NOTAS llevan su propio evento y no el de `factura`. Están en la
--     misma tabla que las facturas, así que meterlas todas juntas hacía que
--     una nota de crédito por devolución de 20 unidades se leyera como una
--     venta de 20 más. Se enseñan —la devolución es parte de la historia del
--     código— pero no cuentan como venta.
select
  di.producto_id,
  d.fecha_emision::timestamptz,
  'venta',
  case d.tipo::text
    when 'nota_credito' then 'nota_credito'
    when 'nota_debito'  then 'nota_debito'
    else 'factura'
  end,
  d.id,
  d.numero,
  cl.id,
  cl.razon_social,
  cl.numero_documento,
  di.cantidad,
  di.valor_unitario,
  di.importe,
  d.estado::text,
  d.orden_compra_cliente,
  case when d.tipo::text in ('nota_credito','nota_debito') then 5 else 4 end,
  d.fecha_emision
from comprobante_items di
join comprobantes d on d.id = di.comprobante_id
join clientes cl    on cl.id = d.cliente_id
where di.producto_id is not null and d.estado <> 'anulado';

comment on view v_trazabilidad_item is
  'Línea de tiempo de un producto: compra y recepción por un lado, cotización, venta y notas por el otro. Responde «a quién se lo compré, a cuánto, y a quién se lo ofrecí y a qué precio» (Willy, 26/08 32:45). En la recepción el unitario sale del kardex, o sea con los gastos de importación ya prorrateados. Las notas de crédito y débito llevan evento propio: se ven, pero no cuentan como venta. `secuencia` ordena los eventos del mismo día por el flujo del negocio.';

-- ---------------------------------------------------------------------------
-- Resumen de un vistazo
-- ---------------------------------------------------------------------------
-- Lo que se lee ANTES de la línea de tiempo: el mejor proveedor, el último
-- precio cotizado y cuánto se ha movido. Va como función y no como vista
-- porque necesita un producto concreto y devolver una sola fila; una vista
-- tendría que calcularlo para el catálogo entero para luego filtrar por uno.
create or replace function public.resumen_trazabilidad(p_producto uuid)
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with eventos as (
    select * from v_trazabilidad_item where producto_id = p_producto
  ),
  compras_ as (select * from eventos where lado = 'compra' and evento = 'compra'),
  ventas_  as (select * from eventos where lado = 'venta'  and evento = 'factura'),
  cotiz_   as (select * from eventos where lado = 'venta'  and evento = 'cotizacion')
  select jsonb_build_object(
    'eventos', (select count(*) from eventos),

    -- El proveedor más barato de los que SÍ nos han vendido esto. Es la
    -- respuesta a «¿a quién se lo vuelvo a pedir?».
    'mejor_proveedor', (
      select jsonb_build_object(
               'id', c.contraparte_id, 'nombre', c.contraparte,
               'unitario', c.unitario, 'fecha', c.fecha, 'documento', c.documento)
      from compras_ c order by c.unitario asc, c.fecha desc limit 1
    ),
    'ultima_compra', (
      select jsonb_build_object(
               'id', c.contraparte_id, 'nombre', c.contraparte,
               'unitario', c.unitario, 'fecha', c.fecha, 'documento', c.documento)
      from compras_ c order by c.fecha desc limit 1
    ),
    'proveedores', (select count(distinct c.contraparte_id) from compras_ c),

    'ultima_cotizacion', (
      select jsonb_build_object(
               'id', q.contraparte_id, 'nombre', q.contraparte,
               'unitario', q.unitario, 'fecha', q.fecha,
               'documento', q.documento, 'estado', q.estado)
      from cotiz_ q order by q.fecha desc limit 1
    ),
    'ultima_venta', (
      select jsonb_build_object(
               'id', v.contraparte_id, 'nombre', v.contraparte,
               'unitario', v.unitario, 'fecha', v.fecha, 'documento', v.documento)
      from ventas_ v order by v.fecha desc limit 1
    ),
    'clientes', (select count(distinct v.contraparte_id) from ventas_ v),
    'unidades_vendidas', (select coalesce(sum(v.cantidad), 0) from ventas_ v),

    -- Rango de precios cotizados. Que el mínimo y el máximo estén lejos es la
    -- señal de que el precio de este código depende del cliente, no del costo.
    'cotizado_min', (select min(q.unitario) from cotiz_ q),
    'cotizado_max', (select max(q.unitario) from cotiz_ q)
  );
$$;

comment on function public.resumen_trazabilidad(uuid) is
  'Cabecera de la trazabilidad de un producto: mejor proveedor, última compra, última cotización y rango de precios cotizados.';

revoke execute on function public.resumen_trazabilidad(uuid) from public, anon;
grant execute on function public.resumen_trazabilidad(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Índices que la vista necesita
-- ---------------------------------------------------------------------------
-- `ix_compra_items_producto`, `ix_comp_items_producto` y
-- `ix_mov_producto_fecha` ya existen desde la 002. Falta el de las líneas de
-- cotización: sin él, buscar la historia de un código obliga a recorrer todas
-- las líneas de todas las cotizaciones, que es la tabla que más crece.
create index if not exists ix_cotiz_items_producto
  on cotizacion_items (producto_id) where producto_id is not null;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_producto uuid;
  v_res jsonb;
begin
  if not exists (select 1 from pg_views where viewname = 'v_trazabilidad_item') then
    raise exception 'No se creó v_trazabilidad_item';
  end if;

  -- La vista tiene que responder para CUALQUIER producto, también uno sin
  -- historia: una ficha vacía es una respuesta legítima («nunca lo hemos
  -- movido»), y reventar ahí sería peor que no tener la pantalla.
  select p.id into v_producto from productos p limit 1;
  if v_producto is not null then
    v_res := public.resumen_trazabilidad(v_producto);
    if v_res is null or not (v_res ? 'eventos') then
      raise exception 'resumen_trazabilidad no devolvió la forma esperada';
    end if;
  end if;

  if public.resumen_trazabilidad('00000000-0000-0000-0000-000000000000'::uuid) is null then
    raise exception 'resumen_trazabilidad revienta con un producto inexistente';
  end if;

  -- Ninguna nota puede estar contándose como venta. Es el fallo que se vio en
  -- la primera versión: FC01-00000001 salía como `factura` y sumaba 20
  -- unidades vendidas que en realidad eran una devolución.
  if exists (
    select 1
    from v_trazabilidad_item t
    join comprobantes c on c.id = t.documento_id
    where t.evento = 'factura'
      and c.tipo::text in ('nota_credito','nota_debito')
  ) then
    raise exception 'Hay notas de crédito o débito contándose como ventas';
  end if;

  raise notice 'Trazabilidad por ítem: vista, resumen e índice en su sitio.';
end $$;
