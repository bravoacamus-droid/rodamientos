-- ###########################################################################
-- 061 · LAS ALTERNATIVAS SON LAS DEL MISMO CÓDIGO BÁSICO
-- ###########################################################################
--
-- Willy, 07/09 (08:56), sobre un 6309 sin stock:
--
--   *«los que tienen ese número básico, porque el 6308 tiene otra medida, el
--   6207 tiene otra medida. Claro que pertenecen todos a una misma subfamilia
--   de productos, porque todos son de la serie 60, que son rodamientos rígidos
--   de bola y tienen una característica determinada. Pero no puedo reemplazar
--   un 6309 por un 6307 o un 08, porque ya tienen diferentes medidas. El
--   número básico ya te define las tres medidas principales del rodamiento: el
--   interior, el exterior y la altura.»*
--
-- Y qué SÍ vale:
--
--   *«puede que me pidan con dos Z C3, que es el tapa de goma, y no hay en
--   ningún lado, y yo le puedo ofrecer con 2RS: es una alternativa posible.»*
--
-- ---------------------------------------------------------------------------
-- Lo que estaba mal
-- ---------------------------------------------------------------------------
-- La cascada de la 011 tenía cuatro escalones:
--
--   1. equivalencia capturada a mano
--   2. misma `designacion_base` — el código básico
--   3. mismo TIPO constructivo, con banda de precio de ±25 %
--   4. misma SUBFAMILIA, con la misma banda
--
-- Los dos últimos son exactamente lo que Willy acaba de descartar. La 011 ya
-- sospechaba del tercero —*«un 6205 y un 6320 comparten tipo y NO son
-- intercambiables; la banda de precio los separaba casi siempre, pero por
-- accidente»*— y aun así lo dejó, con la banda haciendo de red.
--
-- La red no aguanta: un 6307 y un 6309 son de la misma subfamilia y cuestan
-- parecido, así que la banda los deja pasar. Y el daño no es una sugerencia
-- fea, es un rodamiento que no entra en el eje, a un cliente que confió en que
-- se lo estábamos ofreciendo como recambio.
--
-- **Una alternativa equivocada es peor que ninguna alternativa.** Aquí no se
-- está adivinando un texto: se está afirmando que dos piezas son
-- intercambiables, y eso o se sabe o no se dice.
--
-- ---------------------------------------------------------------------------
-- Lo que queda
-- ---------------------------------------------------------------------------
-- Dos escalones, y los dos afirman lo mismo con fundamento:
--
--   1. **equivalencia capturada a mano** — alguien que sabe lo decidió;
--   2. **mismo código básico** — el núcleo ISO fija diámetro interior,
--      exterior y altura, así que 6309-2ZC3 y 6309-2RS entran en el mismo eje.
--      Cambia el sellado y el juego, y eso es justo lo que Willy elige a ojo.
--
-- Se va también `p_tolerancia_pct`: sin escalones que dependan del precio, una
-- banda de precio no separa nada. Dejarla en la firma sugeriría que sigue
-- protegiendo de algo.
--
-- ---------------------------------------------------------------------------
-- El precio de esto, dicho en voz alta
-- ---------------------------------------------------------------------------
-- De los 790 productos del catálogo, **394 tienen código básico y 396 no**.
-- Los que no lo tienen no son rodamientos: son o-rings (`ON-2.5X14.5`), pines
-- (`PIN5X40`), fajas (`3V-1180`), retenes y juntas, cuyo código empieza por
-- letras y guion y no encaja en el patrón `^[A-Z]{0,4}[0-9]{2,5}`.
--
-- Para esos, a partir de ahora solo salen las equivalencias capturadas a mano.
-- Antes salían sugerencias por subfamilia, que es precisamente lo que se está
-- quitando por no ser de fiar. Que no salga nada es la respuesta honesta
-- mientras nadie diga cuál es el «código básico» de un o-ring.
-- ###########################################################################

set local search_path = public, extensions;

drop function if exists public.sustitutos_de(uuid, numeric, int);
drop function if exists public.sustitutos_de(uuid, int);

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
    -- 1 · Equivalencias explícitas, en los dos sentidos. Las capturó alguien
    --     que sabe, y mandan sobre cualquier regla automática.
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
    --     Sin banda de precio: la medida ya garantiza que entra en el eje, y
    --     un 6309 de marca cara sigue siendo un 6309.
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
  )
  select e.id, e.codigo, e.descripcion, e.marca, e.stock, e.precio_venta,
         e.precio_minimo, e.diferencia_pct, e.origen, e.prioridad,
         -- «que le marque mejor oferta» (49:56): con stock y más barato.
         (e.stock > 0 and e.diferencia_pct < 0
          and e.precio_venta = min(e.precio_venta) filter (where e.stock > 0) over ()) as mejor_oferta
  from enriquecidos e
  -- Un sustituto sin stock no resuelve el problema que motivó la búsqueda,
  -- pero se enseña igual: saber que existe en otra marca vale para salir a
  -- comprarlo.
  order by (e.stock > 0) desc, e.prioridad, abs(e.diferencia_pct), e.precio_venta
  limit greatest(p_limit, 1);
$$;

comment on function public.sustitutos_de(uuid, int) is
  'Alternativas de un producto: equivalencia capturada a mano, o MISMO CÓDIGO BÁSICO. Willy 07/09: «no puedo reemplazar un 6309 por un 6307 o un 08, porque ya tienen diferentes medidas; el número básico ya te define las tres medidas principales». Se quitaron los escalones por tipo y por subfamilia de la 011: la serie 60 agrupa rodamientos que NO son intercambiables, y la banda de precio los separaba por accidente.';
