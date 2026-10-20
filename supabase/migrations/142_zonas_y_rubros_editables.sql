-- ###########################################################################
-- 142 · ZONAS Y RUBROS QUE SE CREAN, SE CORRIGEN Y SE BORRAN
-- ###########################################################################
--
-- Luis, 20/10, mirando la 141 en pantalla: *«en zona falta también el botón
-- de más, y el CRUD completo dentro de los select: editar si se equivocaron, o
-- eliminar si no lo necesitan; igual en rubro»*.
--
-- La 141 hizo la ZONA una clave al padrón de distritos (`ubigeo`). Ese padrón
-- es de SUNAT: no se renombra ni se borra, y «Lima Centro» no es un distrito.
-- Así que la zona pasa a su propio maestro, `zonas`, que nace con los 50
-- distritos de Lima Metropolitana y del Callao. Ningún cliente tiene zona
-- todavía (se comprueba abajo), así que cambiar la columna no pierde nada.
--
-- Borrar: solo lo que no usa nadie. Con clientes dentro se dice cuántos, en
-- vez de dejarlos sin zona en silencio.
-- ###########################################################################

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'clientes' and column_name = 'zona_codigo')
     and exists (select 1 from clientes where zona_codigo is not null) then
    raise exception '142: hay clientes con zona puesta; esta migración supone que no';
  end if;
end $$;

create table if not exists zonas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) >= 2),
  nombre_norm   text generated always as (public.normalizar_texto(nombre)) stored,
  -- El distrito del padrón del que salió, si salió de uno. Solo informativo.
  ubigeo_codigo text references ubigeo (codigo),
  creado_en     timestamptz not null default now()
);
create unique index if not exists ux_zonas_nombre on zonas (nombre_norm);

alter table zonas enable row level security;
drop policy if exists lectura_autenticados on zonas;
create policy lectura_autenticados on zonas
  for select to authenticated using ((select mi_rol()) is not null);
revoke all on zonas from anon, public;
grant select on zonas to authenticated;
grant all on zonas to service_role;

-- Los 50 distritos de Lima y el Callao. El Cercado se llama como lo dice
-- Willy: «Lima Centro».
insert into zonas (nombre, ubigeo_codigo)
select case when u.codigo = '150101' then 'Lima Centro' else u.distrito end, u.codigo
  from ubigeo u
 where u.codigo like '1501%' or u.codigo like '0701%'
on conflict (nombre_norm) do nothing;

alter table clientes drop column if exists zona_codigo;
alter table clientes add column if not exists zona_id uuid references zonas (id);
create index if not exists ix_clientes_zona_id on clientes (zona_id) where zona_id is not null;
comment on column clientes.zona_id is
  'Zona de visita (141/142): no tiene por qué ser el distrito de la dirección fiscal.';

-- ---------------------------------------------------------------------------
-- Las seis funciones. Mismo candado que crear_rubro: quien escribe clientes.
-- ---------------------------------------------------------------------------
create or replace function public._nombre_de_catalogo(p text, p_que text)
returns text language plpgsql immutable as $$
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if length(v) < 2 then
    raise exception 'El nombre de la % es demasiado corto', p_que using errcode = 'invalid_parameter_value';
  end if;
  if length(v) > 80 then
    raise exception 'El nombre de la % es demasiado largo', p_que using errcode = 'invalid_parameter_value';
  end if;
  return upper(left(v, 1)) || substr(v, 2);
end $$;

