-- ###########################################################################
-- 011 · LO QUE EL CONSTRUCTOR DE COTIZACIONES NECESITA
-- ###########################################################################
--
-- Tres cosas que 004 no podía traer porque son posteriores al archivo del
-- cliente y a la confirmación del piso de venta:
--
--   1. `precio_minimo` en las consultas del cotizador. Sin él, la pantalla no
--      puede avisar del piso mientras se negocia y el vendedor se entera al
--      guardar, con un error de constraint.
--   2. `designacion_base` dentro de sustitutos_de(). Está en el esquema desde
--      009 y documentada como "alimenta la prioridad intermedia", pero la
--      cascada nunca la miró.
--   3. El histórico de precio de un producto. Willy, 28:30: "el promedio se
--      obtiene del costo y de todas las ventas que ha tenido un producto".
--      Para negociar hace falta ver esas ventas, no solo su promedio.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. buscar_productos: agrega el piso
-- ---------------------------------------------------------------------------
-- Cambia el tipo de retorno, así que hay que soltarla antes: `create or
-- replace` no puede alterar la firma de salida.
drop function if exists public.buscar_productos(text, int, boolean);

create or replace function public.buscar_productos(
  p_q              text,
  p_limit          int default 30,
  p_solo_con_stock boolean default false
) returns table (
  id uuid, codigo text, codigo_fabricante text, descripcion text,
  marca text, familia text, subfamilia text, tipo text,
  unidad text, stock numeric, precio_venta numeric, precio_promedio numeric,
  precio_minimo numeric, costo_promedio numeric, estado_stock text,
  relevancia real
)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, p.codigo, p.codigo_fabricante, p.descripcion,
         m.nombre, f.nombre, sf.nombre, t.nombre,
         p.unidad_codigo,
         coalesce(s.cantidad, 0),
         p.precio_venta, p.precio_promedio, p.precio_minimo, p.costo_promedio,
         case
           when coalesce(s.cantidad, 0) <= 0 then 'sin_stock'
           when coalesce(s.cantidad, 0) <= p.stock_minimo then 'bajo'
           else 'ok'
         end,
         similarity(p.busqueda, public.normalizar_texto(p_q))
  from productos p
  join marcas m       on m.id = p.marca_id
  join familias f     on f.id = p.familia_id
  join subfamilias sf on sf.id = p.subfamilia_id
  left join tipos t   on t.id = p.tipo_id
  left join stock s   on s.producto_id = p.id
  where not p.archivado
    and (
      p_q is null or btrim(p_q) = ''
      or p.busqueda % public.normalizar_texto(p_q)
      or p.busqueda like '%' || public.normalizar_texto(p_q) || '%'
    )
    and (not p_solo_con_stock or coalesce(s.cantidad, 0) > 0)
  order by
    -- Un código exacto gana siempre: quien teclea "6205-2RS1/C3" ya sabe cuál
    -- quiere y no le sirve que se lo ordenen por parecido.
    (p.codigo_norm = public.normalizar_codigo(p_q)) desc,
    similarity(p.busqueda, public.normalizar_texto(p_q)) desc,
    (coalesce(s.cantidad, 0) > 0) desc,
    p.codigo_norm
  limit greatest(p_limit, 1);
$$;

comment on function public.buscar_productos(text, int, boolean) is
  'Caja única del constructor. Un solo RPC en lugar del .or(ilike,ilike,ilike) de la demo: el LIKE va contra `busqueda`, que sí tiene índice GIN trigram. Devuelve `precio_minimo` porque el cotizador lo necesita para avisar del piso mientras se negocia.';

-- ---------------------------------------------------------------------------
-- 2. sustitutos_de: la designación base entra en la cascada
-- ---------------------------------------------------------------------------
-- Willy, 49:56: "si un producto no tiene stock, crear la recomendación de
-- productos que estén dentro de la familia/subfamilia, que estén en precios
-- alineados, que le marque mejor oferta".
--
-- La cascada era: equivalencia explícita (1) -> mismo tipo (2) -> misma
-- subfamilia (3). El problema es que "mismo tipo" agrupa por tipo
-- CONSTRUCTIVO: un 6205 y un 6320 comparten tipo y NO son intercambiables. La
-- banda de precio los separaba casi siempre, pero por accidente.
--
-- La designación base entra como prioridad 2, por delante del tipo: un 6205 de
-- otra marca es EL sustituto, con la misma medida exacta, y sale sin que nadie
-- haya capturado la equivalencia a mano. Además no necesita banda de precio,
-- porque la medida ya garantiza que es el mismo rodamiento.
drop function if exists public.sustitutos_de(uuid, numeric, int);

