-- ###########################################################################
-- 125 · LAS COMUNICACIONES DE BAJA, CON SU TICKET
-- ###########################################################################
--
-- Anular una factura que SUNAT ya aceptó la deja en `baja_solicitada` (004),
-- y ahí se quedaba: el XML de la comunicación de baja (RA) y su envío por
-- `sendSummary` estaban escritos en `@rodatech/sunat` desde la fase C, y
-- ninguna pantalla los llamaba. La factura salía anulada en el ERP y viva
-- en SUNAT.
--
-- La baja es asíncrona: SUNAT devuelve un TICKET y el resultado se pregunta
-- después. Hace falta guardar ese ticket, y el correlativo del día —el
-- identificador es RA-AAAAMMDD-n, y no se puede repetir—. Una comunicación
-- da de baja varios documentos, pero todos de la MISMA fecha de emisión
-- (`ReferenceDate`), así que la pantalla manda una por fecha.
--
-- Solo se escribe desde el servidor con la clave de servicio (como el envío
-- de facturas): la tabla se lee, no se toca desde el navegador.
-- ###########################################################################

set local search_path = public, extensions;

create table if not exists sunat_bajas (
  id                 uuid primary key default gen_random_uuid(),
  fecha_comunicacion date not null,
  correlativo        int  not null check (correlativo > 0),
  identificador      text not null unique,
  fecha_documentos   date not null,
  comprobantes       uuid[] not null check (cardinality(comprobantes) > 0),
  ticket             text,
  estado             text not null default 'enviada'
                       check (estado in ('enviada', 'aceptada', 'rechazada', 'error')),
  codigo             text,
  mensaje            text,
  creado_por         uuid references perfiles(id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  unique (fecha_comunicacion, correlativo)
);

comment on table sunat_bajas is
  'Comunicaciones de baja (RA) enviadas a SUNAT: una por fecha de emisión de los documentos, con su ticket. 125.';

alter table sunat_bajas enable row level security;

drop policy if exists sunat_bajas_select on sunat_bajas;
create policy sunat_bajas_select on sunat_bajas
  for select to authenticated
  using (public.tiene_rol('gerencia', 'admin', 'ventas'));

revoke insert, update, delete on sunat_bajas from authenticated, anon;

-- ------------------------------------------------------------------ Centinela
do $$
begin
  if not exists (select 1 from pg_class where relname = 'sunat_bajas' and relrowsecurity) then
    raise exception '125: sunat_bajas sin RLS';
  end if;
  if has_table_privilege('authenticated', 'sunat_bajas', 'INSERT') then
    raise exception '125: authenticated puede escribir en sunat_bajas';
  end if;
  raise notice '125: comunicaciones de baja con ticket; solo lectura desde la sesión.';
end $$;
