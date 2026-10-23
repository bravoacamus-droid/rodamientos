-- ###########################################################################
-- 147 · DÓNDE QUEDA APUNTADA CADA COPIA DE SEGURIDAD (23/10)
-- ###########################################################################
--
-- El consultor del 23/10 la puso la primera de diez: la copia de seguridad
-- copiaba 45 tablas de 72, sin archivos, y la última era del 07/10. Nadie lo
-- sabía, porque el único sitio donde quedaba constancia de una copia era la
-- carpeta del disco de quien la corrió.
--
-- `scripts/respaldar.mjs` se reescribió (lee las tablas de la base, cuenta
-- cada una y copia Storage), y al terminar apunta aquí cómo fue, bien o mal.
-- La pantalla de Datos de la empresa lee la última fila y avisa cuando la
-- última copia BUENA tiene más de siete días: una copia que falla en silencio
-- o que nadie corre vale lo mismo que ninguna.
--
-- Solo escribe el script, con la llave de servicio. Leen gerencia y admin.

create table if not exists public.respaldos (
  id              bigint generated always as identity primary key,
  fecha           timestamptz not null default now(),
  ok              boolean not null,
  tablas          int not null default 0,
  filas           bigint not null default 0,
  archivos        int not null default 0,
  bytes_archivos  bigint not null default 0,
  equipo          text,
  detalle         text
);

comment on table public.respaldos is
  'Una fila por cada vez que se corrió scripts/respaldar.mjs, haya salido bien o no (147).';

create index if not exists respaldos_fecha on public.respaldos (fecha desc);

alter table public.respaldos enable row level security;

drop policy if exists respaldos_lectura on public.respaldos;
create policy respaldos_lectura on public.respaldos for select to authenticated
  using ((select public.mi_rol()) in ('gerencia', 'admin'));

revoke all on public.respaldos from anon;
revoke insert, update, delete on public.respaldos from authenticated;

-- Centinela: que lea gerencia, que no lea ventas y que nadie escriba desde la app.
do $$
declare v_n int;
begin
  begin
    insert into public.respaldos (ok, tablas, filas) values (true, 1, 1);

    -- Las claims antes que el rol: como authenticated sin claims, perfiles no devuelve nada.
    perform set_config('request.jwt.claims', json_build_object('sub',
      (select id from perfiles where rol = 'gerencia' and activo limit 1), 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.respaldos;
    if v_n = 0 then raise exception '147: gerencia no ve los respaldos'; end if;

    begin
      insert into public.respaldos (ok) values (true);
      raise exception '147: gerencia pudo escribir un respaldo';
    exception when insufficient_privilege then null;
    end;

    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub',
      (select id from perfiles where rol = 'ventas' and activo limit 1), 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.respaldos;
    if v_n <> 0 then raise exception '147: ventas ve los respaldos'; end if;

    perform set_config('role', 'postgres', true);
    raise exception '__147_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__147_DESHACER__' then raise; end if;
  end;
  raise notice '147: registro de respaldos listo.';
end $$;
