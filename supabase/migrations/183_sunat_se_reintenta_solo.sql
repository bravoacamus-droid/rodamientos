-- ###########################################################################
-- 183 · LO QUE NO LLEGÓ A SUNAT SE REINTENTA SOLO
-- ###########################################################################
--
-- El problema (02/11, primer día en producción). Luis: «hay que darle la mejor
-- solución y la mejor automatización, sin gastar mucho… recuerda también de
-- Vercel». Al revisar cómo se maneja una caída de SUNAT salieron dos cosas:
--
-- 1. El rescate de cada 15 minutos BORRABA `sunat_enviado_en`. Esa fecha es la
--    única prueba de que el documento ya salió alguna vez, y es lo que hace que
--    un 1033 («ya registrado») se pregunte a SUNAT en vez de darse por
--    rechazado (auditoría 21/10, A4). El camino roto: la factura llega, SUNAT
--    la acepta, la respuesta se pierde; el rescate la devuelve a «pendiente»
--    SIN la fecha; al reenviarla SUNAT contesta 1033 y la pantalla dice
--    «rechazada, emite otra». Dos facturas por una venta.
--
-- 2. Nada se reenviaba solo. Si SUNAT se caía a mediodía, alguien tenía que
--    acordarse de pulsar «Enviar», y el aviso salía al DÍA siguiente. Las
--    guías colgadas no avisaban nunca.
--
-- La solución, y por qué así:
--
--   · `sunat_por_reintentar()` dice qué falta: lo que no salió, lo que falló
--     por la red y las guías que esperan respuesta. Con espera creciente
--     (10, 20, 40, 80, 160 y luego cada 320 minutos) y un tope de 15 intentos
--     automáticos, que cubre los 3 días que SUNAT da de plazo. Solo con el
--     ambiente en PRODUCCIÓN, solo series reales y solo lo de los últimos 10
--     días: el histórico de SIMPLE no se toca.
--   · Un rechazo NO se reintenta. Un 0102 (clave SOL mal) repetido cada diez
--     minutos BLOQUEA el usuario SOL; un 2xxx repetido da el mismo 2xxx.
--   · El cron de Supabase corre cada 10 minutos y SOLO llama al ERP de Vercel
--     si hay algo en la lista. Un día normal son cero llamadas: Vercel no
--     gasta nada mientras todo llegue a la primera.
--   · El envío lo hace el ERP (`/api/sunat/reintentar`), con el mismo código
--     del botón: firma, candado, 1033, guardar el CDR. Postgres no firma XML.
--   · El aviso de «sin llegar a SUNAT» pasa de un día a dos horas, y las guías
--     también avisan.
--
-- Necesita el Vault configurado (`node scripts/configurar-avisos.mjs <url>`),
-- el mismo que los avisos al celular. Sin él, el cron no llama y lo dice; el
-- ERP lo reintenta igual dos veces al día con el cron de Vercel.
-- ###########################################################################

alter table public.comprobantes
  add column if not exists sunat_reintentos_auto smallint not null default 0;
alter table public.guias_remision
  add column if not exists sunat_reintentos_auto smallint not null default 0;

comment on column public.comprobantes.sunat_reintentos_auto is
  'Envíos automáticos a SUNAT intentados (183). Con 15 deja de reintentar solo; el botón sigue funcionando.';
comment on column public.guias_remision.sunat_reintentos_auto is
  'Envíos o consultas automáticas a SUNAT intentadas (183). Tope 15.';

