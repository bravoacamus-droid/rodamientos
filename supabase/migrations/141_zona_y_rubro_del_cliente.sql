-- ###########################################################################
-- 141 · LA ZONA Y EL RUBRO DEL CLIENTE
-- ###########################################################################
--
-- Willy, reunión del 20/10 (≈36:00 y 39:24):
--
--   *«cuando hacemos visitas, hacemos visitas por zonas… no vamos a ir del
--   Callao a Ate, a Lurín o a Chorrillos… cuando creo un cliente debo ponerle
--   zona, que las zonas son los distritos: Callao, Chorrillos, Ate, Lima
--   Centro, Los Olivos, San Juan de Lurigancho…»* — y no es la dirección
--   fiscal: *«no es siempre la zona de trabajo»*.
--
--   *«y el rubro, el sector productivo al que pertenece: si es textil, si es
--   pesquera, si es industria alimentaria, si es metalmecánica… con la opción
--   de que haya algún rubro medio raro que no se conoce y que se pueda
--   crear»*. Para qué: *«quiero saber con cuántas empresas agroindustriales
--   contamos… y si vale la pena incurrir en esos productos»*.
--
-- La ZONA es un distrito del padrón (`ubigeo`), no texto libre: así «Callao»
-- y «callao » son el mismo y el reporte por zona cuenta bien. Lo que se ofrece
-- son los 50 de Lima Metropolitana y el Callao; la columna admite cualquiera.
--
-- El RUBRO va en su propio maestro, como las marcas (039): un desplegable con
-- buscador y «crear» si no está. `clientes.sector` (texto libre, nunca
-- llenado: 0 de 113) se deja como está.
--
-- La lista inicial son los rubros que Willy nombró en la reunión; la suya
-- llegará después y se carga desde la pantalla (crear), no desde aquí.
-- ###########################################################################

create table if not exists rubros (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) >= 2),
  nombre_norm text generated always as (public.normalizar_texto(nombre)) stored,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);
create unique index if not exists ux_rubros_nombre on rubros (nombre_norm);

alter table rubros enable row level security;
drop policy if exists lectura_autenticados on rubros;
create policy lectura_autenticados on rubros
  for select to authenticated using ((select mi_rol()) is not null);
-- Se escribe solo por `crear_rubro`: sin políticas de escritura.
revoke all on rubros from anon, public;
grant select on rubros to authenticated;
grant all on rubros to service_role;

alter table clientes
  add column if not exists zona_codigo text references ubigeo (codigo),
  add column if not exists rubro_id uuid references rubros (id);

create index if not exists ix_clientes_zona on clientes (zona_codigo) where zona_codigo is not null;
create index if not exists ix_clientes_rubro on clientes (rubro_id) where rubro_id is not null;

comment on column clientes.zona_codigo is
  'Zona de visita (141): un distrito, que no tiene por qué ser el de la dirección fiscal.';
comment on column clientes.rubro_id is 'Sector productivo del cliente (141).';

-- ---------------------------------------------------------------------------
-- crear_rubro: como crear_marca (039). Si ya existe, lo devuelve y no falla.
-- ---------------------------------------------------------------------------
create or replace function public.crear_rubro(p_nombre text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_id     uuid;
begin
  -- Quien da de alta clientes da de alta su rubro: no tiene sentido poder
  -- crear la empresa y no lo que hace.
  if not public.puede_escribir('clientes') then
    raise exception 'Tu rol no puede crear rubros' using errcode = 'insufficient_privilege';
  end if;
  if length(v_nombre) < 2 then
    raise exception 'El nombre del rubro es demasiado corto' using errcode = 'invalid_parameter_value';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'El nombre del rubro es demasiado largo' using errcode = 'invalid_parameter_value';
  end if;

  select r.id into v_id from rubros r where r.nombre_norm = public.normalizar_texto(v_nombre);
  if v_id is not null then
    update rubros set activo = true where id = v_id and not activo;
    return (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'creado', false)
              from rubros r where r.id = v_id);
  end if;

  -- Con la primera en mayúscula y el resto como se escribió: «Agroindustria»,
  -- no «AGROINDUSTRIA» ni «agroindustria».
  insert into rubros (nombre)
  values (upper(left(v_nombre, 1)) || substr(v_nombre, 2))
  returning id into v_id;
  return (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'creado', true)
            from rubros r where r.id = v_id);
end $$;

revoke execute on function public.crear_rubro(text) from public, anon;
grant execute on function public.crear_rubro(text) to authenticated, service_role;

-- Los que nombró Willy el 20/10. Su lista completa se añade desde la pantalla.
insert into rubros (nombre) values
  ('Agroindustria'), ('Industria alimentaria'), ('Pesquera'), ('Metalmecánica'),
  ('Productos químicos'), ('Textil')
on conflict (nombre_norm) do nothing;

-- ---------------------------------------------------------------------------
-- Centinela: ejecuta crear_rubro como si fuera gerencia y guarda un cliente
-- con zona y rubro; deshace todo al salir.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ger uuid;
  v_r   jsonb;
  v_r2  jsonb;
  v_cli uuid;
begin
  select id into v_ger from perfiles where rol = 'gerencia' and activo limit 1;
  if v_ger is null then
    raise notice '141: no hay gerencia activa; centinela de crear_rubro omitido.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    v_r := public.crear_rubro('  minería   subterránea ');
    if (v_r->>'nombre') <> 'Minería subterránea' or not (v_r->>'creado')::boolean then
      raise exception '141: crear_rubro devolvió %', v_r;
    end if;
    v_r2 := public.crear_rubro('MINERIA SUBTERRANEA');
    if (v_r2->>'id') <> (v_r->>'id') or (v_r2->>'creado')::boolean then
      raise exception '141: el duplicado sin tildes no se reconoció: %', v_r2;
    end if;
    select id into v_cli from clientes limit 1;
    update clientes set zona_codigo = '070101', rubro_id = (v_r->>'id')::uuid where id = v_cli;
    if (select zona_codigo from clientes where id = v_cli) <> '070101' then
      raise exception '141: la zona no se guardó';
    end if;
    raise exception '__141_DESHACER__';
  exception when others then
    if sqlerrm <> '__141_DESHACER__' then raise; end if;
  end;
  raise notice '141: zona, rubro y crear_rubro listos.';
end $$;
