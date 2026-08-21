-- ###########################################################################
-- 012 · CERRAR LA SUPERFICIE DE LOS RPC INTERNOS
-- ###########################################################################
--
-- Encontrado probando el ajuste rápido de stock: un usuario con rol `ventas`
-- podía llamar a `registrar_movimientos` directamente por PostgREST y sumarse
-- 999 unidades de cualquier producto.
--
--     POST /rest/v1/rpc/registrar_movimientos  ->  200 {"movimientos":1}
--
-- El problema es de diseño y no de esa función en concreto: TODAS estas son
-- `security definer`, o sea que se ejecutan con los privilegios del dueño y
-- **se saltan las políticas de RLS**. Si además `authenticated` puede
-- ejecutarlas, el control de rol que hace la aplicación es decorado: basta con
-- no pasar por la aplicación.
--
-- Aquí se retira el permiso a las que son AYUDANTES INTERNOS y a las de
-- mantenimiento. Los que sí las llaman son otras funciones `security definer`
-- —`recepcionar_mercaderia`, `registrar_ajuste_inventario`, `emitir_comprobante`—
-- y esas siguen funcionando: durante una llamada `security definer` el
-- privilegio se comprueba contra el DUEÑO, no contra quien inició la petición.
--
-- Lo que NO cierra esta migración: las nueve funciones de negocio que sí deben
-- ser llamables (crear_cotizacion, emitir_comprobante, importar_productos…)
-- necesitan un control de rol DENTRO del cuerpo, como ya hacen
-- `registrar_ajuste_inventario` y `anular_comprobante`. Va aparte porque cada
-- una necesita su propia lista de roles y equivocarse ahí rompe la facturación.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Ayudantes internos del kardex y de la numeración
-- ---------------------------------------------------------------------------
-- Nadie debería llamarlos desde fuera: mover stock es consecuencia de un
-- documento (recepción, ajuste, comprobante, guía), nunca un acto suelto.
revoke execute on function public.registrar_movimientos(jsonb, uuid) from anon, authenticated;
revoke execute on function public.registrar_movimiento(uuid, tipo_movimiento, numeric, numeric, text, uuid, text, text, uuid) from anon, authenticated;

-- Quemar un correlativo por fuera deja un hueco en la numeración que después
-- hay que explicarle a SUNAT.
revoke execute on function public.siguiente_correlativo(tipo_documento, text) from anon, authenticated;
revoke execute on function public.siguiente_numero_interno(tipo_documento) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Mantenimiento
-- ---------------------------------------------------------------------------
-- Recalcular precios o regenerar alertas es trabajo programado, no algo que
-- dispare una pantalla. Se dejan para `service_role`, que es quien corre las
-- tareas.
revoke execute on function public.recalcular_precios_promedio(jsonb, int) from anon, authenticated;
revoke execute on function public.generar_alertas() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funciones de disparador
-- ---------------------------------------------------------------------------
-- Devuelven `trigger`, así que PostgREST no las expone de todos modos. Se
-- retiran igual: la superficie que no existe no hay que auditarla.
revoke execute on function public.tocar_actualizado_en() from anon, authenticated;
revoke execute on function public.recalcular_totales_cotizacion() from anon, authenticated;
revoke execute on function public.recalcular_comprobante() from anon, authenticated;
revoke execute on function public.proteger_comprobante_emitido() from anon, authenticated;
revoke execute on function public.fijar_piso_cotizacion() from anon, authenticated;
revoke execute on function public.manejar_usuario_nuevo() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_abiertas text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_abiertas
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
    raise exception 'Siguen abiertas a authenticated: %', v_abiertas;
  end if;

  -- El camino legítimo tiene que seguir en pie.
  if not has_function_privilege('authenticated', 'public.registrar_ajuste_inventario(jsonb)', 'EXECUTE') then
    raise exception 'Se cerró registrar_ajuste_inventario, que SÍ debe ser llamable';
  end if;

  raise notice 'RPC internos cerrados a authenticated.';
end $$;
