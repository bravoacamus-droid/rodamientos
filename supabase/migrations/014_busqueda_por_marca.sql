-- ###########################################################################
-- 014 · LA BÚSQUEDA TIENE QUE ENCONTRAR POR MARCA
-- ###########################################################################
--
-- Escribir "SKF" en la caja de búsqueda no devolvía nada, ni en el catálogo ni
-- en el constructor de cotizaciones.
--
-- El motivo: las dos funciones filtran contra `productos.busqueda`, que es una
-- columna GENERADA y por tanto solo puede mirar columnas de su propia fila:
--
--   busqueda = normalizar_texto(codigo || codigo_fabricante || descripcion)
--
-- La marca no está ahí porque no puede estarlo: vive en `marcas`, y una
-- columna generada no cruza tablas. Meterla denormalizada en `productos`
-- significaría reescribir todas las filas de una marca —con sus cuatro
-- índices GIN— cada vez que alguien le corrige el nombre.
--
-- Las dos funciones YA hacen `join marcas m`. Lo único que faltaba era usarlo
-- en el `where`.
--
-- Sobre el índice: la condición nueva es un OR entre dos columnas indexadas
-- —`busqueda` (GIN trigram) y `marca_id` (btree parcial `ix_productos_marca`)—
-- así que sigue habiendo por dónde entrar; no se degrada a scan secuencial por
-- el hecho de añadirla.
--
-- Ojo con la normalización, que no es la misma en los dos lados:
--
--   productos.busqueda   -> normalizar_texto   (minúsculas, sin tildes)
--   marcas.nombre_norm   -> normalizar_codigo  (MAYÚSCULAS, sin separadores)
--
-- Por eso el texto buscado se normaliza DE LAS DOS FORMAS y cada mitad del OR
-- compara con la suya. Comparar "skf" contra "SKF" no habría encontrado nada,
-- que es exactamente el bug que estamos arreglando.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. buscar_productos — la caja del constructor de cotizaciones
-- ---------------------------------------------------------------------------
-- OJO: la versión vigente de esta función es la de 011, NO la de 004. 011 la
-- soltó y la recreó con una columna más (`precio_minimo`, para avisar del piso
-- mientras se negocia) y con otro orden. Partir de la de 004 aquí hacía fallar
-- la migración con «cannot change return type of existing function», que es
-- justo lo que pasó la primera vez que se escribió este archivo.
--
-- Lo de abajo es la de 011 con la marca añadida y nada más. La firma no cambia,
-- así que basta `create or replace` y se conservan los GRANT que puso 012.
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
         -- La marca entra también en la relevancia. Sin esto, buscar "SKF"
         -- devolvía todo con relevancia 0 y el orden quedaba al azar del
         -- desempate. `greatest` descarta los NULL, así que con la caja vacía
         -- —normalizar_codigo('') es NULL— se comporta igual que antes.
         greatest(
           similarity(p.busqueda, public.normalizar_texto(p_q)),
           similarity(m.nombre_norm, public.normalizar_codigo(p_q))
         )
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
      or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
    )
    and (not p_solo_con_stock or coalesce(s.cantidad, 0) > 0)
  order by
    -- Un código exacto gana siempre: quien teclea "6205-2RS1/C3" ya sabe cuál
    -- quiere y no le sirve que se lo ordenen por parecido.
    (p.codigo_norm = public.normalizar_codigo(p_q)) desc,
    greatest(
      similarity(p.busqueda, public.normalizar_texto(p_q)),
      similarity(m.nombre_norm, public.normalizar_codigo(p_q))
    ) desc,
    (coalesce(s.cantidad, 0) > 0) desc,
    p.codigo_norm
  limit greatest(p_limit, 1);
$$;

comment on function public.buscar_productos(text, int, boolean) is
  'Caja única del constructor. Busca por código, código de fabricante, descripción Y MARCA. El LIKE de las tres primeras va contra `busqueda`, que sí tiene índice GIN trigram; el de la marca contra `marcas.nombre_norm`, aprovechando el join que ya existía. Devuelve `precio_minimo` porque el cotizador lo necesita para avisar del piso mientras se negocia.';

