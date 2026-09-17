-- ###########################################################################
-- `buscar_productos` devuelve también el ÚLTIMO COSTO
-- ###########################################################################
--
-- Luis, 17/09, viendo el diálogo de editar artículo: *«en editar no puedo
-- poner el precio de costo, precio mínimo y el precio normal o de lista pues»*.
--
-- Poder escribirlos desde la cotización es lo que pidió, y tiene su razón en
-- este catálogo: **790 productos entraron del Excel sin costo y sin precio
-- mínimo**, y el sitio donde uno se entera de que faltan es justo cotizando.
--
-- ---------------------------------------------------------------------------
-- Por qué hace falta tocar la función para eso
-- ---------------------------------------------------------------------------
-- Porque si se pueden escribir y la pantalla no los refleja, es peor que no
-- dejarlos escribir. Y hay dos costos distintos:
--
--   · `costo_promedio` — lo que de verdad se pagó, promedio ponderado que
--     mantiene el KARDEX con cada recepción (015). Es el bueno.
--   · `ultimo_costo`   — lo que alguien anotó en la ficha. Es lo único que hay
--     mientras el producto no haya entrado nunca al almacén, que es el caso de
--     casi todo el catálogo hoy.
--
-- El buscador solo devolvía el primero, así que un producto recién cargado con
-- su costo salía igual que uno sin costo: sin margen que calcular.
--
-- Ahora vienen los dos y la pantalla usa el del kardex cuando existe. No se
-- mezclan ni se suman: se dice cuál se está mirando.
-- ###########################################################################

drop function if exists public.buscar_productos(text, int, boolean);
drop function if exists public.buscar_productos(text, integer, boolean);

create function public.buscar_productos(
  p_q              text,
  p_limit          int default 30,
  p_solo_con_stock boolean default false
) returns table (
  id uuid, codigo text, codigo_fabricante text, descripcion text,
  marca text, familia text, subfamilia text, tipo text,
  unidad text, stock numeric,
  precio_venta numeric, precio_promedio numeric,
  precio_minimo numeric, precio_mercado numeric,
  costo_promedio numeric, ultimo_costo numeric,
  estado_stock text,
  relevancia real
)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, p.codigo, p.codigo_fabricante, p.descripcion,
         m.nombre, f.nombre, sf.nombre, t.nombre,
         p.unidad_codigo,
         coalesce(s.cantidad, 0),
         p.precio_venta, p.precio_promedio,
         p.precio_minimo, p.precio_mercado,
         p.costo_promedio, p.ultimo_costo,
         case
           when coalesce(s.cantidad, 0) <= 0 then 'sin_stock'
           when coalesce(s.cantidad, 0) <= p.stock_minimo then 'bajo'
           else 'ok'
         end,
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
      -- La búsqueda por marca, que hasta la 082 nunca llegó a instalarse.
      or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
    )
    and (not p_solo_con_stock or coalesce(s.cantidad, 0) > 0)
  order by
    (p.codigo_norm = public.normalizar_codigo(p_q)) desc,
    greatest(
      similarity(p.busqueda, public.normalizar_texto(p_q)),
      similarity(m.nombre_norm, public.normalizar_codigo(p_q))
    ) desc,
    p.codigo
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.buscar_productos(text, int, boolean) to authenticated;

-- El mismo centinela de la 082, ampliado: EJECUTA la función y comprueba lo
-- que responde, no lo que la migración escribió.
do $$
declare
  una_marca text;
  encontrados int;
begin
  perform b.precio_minimo, b.precio_mercado, b.costo_promedio, b.ultimo_costo, b.marca
  from public.buscar_productos('a', 1, false) b;

  if exists (
    select 1
    from public.buscar_productos('', 50, false)
    where estado_stock not in ('sin_stock', 'bajo', 'ok')
  ) then
    raise exception
      'buscar_productos devuelve un estado_stock que la aplicacion no conoce';
  end if;

  select m.nombre into una_marca
  from marcas m
  join productos p on p.marca_id = m.id and not p.archivado
  group by m.nombre
  order by count(*) desc
  limit 1;

  if una_marca is not null then
    select count(*) into encontrados
    from public.buscar_productos(una_marca, 50, false) b
    where b.marca = una_marca;

    if encontrados = 0 then
      raise exception
        'buscar_productos(%) no devuelve ni un producto de esa marca', una_marca;
    end if;
  end if;
end $$;
