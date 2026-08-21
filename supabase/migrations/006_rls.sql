-- ============================================================================
-- RODATECH ERP v2 · 005 · Row Level Security
-- ----------------------------------------------------------------------------
-- Modelo (heredado de la demo, que en esto acertó):
--   · todo usuario autenticado con perfil activo LEE
--   · la ESCRITURA la decide el rol, y la decide POSTGRES, no el navegador
--
-- Diferencia con la demo: las políticas no llevan la lista de roles embebida
-- en el DDL. Preguntan a `permisos_rol` a través de `puede_escribir()`, así
-- que cambiar quién puede tocar qué es un INSERT en una tabla, no una
-- migración con ALTER POLICY.
--
-- Nota de rendimiento: cada política envuelve la llamada en `(select …)`.
-- Eso fuerza a Postgres a evaluarla UNA vez por sentencia (InitPlan) en lugar
-- de una vez por fila; con un UPDATE masivo la diferencia es de dos órdenes
-- de magnitud.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Políticas uniformes sobre todas las tablas de negocio
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'empresa','series_documento','permisos_rol',
    'ubigeo','motivos_traslado','motivos_nota','unidades_medida',
    'marcas','familias','subfamilias','tipos',
    'productos','producto_equivalencias',
    'clientes','proveedores','proveedor_marcas',
    'consultas_cache','consultas_cuota','consultas_log',
    'stock','movimientos_inventario','ajustes_inventario','ajuste_items',
    'compras','compra_items','gastos_importacion','recepciones','recepcion_items',
    'cotizaciones','cotizacion_items',
    'guias_remision','guia_items',
    'comprobantes','comprobante_items','comprobante_cuotas',
    'pagos','gestiones_cobranza',
    'alertas','actividad'
  ];
