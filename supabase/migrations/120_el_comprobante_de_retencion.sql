-- ###########################################################################
-- 120 · EL COMPROBANTE DE RETENCIÓN (CR) DE CADA FACTURA
-- ###########################################################################
--
-- Willy, reunión del 14/10: *«yo no controlaba ese tema de la retención…
-- después me voy con la sorpresa de que [el contador] me informa que no se
-- han estado [declarando]… al final de año salió como 5 mil soles que yo
-- tenía a favor… es plata dormida»*. Los CR le llegan por correo en PDF, o no
-- llegan, y al mandárselos al contador cada mes repite algunos.
--
-- Lo que se acordó: un botón «Registrar CR» en las facturas con retención,
-- que sube el PDF y lo deja colgado de SU factura; y descargarlos todos de una
-- vez, por cliente. Y que no se pueda cargar dos veces el mismo.
--
--   · `comprobante_retenciones`: uno por factura (la factura es la clave).
--   · `sha256` ÚNICO: el mismo PDF no entra en dos facturas. Es lo que evita
--     el duplicado que contaba Willy, sin leer el contenido del PDF.
--   · Bucket privado `comprobantes-retencion`, rutas `cr/<factura>/…`.
--   · Lo sube quien puede tocar los cobros (`pagos`): es parte de cobrar.
-- ###########################################################################

set local search_path = public, extensions;

-- 1 · El bucket ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes-retencion',
  'comprobantes-retencion',
  false,
  10 * 1024 * 1024,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cr_lectura" on storage.objects;
create policy "cr_lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes-retencion' and (select public.mi_rol()) is not null);

drop policy if exists "cr_subida" on storage.objects;
create policy "cr_subida" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes-retencion' and (select public.puede_escribir('pagos')));

drop policy if exists "cr_borrado" on storage.objects;
create policy "cr_borrado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprobantes-retencion' and (select public.puede_escribir('pagos')));

-- 2 · La tabla ----------------------------------------------------------------
create table if not exists comprobante_retenciones (
  comprobante_id uuid primary key references comprobantes(id) on delete cascade,
  ruta        text not null,
  nombre      text not null,
  mime        text not null,
  sha256      text not null,
  -- El número que trae el CR (E001-123…), si se escribe. Ayuda al contador.
  numero_cr   text,
  subido_por  uuid default auth.uid() references perfiles(id),
  subido_en   timestamptz not null default now(),
  constraint cr_ruta_ok check (ruta like 'cr/%'),
  constraint cr_hash_ok check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint cr_numero_corto check (numero_cr is null or char_length(numero_cr) <= 40)
);

create unique index if not exists cr_sha256_unico on comprobante_retenciones (sha256);

comment on table comprobante_retenciones is
  'El comprobante de retención (CR) de cada factura con retención (120). Uno por factura; el mismo PDF (sha256) no entra en dos.';

alter table comprobante_retenciones enable row level security;

drop policy if exists cr_select on comprobante_retenciones;
create policy cr_select on comprobante_retenciones
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists cr_insert on comprobante_retenciones;
create policy cr_insert on comprobante_retenciones
  for insert to authenticated
  with check ((select public.puede_escribir('pagos')));

drop policy if exists cr_update on comprobante_retenciones;
create policy cr_update on comprobante_retenciones
  for update to authenticated
  using ((select public.puede_escribir('pagos')))
  with check ((select public.puede_escribir('pagos')));

drop policy if exists cr_delete on comprobante_retenciones;
create policy cr_delete on comprobante_retenciones
  for delete to authenticated
  using ((select public.puede_escribir('pagos')));

grant select, insert, update, delete on comprobante_retenciones to authenticated;

-- 3 · Centinela ---------------------------------------------------------------
-- La regla que importa es la del duplicado: el mismo hash no entra dos veces.
do $$
declare
  f1 uuid; f2 uuid; v_fallo boolean := false;
  h text := repeat('a', 64);
begin
  select id into f1 from comprobantes where tipo = 'factura' order by creado_en limit 1;
  select id into f2 from comprobantes where tipo = 'factura' and id <> f1 order by creado_en limit 1;
  if f2 is null then
    raise notice '120: faltan facturas para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    insert into comprobante_retenciones (comprobante_id, ruta, nombre, mime, sha256)
      values (f1, 'cr/x/uno.pdf', 'uno.pdf', 'application/pdf', h);
    begin
      insert into comprobante_retenciones (comprobante_id, ruta, nombre, mime, sha256)
        values (f2, 'cr/x/dos.pdf', 'dos.pdf', 'application/pdf', h);
    exception when unique_violation then v_fallo := true;
    end;
    if not v_fallo then raise exception '120: dejó el mismo CR en dos facturas'; end if;
    raise exception '__120_DESHACER__';
  exception when others then
    if sqlerrm <> '__120_DESHACER__' then raise; end if;
  end;
  raise notice '120: un CR por factura y el mismo PDF no entra dos veces; deshecho limpio.';
end $$;
