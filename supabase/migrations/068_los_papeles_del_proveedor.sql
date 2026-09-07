-- ###########################################################################
-- 068 · LOS PAPELES DEL PROVEEDOR
-- ###########################################################################
--
-- Willy, 07/09 (29:08):
--
--   *«Guía de proveedor no es necesario, ni guía de proveedor ni factura»* —
--   *«No, sí, eso hay que registrarlo»* — *«¿Le entregan su guía? ¿Su
--   factura?»* — *«Siempre nos atienden con guía y factura»* — *«¿Quiere subir
--   su guía y su factura también?»* — *«Claro»*.
--
-- Los NÚMEROS ya se apuntan al recibir (`recepciones.guia_proveedor` y
-- `factura_proveedor`). Lo que falta es el papel: la foto o el PDF que se mira
-- cuando el proveedor dice que costaba otra cosa, o cuando el contador pide el
-- sustento de una compra de hace ocho meses.
--
-- ---------------------------------------------------------------------------
-- El bucket es PRIVADO
-- ---------------------------------------------------------------------------
-- Una factura de compra lleva el RUC del proveedor, los precios a los que
-- compra Rodatech y su margen. Un bucket público es una URL que adivina
-- cualquiera y no caduca nunca: sus precios de compra quedarían al alcance de
-- quien pruebe con un identificador.
--
-- Se lee con URL firmada y de vida corta, generada por el servidor para quien
-- ya ha iniciado sesión.
--
-- ---------------------------------------------------------------------------
-- Una tabla, no dos columnas
-- ---------------------------------------------------------------------------
-- La tentación era `guia_url` y `factura_url` en `recepciones`. No vale: una
-- entrega puede venir con dos facturas, o con la guía en tres fotos porque se
-- fotografió con el móvil. Con dos columnas, la segunda foto machaca la
-- primera y nadie se entera.
--
-- Y así queda constancia de QUIÉN subió cada papel y cuándo, que es lo que se
-- pregunta el día que uno no cuadra.
-- ###########################################################################

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · El almacén de archivos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-proveedor',
  'documentos-proveedor',
  false,
  -- 10 MB. Una foto de móvil ronda los 3-5 MB y un PDF escaneado, menos.
  -- Suficiente para lo que hay que guardar, y un tope que evita que alguien
  -- suba un vídeo por error y llene el plan.
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2 · Qué papel es cada archivo
-- ---------------------------------------------------------------------------
do $$ begin
  create type tipo_papel_proveedor as enum ('guia', 'factura', 'otro');
exception when duplicate_object then null;
end $$;

create table if not exists recepcion_adjuntos (
  id           uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references recepciones(id) on delete cascade,
  tipo         tipo_papel_proveedor not null default 'otro',
  -- La ruta dentro del bucket. No la URL: las firmadas caducan, así que
  -- guardar una dejaría enlaces muertos por toda la base.
  ruta         text not null,
  nombre       text not null,
  tamano_bytes bigint,
  mime         text,
  subido_por   uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now(),
  constraint adjunto_ruta_unica unique (ruta)
);

create index if not exists ix_adjuntos_recepcion
  on recepcion_adjuntos (recepcion_id, tipo);

comment on table recepcion_adjuntos is
  'La guía y la factura del proveedor, escaneadas. Willy 07/09: «siempre nos atienden con guía y factura». Los NÚMEROS ya están en `recepciones`; esto es el papel, que es lo que se mira cuando el proveedor dice que costaba otra cosa. Una tabla y no dos columnas porque una entrega puede traer dos facturas, o la guía en tres fotos.';
comment on column recepcion_adjuntos.ruta is
  'Ruta dentro del bucket `documentos-proveedor`. NO se guarda la URL: las firmadas caducan y dejarían enlaces muertos.';

-- ---------------------------------------------------------------------------
-- 3 · Permisos y RLS de la tabla
-- ---------------------------------------------------------------------------
-- Los mismos que recepciones: quien recibe mercadería, adjunta sus papeles.
insert into permisos_rol (tabla, rol, nota)
select 'recepcion_adjuntos', r.rol::rol_usuario, 'papeles del proveedor'
from (values ('gerencia'),('admin'),('almacen'),('compras')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table recepcion_adjuntos enable row level security;

drop policy if exists "lectura_autenticados" on recepcion_adjuntos;
create policy "lectura_autenticados" on recepcion_adjuntos
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on recepcion_adjuntos;
create policy "escritura_insert" on recepcion_adjuntos
  for insert to authenticated
  with check ((select public.puede_escribir('recepcion_adjuntos')));

-- Borrar SÍ, a diferencia del resto del ERP: aquí no se destruye un hecho
-- contable, se quita una foto movida o el papel que no era. El hecho -que se
-- recibió, a quién y a cuánto- vive en `recepciones` y no se toca.
drop policy if exists "escritura_delete" on recepcion_adjuntos;
create policy "escritura_delete" on recepcion_adjuntos
  for delete to authenticated
  using ((select public.puede_escribir('recepcion_adjuntos')));

grant select, insert, delete on recepcion_adjuntos to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · RLS del bucket
-- ---------------------------------------------------------------------------
-- `storage.objects` tiene su propia RLS y no hereda la de nuestras tablas. Sin
-- estas políticas, el bucket privado no lo lee ni lo escribe nadie, y la
-- pantalla fallaría con un «not authorized» que no explica nada.
drop policy if exists "proveedor_lectura" on storage.objects;
create policy "proveedor_lectura" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos-proveedor'
    and (select public.mi_rol()) is not null
  );

drop policy if exists "proveedor_subida" on storage.objects;
create policy "proveedor_subida" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-proveedor'
    and (select public.puede_escribir('recepcion_adjuntos'))
  );

drop policy if exists "proveedor_borrado" on storage.objects;
create policy "proveedor_borrado" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos-proveedor'
    and (select public.puede_escribir('recepcion_adjuntos'))
  );
