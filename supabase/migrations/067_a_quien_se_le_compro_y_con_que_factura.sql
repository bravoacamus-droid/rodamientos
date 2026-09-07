-- ###########################################################################
-- 067 · A QUIÉN SE LE COMPRÓ, Y CON QUÉ FACTURA
-- ###########################################################################
--
-- Willy, 07/09 (29:47), sobre el módulo de compras:
--
--   *«Hay que ingresar la factura. ¿A qué precio se ha comprado? ¿A quién se
--   ha comprado? ¿Con qué número de factura? ¿Fecha? Todo eso. Cosa que eso me
--   sirve de historial para una próxima que quiera comprar el mismo producto.
--   O sea, tengo que tener un módulo para hacer la consulta: yo digito el
--   código y me debe aparecer el historial de compras. Le compré a A,
--   anteriormente lo compré a B, luego lo compré a C.»*
--
-- ---------------------------------------------------------------------------
-- Lo que ya había y lo que faltaba
-- ---------------------------------------------------------------------------
-- `v_precios_compra` (042) ya da casi todo eso: producto, fecha, proveedor,
-- cantidad, costo en la moneda y en dólares, y hasta el costo de la compra
-- anterior para poder decir «subió un 12 %».
--
-- Lo que NO daba son los dos números por los que se busca un papel cuando hay
-- una discusión: la **factura del proveedor** y su **guía**. Están en
-- `recepciones` desde el principio —se piden al recibir la mercadería— y se
-- quedaban ahí.
--
-- Y son justo los que Willy nombró. «Le compré a A» se responde con el
-- proveedor; «¿con qué número de factura?» no se responde con nada.
--
-- ---------------------------------------------------------------------------
-- Se añaden al final
-- ---------------------------------------------------------------------------
-- `create or replace view` no deja reordenar ni renombrar columnas, solo
-- añadir al final. No es una molestia: es la garantía de que nada de lo que ya
-- lee esta vista se rompe por este cambio.
-- ###########################################################################

set local search_path = public, extensions;

create or replace view v_precios_compra
with (security_invoker = true) as
select
  ri.producto_id,
  p.codigo,
  p.descripcion,
  r.id                      as recepcion_id,
  r.numero                  as documento,
  r.fecha,
  r.proveedor_id,
  pr.razon_social           as proveedor,
  r.moneda,
  r.tipo_cambio,
  ri.costo_unitario         as costo_moneda,
  public.a_dolares(ri.costo_unitario, r.moneda, r.tipo_cambio) as costo_usd,
  ri.cantidad,
  -- El costo de la compra ANTERIOR del mismo producto, para poder decir
  -- «subió un 12 %» sin que la pantalla tenga que hacer dos consultas.
  lag(public.a_dolares(ri.costo_unitario, r.moneda, r.tipo_cambio))
    over (partition by ri.producto_id order by r.fecha, r.numero) as costo_anterior_usd,
  -- Los dos papeles del proveedor. Van al FINAL porque `create or replace
  -- view` no admite otra cosa.
  r.factura_proveedor,
  r.guia_proveedor
from recepcion_items ri
join recepciones r    on r.id = ri.recepcion_id
join productos p      on p.id = ri.producto_id
left join proveedores pr on pr.id = r.proveedor_id
where not r.anulada;

comment on view v_precios_compra is
  'Historial de COMPRAS de un producto: a quién, cuándo, cuánto y con qué factura. Willy 07/09: «yo digito el código y me debe aparecer el historial de compras: le compré a A, anteriormente lo compré a B». Sale de recepciones —lo que de verdad entró y se pagó—, no de las cotizaciones de proveedores, que son lo que dijeron que costaría.';
