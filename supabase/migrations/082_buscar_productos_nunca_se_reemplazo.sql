-- ###########################################################################
-- `buscar_productos` se quedó en la versión de la 004 durante tres semanas
-- ###########################################################################
--
-- ---------------------------------------------------------------------------
-- El problema
-- ---------------------------------------------------------------------------
-- La 004 creó `buscar_productos` devolviendo 15 columnas. La 011 y la 014 la
-- redefinieron con 16 —añadiendo `precio_minimo`— y **ninguna de las dos
-- llegó**: en PostgreSQL, `create or replace function` NO puede cambiar el
-- tipo de retorno, y el `returns table (…)` es parte del tipo. Postgres
-- responde «cannot change return type of existing function» y deja la de
-- antes.
--
-- Es la misma trampa que mordió el 16/09 con la 078 (§AM), donde añadir un
-- parámetro creó una sobrecarga en vez de reemplazar. Con el tipo de retorno
-- es peor, porque no crea nada: falla y se queda lo viejo.
--
-- ---------------------------------------------------------------------------
-- Lo que costó, y por qué nadie lo vio
-- ---------------------------------------------------------------------------
-- Tres cosas, las tres en uso diario:
--
--   1 · **La búsqueda por marca no encuentra nada.** Era el único propósito de
--       la 014, y el diario la da por aplicada el 24/08 (§R3). Comprobado el
--       17/09 en el cotizador: teclear «NTN» devuelve tres productos «SIN
--       MARCA» que llevan NTN en la descripción, y NO devuelve el 1210SC3,
--       que es NTN de verdad.
--
--   2 · **El precio mínimo nunca llega al cotizador.** Con él está muerto todo
--       el aparato de la negociación: la fila en rojo, «faltan X por unidad»,
--       el descuento máximo, el botón «Dejar en el mínimo» y —hasta el
--       17/09— el bloqueo de guardar. Escrito desde la 011, con tests, sin
--       ejecutarse nunca contra un producto real.
--
--   3 · **`estado_stock` devuelve «normal»** y las dos pantallas que lo leen
--       comparan con `'sin_stock'` y `'bajo'`, así que el aviso de stock del
--       desplegable no se pinta nunca.
--
-- Y lo que lo ocultó: `buscar.ts` hace `data as unknown as ProductoBusqueda[]`.
-- El paso por `unknown` apaga la comprobación, así que TypeScript daba por
-- bueno un objeto al que le faltaba un campo. **Un cast a `unknown` sobre el
-- resultado de una RPC es exactamente donde se esconde este fallo.**
--
-- ---------------------------------------------------------------------------
-- La solución
-- ---------------------------------------------------------------------------
-- `drop function` y volver a crearla. Y un centinela que EJECUTA la función y
-- mira las columnas del resultado, que es lo único que habría cazado esto: la
-- 011 y la 014 llevaban centinelas, pero comprobaban el texto del fuente, no
-- lo que la base responde.
-- ###########################################################################

-- Las dos firmas posibles, por si alguna quedó a medias.
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
  -- Los tres que faltaban. `precio_minimo` es el que sostiene la negociación;
  -- `precio_mercado` y `costo_promedio` son para el modal de precios de la
  -- línea (Luis, 17/09: *«ver precios y le salga modal de los precios, compra,
  -- precio mínimo, precio venta»*).
  precio_minimo numeric, precio_mercado numeric, costo_promedio numeric,
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
         p.precio_minimo, p.precio_mercado, p.costo_promedio,
         -- Los TRES valores que la aplicación compara, ni uno más. Devolvía
         -- «normal», que no existe en ninguna parte del código.
         case
           when coalesce(s.cantidad, 0) <= 0 then 'sin_stock'
           when coalesce(s.cantidad, 0) <= p.stock_minimo then 'bajo'
           else 'ok'
         end,
         -- La marca entra en la relevancia. Sin esto, buscar «SKF» devolvía
         -- todo con relevancia 0 y el orden quedaba al azar del desempate.
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
      -- Lo que la 014 nunca llegó a instalar. Los dos lados normalizan
      -- distinto a propósito: `productos.busqueda` con `normalizar_texto`
      -- (minúsculas) y `marcas.nombre_norm` con `normalizar_codigo`
      -- (MAYÚSCULAS, sin separadores). Comparar «skf» contra «SKF» no
      -- encuentra nada, así que cada mitad del OR compara con la suya.
      or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
    )
    and (not p_solo_con_stock or coalesce(s.cantidad, 0) > 0)
  order by
    -- Un código exacto gana siempre: quien teclea «6205-2RS1/C3» ya sabe cuál
    -- quiere y no le sirve que se lo ordenen por parecido.
    (p.codigo_norm = public.normalizar_codigo(p_q)) desc,
    greatest(
      similarity(p.busqueda, public.normalizar_texto(p_q)),
      similarity(m.nombre_norm, public.normalizar_codigo(p_q))
    ) desc,
    p.codigo
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.buscar_productos(text, int, boolean) to authenticated;

-- ###########################################################################
-- Centinela: EJECUTA la función y mira lo que responde
-- ###########################################################################
--
-- La 011 y la 014 también llevaban centinela, y por eso este es distinto:
-- aquellos leían el FUENTE de la función con `pg_get_functiondef` y buscaban
-- la palabra dentro. Como el fuente que leían era el que la migración acababa
-- de escribir en su propio texto —no el que quedó instalado—, daban verde
-- mientras la base seguía con la versión vieja.
--
-- Este llama a la función de verdad y comprueba las columnas del resultado.
-- Es la diferencia entre «lo escribí» y «responde».
do $$
declare
  una_marca text;
  encontrados int;
begin
  -- 1 · Que las columnas EXISTAN de verdad.
  --
  -- Referenciarlas basta: si la función instalada no las devuelve, esta
  -- consulta no llega a ejecutarse y revienta con «column does not exist».
  -- Es la comprobación que la 011 y la 014 no hicieron.
  perform b.precio_minimo, b.precio_mercado, b.costo_promedio, b.marca
  from public.buscar_productos('a', 1, false) b;

  -- 2 · Que `estado_stock` sea uno de los tres que la aplicación conoce.
  if exists (
    select 1
    from public.buscar_productos('', 50, false)
    where estado_stock not in ('sin_stock', 'bajo', 'ok')
  ) then
    raise exception
      'buscar_productos devuelve un estado_stock que la aplicacion no conoce';
  end if;

  -- 3 · Y el que de verdad importa: que BUSCAR POR MARCA encuentre.
  --
  -- Es el fallo que estuvo tres semanas vivo. Se toma una marca que tenga
  -- productos y se comprueba que teclearla los devuelve. Un centinela que
  -- mira el fuente no habría cazado esto; este sí.
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