create or replace function public.crear_zona(p_nombre text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v text; v_id uuid;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede crear zonas' using errcode = 'insufficient_privilege';
  end if;
  v := public._nombre_de_catalogo(p_nombre, 'zona');
  select id into v_id from zonas where nombre_norm = public.normalizar_texto(v);
  if v_id is null then
    insert into zonas (nombre) values (v) returning id into v_id;
  end if;
  return (select jsonb_build_object('id', id, 'nombre', nombre) from zonas where id = v_id);
end $$;

create or replace function public.renombrar_zona(p_id uuid, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede cambiar zonas' using errcode = 'insufficient_privilege';
  end if;
  v := public._nombre_de_catalogo(p_nombre, 'zona');
  if exists (select 1 from zonas where nombre_norm = public.normalizar_texto(v) and id <> p_id) then
    raise exception 'Ya hay una zona «%»', v using errcode = 'unique_violation';
  end if;
  update zonas set nombre = v where id = p_id;
  if not found then raise exception 'Esa zona ya no existe' using errcode = 'no_data_found'; end if;
  return (select jsonb_build_object('id', id, 'nombre', nombre) from zonas where id = p_id);
end $$;

create or replace function public.eliminar_zona(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede eliminar zonas' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into n from clientes where zona_id = p_id;
  if n > 0 then
    raise exception 'La tienen % cliente%: cámbiales la zona antes de eliminarla', n, case when n = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  delete from zonas where id = p_id;
end $$;

create or replace function public.renombrar_rubro(p_id uuid, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede cambiar rubros' using errcode = 'insufficient_privilege';
  end if;
  v := public._nombre_de_catalogo(p_nombre, 'rubro');
  if exists (select 1 from rubros where nombre_norm = public.normalizar_texto(v) and id <> p_id) then
    raise exception 'Ya hay un rubro «%»', v using errcode = 'unique_violation';
  end if;
  update rubros set nombre = v where id = p_id;
  if not found then raise exception 'Ese rubro ya no existe' using errcode = 'no_data_found'; end if;
  return (select jsonb_build_object('id', id, 'nombre', nombre) from rubros where id = p_id);
end $$;

create or replace function public.eliminar_rubro(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede eliminar rubros' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into n from clientes where rubro_id = p_id;
  if n > 0 then
    raise exception 'Lo tienen % cliente%: cámbiales el rubro antes de eliminarlo', n, case when n = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  delete from rubros where id = p_id;
end $$;

revoke execute on function public._nombre_de_catalogo(text, text) from public, anon;
revoke execute on function public.crear_zona(text) from public, anon;
revoke execute on function public.renombrar_zona(uuid, text) from public, anon;
revoke execute on function public.eliminar_zona(uuid) from public, anon;
revoke execute on function public.renombrar_rubro(uuid, text) from public, anon;
revoke execute on function public.eliminar_rubro(uuid) from public, anon;
grant execute on function public.crear_zona(text) to authenticated, service_role;
grant execute on function public.renombrar_zona(uuid, text) to authenticated, service_role;
grant execute on function public.eliminar_zona(uuid) to authenticated, service_role;
grant execute on function public.renombrar_rubro(uuid, text) to authenticated, service_role;
grant execute on function public.eliminar_rubro(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Centinela: las ejecuta como gerencia y deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ger uuid; z jsonb; r jsonb; v_cli uuid; v_msg text;
begin
  if (select count(*) from zonas) < 50 then raise exception '142: faltan zonas'; end if;
  if not exists (select 1 from zonas where nombre = 'Lima Centro') then raise exception '142: falta Lima Centro'; end if;
  select id into v_ger from perfiles where rol = 'gerencia' and activo limit 1;
  if v_ger is null then raise notice '142: sin gerencia activa; centinela omitido.'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    z := public.crear_zona('  zona   de prueba ');
    z := public.renombrar_zona((z->>'id')::uuid, 'Zona de prueba dos');
    if z->>'nombre' <> 'Zona de prueba dos' then raise exception '142: renombrar_zona devolvió %', z; end if;
    begin
      perform public.renombrar_zona((z->>'id')::uuid, 'callao');
      raise exception '142: dejó repetir una zona';
    exception when unique_violation then null;
    end;
    r := public.crear_rubro('Rubro de prueba');
    select id into v_cli from clientes limit 1;
    update clientes set zona_id = (z->>'id')::uuid, rubro_id = (r->>'id')::uuid where id = v_cli;
    begin
      perform public.eliminar_zona((z->>'id')::uuid);
      raise exception '142: borró una zona en uso';
    exception when foreign_key_violation then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg not like 'La tienen 1 cliente:%' then raise exception '142: mensaje inesperado: %', v_msg; end if;
    update clientes set zona_id = null, rubro_id = null where id = v_cli;
    perform public.eliminar_zona((z->>'id')::uuid);
    perform public.eliminar_rubro((r->>'id')::uuid);
    if exists (select 1 from zonas where id = (z->>'id')::uuid) then raise exception '142: no borró la zona'; end if;
    raise exception '__142_DESHACER__';
  exception when others then
    if sqlerrm <> '__142_DESHACER__' then raise; end if;
  end;
  raise notice '142: zonas y rubros editables.';
end $$;
