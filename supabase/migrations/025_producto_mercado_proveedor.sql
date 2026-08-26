-- ###########################################################################
-- 025 · PRECIO DE MERCADO Y PROVEEDOR EN EL PRODUCTO
-- ###########################################################################
--
-- Dos campos que Willy pidió en la demo del 26/08, y la plantilla de carga
-- que los tiene que poder traer. Es lo urgente de los dos: va a subir **más de
-- 3.000 rodamientos ya clasificados**, y una columna que no exista el día de
-- la carga se pierde.
--
-- ---------------------------------------------------------------------------
-- 1 · `precio_mercado`
-- ---------------------------------------------------------------------------
-- (11:41) «PM, yo lo he considerado como precio de mercado… para tener una
-- referencia de cómo se está vendiendo. Porque con ese precio rápidamente yo
-- ya le agrego un 20 %, un porcentaje para asegurarme y puedo lanzar una
-- cotización rápida.»
--
-- O sea que no es un precio de venta ni un piso: es **a cuánto se ve que está
-- el mercado**, para poder cotizar de memoria cuando la cosa corre («paso de
-- emergencia… acá las cosas son rápidas»). No entra en ninguna validación: no
-- bloquea, no calcula totales, no viaja a SUNAT. Solo se enseña.
--
-- OJO, Y ES LO MÁS IMPORTANTE DE ESTA MIGRACIÓN: `precio_mercado` es un campo
-- NUEVO y NO toca `precio_minimo`. La columna `P.M. $` del Excel se sigue
-- cargando como el piso, que es lo que él mismo confirmó el 21/08 («es el
-- precio mínimo que se puede vender… no puede vender menos de eso»). Las dos
-- frases se contradicen y hay que preguntárselo antes de la carga masiva; si
-- resulta que su P.M. era el precio de mercado, hoy cada producto tendría un
-- piso duro que él nunca fijó. Ver docs/FEEDBACK-26-08.md §2.1.
--
-- Mientras tanto el importador AVISA de esa lectura en la previsualización,
-- para que la decisión se tome mirando, no por omisión.
--
-- ---------------------------------------------------------------------------
-- 2 · `proveedor_id`
-- ---------------------------------------------------------------------------
-- (7:40) «Falta proveedor, por ejemplo proveedor de dónde se compró ese ítem.»
--
-- El historial de a quién se le ha comprado ya lo responde la trazabilidad
-- (024). Esto es otra cosa: el proveedor HABITUAL, el que se pone en la ficha
-- para saber a quién pedirle sin mirar la historia. Es una sugerencia editable,
-- no un dato derivado — por eso es una columna y no una vista.
--
-- `on delete set null` y no `restrict`: dar de baja a un proveedor no puede
-- impedir borrar nada ni dejar el producto inaccesible. Se queda sin proveedor
-- habitual y ya.

set search_path = public, extensions;

alter table productos
  add column if not exists precio_mercado numeric(14,2) not null default 0;

alter table productos
  add column if not exists proveedor_id uuid references proveedores(id) on delete set null;

do $$ begin
  alter table productos add constraint productos_mercado_pos check (precio_mercado >= 0);
exception when duplicate_object then null; end $$;

create index if not exists ix_productos_proveedor
  on productos (proveedor_id) where proveedor_id is not null;

comment on column productos.precio_mercado is
  'A cuánto se ve que está el mercado. Referencia para cotizar rápido (Willy 26/08, 11:41), NO un piso ni un precio de venta: no entra en ninguna validación.';
comment on column productos.proveedor_id is
  'Proveedor habitual. Es una sugerencia editable, no el historial: a quién se le ha comprado de verdad lo responde v_trazabilidad_item (024).';

-- ---------------------------------------------------------------------------
-- 3 · El catálogo, con los campos nuevos
-- ---------------------------------------------------------------------------
-- `v_productos_stock` gana las dos columnas. Van al final porque
-- `create or replace view` solo admite añadir por ahí.
create or replace view v_productos_stock
with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.codigo_norm,
  p.codigo_fabricante,
  p.descripcion,
  m.nombre                       as marca,
  m.segmento                     as marca_segmento,
  c.nombre                       as familia,
  f.nombre                       as subfamilia,
  sf.nombre                      as tipo,
  p.familia_id, p.subfamilia_id, p.tipo_id, p.marca_id,
  p.unidad_codigo,
  u.abreviatura                  as unidad,
  coalesce(s.cantidad, 0)        as stock,
  coalesce(s.reservado, 0)       as reservado,
  coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible,
  p.stock_minimo,
  p.stock_maximo,
  p.costo_promedio,
  p.ultimo_costo,
  p.precio_promedio,
  p.precio_venta,
  round(coalesce(s.valorizado, 0), 2) as valorizado,
  case when p.costo_promedio > 0
       then round((p.precio_venta - p.costo_promedio) / p.costo_promedio * 100, 2)
       else null end             as margen_pct,
  case
    when coalesce(s.cantidad, 0) < 0 then 'negativo'
    when coalesce(s.cantidad, 0) = 0 then 'sin_stock'
    when p.stock_minimo > 0 and coalesce(s.cantidad, 0) <= p.stock_minimo then 'critico'
    when p.stock_maximo > 0 and coalesce(s.cantidad, 0) > p.stock_maximo then 'sobrestock'
    else 'normal'
  end                            as estado_stock,
  p.ubicacion,
  p.peso_kg,
  p.archivado,
  p.creado_en,
  p.actualizado_en,
  -- Nuevas en la 025. Van al final por obligación de `create or replace view`,
  -- no por orden de lectura.
  p.precio_minimo,
  p.precio_mercado,
  p.proveedor_id,
  prov.razon_social              as proveedor
from productos p
join marcas m        on m.id  = p.marca_id
join familias c    on c.id  = p.familia_id
join subfamilias f      on f.id  = p.subfamilia_id
left join tipos sf on sf.id = p.tipo_id
join unidades_medida u on u.codigo = p.unidad_codigo
left join stock s    on s.producto_id = p.id
left join proveedores prov on prov.id = p.proveedor_id;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'productos' and column_name = 'precio_mercado'
  ) then
    raise exception 'No se creó productos.precio_mercado';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_name = 'productos' and column_name = 'proveedor_id'
  ) then
    raise exception 'No se creó productos.proveedor_id';
  end if;

  -- El piso NO se ha tocado. Es el punto de toda la migración: mientras Willy
  -- no aclare qué es su columna P.M., `precio_minimo` se queda como está.
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'productos' and column_name = 'precio_minimo'
  ) then
    raise exception 'Se perdió productos.precio_minimo';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cotiz_item_respeta_piso'
  ) then
    raise exception 'Se perdió el check que hace cumplir el piso de venta';
  end if;

  raise notice 'Productos: precio de mercado y proveedor habitual. El piso sigue intacto.';
end $$;