begin
  foreach t in array tablas loop
    -- Las tablas del módulo de consultas (`consultas_*`) las declara
    -- 007_consultas.sql, que se aplica DESPUÉS de este archivo y trae sus
    -- propias políticas. Si todavía no existen, se saltan en silencio en vez
    -- de romper la migración: la matriz de permisos de 006 ya tiene sus filas.
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice 'RLS: se omite %, aún no existe (la declara una migración posterior)', t;
      continue;
    end if;

    -- ENABLE, no FORCE: el dueño de las tablas (postgres) tiene que poder
    -- saltarse las políticas, porque es el rol bajo el que corren TODAS las
    -- funciones `security definer` de 003. Con FORCE, `registrar_movimientos`
    -- fallaría al escribir el kardex, que es append-only por política.
    execute format('alter table public.%I enable row level security', t);

    -- Lectura: cualquier usuario autenticado CON PERFIL ACTIVO. Un usuario
    -- dado de baja conserva su sesión en Supabase Auth pero deja de ver datos.
    execute format('drop policy if exists "lectura_autenticados" on public.%I', t);
    execute format(
      'create policy "lectura_autenticados" on public.%I
         for select to authenticated
         using ((select public.mi_rol()) is not null)', t);

    -- Escritura: la decide la matriz declarativa.
    execute format('drop policy if exists "escritura_insert" on public.%I', t);
    execute format(
      'create policy "escritura_insert" on public.%I
         for insert to authenticated
         with check ((select public.puede_escribir(%L)))', t, t);

    execute format('drop policy if exists "escritura_update" on public.%I', t);
    execute format(
      'create policy "escritura_update" on public.%I
         for update to authenticated
         using ((select public.puede_escribir(%L)))
         with check ((select public.puede_escribir(%L)))', t, t, t);

    execute format('drop policy if exists "escritura_delete" on public.%I', t);
    execute format(
      'create policy "escritura_delete" on public.%I
         for delete to authenticated
         using ((select public.puede_escribir(%L)))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Perfiles: caso especial
-- ---------------------------------------------------------------------------
alter table public.perfiles enable row level security;

drop policy if exists "perfiles_lectura" on public.perfiles;
create policy "perfiles_lectura" on public.perfiles
  for select to authenticated using (true);

-- Cada quien edita su propia ficha; el rol solo lo cambia admin/gerencia.
drop policy if exists "perfiles_propio_update" on public.perfiles;
create policy "perfiles_propio_update" on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.es_gerencia()))
  with check (id = (select auth.uid()) or (select public.es_gerencia()));

drop policy if exists "perfiles_admin_insert" on public.perfiles;
create policy "perfiles_admin_insert" on public.perfiles
  for insert to authenticated
  with check ((select public.es_gerencia()));

drop policy if exists "perfiles_admin_delete" on public.perfiles;
create policy "perfiles_admin_delete" on public.perfiles
  for delete to authenticated
  using ((select public.es_gerencia()));

-- ---------------------------------------------------------------------------
-- Endurecimientos que la matriz por rol no puede expresar
-- ---------------------------------------------------------------------------

-- El kardex es un LIBRO: se escribe, no se corrige. Nadie edita ni borra un
-- movimiento; un error se arregla con otro movimiento (ajuste de gerencia).
drop policy if exists "escritura_update" on public.movimientos_inventario;
drop policy if exists "escritura_delete" on public.movimientos_inventario;

comment on table movimientos_inventario is
  'Kardex valorizado con costo promedio ponderado. Append-only por RLS: no hay política de UPDATE ni DELETE. Un error se corrige con un ajuste, no reescribiendo la historia.';

-- Un comprobante emitido no se borra: se anula (deja rastro) o se corrige con
-- una nota de crédito. Es requisito de SUNAT, no una preferencia. El UPDATE sí
-- se permite —hace falta para el estado SUNAT y el saldo— pero el trigger de
-- abajo congela la identidad y los importes una vez aceptado.
drop policy if exists "escritura_delete" on public.comprobantes;
drop policy if exists "escritura_delete" on public.comprobante_items;
drop policy if exists "escritura_delete" on public.guias_remision;
drop policy if exists "escritura_delete" on public.guia_items;

create or replace function public.proteger_comprobante_emitido()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if old.estado_sunat in ('aceptado','baja_aceptada')
     and (new.total <> old.total
          or new.op_gravada <> old.op_gravada
          or new.igv <> old.igv
          or new.cliente_id <> old.cliente_id
          or new.serie <> old.serie
          or new.correlativo <> old.correlativo
          or new.fecha_emision <> old.fecha_emision) then
    raise exception 'El comprobante % ya fue aceptado por SUNAT: sus importes y su identidad no se pueden modificar. Use una nota de crédito.',
      old.numero using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_comprobante_inmutable on comprobantes;
create trigger trg_comprobante_inmutable
  before update on comprobantes
  for each row execute function public.proteger_comprobante_emitido();

-- Ajuste de inventario: además de la matriz, blindado a gerencia. Es el botón
-- que Willy dijo que "va a usar con cuidado" (26:49).
do $$
declare t text;
begin
  foreach t in array array['ajustes_inventario','ajuste_items'] loop
    execute format('drop policy if exists "escritura_insert" on public.%I', t);
    execute format('drop policy if exists "escritura_update" on public.%I', t);
    execute format('drop policy if exists "escritura_delete" on public.%I', t);
    execute format('drop policy if exists "ajuste_solo_gerencia" on public.%I', t);
    execute format(
      'create policy "ajuste_solo_gerencia" on public.%I
         for all to authenticated
         using ((select public.es_gerencia()))
         with check ((select public.es_gerencia()))', t);
  end loop;
end $$;

-- La matriz de permisos solo la toca gerencia: si cualquiera pudiera escribir
-- en `permisos_rol` el modelo entero sería decorativo.
drop policy if exists "escritura_insert" on public.permisos_rol;
drop policy if exists "escritura_update" on public.permisos_rol;
drop policy if exists "escritura_delete" on public.permisos_rol;
drop policy if exists "permisos_solo_gerencia" on public.permisos_rol;
create policy "permisos_solo_gerencia" on public.permisos_rol
  for all to authenticated
  using ((select public.es_gerencia()))
  with check ((select public.es_gerencia()));

-- El ubigeo es data maestra del Estado: se carga por seed, no se edita en línea.
drop policy if exists "escritura_insert" on public.ubigeo;
drop policy if exists "escritura_update" on public.ubigeo;
drop policy if exists "escritura_delete" on public.ubigeo;

-- La actividad es un log: se escribe y se lee, no se reescribe.
drop policy if exists "escritura_update" on public.actividad;
drop policy if exists "escritura_delete" on public.actividad;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Los GRANT abren la puerta; el RLS decide quién pasa. Sin GRANT, PostgREST
-- devuelve 401 antes de siquiera evaluar la política.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- `anon` no ve nada: este ERP no tiene superficie pública. Se revoca también
-- de PUBLIC porque Postgres concede EXECUTE a PUBLIC por defecto en cada
-- función, y sin esto el rol anónimo seguiría pudiendo invocarlas.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
-- Postgres concede EXECUTE a PUBLIC en cada función nueva; sin esta línea,
-- toda función que se agregue mañana volvería a quedar abierta a `anon`.
alter default privileges in schema public
  revoke execute on functions from public;
