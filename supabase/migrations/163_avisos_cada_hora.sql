-- 163 · Los avisos salen cada hora, de 7 de la mañana a 9 de la noche
--
-- El problema. La 162 dejó el envío al celular en dos pasadas al día, las de
-- Vercel Cron (7:10 y 16:00 de Lima), porque el plan gratuito de Vercel no
-- permite más. Y `generar_alertas()` solo corre una vez, a las 7:00. Un
-- rechazo de SUNAT a las 4:30 de la tarde llegaba al celular a las 7:10 del
-- día siguiente: quince horas después, con la factura ya en manos del
-- cliente.
--
-- Luis, 27/10: «vale, sí, cada hora».
--
-- La solución no pasa por Vercel: la base ya tiene `pg_cron` (lo usa
-- `rescatar_envios_sunat`, cada 15 minutos). Cada hora, de 7:05 a 21:05 de
-- Lima, un trabajo genera las alertas y llama a la ruta de envío
-- (`/api/avisos/enviar`) con `pg_net`. De noche no suena nada: lo que pase
-- se acumula y sale en el resumen de las 7:05.
--
-- Lo que necesita la llamada —la dirección del ERP desplegado y el
-- `CRON_SECRET`— vive en el Vault de Supabase (`avisos_url`,
-- `avisos_cron_secret`), cifrado, y NO en esta migración: las migraciones se
-- versionan. Mientras no estén cargados, `avisar_al_celular()` no hace nada y
-- lo dice; las alertas se siguen generando cada hora igual. Se cargan al
-- desplegar (ver docs/PENDIENTES.md §CK.2).
--
-- Los dos cron de Vercel se quedan: la ruta reserva lo que manda, así que una
-- pasada que coincide con otra no repite nada.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1 · Llamar a la ruta de envío
-- ---------------------------------------------------------------------------
create or replace function public.avisar_al_celular()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'avisos_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'avisos_cron_secret';

  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return 'sin configurar: falta avisos_url o avisos_cron_secret en el Vault';
  end if;

  select net.http_get(
           url     := rtrim(v_url, '/') || '/api/avisos/enviar',
           headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
           timeout_milliseconds := 30000)
    into v_id;
  return 'llamada ' || v_id;
end;
$$;

-- Solo la llama el cron (como postgres). Con la API, nadie.
revoke all on function public.avisar_al_celular() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · El trabajo de cada hora
-- ---------------------------------------------------------------------------
-- 12:05 a 02:05 UTC = 7:05 a 21:05 de Lima (UTC−5, sin horario de verano).
-- El diario de las 12:00 (`rodatech-alertas-diarias`) se queda: genera cinco
-- minutos antes y este lo encuentra hecho.
select cron.unschedule(jobid) from cron.job where jobname = 'rodatech-avisos-cada-hora';
select cron.schedule(
  'rodatech-avisos-cada-hora',
  '5 0-2,12-23 * * *',
  $$select public.generar_alertas(); select public.avisar_al_celular();$$
);

-- ---------------------------------------------------------------------------
-- Centinela: ejecuta las dos ramas y deshace
-- ---------------------------------------------------------------------------
do $$
declare
  v_r     text;
  v_antes bigint;
  v_cola  bigint;
begin
  if not exists (select 1 from cron.job
                  where jobname = 'rodatech-avisos-cada-hora'
                    and schedule = '5 0-2,12-23 * * *') then
    raise exception '163: no quedó programado el trabajo de cada hora';
  end if;

  begin
    -- Sin nada en el Vault, no llama y lo dice.
    delete from vault.secrets where name in ('avisos_url', 'avisos_cron_secret');
    v_r := public.avisar_al_celular();
    if v_r not like 'sin configurar%' then
      raise exception '163: sin configurar devolvió «%»', v_r;
    end if;

    -- Con los dos, deja la petición en la cola de pg_net.
    select count(*) into v_antes from net.http_request_queue;
    perform vault.create_secret('https://ejemplo.invalid', 'avisos_url');
    perform vault.create_secret('secreto-del-centinela', 'avisos_cron_secret');
    v_r := public.avisar_al_celular();
    select count(*) into v_cola from net.http_request_queue;
    if v_r not like 'llamada %' or v_cola <> v_antes + 1 then
      raise exception '163: con configuración devolvió «%» y la cola pasó de % a %', v_r, v_antes, v_cola;
    end if;
    if not exists (select 1 from net.http_request_queue
                    where url = 'https://ejemplo.invalid/api/avisos/enviar'
                      and headers ->> 'Authorization' = 'Bearer secreto-del-centinela') then
      raise exception '163: la petición no lleva la ruta o el secreto';
    end if;

    raise exception '__163_DESHACER__';
  exception when others then
    if sqlerrm <> '__163_DESHACER__' then raise; end if;
  end;
end $$;
