-- ###########################################################################
-- 201 · EL KARDEX SE FILTRA POR FAMILIA, MARCA Y TEXTO, Y SE RESUME
-- ###########################################################################
--
-- Luis (19/11): *«en la página de kardex tenemos que poner más filtros
-- profesionales, como también buscar por producto, porque si no, ¿cómo sé qué
-- producto?… tener una mejor trazabilidad»*.
--
-- El kardex solo se podía filtrar por un producto llegando desde el catálogo
-- (un id en la URL), por tipo de movimiento y por fechas. `v_kardex` no traía
-- ni la familia ni la marca del producto, así que no había por dónde filtrar.
--
-- 1. `v_kardex` suma al FINAL (create or replace view solo añade columnas al
--    final): código de fábrica, unidad, marca, familia, subfamilia y el id
--    del usuario. Sigue siendo `security_invoker`: manda RLS.
-- 2. `kardex_resumen(...)`: con los MISMOS filtros que la lista, cuántos
--    movimientos, cuánto entró y cuánto salió (en cantidad y al costo), y si
--    hay UN producto puesto, el saldo con el que empezó el periodo y con el
--    que terminó. Es lo que pide un kardex de verdad: «saldo anterior,
--    entradas, salidas, saldo final».
-- ###########################################################################

create or replace view public.v_kardex
with (security_invoker = true) as
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
  -- 201: lo que hace falta para filtrar y para el Excel.
  p.codigo_fabricante,
  p.unidad_codigo,
  p.marca_id,
  m.nombre as marca,
  p.familia_id,
  f.nombre as familia,
  p.subfamilia_id,
  s.nombre as subfamilia,
  mi.usuario_id
from movimientos_inventario mi
join productos p on p.id = mi.producto_id
left join perfiles pf on pf.id = mi.usuario_id
left join marcas m on m.id = p.marca_id
left join familias f on f.id = p.familia_id
left join subfamilias s on s.id = p.subfamilia_id;

-- El resumen, con los mismos filtros que la lista. `security invoker` y sobre
-- la vista: lee lo mismo que podría leer quien la llama, ni una fila más.
create or replace function public.kardex_resumen(
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
  movimientos     bigint,
  productos       bigint,
  entradas        numeric,
  salidas         numeric,
  valor_entradas  numeric,
  valor_salidas   numeric,
  saldo_inicial   numeric,
  saldo_final     numeric
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
      )
  )
  select
    count(*)::bigint,
    count(distinct producto_id)::bigint,
    coalesce(sum(entrada), 0),
    coalesce(sum(salida), 0),
    round(coalesce(sum(entrada * costo_unitario), 0), 2),
    round(coalesce(sum(salida * costo_unitario), 0), 2),
    -- Los saldos solo tienen sentido para UN producto: sumados entre
    -- productos distintos no son nada.
    case when p_producto is null then null else coalesce((
      select k.saldo_cantidad from v_kardex k
      where k.producto_id = p_producto and p_desde is not null and k.fecha < p_desde
      order by k.id desc limit 1), 0) end,
    case when p_producto is null then null else coalesce((
      select k.saldo_cantidad from v_kardex k
      where k.producto_id = p_producto and (p_hasta is null or k.fecha <= p_hasta)
      order by k.id desc limit 1), 0) end
  from filtrado
$function$;

comment on function public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz) is
  'Totales del kardex con los mismos filtros que la lista; con un producto, saldo inicial y final del periodo (201).';

revoke all on function public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.kardex_resumen(uuid, uuid, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- Centinela --
-- Se EJECUTA: con un producto que tenga movimientos, el saldo final del
-- resumen tiene que ser el saldo del último movimiento, y las entradas menos
-- las salidas de todo su historial tienen que dar ese mismo saldo.
do $centinela$
declare
  v_prod  uuid;
  v_r     record;
  v_ult   numeric;
begin
  select producto_id into v_prod from movimientos_inventario order by id desc limit 1;
  if v_prod is null then
    return;
  end if;
  select * into v_r from public.kardex_resumen(p_producto => v_prod);
  select saldo_cantidad into v_ult from movimientos_inventario where producto_id = v_prod order by id desc limit 1;
  if v_r.saldo_final is distinct from v_ult then
    raise exception '201: saldo final % y último saldo % no coinciden', v_r.saldo_final, v_ult;
  end if;
  if v_r.entradas - v_r.salidas is distinct from v_ult then
    raise exception '201: entradas - salidas (%) no da el saldo (%)', v_r.entradas - v_r.salidas, v_ult;
  end if;
  perform 1 from public.v_kardex where familia is not null or marca is not null limit 1;
end
$centinela$;
