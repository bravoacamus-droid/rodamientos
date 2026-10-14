-- ###########################################################################
-- 126 · LAS CREDENCIALES DE API DE LA GUÍA (GRE)
-- ###########################################################################
--
-- La guía de remisión no va por el SOAP de la factura: SUNAT la recibe por
-- una API REST con OAuth2, y para eso pide, además del usuario y la clave
-- SOL, el `client_id` y el `client_secret` que el contribuyente genera una
-- vez en SOL › «Credenciales de API SUNAT» (docs/INVESTIGACION-GRE.md §2.2).
--
-- Mismo reparto que el resto de la configuración (017): el `client_id`, que
-- no es secreto, con lo visible; el `client_secret`, cifrado con la llave
-- maestra, en la tabla de secretos que solo lee el servidor.
-- ###########################################################################

set local search_path = public, extensions;

alter table config_sunat add column if not exists gre_client_id text;
alter table config_sunat_secretos add column if not exists gre_client_secret_cifrado text;

comment on column config_sunat.gre_client_id is
  'ID de la aplicación en «Credenciales de API SUNAT», para enviar guías (126).';
comment on column config_sunat_secretos.gre_client_secret_cifrado is
  'Su CLAVE (client_secret), cifrada con SUNAT_ENCRYPTION_KEY (126).';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'config_sunat_secretos' and column_name = 'gre_client_secret_cifrado') then
    raise exception '126: falta la columna del client_secret';
  end if;
  -- El secreto no se lee desde la sesión: lo mismo que el resto de la tabla.
  if has_table_privilege('authenticated', 'config_sunat_secretos', 'SELECT') then
    raise exception '126: config_sunat_secretos se puede leer desde la sesión';
  end if;
  raise notice '126: credenciales de API de la GRE guardadas aparte; el secreto, cifrado.';
end $$;