-- ---------------------------------------------------------------------------
-- 2. productos_pagina — la caja del catálogo
-- ---------------------------------------------------------------------------
-- Mismo agujero. Aquí además existe el desplegable `p_marca`, pero eso no
-- sustituye a escribir la marca en la caja: son dos gestos distintos y el
-- usuario espera que el segundo funcione.
create or replace function public.productos_pagina(
  p_cursor    text default null,
  p_limit     int  default 50,
  p_q         text default null,
  p_familia uuid default null,
  p_subfamilia   uuid default null,
  p_tipo uuid default null,
  p_marca     uuid default null,
  p_archivados boolean default false
) returns table (
  id uuid, codigo text, codigo_norm text, codigo_fabricante text, descripcion text,
  marca text, familia text, subfamilia text, tipo text, unidad text,
  stock numeric, stock_minimo numeric, stock_maximo numeric,
  precio_venta numeric, precio_promedio numeric, costo_promedio numeric,
  archivado boolean, estado_stock text
)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, p.codigo, p.codigo_norm, p.codigo_fabricante, p.descripcion,
         m.nombre, c.nombre, f.nombre, sf.nombre, p.unidad_codigo,
         coalesce(s.cantidad,0), p.stock_minimo, p.stock_maximo,
         p.precio_venta, p.precio_promedio, p.costo_promedio, p.archivado,
         case
           when coalesce(s.cantidad,0) <= 0 then 'sin_stock'
           when coalesce(s.cantidad,0) <= p.stock_minimo then 'critico'
           when p.stock_maximo > 0 and coalesce(s.cantidad,0) > p.stock_maximo then 'sobrestock'
           else 'normal' end
  from productos p
  join marcas m     on m.id = p.marca_id
  join familias c on c.id = p.familia_id
  join subfamilias f   on f.id = p.subfamilia_id
  left join tipos sf on sf.id = p.tipo_id
  left join stock s on s.producto_id = p.id
  where (p_archivados or not p.archivado)
    and (p_cursor is null or p.codigo_norm > p_cursor)
    and (p_familia  is null or p.familia_id  = p_familia)
    and (p_subfamilia    is null or p.subfamilia_id    = p_subfamilia)
    and (p_tipo is null or p.tipo_id = p_tipo)
    and (p_marca      is null or p.marca_id      = p_marca)
    and (
          p_q is null or p_q = ''
       or p.busqueda    like '%' || public.normalizar_texto(p_q)  || '%'
       or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
    )
  order by p.codigo_norm
  limit greatest(p_limit, 1);
$$;

comment on function public.productos_pagina(text, int, text, uuid, uuid, uuid, uuid, boolean) is
  'Paginación por keyset sobre codigo_norm (único e indexado). Sustituye el .range() por offset, que se degrada con 2.000+ SKU. La caja de texto busca también por marca.';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Funcional, no cosmética: se coge la marca que REALMENTE tenga más productos
-- vivos y se comprueba que buscarla por su nombre los devuelve todos. Si la
-- base aún no tiene catálogo, se avisa y no se falla: no hay nada que
-- verificar y hacer caer la migración por eso sería mentir.
do $$
declare
  v_marca   text;
  v_espera  bigint;
  v_obtiene bigint;
begin
  select m.nombre, count(*)
    into v_marca, v_espera
    from marcas m
    join productos p on p.marca_id = m.id and not p.archivado
   group by m.nombre
   order by count(*) desc, m.nombre
   limit 1;

  if v_marca is null then
    raise notice '014: no hay productos cargados todavía; la búsqueda por marca queda sin verificar.';
    return;
  end if;

  -- El límite se sube por encima de lo esperado para que no sea el `limit`
  -- quien recorte el resultado y nos dé un falso negativo.
  select count(*) into v_obtiene
    from public.buscar_productos(v_marca, (v_espera + 10)::int, false);

  if v_obtiene < v_espera then
    raise exception 'Buscar la marca % devuelve % de los % productos que tiene',
      v_marca, v_obtiene, v_espera;
  end if;

  raise notice '014: buscar "%" devuelve sus % productos. Búsqueda por marca operativa.',
    v_marca, v_obtiene;
end $$;