create or replace function public.sustitutos_de(
  p_producto       uuid,
  p_tolerancia_pct numeric default 25,
  p_limit          int default 10
) returns table (
  id uuid, codigo text, descripcion text, marca text,
  stock numeric, precio_venta numeric, precio_minimo numeric,
  diferencia_pct numeric, origen text, prioridad smallint, mejor_oferta boolean
)
language sql stable security definer set search_path = public, extensions
as $$
  with base as (
    select p.id, p.precio_venta, p.subfamilia_id, p.tipo_id,
           p.designacion_base, p.marca_id
    from productos p where p.id = p_producto
  ),
  candidatos as (
    -- 1 · equivalencias explícitas (bidireccionales)
    select p.id, 'equivalencia'::text as origen, 1::smallint as prioridad
    from producto_equivalencias e
    join productos p on p.id = e.equivalente_id
    where e.producto_id = p_producto and not p.archivado
    union
    select p.id, 'equivalencia'::text, 1::smallint
    from producto_equivalencias e
    join productos p on p.id = e.producto_id
    where e.equivalente_id = p_producto and not p.archivado
    union
    -- 2 · MISMA MEDIDA, otra marca. Sin banda de precio: el núcleo ISO ya
    --     garantiza que es el mismo rodamiento.
    select p.id, 'misma_medida'::text, 2::smallint
    from productos p, base b
    where p.id <> b.id and not p.archivado
      and b.designacion_base is not null
      and p.designacion_base = b.designacion_base
    union
    -- 3 · mismo tipo, precio alineado
    select p.id, 'tipo'::text, 3::smallint
    from productos p, base b
    where p.id <> b.id and not p.archivado
      and p.tipo_id is not null and p.tipo_id = b.tipo_id
      and (b.precio_venta = 0 or p.precio_venta
           between b.precio_venta * (1 - p_tolerancia_pct/100.0)
               and b.precio_venta * (1 + p_tolerancia_pct/100.0))
    union
    -- 4 · misma subfamilia, precio alineado
    select p.id, 'subfamilia'::text, 4::smallint
    from productos p, base b
    where p.id <> b.id and not p.archivado
      and p.subfamilia_id = b.subfamilia_id
      and (b.precio_venta = 0 or p.precio_venta
           between b.precio_venta * (1 - p_tolerancia_pct/100.0)
               and b.precio_venta * (1 + p_tolerancia_pct/100.0))
  ),
  mejores as (
    select c.id, min(c.prioridad) as prioridad,
           (array_agg(c.origen order by c.prioridad))[1] as origen
    from candidatos c group by c.id
  ),
  enriquecidos as (
    select p.id, p.codigo, p.descripcion, m.nombre as marca,
           coalesce(s.cantidad,0) as stock, p.precio_venta, p.precio_minimo,
           case when b.precio_venta > 0
                then round((p.precio_venta - b.precio_venta) / b.precio_venta * 100, 2)
                else 0 end as diferencia_pct,
           mj.origen, mj.prioridad
    from mejores mj
    join productos p on p.id = mj.id
    join marcas m on m.id = p.marca_id
    left join stock s on s.producto_id = p.id
    cross join base b
  )
  select e.id, e.codigo, e.descripcion, e.marca, e.stock, e.precio_venta,
         e.precio_minimo, e.diferencia_pct, e.origen, e.prioridad,
         -- "que le marque mejor oferta" (49:56): con stock y más barato.
         (e.stock > 0 and e.diferencia_pct < 0
          and e.precio_venta = min(e.precio_venta) filter (where e.stock > 0) over ()) as mejor_oferta
  from enriquecidos e
  -- Un sustituto sin stock no resuelve el problema que motivó la búsqueda.
  order by (e.stock > 0) desc, e.prioridad, abs(e.diferencia_pct), e.precio_venta
  limit greatest(p_limit, 1);
$$;

comment on function public.sustitutos_de(uuid, numeric, int) is
  'Cascada equivalencia explícita → MISMA MEDIDA (designacion_base) → tipo → subfamilia, con banda de precio y priorizando stock. La misma medida no lleva banda de precio: el núcleo ISO ya garantiza que es el mismo rodamiento en otra marca.';

-- ---------------------------------------------------------------------------
-- 3. Histórico de precio de un producto
-- ---------------------------------------------------------------------------
-- Para negociar hace falta saber a cuánto se vendió ANTES, y sobre todo a
-- cuánto se le vendió A ESTE CLIENTE. Sin eso, el vendedor le cotiza más caro
-- que la vez pasada sin darse cuenta y el cliente sí se da cuenta.
--
-- Se lee de comprobantes emitidos, no de cotizaciones: una cotización es lo
-- que se pidió, una factura es lo que se aceptó.
create or replace function public.historial_precio_producto(
  p_producto uuid,
  p_cliente  uuid default null,
  p_limit    int  default 8
) returns table (
  fecha date,
  documento text,
  cliente text,
  cantidad numeric,
  valor_unitario numeric,
  mismo_cliente boolean
)
language sql stable security definer set search_path = public, extensions
as $$
  select c.fecha_emision,
         c.numero,
         cl.razon_social,
         ci.cantidad,
         ci.valor_unitario,
         (p_cliente is not null and c.cliente_id = p_cliente) as mismo_cliente
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  join clientes cl    on cl.id = c.cliente_id
  where ci.producto_id = p_producto
    and c.estado <> 'anulado'
  -- Lo de este cliente primero: es lo que de verdad condiciona la negociación.
  order by (p_cliente is not null and c.cliente_id = p_cliente) desc,
           c.fecha_emision desc
  limit greatest(p_limit, 1);
$$;

comment on function public.historial_precio_producto(uuid, uuid, int) is
  'A cuánto se vendió antes este producto, con lo de ESTE cliente primero. Se lee de comprobantes y no de cotizaciones: una cotización es lo que se pidió, una factura es lo que se aceptó.';

revoke all on function public.historial_precio_producto(uuid, uuid, int) from public, anon;
grant execute on function public.historial_precio_producto(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from information_schema.routines
   where routine_schema = 'public' and routine_name = 'historial_precio_producto';
  if v = 0 then raise exception 'Falta historial_precio_producto'; end if;

  -- Que las firmas nuevas devuelvan de verdad el piso.
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'buscar_productos'
     and pg_get_function_result(p.oid) like '%precio_minimo%';
  if not found then raise exception 'buscar_productos no devuelve precio_minimo'; end if;

  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sustitutos_de'
     and pg_get_function_result(p.oid) like '%precio_minimo%';
  if not found then raise exception 'sustitutos_de no devuelve precio_minimo'; end if;

  raise notice 'Constructor: buscar_productos y sustitutos_de con piso, e historial de precio.';
end $$;
