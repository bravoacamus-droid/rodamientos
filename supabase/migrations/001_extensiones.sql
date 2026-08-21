-- ============================================================================
-- RODATECH ERP v2 · 001 · Extensiones y utilidades transversales
-- Inversiones Rodatech E.I.R.L. · Lima, Perú
-- ----------------------------------------------------------------------------
-- Este archivo solo instala extensiones y las funciones inmutables que el
-- resto del esquema necesita DENTRO de columnas generadas y de índices por
-- expresión. Nada de aquí depende de tablas: se aplica primero y no cambia.
-- ============================================================================

-- Las extensiones NO van en `public`: Supabase marca eso como hallazgo del
-- security advisor y además ensucia el espacio de nombres que exponemos por
-- PostgREST. Van en `extensions`, que es el esquema que Supabase ya crea.
create schema if not exists extensions;

create extension if not exists pg_trgm    with schema extensions;  -- similarity() + gin_trgm_ops
create extension if not exists unaccent   with schema extensions;  -- "cañete" ~ "canete"
create extension if not exists btree_gin  with schema extensions;  -- GIN mixto: trigram + booleano

grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- normalizar_texto: minúsculas + sin tildes, IMMUTABLE.
-- ---------------------------------------------------------------------------
-- `unaccent(text)` de una sola firma es STABLE (resuelve el diccionario por
-- search_path) y Postgres rechaza usarla en una columna generada o en un
-- índice. La firma de dos argumentos `unaccent(regdictionary, text)` sí es
-- IMMUTABLE. Este envoltorio es lo que permite indexar el ubigeo y las
-- descripciones "como se escriben de verdad", sin tildes.
create or replace function public.normalizar_texto(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, lower(coalesce(p_texto, '')))
$$;

comment on function public.normalizar_texto(text) is
  'Minúsculas sin tildes. IMMUTABLE a propósito: es la base de todas las columnas generadas de búsqueda y de los índices GIN trigram.';

-- ---------------------------------------------------------------------------
-- normalizar_codigo: la forma canónica de un código de producto.
-- ---------------------------------------------------------------------------
-- Willy (10:44): el código es único y sin espacios. Y en la carga inicial
-- (27:42) su queja fue exactamente esta: "basta que un carácter sea diferente
-- al otro y ya no hace match y se rompe todo". Toda comparación de códigos
-- —el UNIQUE, el importador de Excel, el buscador— pasa por esta función,
-- así que "6205 2RS", "6205-2rs" y "6205 2RS " son el mismo código.
--
-- Por eso se comen también los separadores (. _ / -) y no solo los espacios:
-- quitando solo espacios, "6205 2RS" daba "62052RS" y "6205-2RS" daba
-- "6205-2RS", que son distintos, y el maestro terminaba con el producto
-- duplicado. Que es exactamente lo que él describió.
create or replace function public.normalizar_codigo(p_codigo text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select nullif(
           extensions.unaccent(
             'extensions.unaccent'::regdictionary,
             upper(regexp_replace(coalesce(p_codigo, ''), '[[:space:]._/-]+', '', 'g'))
           ),
         '')
$$;

comment on function public.normalizar_codigo(text) is
  'Forma canónica de un código: sin espacios NI separadores (. _ / -), mayúsculas, sin tildes. El UNIQUE del maestro y el importador comparan por esto (reunión 27:42).';

-- ---------------------------------------------------------------------------
-- Trigger genérico de auditoría de fecha.
-- ---------------------------------------------------------------------------
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  new.actualizado_en := now();
  return new;
end $$;
