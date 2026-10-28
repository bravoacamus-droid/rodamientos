-- 170 · Cuántas alternativas tiene cada producto, en la búsqueda
--
-- El problema. Las alternativas de un producto solo se veían DESPUÉS de
-- añadirlo a la cotización, en el botón «Alternativas» de la línea. Al
-- buscar, la lista enseñaba «stock 0» en rojo y nada más: Willy no sabía si
-- ese 6306-2Z sin stock tenía un 6306-2RS1 en el almacén hasta añadirlo y
-- abrir el diálogo. Y en la fila de la búsqueda sobraba sitio.
--
-- Luis, 28/10: «¿podemos poner ahí si tengo alternativas, y que se vea bien,
-- ya que tenemos ese espacio en blanco?».
--
-- La cuenta sale de `sustitutos_de()` y no de una copia de su criterio: si un
-- día cambia qué es una alternativa (061: equivalencia o mismo código
-- básico), la búsqueda y el diálogo siguen diciendo lo mismo. Son como mucho
-- 20 productos por búsqueda; medido el 28/10, 56 ms.

create or replace function public.cuantas_alternativas(p_ids uuid[])
returns table (producto_id uuid, total integer, con_stock integer)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select x.id,
         count(s.id)::integer,
         (count(s.id) filter (where s.stock > 0))::integer
    from unnest(p_ids[1:50]) as x(id)
    left join lateral public.sustitutos_de(x.id, 1000) s on true
   group by x.id;
$$;

-- Solo cuentas: ni precios ni costos. Como `sustitutos_de`, para quien entra.
revoke all on function public.cuantas_alternativas(uuid[]) from public, anon;
grant execute on function public.cuantas_alternativas(uuid[]) to authenticated;

-- Centinela: la cuenta coincide con lo que devuelve `sustitutos_de` para un
-- producto con alternativas, y un producto sin ninguna sale con 0.
do $$
declare
  v_id    uuid;
  v_total integer;
  v_stock integer;
  v_ref   integer;
  v_ref_s integer;
begin
  select p.id into v_id
    from productos p
   where not p.archivado and p.designacion_base is not null
     and exists (select 1 from productos q
                  where q.id <> p.id and not q.archivado
                    and q.designacion_base = p.designacion_base)
   limit 1;
  if v_id is null then
    raise notice '170: no hay ningún producto con alternativas; centinela sin caso positivo';
    return;
  end if;

  select c.total, c.con_stock into v_total, v_stock
    from public.cuantas_alternativas(array[v_id]) c;
  select count(*), count(*) filter (where stock > 0) into v_ref, v_ref_s
    from public.sustitutos_de(v_id, 1000);
  if v_total is distinct from v_ref or v_stock is distinct from v_ref_s or v_total = 0 then
    raise exception '170: la cuenta (%, %) no cuadra con sustitutos_de (%, %)', v_total, v_stock, v_ref, v_ref_s;
  end if;

  if (select count(*) from public.cuantas_alternativas(array[v_id, gen_random_uuid()])) <> 2 then
    raise exception '170: un id sin producto tiene que salir con 0, no desaparecer';
  end if;
end $$;
