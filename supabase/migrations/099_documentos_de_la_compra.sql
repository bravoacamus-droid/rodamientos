-- ###########################################################################
-- 099 · LOS DOCUMENTOS DE LA COMPRA: LA PROFORMA CONFIRMADA, EN PDF
-- ###########################################################################
--
-- Reunión del 01/10 (§AQ). Willy: *«cuando hago el pedido me emiten una
-- factura proforma invoice […] y ese documento tiene que estar registrado, no
-- sé si se puede guardar en el sistema el escaneado o en PDF […] para
-- cualquier cosa que se le pierda»*.
--
-- Recepción ya guardaba sus papeles (068) en el bucket privado
-- `documentos-proveedor`; la compra no tenía dónde. Mismo bucket, misma
-- forma: una tabla con la RUTA (no la URL: las firmadas caducan), y el
-- archivo se ve con un enlace de diez minutos.
-- ###########################################################################

create table if not exists compra_adjuntos (
  id           uuid primary key default gen_random_uuid(),
  compra_id    uuid not null references compras(id) on delete cascade,
  -- proforma: la confirmada del proveedor de fuera; factura: la comercial;
  -- otro: guía aérea, packing list, lo que sea.
  tipo         text not null default 'proforma',
  ruta         text not null,
  nombre       text not null,
  tamano_bytes bigint,
  mime         text,
  subido_por   uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now(),
  constraint compra_adjunto_tipo check (tipo in ('proforma', 'factura', 'otro')),
  constraint compra_adjunto_ruta_unica unique (ruta)
);

create index if not exists ix_compra_adjuntos on compra_adjuntos (compra_id, creado_en);

comment on table compra_adjuntos is
  'Los documentos de una compra (099): la proforma confirmada, la factura, la guía aérea. El archivo vive en el bucket privado `documentos-proveedor`; aquí, su ruta.';

insert into permisos_rol (tabla, rol, nota)
select 'compra_adjuntos', r.rol::rol_usuario, 'documentos de la compra (099)'
from (values ('gerencia'), ('admin'), ('compras')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table compra_adjuntos enable row level security;

drop policy if exists "lectura_autenticados" on compra_adjuntos;
create policy "lectura_autenticados" on compra_adjuntos
  for select to authenticated using ((select public.mi_rol()) is not null);
drop policy if exists "escritura_insert" on compra_adjuntos;
create policy "escritura_insert" on compra_adjuntos
  for insert to authenticated with check ((select public.puede_escribir('compra_adjuntos')));
drop policy if exists "escritura_delete" on compra_adjuntos;
create policy "escritura_delete" on compra_adjuntos
  for delete to authenticated using ((select public.puede_escribir('compra_adjuntos')));

-- El bucket: las políticas de storage de la 068 dejan subir a quien puede
-- escribir `recepcion_adjuntos`. Compras está en esa lista (068), así que el
-- mismo rol sube aquí. Se comprueba, no se supone.
do $$
begin
  if not exists (
    select 1 from permisos_rol where tabla = 'recepcion_adjuntos' and rol = 'compras' and escribir
  ) then
    raise exception '099: compras no puede subir al bucket documentos-proveedor; revisa la 068';
  end if;
  raise notice '099: compra_adjuntos lista; compras sube al mismo bucket que recepción.';
end $$;