-- ---------------------------------------------------------------------------
-- 1 · Qué hay que reintentar
-- ---------------------------------------------------------------------------
create or replace function public.sunat_por_reintentar()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  with cfg as (
    select (ambiente = 'produccion') as prod from config_sunat where id = 1
  ),
  -- 10 · 20 · 40 · 80 · 160 · 320 minutos, y 320 de ahí en adelante.
  espera(n, minutos) as (
    select n, 10 * power(2, least(n, 5))::int from generate_series(0, 15) n
  ),
  reales as (
    select serie from series_documento where not es_prueba
  ),
  comprobantes_ as (
    select c.id, c.tipo, c.numero, c.sunat_reintentos_auto as intentos
      from comprobantes c
      join espera e on e.n = c.sunat_reintentos_auto
     where (select prod from cfg)
       and c.serie in (select serie from reales)
       and c.tipo in ('factura', 'nota_credito', 'nota_debito')
       and c.estado <> 'anulado'
       and c.fecha_emision >= current_date - 10
       and c.sunat_reintentos_auto < 15
       and (
             -- Nunca salió: al emitir se manda en el acto, así que diez
             -- minutos sin salir es que no se marcó o que falló antes.
             (c.estado_sunat = 'no_enviado' and c.creado_en < now() - interval '10 minutes')
             -- Falló por la red o SUNAT no dio respuesta clara.
          or (c.estado_sunat = 'pendiente'
              and coalesce(c.sunat_enviado_en, c.creado_en) < now() - make_interval(mins => e.minutos))
             -- Se quedó a mitad (el proceso murió): el candado lo suelta a los 15.
          or (c.estado_sunat = 'enviado' and c.sunat_enviado_en < now() - interval '15 minutes')
           )
  ),
  guias_ as (
    select g.id, g.numero, g.sunat_reintentos_auto as intentos,
           case when g.estado_sunat = 'enviado' and g.sunat_ticket is not null
                then 'preguntar' else 'mandar' end as que
      from guias_remision g
      join espera e on e.n = g.sunat_reintentos_auto
     where (select prod from cfg)
       and g.serie in (select serie from reales)
       and g.estado = 'emitida'
       and g.fecha_emision >= current_date - 10
       and g.sunat_reintentos_auto < 15
       and (
             (g.estado_sunat = 'no_enviado' and g.creado_en < now() - interval '10 minutes')
          or (g.estado_sunat = 'pendiente'
              and coalesce(g.sunat_enviado_en, g.creado_en) < now() - make_interval(mins => e.minutos))
             -- Con ticket: SUNAT la tiene y falta su respuesta. Se pregunta.
          or (g.estado_sunat = 'enviado' and g.sunat_ticket is not null
              and g.sunat_enviado_en < now() - make_interval(mins => least(e.minutos, 30)))
             -- Sin ticket y 15 minutos: el envío murió a mitad.
          or (g.estado_sunat = 'enviado' and g.sunat_ticket is null
              and g.sunat_enviado_en < now() - interval '15 minutes')
           )
  )
  select jsonb_build_object(
    'comprobantes', coalesce((select jsonb_agg(to_jsonb(x)) from comprobantes_ x), '[]'::jsonb),
    'guias',        coalesce((select jsonb_agg(to_jsonb(x)) from guias_ x), '[]'::jsonb)
  );
$$;

comment on function public.sunat_por_reintentar() is
  'Lo que el reenvío automático manda o pregunta a SUNAT (183). Solo en producción, series reales, últimos 10 días, sin rechazados.';

-- La lee el ERP con la clave de servicio, y el cron. Nadie más.
revoke all on function public.sunat_por_reintentar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · El cron: llama al ERP solo si hay algo
-- ---------------------------------------------------------------------------
create or replace function public.llamar_reintentos_sunat()
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_lista  jsonb := public.sunat_por_reintentar();
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  if jsonb_array_length(v_lista -> 'comprobantes') = 0
     and jsonb_array_length(v_lista -> 'guias') = 0 then
    return 'nada que reintentar';
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'avisos_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'avisos_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return 'sin configurar: falta avisos_url o avisos_cron_secret en el Vault';
  end if;

  select net.http_get(
           url     := rtrim(v_url, '/') || '/api/sunat/reintentar',
           headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
           timeout_milliseconds := 60000)
    into v_id;
  return 'llamada ' || v_id;
end $$;

