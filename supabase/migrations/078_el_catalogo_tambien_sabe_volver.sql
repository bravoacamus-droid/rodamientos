-- ###########################################################################
-- 078 · EL CATÁLOGO TAMBIÉN SABE VOLVER
-- ###########################################################################
--
-- El último de los cinco listados que solo sabían avanzar (§AJ.6, 10/09).
--
-- En las otras nueve tablas el keyset se arma en TypeScript, así que volver
-- atrás fue cambiar `lt` por `gt`, invertir el orden y dar la vuelta al array.
-- El catálogo no: pagina dentro de `productos_pagina`, y la función solo sabe
-- mirar hacia adelante —`p.codigo_norm > p_cursor`, `order by p.codigo_norm`—.
-- Por eso se quedó fuera: era la única de las cinco que necesitaba tocar la
-- base.
--
-- Se añade `p_atras`, con default `false`. Un parámetro con valor por defecto
-- al FINAL de la lista no rompe a nadie que ya la llame, que es la única forma
-- de tocar una función a la que apunta la pantalla más usada del ERP.
--
-- Ojo con el orden: la vuelta al array la sigue dando TypeScript, igual que en
-- las otras nueve. Aquí solo se invierte el sentido del recorrido.
-- ###########################################################################

create or replace function public.productos_pagina(
  p_cursor    text default null,
  p_limit     int  default 50,
  p_q         text default null,
  p_familia uuid default null,
  p_subfamilia   uuid default null,
  p_tipo uuid default null,
  p_marca     uuid default null,
  p_archivados boolean default false,
  p_atras     boolean default false
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
    -- Hacia atrás se pide lo que está POR ENCIMA del cursor. Es el mismo
    -- índice (`codigo_norm`), recorrido en el otro sentido.
    and (
          p_cursor is null
       or (not p_atras and p.codigo_norm > p_cursor)
       or (    p_atras and p.codigo_norm < p_cursor)
    )
    and (p_familia  is null or p.familia_id  = p_familia)
    and (p_subfamilia    is null or p.subfamilia_id    = p_subfamilia)
    and (p_tipo is null or p.tipo_id = p_tipo)
    and (p_marca      is null or p.marca_id      = p_marca)
    and (
          p_q is null or p_q = ''
       or p.busqueda    like '%' || public.normalizar_texto(p_q)  || '%'
       or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
    )
  order by
    case when p_atras then p.codigo_norm end desc,
    case when not p_atras then p.codigo_norm end asc
  limit greatest(p_limit, 1);
$$;

comment on function public.productos_pagina(text, int, text, uuid, uuid, uuid, uuid, boolean, boolean) is
  'Paginación por keyset sobre codigo_norm (único e indexado), en los dos sentidos. Sustituye el .range() por offset, que se degrada con 2.000+ SKU. La caja de texto busca también por marca. `p_atras` devuelve la página ANTERIOR al cursor, en orden descendente: a quien la llama le toca dar la vuelta al array, igual que en los otros nueve listados del ERP.';

-- ###########################################################################
-- Verificación
-- ###########################################################################
-- Funcional: se coge la primera página, se usa su última fila como cursor para
-- avanzar, y desde ahí se vuelve. Lo que vuelve tiene que ser exactamente la
-- primera página otra vez. Si el `order by` o el operador estuvieran del revés,
-- esto no cuadraría — y es justo el fallo que costó dos intentos en las otras.
do $$
declare
  v_pag1   text[];
  v_cursor text;
  v_vuelta text[];
  v_n      int;
begin
  select array_agg(codigo_norm order by codigo_norm)
    into v_pag1
    from (select codigo_norm from public.productos_pagina(null, 5) ) x;

  v_n := coalesce(array_length(v_pag1, 1), 0);

  if v_n < 2 then
    raise notice '078: hacen falta al menos 2 productos para verificar el volver; hay %.', v_n;
    return;
  end if;

  -- El cursor con el que se avanzó: la última de la primera página.
  v_cursor := v_pag1[v_n];

  -- Y desde la primera fila de la SEGUNDA página, volver.
  select codigo_norm into v_cursor
    from public.productos_pagina(v_cursor, 1)
   limit 1;

  if v_cursor is null then
    raise notice '078: no hay segunda página; el volver queda sin verificar.';
    return;
  end if;

  select array_agg(codigo_norm order by codigo_norm)
    into v_vuelta
    from (select codigo_norm from public.productos_pagina(v_cursor, 5, null, null, null, null, null, false, true)) y;

  if v_vuelta is distinct from v_pag1 then
    raise exception
      'productos_pagina hacia atrás no devuelve la página de la que se venía: % vs %',
      v_vuelta, v_pag1;
  end if;
end $$;
