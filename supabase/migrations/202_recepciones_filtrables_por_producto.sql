-- ###########################################################################
-- 202 · LAS RECEPCIONES SE FILTRAN POR PRODUCTO, FAMILIA Y MARCA
-- ###########################################################################
--
-- Luis (19/11): *«en el módulo de recepciones también faltan buenos filtros,
-- necesarios, igual que en el inventario»*. La lista solo buscaba por número,
-- guía o factura del proveedor, y filtraba por proveedor y fechas: no había
-- cómo responder «¿cuándo entró el 6205?» o «¿qué recibimos de rodamientos
-- SKF este mes?».
--
-- El producto está en las LÍNEAS, no en la recepción. Filtrar con un embed
-- `!inner` desde la lista habría filtrado también las líneas que suman el
-- valor de cada recepción. Así que una vista, una fila por recepción, con:
--
--  · lo que la lista ya calculaba en Node (líneas y valor);
--  · el texto de sus productos (código, código de fábrica, descripción) para
--    buscar con un ilike;
--  · los ids de las familias, subfamilias y marcas que trae, para filtrar con
--    `cs` (contiene).
--
-- `security_invoker`: manda RLS de quien la lee, como en las tablas.
-- ###########################################################################

create or replace view public.v_recepciones_lista
with (security_invoker = true) as
select
  r.id,
  r.numero,
  r.fecha,
  r.creado_en,
  r.compra_id,
  c.numero as compra_numero,
  r.proveedor_id,
  pv.razon_social as proveedor,
  r.guia_proveedor,
  r.factura_proveedor,
  r.recibido_por,
  pf.nombre as recibido_por_nombre,
  r.anulada,
  r.moneda,
  r.tipo_cambio,
  r.observaciones,
  coalesce(l.items, 0)::int as items,
  coalesce(l.unidades, 0) as unidades,
  coalesce(l.valorizado, 0) as valorizado,
  coalesce(l.productos_texto, '') as productos_texto,
  coalesce(l.familia_ids, '{}') as familia_ids,
  coalesce(l.subfamilia_ids, '{}') as subfamilia_ids,
  coalesce(l.marca_ids, '{}') as marca_ids
from recepciones r
left join compras c on c.id = r.compra_id
left join proveedores pv on pv.id = r.proveedor_id
left join perfiles pf on pf.id = r.recibido_por
left join lateral (
  select
    count(*) as items,
    sum(ri.cantidad) as unidades,
    round(sum(ri.cantidad * ri.costo_unitario), 2) as valorizado,
    string_agg(concat_ws(' ', p.codigo, p.codigo_fabricante, p.descripcion), ' | ') as productos_texto,
    array_remove(array_agg(distinct p.familia_id), null) as familia_ids,
    array_remove(array_agg(distinct p.subfamilia_id), null) as subfamilia_ids,
    array_remove(array_agg(distinct p.marca_id), null) as marca_ids
  from recepcion_items ri
  join productos p on p.id = ri.producto_id
  where ri.recepcion_id = r.id
) l on true;

comment on view public.v_recepciones_lista is
  'La lista de recepciones con lo que hace falta para filtrar por producto, familia, subfamilia y marca (202).';

grant select on public.v_recepciones_lista to authenticated;
revoke all on public.v_recepciones_lista from anon;

-- ---------------------------------------------------------------- Centinela --
-- Las cuentas de la vista tienen que ser las de las tablas: mismo número de
-- recepciones, y el valor de cada una igual a la suma de sus líneas.
do $centinela$
declare
  v_vista  bigint;
  v_tabla  bigint;
  v_mal    bigint;
begin
  select count(*) into v_vista from public.v_recepciones_lista;
  select count(*) into v_tabla from public.recepciones;
  if v_vista <> v_tabla then
    raise exception '202: la vista tiene % recepciones y la tabla %', v_vista, v_tabla;
  end if;
  select count(*) into v_mal
  from public.v_recepciones_lista v
  where v.valorizado <> (
    select coalesce(round(sum(cantidad * costo_unitario), 2), 0) from public.recepcion_items where recepcion_id = v.id);
  if v_mal > 0 then
    raise exception '202: % recepciones con el valor descuadrado', v_mal;
  end if;
end
$centinela$;
