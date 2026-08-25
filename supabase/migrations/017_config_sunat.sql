-- ###########################################################################
-- 017 · CONFIGURACIÓN SUNAT · dónde viven las credenciales
-- ###########################################################################
--
-- El conector (`packages/sunat`) está entero: UBL, firma, SOAP, CDR. Lo único
-- que le falta para emitir es la configuración del emisor — certificado, su
-- clave, y el usuario/clave SOL secundario. Esta migración es el sitio donde
-- se guardan.
--
-- La decisión de diseño está en la separación en DOS tablas, y no es
-- cosmética:
--
--   · `config_sunat`          — lo que se puede enseñar en pantalla.
--   · `config_sunat_secretos` — el .pfx y las claves, cifrados, y con RLS
--                               SIN NINGUNA POLÍTICA.
--
-- RLS es a nivel de FILA, no de columna. Con todo en una tabla, cualquier
-- política de lectura que dejara ver el ambiente dejaría ver también la clave
-- SOL, porque `select *` por PostgREST trae la fila entera. La única forma de
-- que unas columnas sean invisibles es que estén en otra tabla que nadie
-- pueda leer.
--
-- «Sin políticas» con RLS activo significa que anon y authenticated NO pueden
-- leer nada: PostgREST devuelve cero filas. Solo `service_role`, que se salta
-- RLS, alcanza los secretos — y ese cliente vive únicamente en el servidor.
--
-- Idempotente. Se puede volver a aplicar sin efectos.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Lo que sí se puede enseñar
-- ---------------------------------------------------------------------------
create table if not exists config_sunat (
  id                     smallint primary key default 1,

  -- 'beta' es homologación de SUNAT: acepta cualquier certificado y no tiene
  -- valor fiscal. Es el valor por defecto A PROPÓSITO — arrancar en producción
  -- con la configuración a medias emite documentos reales sin querer.
  ambiente               text not null default 'beta',

  -- Usuario SOL SECUNDARIO, formato RUC + usuario (20601234567MODDATOS).
  -- El principal no vale: SUNAT no lo acepta para facturación electrónica.
  usuario_sol            text,

  -- Del certificado se guarda aquí solo lo que sirve para saber si está bien.
  -- El archivo va cifrado en la otra tabla.
  certificado_nombre     text,
  certificado_sujeto     text,
  certificado_caduca_en  date,

  -- Series por defecto. Están también en `series_documento`, que es quien
  -- manda; esto es la preferencia que propone la pantalla de emisión.
  serie_factura          text not null default 'F001',
  serie_boleta           text not null default 'B001',

  -- Última prueba de conexión. Se guarda para no obligar a repetirla cada vez
  -- que alguien entra a mirar, y para poder decir «funcionaba el martes».
  probado_en             timestamptz,
  probado_ok             boolean,
  probado_mensaje        text,

  actualizado_en         timestamptz not null default now(),
  actualizado_por        uuid references perfiles(id) on delete set null,

  constraint config_sunat_unica    check (id = 1),
  constraint config_sunat_ambiente check (ambiente in ('beta','produccion')),
  -- El formato del usuario SOL es la causa número uno de «error de
  -- autenticación» al arrancar: se escribe solo el usuario y falta el RUC
  -- delante. Se comprueba aquí para que falle al guardar, no al emitir.
  constraint config_sunat_usuario_formato check (
    usuario_sol is null or usuario_sol ~ '^[0-9]{11}[A-Za-z0-9]{3,}$'
  )
);

insert into config_sunat (id) values (1) on conflict (id) do nothing;

comment on table config_sunat is
  'Configuración fiscal visible. Las claves y el certificado viven en config_sunat_secretos, que nadie puede leer por PostgREST.';
comment on column config_sunat.ambiente is
  'beta = homologación, sin valor fiscal. Por defecto beta: emitir de verdad tiene que ser una decisión explícita.';


-- ---------------------------------------------------------------------------
-- Lo que NADIE puede leer desde el navegador
-- ---------------------------------------------------------------------------
create table if not exists config_sunat_secretos (
  id                        smallint primary key default 1,

  -- Los tres viajan cifrados con AES-256-GCM desde el servidor. El formato es
  -- [IV(12) | authTag(16) | ciphertext] en base64; lo hace
  -- `apps/web/src/lib/cifrado.ts` con SUNAT_ENCRYPTION_KEY.
  --
  -- Cifrar además de aislar puede parecer de más, pero cubre el caso que de
  -- verdad pasa: un volcado de la base compartido para depurar, o una copia de
  -- seguridad que acaba donde no debe.
  clave_sol_cifrada         text,
  certificado_pfx_cifrado   text,
  certificado_clave_cifrada text,

  actualizado_en            timestamptz not null default now(),

  constraint config_sunat_secretos_unica check (id = 1)
);

insert into config_sunat_secretos (id) values (1) on conflict (id) do nothing;

-- El .pfx entero va en la fila y no en Storage a propósito: son 3-5 kB, ya
-- está cifrado, y un bucket privado añade políticas, rutas y un segundo sitio
-- donde algo puede quedar mal configurado sin que se note.
comment on table config_sunat_secretos is
  'Certificado y claves SUNAT, cifrados. RLS activo SIN políticas: solo service_role llega. No añadir políticas aquí.';

alter table config_sunat_secretos enable row level security;

-- Por si una migración anterior o un descuido dejó alguna.
drop policy if exists "lectura_autenticados" on public.config_sunat_secretos;
drop policy if exists "escritura_insert"     on public.config_sunat_secretos;
drop policy if exists "escritura_update"     on public.config_sunat_secretos;
drop policy if exists "escritura_delete"     on public.config_sunat_secretos;

-- Cinturón y tirantes: aunque alguien añadiera una política por error, sin
-- GRANT no hay acceso.
revoke all on public.config_sunat_secretos from anon, authenticated;


-- ---------------------------------------------------------------------------
-- La tabla visible sí lleva políticas, y solo para gerencia
-- ---------------------------------------------------------------------------
alter table config_sunat enable row level security;

drop policy if exists "lectura_gerencia"  on public.config_sunat;
drop policy if exists "escritura_insert"  on public.config_sunat;
drop policy if exists "escritura_update"  on public.config_sunat;
drop policy if exists "escritura_delete"  on public.config_sunat;

-- Lectura restringida a gerencia y NO a todo autenticado, que es la regla
-- general del resto de tablas: el usuario SOL identifica a la empresa ante
-- SUNAT y no tiene por qué verlo el vendedor.
create policy "lectura_gerencia" on public.config_sunat
  for select to authenticated
  using ((select public.es_gerencia()));

create policy "escritura_update" on public.config_sunat
  for update to authenticated
  using ((select public.es_gerencia()))
  with check ((select public.es_gerencia()));

-- Sin INSERT ni DELETE: la fila 1 es única y ya existe. Que no se pueda
-- borrar evita el estado «configuración desaparecida» que nadie sabe arreglar.


-- ---------------------------------------------------------------------------
-- Centinela
-- ---------------------------------------------------------------------------
do $$
declare
  v_politicas int;
  v_grants    int;
begin
  select count(*) into v_politicas
    from pg_policy where polrelid = 'public.config_sunat_secretos'::regclass;

  if v_politicas > 0 then
    raise exception 'config_sunat_secretos tiene % políticas: sus columnas volverían visibles por PostgREST', v_politicas;
  end if;

  select count(*) into v_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'config_sunat_secretos'
     and grantee in ('anon','authenticated');

  if v_grants > 0 then
    raise exception 'config_sunat_secretos tiene % permisos para anon/authenticated', v_grants;
  end if;
end $$;
