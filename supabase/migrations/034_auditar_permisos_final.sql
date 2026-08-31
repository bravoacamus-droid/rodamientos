-- ###########################################################################
-- 034 · LA AUDITORÍA DE PERMISOS, OTRA VEZ, PERO AL FINAL DE LA CADENA
-- ###########################################################################
--
-- Esto no es un duplicado por descuido: la DUPLICACIÓN ES EL PUNTO. La misma
-- regla, comprobada en dos sitios distintos de la cadena, porque cada posición
-- ve cosas distintas.
--
-- ---------------------------------------------------------------------------
-- Qué se descubrió
-- ---------------------------------------------------------------------------
-- La 013 audita en el puesto 13 de 34. Cuando corre, las funciones de la 014
-- en adelante TODAVÍA NO EXISTEN, así que nunca las ha mirado. Veinte
-- migraciones de funciones —el constructor, el importador, las alertas, las
-- importaciones, la trazabilidad, los catálogos desde pantalla— pasaron por
-- delante de una auditoría que no podía verlas.
--
-- Y no es teórico. La 006 hace dos cosas que juntas abren la puerta:
--
--     grant execute on all functions in schema public to authenticated;
--     alter default privileges in schema public
--       grant execute on functions to authenticated, service_role;
--
-- La segunda es la importante: **toda función creada DESPUÉS de la 006 nace
-- con EXECUTE concedido a `authenticated`**. Es lo que se quiere para las
-- funciones de negocio —que validan rol por dentro— y es exactamente lo que NO
-- se quiere para un disparador o para un ayudante que mueve kardex.
--
-- Depende, entonces, de que cada archivo se acuerde de cerrarse solo. La 022
-- se acordó. La siguiente puede que no, y nadie se enteraría: la única
-- auditoría del proyecto habría corrido nueve archivos antes de que la función
-- existiera.
--
-- ---------------------------------------------------------------------------
-- Cómo salió a la luz, que es la parte que conviene recordar
-- ---------------------------------------------------------------------------
-- Por accidente, y hacen falta DOS fallos para explicarlo:
--
--   1. Reaplicar la cadena entera moría en la 005 (`42P16: cannot drop columns
--      from view`), porque la 023 y la 025 ensanchan vistas que la 005 vuelve
--      a declarar estrechas. Nadie llegaba nunca al 013 sobre una base ya
--      migrada.
--   2. Arreglado eso, la 013 saltó de inmediato: sobre una base ya migrada
--      `sincronizar_gastos_importacion` SÍ existe cuando corre el `grant` a
--      bulto de la 006, y su revoke propio está treinta y tres archivos
--      después.
--
-- El primero tapaba al segundo. Y el segundo, al mirarlo, resultó ser el
-- síntoma de este tercero: la auditoría está en el sitio equivocado.
--
-- La 006 ahora cierra sola toda función volátil `security definer` sin
-- guardián, así que el caso concreto ya no puede repetirse. Este archivo es lo
-- otro que hacía falta: **mirar el sistema TERMINADO**, no el de la mitad.
--
-- ---------------------------------------------------------------------------
-- La regla, que es la de la 013 palabra por palabra
-- ---------------------------------------------------------------------------
-- Una función es peligrosa si cumple las tres a la vez:
--
--   · `volatile`  — escribe. Las `stable` solo leen y de esas se ocupa el RLS.
--   · `security definer` — se salta el RLS de las tablas que toca.
--   · llamable por `authenticated` — cualquiera con sesión, sea del rol que sea.
--
-- Y se salva si el cuerpo menciona uno de los tres guardianes del proyecto:
-- `puede_escribir`, `tiene_rol` o `es_gerencia`.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · Ninguna función que escriba puede estar abierta sin validar rol
-- ---------------------------------------------------------------------------
do $$
declare
  v_sin_control text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into v_sin_control
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.provolatile = 'v'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and pg_get_functiondef(p.oid) !~* '(puede_escribir|tiene_rol|es_gerencia)'
    -- Alta del perfil al crear el usuario en Auth. La dispara un trigger sobre
    -- `auth.users`, donde todavía no hay `auth.uid()` a quien preguntarle el
    -- rol. Es la misma excepción que la 013 y la única del proyecto.
    and p.proname not in ('manejar_usuario_nuevo');

  if v_sin_control is not null then
    raise exception
      'Al terminar la cadena quedan funciones que escriben, son security definer y las puede llamar cualquiera con sesión sin validar rol: %. Ciérralas en su propio archivo con «revoke execute ... from public, anon, authenticated», como hace la 022.',
      v_sin_control;
  end if;

  raise notice 'Permisos (final): ninguna función de escritura queda abierta sin guardián.';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Los ayudantes internos, con la lista al día
-- ---------------------------------------------------------------------------
-- La 013 ya vigila los siete de las migraciones 004 y 011. Aquí se le suman
-- los que nacieron después y que tampoco debe poder llamar nadie a mano.
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into v_abiertas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      -- Los de la 013, repetidos a propósito: si alguien los reabre en una
      -- migración posterior a la 013, ella ya no está para verlo.
      'registrar_movimientos', 'registrar_movimiento',
      'siguiente_correlativo', 'siguiente_numero_interno',
      'recalcular_precios_promedio', 'generar_alertas', 'rls_auto_enable',
      -- Nacidos después de la 013.
      'sincronizar_gastos_importacion'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_abiertas is not null then
    raise exception 'Ayudantes internos abiertos a authenticated al final de la cadena: %', v_abiertas;
  end if;

  raise notice 'Permisos (final): los ayudantes internos siguen cerrados.';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Y que la regla de la 006 siga en pie
-- ---------------------------------------------------------------------------
-- Sin esto, alguien podría borrar el bloque de cierre automático de la 006 y
-- los dos apartados de arriba seguirían pasando mientras cada archivo se
-- acordara de cerrarse solo — hasta el día que uno se olvide.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sincronizar_gastos_importacion'
  ) then
    raise exception 'Falta sincronizar_gastos_importacion: la 022 no se aplicó';
  end if;

  raise notice 'Permisos (final): auditoría completa sobre las 34 migraciones.';
end $$;
