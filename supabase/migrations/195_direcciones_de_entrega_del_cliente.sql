-- ###########################################################################
-- 195 · LAS DIRECCIONES DE ENTREGA DEL CLIENTE
-- ###########################################################################
--
-- El problema. Moisés, 06/11, desde la guía T002-00000581 (TECNOFIL, que se
-- entrega en Comas y tiene el RUC en Independencia): *«en las guías a veces
-- tiene otra dirección donde se va a enviar… algunos sabemos que sale del
-- RUC pero algunos se van a enviar a otro local… que se guarde por cliente,
-- cuando haga la guía y registre otra dirección que se guarde, y si hago otra
-- cotización y guía a ese cliente pueda seleccionar una dirección u otra…
-- tiene que ser dinámico con el ubigeo»*.
--
-- Hoy la guía proponía SIEMPRE la dirección fiscal con su ubigeo, y otra se
-- tecleaba entera cada vez —y el distrito aparte, que es donde se equivoca
-- uno: cambiar la dirección no cambiaba el distrito—. De las 581 guías
-- cargadas, 505 van a una dirección que no es la fiscal.
--
-- La solución: una lista de direcciones por cliente, cada una CON su ubigeo,
-- para que elegir una ponga las dos cosas a la vez. Se llena sola al guardar
-- una guía con una dirección que no es la fiscal (lo hace la Server Action,
-- no un disparador: así esta migración no cambia nada de lo que ya funciona).
--
-- `clave` es la dirección sin espacios ni signos, en mayúsculas: «AV. SAN
-- GENARO NRO. 222» y «Av. San Genaro Nro 222» son la misma.
-- ###########################################################################

create table if not exists public.cliente_direcciones (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  direccion     text not null check (length(btrim(direccion)) between 3 and 300),
  ubigeo_codigo text,
  clave         text generated always as (upper(regexp_replace(direccion, '[^[:alnum:]]', '', 'g'))) stored,
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now(),
  usado_en      timestamptz not null default now()
);

create unique index if not exists cliente_direcciones_unica on public.cliente_direcciones (cliente_id, clave);
create index if not exists cliente_direcciones_cliente on public.cliente_direcciones (cliente_id, usado_en desc);

comment on table public.cliente_direcciones is
  'Direcciones de entrega de un cliente distintas de la fiscal, con su ubigeo (195). Se llenan al guardar una guía.';

alter table public.cliente_direcciones enable row level security;

drop policy if exists cd_select on public.cliente_direcciones;
create policy cd_select on public.cliente_direcciones
  for select using ((select public.puede('guias', 'ver')) or (select public.puede('clientes', 'ver')));

drop policy if exists cd_insert on public.cliente_direcciones;
create policy cd_insert on public.cliente_direcciones
  for insert with check ((select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar')));

drop policy if exists cd_update on public.cliente_direcciones;
create policy cd_update on public.cliente_direcciones
  for update using ((select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar')))
  with check ((select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar')));

drop policy if exists cd_delete on public.cliente_direcciones;
create policy cd_delete on public.cliente_direcciones
  for delete using ((select public.puede('guias', 'editar')) or (select public.puede('clientes', 'editar')));

grant select, insert, update, delete on public.cliente_direcciones to authenticated;

-- Centinela: la clave junta las variantes de escritura. Se deshace.
do $$
declare v_cli uuid := (select id from clientes limit 1);
begin
  if v_cli is null then return; end if;
  begin
    insert into cliente_direcciones (cliente_id, direccion, ubigeo_codigo) values (v_cli, 'AV. SAN GENARO NRO. 222', '150117');
    begin
      insert into cliente_direcciones (cliente_id, direccion, ubigeo_codigo) values (v_cli, 'Av. San Genaro Nro 222', '150117');
      raise exception '195: dejó guardar dos veces la misma dirección';
    exception when unique_violation then null;
    end;
    raise exception '__195_DESHACER__';
  exception when others then
    if sqlerrm <> '__195_DESHACER__' then raise; end if;
  end;
end $$;
