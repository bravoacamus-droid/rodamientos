-- ###########################################################################
-- 065 · LA MEJOR OPCIÓN, AUNQUE NO HAYA STOCK
-- ###########################################################################
--
-- Willy, 49:56: *«si un producto no tiene stock, crear la recomendación de
-- productos… que le marque mejor oferta»*. Luis lo repitió el 07/09 mirando la
-- pantalla: *«la mejor recomendación»*.
--
-- ---------------------------------------------------------------------------
-- Por qué no se veía nunca
-- ---------------------------------------------------------------------------
-- La marca exigía TRES cosas a la vez:
--
--     stock > 0  AND  diferencia_pct < 0  AND  es la más barata con stock
--
-- Y la primera la mata. Las alternativas salen justo cuando el producto NO
-- tiene stock, y en este catálogo el que no tiene stock casi nunca lo tiene
-- tampoco en las otras variantes: el 6309 y sus tres hermanas están las cuatro
-- en cero. Resultado: `mejor_oferta` era `false` en las tres, siempre, y la
-- recomendación que pidió Willy no la vio nadie desde que se programó.
--
-- Es el mismo fallo que el «hist.» de 12 px: la función existía y el camino
-- para verla, no.
--
-- ---------------------------------------------------------------------------
-- La regla nueva
-- ---------------------------------------------------------------------------
-- Se marca UNA, la que conviene ofrecer, en este orden:
--
--   1. si alguna tiene stock → la más barata DE LAS QUE TIENEN STOCK. Se
--      entrega hoy, y eso vale más que unos céntimos;
--   2. si ninguna tiene stock → la más barata de todas. Igual hay que salir a
--      comprarla, así que manda el precio.
--
-- Se cae el `diferencia_pct < 0`. Exigir que además sea más barata que el
-- producto pedido deja sin marca el caso en que todas son más caras — que es
-- precisamente cuando más falta hace saber cuál duele menos.
--
-- Y se marca solo si hay DOS o más: con una sola no hay nada que comparar, y
-- llamarla «la mejor» diría que se ha elegido cuando es la única.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.sustitutos_de(
  p_producto uuid,
  p_limit    int default 10
) returns table (
  id uuid, codigo text, descripcion text, marca text,
  stock numeric, precio_venta numeric, precio_minimo numeric,
  diferencia_pct numeric, origen text, prioridad smallint, mejor_oferta boolean
)
language sql stable security definer set search_path = public, extensions
as $$
  with base as (
    select p.id, p.precio_venta, p.designacion_base
    from productos p where p.id = p_producto
  ),
  candidatos as (
    -- 1 · Equivalencias explícitas, en los dos sentidos (061).
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
    -- 2 · Mismo código básico: misma medida, cambia el sellado o el juego.
    select p.id, 'mismo_basico'::text, 2::smallint
    from productos p, base b
    where p.id <> b.id and not p.archivado
      and b.designacion_base is not null
      and p.designacion_base = b.designacion_base
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
  ),
  con_rango as (
    select e.*,
           count(*) over () as cuantas,
           -- La que conviene: primero las que se pueden entregar hoy, y entre
           -- ellas la más barata. Un precio cero es «sin precio cargado», no
           -- «gratis», así que va al final en vez de ganar siempre.
           row_number() over (
             order by (e.stock > 0) desc,
                      (e.precio_venta > 0) desc,
                      e.precio_venta,
                      e.codigo
           ) as puesto
    from enriquecidos e
  )
  select c.id, c.codigo, c.descripcion, c.marca, c.stock, c.precio_venta,
         c.precio_minimo, c.diferencia_pct, c.origen, c.prioridad,
         (c.cuantas > 1 and c.puesto = 1) as mejor_oferta
  from con_rango c
  -- El mismo orden con el que se elige: lo entregable primero, y dentro de
  -- eso lo más barato. La marcada queda arriba sin tener que buscarla.
  order by (c.stock > 0) desc, (c.precio_venta > 0) desc, c.precio_venta, c.codigo
  limit greatest(p_limit, 1);
$$;

comment on function public.sustitutos_de(uuid, int) is
  'Alternativas de un producto: equivalencia capturada a mano, o MISMO CÓDIGO BÁSICO (061). Marca UNA como la que conviene: la más barata de las que tienen stock, o la más barata a secas si ninguna lo tiene. Antes exigía stock > 0 y por eso no se marcaba nunca — las alternativas salen justo cuando no hay stock de nada.';
