-- ###########################################################################
-- 155 · CAMBIAR LOS PRECIOS DE UNA MARCA DE UNA VEZ, Y PODER DESHACERLO (23/10)
-- ###########################################################################
--
-- El consultor del 23/10, entre las victorias rápidas: cuando SKF sube su
-- lista un 5 %, Willy tiene que subir el precio de venta de sus cientos de
-- códigos SKF. Hoy es abrir la ficha de cada uno. Odoo y los ERP peruanos lo
-- resuelven con un «aumento por marca o familia»; aquí no había nada.
--
-- `cambiar_precios_por_marca(marca, %, aplicar)`:
--   · Con `aplicar = false` solo CUENTA y enseña ejemplos: la pantalla lo
--     muestra antes del botón que escribe.
--   · Con `aplicar = true` cambia el precio de venta —y el mínimo, en la
--     misma proporción, para que no quede por encima del de venta— de los
--     productos activos de esa marca que TIENEN precio. Redondea a céntimos.
--   · Guarda cada precio anterior en `cambios_precio_items`, y
--     `deshacer_cambio_precios` los devuelve. Solo a los que nadie tocó
--     después: si alguien ya corrigió uno a mano, se respeta su cambio.
--
-- Entre −50 % y +100 %: más allá es un dedo que se fue, no una lista nueva.

create table if not exists public.cambios_precio (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  creado_por  uuid references public.perfiles(id),
  marca_id    uuid not null references public.marcas(id),
  porcentaje  numeric(6,2) not null,
  productos   int not null,
  deshecho_en timestamptz,
  deshecho_por uuid references public.perfiles(id)
);

create table if not exists public.cambios_precio_items (
  cambio_id      bigint not null references public.cambios_precio(id) on delete cascade,
  producto_id    uuid not null references public.productos(id),
  venta_antes    numeric(14,4) not null,
  venta_despues  numeric(14,4) not null,
  minimo_antes   numeric(14,4),
  minimo_despues numeric(14,4),
  primary key (cambio_id, producto_id)
);

comment on table public.cambios_precio is
  'Cada cambio de precios por marca (155), con quién y cuándo; sus items guardan el precio anterior para deshacerlo.';

alter table public.cambios_precio enable row level security;
alter table public.cambios_precio_items enable row level security;
drop policy if exists lectura_autenticados on public.cambios_precio;
create policy lectura_autenticados on public.cambios_precio for select to authenticated
  using ((select public.mi_rol()) is not null);
drop policy if exists lectura_autenticados on public.cambios_precio_items;
create policy lectura_autenticados on public.cambios_precio_items for select to authenticated
  using ((select public.mi_rol()) is not null);
revoke all on public.cambios_precio, public.cambios_precio_items from anon;
revoke insert, update, delete on public.cambios_precio, public.cambios_precio_items from authenticated;

create or replace function public.cambiar_precios_por_marca(p_marca uuid, p_porcentaje numeric, p_aplicar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_factor numeric := 1 + p_porcentaje / 100.0;
  v_n int;
  v_id bigint;
  v_ejemplos jsonb;
begin
  -- Va lo PRIMERO (004): es `security definer` y se salta la RLS.
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar precios' using errcode = 'insufficient_privilege';
  end if;
  if p_porcentaje is null or p_porcentaje = 0 or p_porcentaje < -50 or p_porcentaje > 100 then
    raise exception 'El porcentaje tiene que estar entre -50 y 100, y no ser cero' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from marcas where id = p_marca) then
    raise exception 'Esa marca no existe' using errcode = 'check_violation';
  end if;

  select count(*) into v_n from productos
   where marca_id = p_marca and not archivado and precio_venta > 0;

  select coalesce(jsonb_agg(e order by e ->> 'codigo'), '[]'::jsonb) into v_ejemplos from (
    select jsonb_build_object('codigo', codigo, 'antes', precio_venta,
                              'despues', round(precio_venta * v_factor, 2)) as e
      from productos
     where marca_id = p_marca and not archivado and precio_venta > 0
     order by codigo limit 5) x;

  if not p_aplicar or v_n = 0 then
    return jsonb_build_object('productos', v_n, 'ejemplos', v_ejemplos, 'aplicado', false);
  end if;

  insert into cambios_precio (creado_por, marca_id, porcentaje, productos)
  values (auth.uid(), p_marca, p_porcentaje, v_n) returning id into v_id;

  insert into cambios_precio_items (cambio_id, producto_id, venta_antes, venta_despues, minimo_antes, minimo_despues)
  select v_id, id, precio_venta, round(precio_venta * v_factor, 2),
         precio_minimo, case when precio_minimo > 0 then round(precio_minimo * v_factor, 2) end
    from productos
   where marca_id = p_marca and not archivado and precio_venta > 0;

  update productos p
     set precio_venta = i.venta_despues,
         precio_minimo = coalesce(i.minimo_despues, p.precio_minimo),
         actualizado_en = now()
    from cambios_precio_items i
   where i.cambio_id = v_id and i.producto_id = p.id;

  return jsonb_build_object('productos', v_n, 'ejemplos', v_ejemplos, 'aplicado', true, 'cambio_id', v_id);
