-- ###########################################################################
-- 205 · EL DIRECTORIO DE CONTACTOS: FIJO, DISTRITO Y ZONA
-- ###########################################################################
--
-- Luis, 26/11, con el directorio que Willy lleva en Excel delante:
--
--   EMPRESA · DISTRITO · ZONA · CONTACTO · CARGO · TELEFONO · FIJO · CORREO
--   COMICSA   SJL        celima  Joe Cabanillas  Superv. de planta  989272697
--   MODIPSA   SJL        celima  Erika Navarro   jefe de logística  4595152-207
--   MODIPSA   CAMPOY     lomas   Heber Huamani   mantenimiento      967782878
--
--   *«los contactos tienen que tener así estos datos… Willy también quiere
--   distrito y zona, y tiene que ser un CRUD inteligente ese select, ya que van
--   a registrar así: no escribe a cada rato, busca y ya»*.
--
-- Tres cosas que la base no tenía:
--
--   1. El TELÉFONO FIJO, con su anexo («4595152 - 207», «7191200-axo. 101»).
--      `telefono` sigue siendo el celular: es el que ya estaba lleno.
--
--   2. La ZONA no es el distrito. En la 141 Willy dijo que «las zonas son los
--      distritos» y así nació `zonas` (142): los 50 de Lima y el Callao. En su
--      directorio son DOS columnas: el distrito (SJL) y, dentro, la zona donde
--      está la planta (celima, cajamarquilla, lomas). Así que:
--        · `zonas` (142) es, para la pantalla, el DISTRITO. No se renombra la
--          tabla: la usan sus seis funciones, los filtros y los reportes.
--        · `subzonas` (nueva) es la ZONA, con el distrito al que pertenece si
--          se sabe —lo que deja proponer «celima» al elegir SJL, y poner SJL
--          solo al elegir «celima»—.
--
--   3. Distrito y zona POR CONTACTO, además de por cliente: MODIPSA tiene a
--      tres personas en SJL/celima y a una en Campoy/lomas. Es otra planta de
--      la misma empresa. El contacto nuevo hereda los del cliente en la
--      pantalla; si queda vacío, el directorio usa los del cliente.
--
-- Borrar una zona o un distrito: solo si no lo usa nadie, diciendo cuántos,
-- como en la 142 —y ahora cuentan también los contactos—.
-- ###########################################################################

create table if not exists subzonas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) >= 2),
  nombre_norm text generated always as (public.normalizar_texto(nombre)) stored,
  -- El distrito donde queda, si se sabe. Borrar el distrito no borra la zona.
  zona_id     uuid references zonas (id) on delete set null,
  creado_en   timestamptz not null default now()
);
create unique index if not exists ux_subzonas_nombre on subzonas (nombre_norm);
create index if not exists ix_subzonas_zona on subzonas (zona_id) where zona_id is not null;

alter table subzonas enable row level security;
drop policy if exists lectura_autenticados on subzonas;
create policy lectura_autenticados on subzonas
  for select to authenticated using ((select mi_rol()) is not null);
-- Se escribe solo por sus funciones: sin políticas de escritura.
revoke all on subzonas from anon, public;
grant select on subzonas to authenticated;
grant all on subzonas to service_role;

comment on table subzonas is
  'La ZONA de la pantalla (205): dónde está la planta dentro del distrito (celima, cajamarquilla). El DISTRITO es la tabla zonas (142).';

alter table clientes
  add column if not exists subzona_id uuid references subzonas (id);
create index if not exists ix_clientes_subzona on clientes (subzona_id) where subzona_id is not null;
comment on column clientes.subzona_id is 'Zona dentro del distrito (205), p. ej. «celima» en SJL.';

alter table cliente_contactos
  add column if not exists telefono_fijo text check (telefono_fijo is null or length(telefono_fijo) <= 40),
  add column if not exists zona_id uuid references zonas (id),
  add column if not exists subzona_id uuid references subzonas (id);
comment on column cliente_contactos.telefono_fijo is 'Teléfono fijo con su anexo (205). `telefono` es el celular.';
comment on column cliente_contactos.zona_id is 'Distrito donde trabaja este contacto (205); vacío = el del cliente.';
comment on column cliente_contactos.subzona_id is 'Zona donde trabaja este contacto (205); vacía = la del cliente.';

