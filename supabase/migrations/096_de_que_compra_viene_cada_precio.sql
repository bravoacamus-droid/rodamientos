-- ###########################################################################
-- 096 · `v_precios_compra` DICE DE QUÉ COMPRA VIENE CADA PRECIO
-- ###########################################################################
--
-- Para el botón «volver a comprar» (§AO.5). Willy, 24/09:
--
--   *«Se me acabó el stock y quiero comprar lo mismo una segunda vez… pero no
--   sé a quién le he comprado, porque tengo tres proveedores de importación
--   vía aérea. Mucho menos sé a qué precio le he comprado, y tampoco sé cuánto
--   me han cobrado por el envío. Entonces tengo que volver a llamarlos.»*
--
-- La ficha del producto ya enseña a quién se le compró y a cuánto (067). Lo
-- que no sabía era DE QUÉ COMPRA salió cada fila, y sin eso no se puede
-- repetir: la modalidad, el courier y los gastos viven en la compra, no en la
-- recepción.
--
-- ---------------------------------------------------------------------------
-- Cómo
-- ---------------------------------------------------------------------------
-- Se reescribe desde la definición de la **067**, que es la última, y se
-- añade `compra_id` AL FINAL: `create or replace view` no admite otra cosa
-- (42P16). Si la vista viva tuviera columnas que no están aquí, el `create or
-- replace` fallaría en vez de borrarlas en silencio — que es el
-- comportamiento que se quiere.
--
-- `compra_id` es null en las recepciones sueltas, sin compra detrás. La
-- pantalla lo sabe: ahí el botón repite solo proveedor y producto.
-- ###########################################################################

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
  r.guia_proveedor,
  -- 096. De qué compra salió, para poder repetirla. Al final, por lo mismo.
  r.compra_id
from recepcion_items ri
join recepciones r    on r.id = ri.recepcion_id
join productos p      on p.id = ri.producto_id
left join proveedores pr on pr.id = r.proveedor_id
where not r.anulada;

comment on view v_precios_compra is
  'Historial de COMPRAS de un producto: a quién, cuándo, cuánto, con qué factura y de qué compra (096). Willy 07/09: «yo digito el código y me debe aparecer el historial de compras». Sale de recepciones —lo que de verdad entró y se pagó—, no de las cotizaciones de proveedores.';

-- ###########################################################################
-- Centinela · la columna nueva lleva lo que dice que lleva
-- ###########################################################################
-- Se compara contra `recepciones.compra_id` fila a fila. Mirar solo que la
-- columna exista no dice si trae el dato bueno.
do $$
declare v_mal int; v_filas int;
begin
  select count(*), count(*) filter (where v.compra_id is distinct from r.compra_id)
    into v_filas, v_mal
    from v_precios_compra v
    join recepciones r on r.id = v.recepcion_id;

  if v_mal > 0 then
    raise exception '096: % de % filas traen una compra que no es la de su recepción', v_mal, v_filas;
  end if;

  raise notice '096: % filas, todas con la compra de su recepción.', v_filas;
end $$;
