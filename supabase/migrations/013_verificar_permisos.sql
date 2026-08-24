-- ###########################################################################
-- 013 · CENTINELA DE PERMISOS
-- ###########################################################################
--
-- Esta migración no cambia nada: comprueba.
--
-- Toda función que ESCRIBA, sea `security definer` y esté abierta a
-- `authenticated` tiene que validar el rol dentro de su cuerpo. Es la
-- combinación peligrosa: `security definer` se salta las políticas de RLS, así
-- que sin comprobación explícita basta con no pasar por la aplicación.
--
-- Ya ocurrió dos veces:
--
--   · `registrar_movimientos` — un usuario con rol `ventas` se sumó 999
--     unidades de un rodamiento llamándola por PostgREST. Se cerró en 012
--     retirándole el permiso: es un ayudante interno y nadie debe llamarla
--     desde fuera.
--   · Otras nueve funciones de negocio —crear_cotizacion, emitir_comprobante,
--     importar_productos…— que SÍ deben ser llamables. A esas se les puso el
--     guardián dentro, contra la matriz `permisos_rol`.
--
-- Poniendo el centinela en una migración, cualquiera que añada una función de
-- escritura sin control de rol se entera al aplicar, no cuando alguien lo
-- descubra en producción.

set local search_path = public, extensions;

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
    -- `v` = volatile: escribe. Las `stable` e `immutable` solo leen, y de esas
    -- ya se ocupa RLS.
    and p.provolatile = 'v'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    -- Que el cuerpo mencione uno de los tres guardianes.
    and pg_get_functiondef(p.oid) !~* '(puede_escribir|tiene_rol|es_gerencia)'
    -- Excepciones justificadas: no escriben datos de negocio.
    and p.proname not in (
      -- Alta del perfil al crear el usuario en Auth. La dispara un trigger de
      -- `auth.users`, donde no hay `auth.uid()` todavía.
      'manejar_usuario_nuevo'
    );

  if v_sin_control is not null then
    raise exception
      'Estas funciones escriben, son security definer y las puede llamar cualquiera con sesión, pero NO validan rol: %',
      v_sin_control;
  end if;

  raise notice 'Permisos: toda función de escritura llamable valida el rol.';
end $$;

-- ---------------------------------------------------------------------------
-- Y que los ayudantes internos sigan cerrados
-- ---------------------------------------------------------------------------
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into v_abiertas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'registrar_movimientos', 'registrar_movimiento',
      'siguiente_correlativo', 'siguiente_numero_interno',
      'recalcular_precios_promedio', 'generar_alertas', 'rls_auto_enable'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_abiertas is not null then
    raise exception 'Ayudantes internos abiertos a authenticated: %', v_abiertas;
  end if;

  raise notice 'Permisos: los ayudantes internos siguen cerrados.';
end $$;