revoke all on function public.llamar_reintentos_sunat() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'rodatech-sunat-reintentos';
select cron.schedule(
  'rodatech-sunat-reintentos',
  '*/10 * * * *',
  $$select public.llamar_reintentos_sunat();$$
);

-- ---------------------------------------------------------------------------
-- 3 · El rescate ya no borra la fecha del envío, y avisa antes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rescatar_envios_sunat()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_rescatados int;
  v_avisados   int;
  v_guias      int;
begin
  -- 1 · Los envíos que se quedaron a medias vuelven a la cola.
  --
  -- SIN tocar `sunat_enviado_en` (183): es lo que dice que ya salió alguna
  -- vez, y sin ella un 1033 al reenviar se daba por rechazado.
  with atascados as (
    update comprobantes
       set estado_sunat = 'pendiente'
     where estado_sunat = 'enviado'
       and sunat_enviado_en < now() - interval '15 minutes'
    returning id
  )
  select count(*) into v_rescatados from atascados;

  -- 2 · Lo que lleva dos horas emitido sin llegar a SUNAT.
  --
  -- Dos horas y no un día (183): desde que se reintenta solo, si a las dos
  -- horas no llegó es que SUNAT sigue caído o algo no se arregla solo, y el
  -- plazo es de tres días. Crítico el último día.
  with pendientes as (
    select c.id, c.numero, c.total, c.fecha_emision, c.creado_en, c.estado_sunat
      from comprobantes c
     where c.estado_sunat in ('no_enviado', 'pendiente', 'enviado')
       and c.estado <> 'anulado'
       and c.tipo in ('factura', 'boleta', 'nota_credito', 'nota_debito')
       and c.creado_en < now() - interval '2 hours'
  ), nuevas as (
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id,
                         entidad_nombre, valor, accion_url, huella)
    select 'sunat_atascado',
           case when current_date - p.fecha_emision >= 2 then 'critica'::severidad_alerta
                else 'alta'::severidad_alerta end,
           'Comprobante sin llegar a SUNAT',
           p.numero || ' se emitió el ' || to_char(p.fecha_emision, 'DD/MM/YYYY') ||
             ' y todavía no está en SUNAT. ' ||
             case when current_date - p.fecha_emision >= 3 then 'Ya pasó el plazo de 3 días: envíalo hoy.'
                  when current_date - p.fecha_emision = 2 then 'Hoy es el último día para enviarlo.'
                  else 'El sistema lo sigue intentando; si SUNAT funciona, ábrelo y pulsa «Enviar a SUNAT».' end,
           'comprobante', p.id, p.numero, p.total,
           '/facturacion/' || p.id,
           'sunat_atascado:' || p.id
      from pendientes p
    on conflict (huella) where not archivada do update
       set mensaje    = excluded.mensaje,
           valor      = excluded.valor,
           severidad  = excluded.severidad,
           generada_en = now(),
           leida      = false
     where alertas.mensaje is distinct from excluded.mensaje
        or alertas.leida
    returning 1
  )
  select count(*) into v_avisados from nuevas;

  -- 3 · Y las guías (183): emitidas, de serie real, dos horas sin aceptar.
  -- Una guía que SUNAT no tiene no ampara el traslado.
  with pendientes as (
    select g.id, g.numero, g.fecha_emision
      from guias_remision g
     where g.estado = 'emitida'
       and g.estado_sunat in ('no_enviado', 'pendiente', 'enviado')
       and g.serie in (select serie from series_documento where not es_prueba)
       and g.creado_por is not null
       and g.creado_en < now() - interval '2 hours'
  ), nuevas as (
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id,
                         entidad_nombre, valor, accion_url, huella)
    select 'sunat_atascado', 'alta'::severidad_alerta,
           'Guía sin llegar a SUNAT',
           p.numero || ' se emitió el ' || to_char(p.fecha_emision, 'DD/MM/YYYY') ||
             ' y SUNAT todavía no la aceptó. Sin eso la guía no ampara el traslado.',
           'guia', p.id, p.numero, null,
           '/guias/' || p.id,
           'sunat_atascado:' || p.id
      from pendientes p
    on conflict (huella) where not archivada do update
       set mensaje    = excluded.mensaje,
           generada_en = now(),
           leida      = false
     where alertas.mensaje is distinct from excluded.mensaje
        or alertas.leida
    returning 1
  )
  select count(*) into v_guias from nuevas;

  return jsonb_build_object('rescatados', v_rescatados, 'avisados', v_avisados, 'guias', v_guias);