-- ---------------------------------------------------------------------------
-- Las tres funciones de la zona. Mismo candado que las de la 142.
-- ---------------------------------------------------------------------------
create or replace function public.crear_subzona(p_nombre text, p_zona uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v text; v_id uuid;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede crear zonas' using errcode = 'insufficient_privilege';
  end if;
  v := public._nombre_de_catalogo(p_nombre, 'zona');
  select id into v_id from subzonas where nombre_norm = public.normalizar_texto(v);
  if v_id is null then
    insert into subzonas (nombre, zona_id) values (v, p_zona) returning id into v_id;
  elsif p_zona is not null then
    -- Ya existía sin distrito: se aprende ahora. Con otro distrito, se respeta.
    update subzonas set zona_id = p_zona where id = v_id and zona_id is null;
  end if;
  return (select jsonb_build_object('id', id, 'nombre', nombre, 'zona_id', zona_id) from subzonas where id = v_id);
end $$;

create or replace function public.renombrar_subzona(p_id uuid, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede cambiar zonas' using errcode = 'insufficient_privilege';
  end if;
  v := public._nombre_de_catalogo(p_nombre, 'zona');
  if exists (select 1 from subzonas where nombre_norm = public.normalizar_texto(v) and id <> p_id) then
    raise exception 'Ya hay una zona «%»', v using errcode = 'unique_violation';
  end if;
  update subzonas set nombre = v where id = p_id;
  if not found then raise exception 'Esa zona ya no existe' using errcode = 'no_data_found'; end if;
  return (select jsonb_build_object('id', id, 'nombre', nombre, 'zona_id', zona_id) from subzonas where id = p_id);
end $$;

create or replace function public.eliminar_subzona(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare n int; m int;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede eliminar zonas' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into n from clientes where subzona_id = p_id;
  select count(*) into m from cliente_contactos where subzona_id = p_id and activo;
  if n > 0 then
    raise exception 'La tienen % cliente%: cámbiales la zona antes de eliminarla', n, case when n = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  if m > 0 then
    raise exception 'La tienen % contacto%: cámbiales la zona antes de eliminarla', m, case when m = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  -- Los contactos dados de baja que la tuvieran la pierden: ya no se ven.
  update cliente_contactos set subzona_id = null where subzona_id = p_id;
  delete from subzonas where id = p_id;
end $$;

-- El distrito (zonas, 142) tampoco se borra si lo usa un contacto.
create or replace function public.eliminar_zona(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare n int; m int;
begin
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede eliminar distritos' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into n from clientes where zona_id = p_id;
  select count(*) into m from cliente_contactos where zona_id = p_id and activo;
  if n > 0 then
    raise exception 'La tienen % cliente%: cámbiales el distrito antes de eliminarlo', n, case when n = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  if m > 0 then
    raise exception 'La tienen % contacto%: cámbiales el distrito antes de eliminarlo', m, case when m = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  update cliente_contactos set zona_id = null where zona_id = p_id;
  delete from zonas where id = p_id;
end $$;

revoke execute on function public.crear_subzona(text, uuid) from public, anon;
revoke execute on function public.renombrar_subzona(uuid, text) from public, anon;
revoke execute on function public.eliminar_subzona(uuid) from public, anon;
grant execute on function public.crear_subzona(text, uuid) to authenticated, service_role;
grant execute on function public.renombrar_subzona(uuid, text) to authenticated, service_role;
grant execute on function public.eliminar_subzona(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Centinela: las ejecuta como gerencia —crear, aprender el distrito, no dejar
-- repetir, no borrar en uso— y deshace todo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ger uuid; s jsonb; s2 jsonb; v_sjl uuid; v_cli uuid; v_con uuid; v_msg text;
begin
  select id into v_ger from perfiles where rol = 'gerencia' and activo limit 1;
  if v_ger is null then raise notice '205: sin gerencia activa; centinela omitido.'; return; end if;
  select id into v_sjl from zonas where ubigeo_codigo = '150132';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    s := public.crear_subzona('  zona   de prueba 205 ');
    if s->>'zona_id' is not null then raise exception '205: nació con distrito: %', s; end if;
    s2 := public.crear_subzona('ZONA DE PRUEBA 205', v_sjl);
    if s2->>'id' <> s->>'id' then raise exception '205: duplicó la zona'; end if;
    if (s2->>'zona_id')::uuid is distinct from v_sjl then raise exception '205: no aprendió el distrito: %', s2; end if;
    s := public.renombrar_subzona((s->>'id')::uuid, 'Zona de prueba dos');
    if s->>'nombre' <> 'Zona de prueba dos' then raise exception '205: renombrar devolvió %', s; end if;

    select id into v_cli from clientes limit 1;
    insert into cliente_contactos (cliente_id, nombre, telefono_fijo, zona_id, subzona_id)
    values (v_cli, 'Contacto de prueba 205', '4595152 - 207', v_sjl, (s->>'id')::uuid)
    returning id into v_con;
    begin
      perform public.eliminar_subzona((s->>'id')::uuid);
      raise exception '205: borró una zona en uso';
    exception when foreign_key_violation then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg not like 'La tienen 1 contacto:%' then raise exception '205: mensaje inesperado: %', v_msg; end if;
    begin
      perform public.eliminar_zona(v_sjl);
      raise exception '205: borró un distrito en uso';
    exception when foreign_key_violation then null;
    end;
    delete from cliente_contactos where id = v_con;
    perform public.eliminar_subzona((s->>'id')::uuid);
    if exists (select 1 from subzonas where id = (s->>'id')::uuid) then raise exception '205: no borró la zona'; end if;
    raise exception '__205_DESHACER__';
  exception when others then
    if sqlerrm <> '__205_DESHACER__' then raise; end if;
  end;
  raise notice '205: directorio con fijo, distrito y zona.';
end $$;
