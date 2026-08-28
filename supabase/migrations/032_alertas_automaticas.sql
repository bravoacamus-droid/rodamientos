-- ###########################################################################
-- 032 · LAS ALERTAS SE REFRESCAN SOLAS
-- ###########################################################################
--
-- De la PRIMERA reunión, y sigue siendo lo único de aquella lista que no ha
-- cambiado (25:21):
--
--   «No te llega como una alerta, tú tienes que entrar y ver.»
--
-- Esto NO cierra ese pedido. Lo que él quiere es que la alerta LLEGUE —por
-- WhatsApp o por correo— y eso no se puede escribir todavía porque no ha dicho
-- por cuál de los dos. Está en el guion del viernes.
--
-- Lo que sí se puede hacer, y es la mitad que faltaba: que la bandeja esté al
-- día cuando entre, en vez de depender de que alguien pulse «Refrescar».
--
-- ---------------------------------------------------------------------------
-- Por qué a las 7 de la mañana
-- ---------------------------------------------------------------------------
-- Casi todas las reglas de `generar_alertas()` son de FECHA: cartera vencida,
-- cartera por vencer en 7 días, cotizaciones que caducan en 3. Esas cambian de
-- respuesta a medianoche y no vuelven a cambiar en todo el día, así que una
-- pasada diaria antes de abrir la tienda las deja listas para cuando alguien
-- llega. Correrlo cada hora gastaría lo mismo y no diría nada nuevo.
--
-- 12:00 UTC son las 07:00 en Lima. `pg_cron` programa en UTC y Perú no tiene
-- horario de verano, así que la conversión es fija y no se desalinea en marzo.
--
-- ---------------------------------------------------------------------------
-- Por qué llama a `generar_alertas()` y no a `refrescar_alertas()`
-- ---------------------------------------------------------------------------
-- `refrescar_alertas()` (migración 021) es la que llama el botón de la
-- pantalla, y lo primero que hace es `puede_escribir('alertas')` — que necesita
-- `auth.uid()`. En un cron no hay sesión ni usuario, así que esa comprobación
-- fallaría siempre.
--
-- `generar_alertas()` es el ayudante interno, cerrado a `authenticated` desde
-- la 012 y vigilado por el centinela de la 013 justo para que nadie lo abra.
-- El cron corre como superusuario del mantenimiento, que es el único que debe
-- poder llamarlo sin pasar por el guardián.

create extension if not exists pg_cron;

-- Idempotente: si ya estaba programado se quita y se vuelve a poner, para que
-- reaplicar la migración no deje dos trabajos haciendo lo mismo.
do $$
begin
  perform cron.unschedule('rodatech-alertas-diarias');
exception when others then
  -- No estaba. Es el caso normal la primera vez.
  null;
end $$;

select cron.schedule(
  'rodatech-alertas-diarias',
  '0 12 * * *',
  $$select public.generar_alertas()$$
);

comment on extension pg_cron is
  'Programador del mantenimiento. Hoy solo lo usa el refresco diario de alertas (migración 032).';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_n        int;
  v_horario  text;
  v_activo   boolean;
begin
  select count(*) into v_n from cron.job where jobname = 'rodatech-alertas-diarias';
  if v_n <> 1 then
    raise exception 'El refresco de alertas no quedó programado una sola vez (hay %)', v_n;
  end if;

  select schedule, active into v_horario, v_activo
    from cron.job where jobname = 'rodatech-alertas-diarias';

  if v_horario <> '0 12 * * *' then
    raise exception 'El refresco de alertas quedó con otro horario: %', v_horario;
  end if;
  if not v_activo then
    raise exception 'El refresco de alertas quedó desactivado';
  end if;

  -- Y que la función que va a llamar exista y responda. Lo mismo que enseñó la
  -- 031: una función que existe no es una función que funciona.
  perform public.generar_alertas();

  raise notice 'Alertas: refresco diario programado a las 07:00 de Lima.';
end $$;