end $function$;

-- ---------------------------------------------------------------------------
-- Centinela: ejecuta las tres piezas con un documento real y deshace
-- ---------------------------------------------------------------------------
do $$
declare
  v_id    uuid;
  v_lista jsonb;
  v_r     text;
begin
  if not exists (select 1 from cron.job
                  where jobname = 'rodatech-sunat-reintentos' and schedule = '*/10 * * * *') then
    raise exception '183: no quedó programado el cron de reintentos';
  end if;

  begin
    -- La factura real más reciente, puesta como si se hubiera colgado a mitad.
    select id into v_id from comprobantes
     where tipo = 'factura' and estado <> 'anulado'
       and serie in (select serie from series_documento where not es_prueba)
     order by creado_en desc limit 1;
    if v_id is null then raise exception '183: no hay factura real para probar'; end if;

    update config_sunat set ambiente = 'produccion' where id = 1;
    update comprobantes
       set estado_sunat = 'enviado', sunat_enviado_en = now() - interval '20 minutes',
           fecha_emision = current_date, creado_en = now() - interval '3 hours'
     where id = v_id;

    -- El rescate la devuelve a pendiente SIN borrar la fecha, y avisa.
    perform public.rescatar_envios_sunat();
    if not exists (select 1 from comprobantes where id = v_id
                    and estado_sunat = 'pendiente' and sunat_enviado_en is not null) then
      raise exception '183: el rescate borró la fecha del envío';
    end if;
    if not exists (select 1 from alertas where huella = 'sunat_atascado:' || v_id and not archivada) then
      raise exception '183: el rescate no avisó';
    end if;

    -- Pendiente desde hace 20 minutos con 0 intentos (espera 10): está en la lista.
    v_lista := public.sunat_por_reintentar();
    if not (v_lista -> 'comprobantes') @> jsonb_build_array(jsonb_build_object('id', v_id)) then
      raise exception '183: la pendiente no salió en la lista: %', v_lista;
    end if;

    -- Con 15 intentos, ya no. Rechazada, tampoco.
    update comprobantes set sunat_reintentos_auto = 15 where id = v_id;
    if (public.sunat_por_reintentar() -> 'comprobantes') @> jsonb_build_array(jsonb_build_object('id', v_id)) then
      raise exception '183: el tope de 15 no se respeta';
    end if;
    update comprobantes set sunat_reintentos_auto = 0, estado_sunat = 'rechazado' where id = v_id;
    if (public.sunat_por_reintentar() -> 'comprobantes') @> jsonb_build_array(jsonb_build_object('id', v_id)) then
      raise exception '183: una rechazada se reintentaría';
    end if;

    -- En beta, nada.
    update comprobantes set estado_sunat = 'pendiente' where id = v_id;
    update config_sunat set ambiente = 'beta' where id = 1;
    if jsonb_array_length(public.sunat_por_reintentar() -> 'comprobantes') <> 0 then
      raise exception '183: en beta se reintentaría';
    end if;

    -- El cron, con trabajo y sin Vault, no llama y lo dice.
    update config_sunat set ambiente = 'produccion' where id = 1;
    delete from vault.secrets where name in ('avisos_url', 'avisos_cron_secret');
    v_r := public.llamar_reintentos_sunat();
    if v_r not like 'sin configurar%' then
      raise exception '183: sin Vault devolvió «%»', v_r;
    end if;

    raise exception '__183_DESHACER__';
  exception when others then
    if sqlerrm <> '__183_DESHACER__' then raise; end if;
  end;
end $$;