end $$;

create or replace function public.deshacer_cambio_precios(p_cambio bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_n int; v_saltados int;
begin
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar precios' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from cambios_precio where id = p_cambio and deshecho_en is null for update;
  if not found then
    raise exception 'Ese cambio no existe o ya se deshizo' using errcode = 'check_violation';
  end if;

  -- Solo los que siguen con el precio que les puso el cambio.
  update productos p
     set precio_venta = i.venta_antes,
         precio_minimo = case when i.minimo_despues is not null then i.minimo_antes else p.precio_minimo end,
         actualizado_en = now()
    from cambios_precio_items i
   where i.cambio_id = p_cambio and i.producto_id = p.id and p.precio_venta = i.venta_despues;
  get diagnostics v_n = row_count;
  select count(*) - v_n into v_saltados from cambios_precio_items where cambio_id = p_cambio;

  update cambios_precio set deshecho_en = now(), deshecho_por = auth.uid() where id = p_cambio;
  return jsonb_build_object('devueltos', v_n, 'respetados', v_saltados);
end $$;

revoke execute on function public.cambiar_precios_por_marca(uuid, numeric, boolean) from anon, public;
revoke execute on function public.deshacer_cambio_precios(bigint) from anon, public;
grant execute on function public.cambiar_precios_por_marca(uuid, numeric, boolean) to authenticated;
grant execute on function public.deshacer_cambio_precios(bigint) to authenticated;

-- Centinela: EJECUTA el cambio y su deshacer, y lo deshace todo.
do $$
declare
  v_usr uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_ven uuid := (select id from perfiles where rol = 'ventas' and activo order by creado_en limit 1);
  v_marca uuid; v_p uuid; v_antes numeric; r jsonb; v_ok boolean;
begin
  select p.marca_id, p.id, p.precio_venta into v_marca, v_p, v_antes
    from productos p where not p.archivado and p.precio_venta > 0 order by p.codigo limit 1;
  if v_marca is null then raise notice '155: no hay productos con precio; se salta.'; return; end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    r := public.cambiar_precios_por_marca(v_marca, 10, false);
    if (r ->> 'aplicado')::boolean or (select precio_venta from productos where id = v_p) <> v_antes then
      raise exception '155: la vista previa cambió precios';
    end if;

    r := public.cambiar_precios_por_marca(v_marca, 10, true);
    if (select precio_venta from productos where id = v_p) <> round(v_antes * 1.1, 2) then
      raise exception '155: el +10 %% no se aplicó';
    end if;

    v_ok := false;
    begin
      perform public.cambiar_precios_por_marca(v_marca, 500, false);
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '155: aceptó un +500 %%'; end if;

    perform public.deshacer_cambio_precios((r ->> 'cambio_id')::bigint);
    if (select precio_venta from productos where id = v_p) <> v_antes then
      raise exception '155: deshacer no devolvió el precio';
    end if;

    perform set_config('role', 'postgres', true);
    raise exception '__155_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__155_DESHACER__' then raise; end if;
  end;
  raise notice '155: cambio de precios por marca, con vista previa y deshacer.';
end $$;
