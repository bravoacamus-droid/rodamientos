-- ###########################################################################
-- 113 · LAS CONDICIONES DE LA COTIZACIÓN, GUARDADAS
-- ###########################################################################
--
-- Luis, 12/10, mirando «Nueva cotización»:
--
--   *«esa condiciones va a hacer un select inteligente que va a guardar cosas
--   ahí, añadir o eliminar […] factura por 30 días, 60, 90 días […] para crear
--   un nuevo o eliminar, un CRUD, editar todo eso»*.
--
-- Hasta hoy era texto libre, y el histórico lo demuestra: «ENTREGA INMEDIATA»
-- está escrita de siete maneras («ENTREGA INMEDIAT», «ENTREGA  INMEDIATA»,
-- «DISPONIBLE PARA ENTREGA INMEDIATA.»…). Una lista que se elige no se escribe
-- mal.
--
-- La cotización sigue guardando el TEXTO (`cotizaciones.condiciones`): lo que
-- se mandó al cliente no cambia porque mañana alguien edite o borre la opción.
-- Esta tabla es solo la lista de donde se elige.
--
-- Las opciones iniciales NO van aquí: son datos de Willy (CLAUDE.md §3) y se
-- cargan por SQL directo.
-- ###########################################################################

set local search_path = public, extensions;

create table if not exists condiciones_cotizacion (
  id        uuid primary key default gen_random_uuid(),
  texto     text not null check (char_length(btrim(texto)) between 2 and 200),
  orden     integer not null default 0,
  creado_en timestamptz not null default now(),
  creado_por uuid references perfiles(id) default auth.uid()
);

-- Sin repetidas, aunque cambien mayúsculas o espacios.
create unique index if not exists ux_condiciones_texto
  on condiciones_cotizacion (lower(regexp_replace(btrim(texto), '\s+', ' ', 'g')));

comment on table condiciones_cotizacion is
  'Las condiciones que se eligen al cotizar (113): «Factura a 30 días», «Entrega inmediata»… La cotización guarda el texto, no la referencia.';

alter table condiciones_cotizacion enable row level security;

drop policy if exists "lectura" on condiciones_cotizacion;
create policy "lectura" on condiciones_cotizacion
  for select to authenticated using ((select public.mi_rol()) is not null);
-- Quien cotiza mantiene la lista: es quien la usa.
drop policy if exists "alta" on condiciones_cotizacion;
create policy "alta" on condiciones_cotizacion
  for insert to authenticated with check ((select public.puede_escribir('cotizaciones')));
drop policy if exists "cambio" on condiciones_cotizacion;
create policy "cambio" on condiciones_cotizacion
  for update to authenticated
  using ((select public.puede_escribir('cotizaciones')))
  with check ((select public.puede_escribir('cotizaciones')));
drop policy if exists "baja" on condiciones_cotizacion;
create policy "baja" on condiciones_cotizacion
  for delete to authenticated using ((select public.puede_escribir('cotizaciones')));

grant select, insert, update, delete on condiciones_cotizacion to authenticated;

-- Centinela: el índice no deja repetir la misma con otra forma.
do $$
begin
  begin
    insert into condiciones_cotizacion (texto) values ('__113 prueba__');
    insert into condiciones_cotizacion (texto) values ('  __113   PRUEBA__ ');
    raise exception '113: dejó guardar la misma condición dos veces';
  exception when unique_violation then null;
  end;
  delete from condiciones_cotizacion where texto = '__113 prueba__';
  raise notice '113: condiciones_cotizacion lista; no admite repetidas.';
end $$;
