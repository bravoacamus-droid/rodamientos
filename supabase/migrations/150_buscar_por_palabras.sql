-- ###########################################################################
-- 150 · EL BUSCADOR ENCUENTRA «6205 2RSH» Y «6205 SKF» (23/10)
-- ###########################################################################
--
-- El QA del 23/10: buscar `6205 2RSH` o `6205 skf` no devolvía NADA, y es
-- exactamente como se busca un rodamiento por teléfono: la medida, y después
-- el sello o la marca. El producto está —`6205-2RSH`, de SKF—, pero
-- `buscar_productos` buscaba la frase entera como un trozo seguido
-- (`like '%6205 2rsh%'`) o por parecido de trigramas con la frase entera, y
-- ni el guion del código ni la marca, que no está en la descripción, dejaban
-- que casara.
--
-- Ahora, además de lo de antes, se parte lo escrito en palabras y basta con
-- que CADA palabra esté en algún sitio del producto: en su texto, en su
-- código (sin guiones ni barras) o en su marca. El orden de los resultados
-- cambia poco: el código exacto primero, después lo que tiene todas las
-- palabras y después el parecido.
--
-- Una sola palabra se comporta igual que antes: la condición nueva solo
-- entra con dos o más.

create or replace function public.buscar_productos(p_q text, p_limit integer default 30, p_solo_con_stock boolean default false)
returns table(id uuid, codigo text, codigo_fabricante text, descripcion text, marca text, familia text, subfamilia text, tipo text, unidad text, stock numeric, precio_venta numeric, precio_promedio numeric, precio_minimo numeric, precio_mercado numeric, costo_promedio numeric, ultimo_costo numeric, estado_stock text, es_kit boolean, relevancia real)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with palabras as (
    select coalesce(array_agg(w), '{}') as w
      from regexp_split_to_table(btrim(public.normalizar_texto(p_q)), '\s+') w
     where w <> ''
  ),
  base as (
    select p.*,
           m.nombre as marca_nombre, f.nombre as familia_nombre,
           sf.nombre as subfamilia_nombre, t.nombre as tipo_nombre,
           -- Aquí está todo el truco del kit: su stock no se lee, se calcula.
           case when p.es_kit
                then public.stock_armable(p.id)
                else coalesce(s.cantidad, 0)
           end as stock_real,
           greatest(
             similarity(p.busqueda, public.normalizar_texto(p_q)),
             similarity(m.nombre_norm, public.normalizar_codigo(p_q))
           ) as rel,
           tw.todas
    from productos p
    join marcas m       on m.id = p.marca_id
    join familias f     on f.id = p.familia_id
    join subfamilias sf on sf.id = p.subfamilia_id
    left join tipos t   on t.id = p.tipo_id
    left join stock s   on s.producto_id = p.id
    cross join palabras pl
    -- 150: con dos o más palabras, ¿está cada una en algún sitio del producto?
    cross join lateral (
      select cardinality(pl.w) > 1 and not exists (
               select 1 from unnest(pl.w) x
                where not (p.busqueda like '%' || x || '%'
                           or p.codigo_norm like '%' || public.normalizar_codigo(x) || '%'
                           or m.nombre_norm like '%' || public.normalizar_codigo(x) || '%')) as todas
    ) tw
    where not p.archivado
      and (
        p_q is null or btrim(p_q) = ''
        or p.busqueda % public.normalizar_texto(p_q)
        or p.busqueda like '%' || public.normalizar_texto(p_q) || '%'
        or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
        or tw.todas
      )
  )
  select b.id, b.codigo, b.codigo_fabricante, b.descripcion,
         b.marca_nombre, b.familia_nombre, b.subfamilia_nombre, b.tipo_nombre,
         b.unidad_codigo,
         b.stock_real,
         b.precio_venta, b.precio_promedio,
         b.precio_minimo, b.precio_mercado,
         b.costo_promedio, b.ultimo_costo,
         case
           when b.stock_real <= 0 then 'sin_stock'
           when b.stock_real <= b.stock_minimo then 'bajo'
           else 'ok'
         end,
         b.es_kit,
         b.rel
  from base b
  where (not p_solo_con_stock or b.stock_real > 0)
  order by
    (b.codigo_norm = public.normalizar_codigo(p_q)) desc,
    -- 150: lo que tiene TODAS las palabras, antes que lo que solo se parece.
    b.todas desc,
    b.rel desc,
    b.codigo
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$function$;

-- Centinela: un producto con guion se encuentra por sus dos mitades y por
-- la primera mitad más su marca, escritas con espacio.
do $$
declare
  v_id uuid; v_cod text; v_marca text; v_a text; v_b text;
begin
  select p.id, p.codigo, m.nombre into v_id, v_cod, v_marca
    from productos p join marcas m on m.id = p.marca_id
   where not p.archivado and p.codigo ~ '^[0-9A-Za-z]+-[0-9A-Za-z]+$'
   order by p.codigo limit 1;
  if v_id is null then
    raise notice '150: no hay un producto con guion para probar; se salta.';
    return;
  end if;
  v_a := split_part(v_cod, '-', 1);
  v_b := split_part(v_cod, '-', 2);
  if not exists (select 1 from public.buscar_productos(v_a || ' ' || v_b, 50) r where r.id = v_id) then
    raise exception '150: «% %» no encuentra %', v_a, v_b, v_cod;
  end if;
  if not exists (select 1 from public.buscar_productos(lower(v_cod) || ' ' || lower(v_marca), 50) r where r.id = v_id) then
    raise exception '150: «% %» no encuentra %', v_cod, v_marca, v_cod;
  end if;
  if exists (select 1 from public.buscar_productos(v_a || ' zzqqxx', 50)) then
    raise exception '150: una palabra que no está en ningún producto igual devuelve resultados';
  end if;
  raise notice '150: % encontrado por «% %».', v_cod, v_a, v_b;
end $$;
