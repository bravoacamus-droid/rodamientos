-- ###########################################################################
-- 162 · LOS AVISOS LLEGAN AL CELULAR (27/10)
-- ###########################################################################
--
-- Willy, en la reunión que originó las alertas: *«pero no te llega como una
-- alerta, tú tienes que entrar y ver»* (25:21). Por eso `alertas` lleva desde
-- la 002 la columna `notificado_en`: la tabla se pensó como una COLA DE ENVÍO.
-- Y en ocho semanas nadie la vació. `generar_alertas()` la llena cada mañana
-- a las 7:00 de Lima y las 201 filas de hoy tienen `notificado_en` en null.
-- Es el caso treinta y tantos de «la pieza existe, el camino no».
--
-- El camino es Web Push, el estándar de los navegadores: el celular se
-- suscribe una vez desde «Mi perfil», el navegador nos da una dirección
-- (`endpoint`) y dos claves, y el servidor manda ahí la notificación aunque
-- el ERP esté cerrado. No hace falta WhatsApp, ni correo, ni una app de
-- tienda — y los 97 clientes sin teléfono no importan, porque esto es para
-- los seis de dentro.
--
-- Lo que hace esta migración:
--
-- 1 · La tabla `suscripciones_push`: un aparato por fila. Cada uno ve y quita
--     solo las suyas (RLS). Nadie INSERTA directamente: se entra por
--     `registrar_suscripcion_push`, que es la que puede mover un aparato de
--     una cuenta a otra (el mismo celular con otra sesión: el navegador
--     reutiliza la dirección, y la fila vieja de otro usuario no la ve RLS).
--
-- 2 · Qué avisos le llegan a cada uno: `severidad_minima`, por defecto
--     `media`. Es lo que deja fuera lo de severidad `baja` («cotización por
--     vencer», sobrestock) sin perder lo que urge. Va por aparato porque el
--     envío es por aparato, pero la pantalla la cambia en todos a la vez.
--
-- 3 · El `endpoint` solo puede apuntar a un servicio de push conocido. El
--     servidor le hace un POST a esa dirección, y sin esta lista cualquier
--     empleado podría registrar `https://169.254.169.254/...` y usar el envío
--     para tocar la red de dentro de Vercel (SSRF). Se comprueba aquí y otra
--     vez en el servidor.
--
-- 4 · Las alertas que ya están en la cola se dan por avisadas. Si no, la
--     primera pasada del envío soltaría de golpe todo lo acumulado desde
--     agosto. Con más de tres avisos el envío ya junta todo en UNA
--     notificación de resumen, así que no serían cuarenta, pero sería un
--     «tienes 43 avisos» de cosas que Willy lleva semanas viendo en el
--     tablero. Se marcan con la hora de esta migración: quien mire
--     `notificado_en` de esas filas verá que es la misma para todas.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · La tabla
-- ---------------------------------------------------------------------------

create table if not exists public.suscripciones_push (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.perfiles(id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  -- «Android · Chrome», «iPhone · Safari»: lo que se lee en la lista de «Mi
  -- perfil» para saber cuál quitar. El user agent entero va aparte.
  aparato          text,
  agente           text,
  severidad_minima severidad_alerta not null default 'media',
  activa           boolean not null default true,
  creada_en        timestamptz not null default now(),
  -- La última vez que el aparato se volvió a registrar (cada vez que se abre
  -- «Mi perfil» desde él) o recibió algo.
  ultima_vez       timestamptz not null default now(),
  ultimo_envio     timestamptz,
  ultimo_error     text,
  constraint suscripcion_claves_ok check (
    length(p256dh) between 20 and 200 and length(auth) between 8 and 100),
  constraint suscripcion_textos_ok check (
    coalesce(length(aparato), 0) <= 120 and coalesce(length(agente), 0) <= 500
    and coalesce(length(ultimo_error), 0) <= 500)
);

comment on table public.suscripciones_push is
  'Un aparato (celular o computadora) que recibe los avisos de `alertas` por Web Push (162). '
  'Se da de alta con registrar_suscripcion_push; el envío lo hace /api/avisos/enviar con la llave de servicio.';

create index if not exists suscripciones_push_usuario on public.suscripciones_push (usuario_id) where activa;

-- Los servicios de push de verdad. Fuera de la tabla, y con `drop` delante,
-- para que reaplicar la migración la corrija: la primera versión solo admitía
-- `fcm.googleapis.com` para Chrome, y el Chromium de la prueba del 27/10 se
-- suscribió en `jmt17.google.com/fcm/send/…`. Google reparte los endpoints
-- entre subdominios, Apple y Mozilla también pueden; lo que importa no es el
-- subdominio sino que sea de ellos.
alter table public.suscripciones_push drop constraint if exists suscripcion_endpoint_ok;
alter table public.suscripciones_push add constraint suscripcion_endpoint_ok check (
  length(endpoint) <= 1000 and endpoint ~ (
    '^https://([a-z0-9-]+\.)*(googleapis\.com|google\.com|push\.services\.mozilla\.com|'
    || 'push\.apple\.com|notify\.windows\.com)/'));

alter table public.suscripciones_push enable row level security;

drop policy if exists suscripciones_push_lectura on public.suscripciones_push;
create policy suscripciones_push_lectura on public.suscripciones_push for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists suscripciones_push_cambio on public.suscripciones_push;
create policy suscripciones_push_cambio on public.suscripciones_push for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

drop policy if exists suscripciones_push_borrado on public.suscripciones_push;
create policy suscripciones_push_borrado on public.suscripciones_push for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- RLS decide filas y no columnas (§AK.3): sin esto, el dueño de una fila
-- podría reescribirle el `endpoint` o el `usuario_id`. Solo se toca la
-- preferencia; lo demás pasa por la función.
revoke all on public.suscripciones_push from anon;
revoke all on public.suscripciones_push from authenticated;
grant select, delete on public.suscripciones_push to authenticated;
grant update (severidad_minima) on public.suscripciones_push to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · El alta
-- ---------------------------------------------------------------------------

create or replace function public.registrar_suscripcion_push(
  p_endpoint text, p_p256dh text, p_auth text, p_aparato text, p_agente text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_yo uuid := auth.uid();
  v_severidad severidad_alerta;
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from perfiles where id = v_yo and activo) then
    raise exception 'Hay que iniciar sesión.' using errcode = '42501';
  end if;

  -- El aparato hereda la preferencia que ya tenga la persona en otro: «qué
  -- avisos me llegan» es una decisión de quien los recibe, no del celular.
  select severidad_minima into v_severidad from suscripciones_push
   where usuario_id = v_yo order by ultima_vez desc limit 1;

  -- El mismo navegador con otra cuenta: la dirección es del aparato, y quien
  -- tiene ahora la sesión es quien lo usa. La fila del anterior se va.
  delete from suscripciones_push where endpoint = p_endpoint and usuario_id <> v_yo;

  insert into suscripciones_push (usuario_id, endpoint, p256dh, auth, aparato, agente, severidad_minima)
  values (v_yo, p_endpoint, p_p256dh, p_auth, nullif(trim(p_aparato), ''), nullif(p_agente, ''),
          coalesce(v_severidad, 'media'))
  on conflict (endpoint) do update
     set p256dh = excluded.p256dh, auth = excluded.auth,
         aparato = excluded.aparato, agente = excluded.agente,
         activa = true, ultima_vez = now(), ultimo_error = null
  returning id into v_id;

  -- Un tope, para que un bucle o un abuso no llene la tabla: diez aparatos
  -- por persona sobran, y se van los que hace más tiempo que no aparecen.
  delete from suscripciones_push
   where usuario_id = v_yo and id in (
     select id from suscripciones_push where usuario_id = v_yo
      order by ultima_vez desc offset 10);

  return v_id;
end;
$function$;

revoke all on function public.registrar_suscripcion_push(text, text, text, text, text) from public, anon;
grant execute on function public.registrar_suscripcion_push(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · Lo que ya estaba en la cola
-- ---------------------------------------------------------------------------

update public.alertas set notificado_en = now() where notificado_en is null;

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA el alta como dos usuarios de verdad y lo deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  v_gerencia uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
  v_ventas uuid := (select id from perfiles where rol = 'ventas' and activo limit 1);
  c_ep constant text := 'https://fcm.googleapis.com/fcm/send/__162_centinela__';
  c_p256 constant text := 'BPrueba162Prueba162Prueba162Prueba162Prueba162';
  v_id uuid; v_n int;
begin
  begin
    -- Gerencia registra su aparato y lo ve.
    perform set_config('request.jwt.claims', json_build_object('sub', v_gerencia, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_id := public.registrar_suscripcion_push(c_ep, c_p256, 'auth162auth', 'Android · Chrome', 'Mozilla/5.0');
    select count(*) into v_n from suscripciones_push where id = v_id;
    if v_n <> 1 then raise exception '162: gerencia no ve su propio aparato'; end if;

    -- Cambia su preferencia, y no puede tocar nada más de la fila.
    update suscripciones_push set severidad_minima = 'alta' where id = v_id;
    begin
      update suscripciones_push set endpoint = 'https://fcm.googleapis.com/otro' where id = v_id;
      raise exception '162: se pudo reescribir el endpoint';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into suscripciones_push (usuario_id, endpoint, p256dh, auth)
      values (v_gerencia, 'https://fcm.googleapis.com/x', c_p256, 'auth162auth');
      raise exception '162: se pudo insertar sin pasar por la función';
    exception when insufficient_privilege then null;
    end;

    -- Una dirección que no es de un servicio de push no entra (SSRF).
    begin
      perform public.registrar_suscripcion_push('https://169.254.169.254/latest', c_p256, 'auth162auth', null, null);
      raise exception '162: aceptó un endpoint que no es de push';
    exception when check_violation then null;
    end;

    -- Ventas no ve el aparato de gerencia, ni lo puede borrar.
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_ventas, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from suscripciones_push where id = v_id;
    if v_n <> 0 then raise exception '162: ventas ve el aparato de gerencia'; end if;
    delete from suscripciones_push where id = v_id;
    perform set_config('role', 'postgres', true);
    select count(*) into v_n from suscripciones_push where id = v_id;
    if v_n <> 1 then raise exception '162: ventas borró el aparato de gerencia'; end if;

    -- El mismo navegador con la sesión de ventas: el aparato pasa a ventas,
    -- y ventas hereda la media por defecto, no la preferencia de gerencia.
    perform set_config('role', 'authenticated', true);
    perform public.registrar_suscripcion_push(c_ep, c_p256, 'auth162auth', 'Android · Chrome', 'Mozilla/5.0');
    perform set_config('role', 'postgres', true);
    select count(*) into v_n from suscripciones_push
     where endpoint = c_ep and usuario_id = v_ventas and severidad_minima = 'media';
    if v_n <> 1 then raise exception '162: el aparato no pasó a la nueva sesión'; end if;

    -- Sin sesión no se registra nada.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.registrar_suscripcion_push(c_ep, c_p256, 'auth162auth', null, null);
      raise exception '162: se registró sin sesión';
    exception when insufficient_privilege then null;
    end;

    -- La cola quedó vacía de lo antiguo.
    perform set_config('role', 'postgres', true);
    select count(*) into v_n from alertas where notificado_en is null;
    if v_n <> 0 then raise exception '162: quedaron % alertas viejas por avisar', v_n; end if;

    raise exception '__162_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__162_DESHACER__' then raise; end if;
  end;
  raise notice '162: avisos al celular listos.';
end $$;
