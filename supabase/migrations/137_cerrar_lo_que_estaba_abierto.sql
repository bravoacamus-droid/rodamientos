-- ###########################################################################
-- 137 · CERRAR LO QUE ESTABA ABIERTO
-- ###########################################################################
--
-- Auditoría de seguridad antes de producción (15/10). Luis: *«que no haya
-- problemas de seguridad o un dato en el aire»*.
--
-- 1. ANON. Supabase da a `anon`, por privilegio por defecto, EXECUTE en cada
--    función nueva y todo en cada tabla o vista nueva. La 006 solo lo quitó a
--    `public`. Resultado: 38 funciones y 11 vistas al alcance de cualquiera
--    con la anon key, SIN sesión. Las graves: `productos_pagina`,
--    `buscar_productos` y `sustitutos_de` (security definer: el catálogo
--    entero con costo y precio mínimo) y la vista `v_comparativa_precios`
--    (sin security_invoker: lo que cotizó cada proveedor). Se le quita TODO a
--    `anon` y se le devuelve solo `cotizacion_por_token`, que es lo único que
--    usa la ruta pública /ver (072). Y se corta el privilegio por defecto,
--    para que la función de mañana no nazca abierta.
--
-- 2. VISTAS sin security_invoker (se saltaban el RLS): ahora lo llevan.
--
-- 3. PATCH DIRECTO. Las tablas que solo escriben las funciones tenían
--    candados a medias (079): un vendedor podía cambiar por PostgREST la
--    moneda, la retención o las cuotas de una factura emitida y todavía no
--    enviada —y SUNAT recibiría eso—; almacén podía poner «emitida» o
--    «anulada» a una guía sin mover stock, o tocar el stock y el kardex sin
--    rastro. Ninguna pantalla escribe esas tablas directo (comprobado el
--    15/10), así que se cierran: solo pasan las funciones
--    (`escribe_una_funcion()`), más lo poco que la pantalla sí edita:
--      · comprobantes: solo `observaciones`.
--      · guias_remision: la cabecera de un BORRADOR (§6), sin tocar estado
--        ni identidad.
--      · cotizaciones: aprobadas en adelante, nada fuera del estado (que ya
--        vigila `tg_cotizacion_estado_valido`).
--      · guia_items, stock, movimientos_inventario, comprobante_guias:
--        nada.
--
-- 4. `vincular_guias_comprobante` solo antes de mandar a SUNAT: desvincular
--    la guía de una factura viva dejaba anular la guía (y reponer stock)
--    con la factura en pie.
--
-- 5. `registrar_atencion_de_cotizacion` deja de ser llamable con sesión: solo
--    la usa `emitir_comprobante`, y suelta inflaba lo atendido.
-- ###########################################################################

-- ---------------------------------------------------------------- 1 · anon
revoke execute on all functions in schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant execute on function public.cotizacion_por_token(text) to anon;

alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------- 2 · vistas
alter view public.v_comparativa_precios set (security_invoker = true);
alter view public.v_top_productos set (security_invoker = true);
alter view public.v_ventas_mensuales set (security_invoker = true);

-- ---------------------------------------------------------------- 3 · candados
-- Genérico: la tabla solo la escriben las funciones.
create or replace function public.tg_solo_funciones()
returns trigger
language plpgsql security invoker set search_path = public, extensions as $$
begin
  if public.escribe_una_funcion() then
    return coalesce(new, old);
  end if;
  raise exception '% se cambia desde su pantalla, no directamente.', tg_table_name
    using errcode = '42501';
end $$;

drop trigger if exists tg_guia_items_solo_rpc on guia_items;
create trigger tg_guia_items_solo_rpc before insert or update or delete on guia_items
  for each row execute function public.tg_solo_funciones();
drop trigger if exists tg_stock_solo_rpc on stock;
create trigger tg_stock_solo_rpc before insert or update or delete on stock
  for each row execute function public.tg_solo_funciones();
drop trigger if exists tg_movimientos_solo_rpc on movimientos_inventario;
create trigger tg_movimientos_solo_rpc before insert or update or delete on movimientos_inventario
  for each row execute function public.tg_solo_funciones();
drop trigger if exists tg_comprobante_guias_solo_rpc on comprobante_guias;
create trigger tg_comprobante_guias_solo_rpc before insert or update or delete on comprobante_guias
  for each row execute function public.tg_solo_funciones();

-- Comprobantes: de la pantalla, solo las observaciones. Lista BLANCA: una
-- columna nueva nace cerrada.
create or replace function public.tg_comprobante_columnas_de_las_rpc()
returns trigger
language plpgsql security invoker set search_path = public, extensions as $$
begin
  if public.escribe_una_funcion() then
    return coalesce(new, old);
  end if;
  if tg_op <> 'UPDATE' then
    raise exception 'Los comprobantes se emiten y se anulan desde su pantalla.' using errcode = '42501';
  end if;
  if new.estado is distinct from old.estado then
    raise exception
      'El estado de un comprobante no se cambia a mano: anular repone el stock que descargó, y eso solo lo hace Gerencia desde la pantalla.'
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['observaciones', 'actualizado_en'])
     is distinct from (to_jsonb(old) - array['observaciones', 'actualizado_en']) then
    raise exception
      'Un comprobante emitido no se modifica: se corrige con una nota de crédito.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tg_comprobante_solo_rpc on comprobantes;
create trigger tg_comprobante_solo_rpc before insert or update or delete on comprobantes
  for each row execute function public.tg_comprobante_columnas_de_las_rpc();

-- Guías: de la pantalla, la cabecera de un borrador (115).
create or replace function public.tg_guia_solo_borrador()
returns trigger
language plpgsql security invoker set search_path = public, extensions as $$
begin
  if public.escribe_una_funcion() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Las guías se generan desde su pantalla.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.estado = 'borrador' then return old; end if;
    raise exception 'Una guía emitida no se borra: se anula.' using errcode = '42501';
  end if;
  if old.estado <> 'borrador' then
    raise exception 'La guía % ya está emitida: si algo está mal, hay que anularla.', old.numero
      using errcode = '42501';
  end if;
  if new.estado is distinct from old.estado
     or new.numero is distinct from old.numero
     or new.serie is distinct from old.serie
     or new.correlativo is distinct from old.correlativo
     or new.cliente_id is distinct from old.cliente_id
     or new.cotizacion_id is distinct from old.cotizacion_id
     or new.pedido_id is distinct from old.pedido_id then
    raise exception 'El estado, el número y el cliente de una guía los ponen sus funciones.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tg_guia_solo_borrador on guias_remision;
create trigger tg_guia_solo_borrador before insert or update or delete on guias_remision
  for each row execute function public.tg_guia_solo_borrador();

-- Cotizaciones: aprobadas en adelante, la cabecera no se toca a mano.
create or replace function public.tg_cotizacion_cabecera_cerrada()
returns trigger
language plpgsql security invoker set search_path = public, extensions as $$
begin
  if public.escribe_una_funcion() or old.estado in ('borrador', 'enviada') then
    return new;
  end if;
  if (to_jsonb(new) - array['estado', 'actualizado_en'])
     is distinct from (to_jsonb(old) - array['estado', 'actualizado_en']) then
    raise exception 'La cotización % ya está %: se cambia desde su pantalla.', old.numero, old.estado
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tg_cotizacion_cabecera_cerrada on cotizaciones;
create trigger tg_cotizacion_cabecera_cerrada before update on cotizaciones
  for each row execute function public.tg_cotizacion_cabecera_cerrada();

-- ---------------------------------------------------------------- 3b · INVOKER
-- LA CAUSA de que los candados de la 079 no cerraran nada (encontrado al
-- probar esta migración, 15/10): eran SECURITY DEFINER, así que dentro del
-- trigger current_user era el dueño de la base y escribe_una_funcion()
-- daba siempre «sí». Una sesión de gerencia cambió el total de una factura
-- sin enviar con un PATCH (en una transacción deshecha). Como invoker,
-- current_user es quien escribe: authenticated desde PostgREST, el dueño
-- desde una función security definer, service_role desde el servidor.
alter function public.tg_lineas_solo_rpc() security invoker;
alter function public.tg_cotizacion_estado_valido() security invoker;

-- ---------------------------------------------------------------- 4 · vincular
create or replace function public.vincular_guias_comprobante(p_comprobante uuid, p_guias uuid[])
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cliente uuid;
  v_estado  text;
  v_sunat   text;
  v_g       uuid;
  v_i       smallint := 0;
begin
  if (select public.mi_rol()) is null then
    raise exception 'Hay que iniciar sesión.' using errcode = 'insufficient_privilege';
  end if;
  if not (select public.puede_escribir('comprobantes')) then
    raise exception 'Tu rol no puede tocar comprobantes.' using errcode = 'insufficient_privilege';
  end if;

  select cliente_id, estado, estado_sunat into v_cliente, v_estado, v_sunat
  from comprobantes where id = p_comprobante;

  if v_cliente is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_estado = 'anulado' then
    raise exception 'El comprobante está anulado: no se le vinculan guías.';
  end if;
  -- 137: solo antes de mandarlo. Después, la guía que ampara la factura es
  -- la que se declaró, y soltarla dejaría anularla con la factura en pie.
  if coalesce(v_sunat, 'no_enviado') <> 'no_enviado' then
    raise exception 'El comprobante ya se mandó a SUNAT: sus guías ya no se cambian.'
      using errcode = 'check_violation';
  end if;

  delete from comprobante_guias where comprobante_id = p_comprobante;

  foreach v_g in array coalesce(p_guias, array[]::uuid[]) loop
    -- La guía tiene que ser del MISMO cliente (084).
    if not exists (
      select 1 from guias_remision g
      where g.id = v_g and g.cliente_id = v_cliente and g.estado <> 'anulada'
    ) then
      raise exception
        'Esa guía no existe, está anulada o es de otro cliente.'
        using errcode = 'check_violation';
    end if;

    v_i := v_i + 1;
    insert into comprobante_guias (comprobante_id, guia_id, orden)
    values (p_comprobante, v_g, v_i);
  end loop;

  update comprobantes
     set guia_id = (
       select cg.guia_id from comprobante_guias cg
       where cg.comprobante_id = p_comprobante
       order by cg.orden limit 1
     )
   where id = p_comprobante;
end $$;

revoke all on function public.vincular_guias_comprobante(uuid, uuid[]) from public, anon;
grant execute on function public.vincular_guias_comprobante(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------- 1b · PUBLIC
-- Al final, para que cubra también las funciones creadas arriba.
-- Muchas funciones llegan a `anon` a través de PUBLIC (`=X/postgres`). A
-- esas se les da el permiso EXPLÍCITO a quien tiene sesión y se le quita a
-- PUBLIC: `authenticated` sigue igual y `anon` se queda fuera.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.firma);
    execute format('revoke execute on function %s from public', f.firma);
  end loop;
end $$;

revoke execute on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
grant execute on function public.cotizacion_por_token(text) to anon;

-- ---------------------------------------------------------------- 5 · atención
revoke all on function public.registrar_atencion_de_cotizacion(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Centinela: lo comprueba de verdad, con los roles de verdad.
-- ---------------------------------------------------------------------------
do $$
declare
  v_abiertas text;
  v_usuario  uuid;
  v_comp     uuid;
  v_guia     uuid;
  v_stock    uuid;
  v_cot      uuid;
  v_falla    text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname <> 'cotizacion_por_token';
  if v_abiertas is not null then
    raise exception '137: anon todavía ejecuta: %', v_abiertas;
  end if;
  select string_agg(c.relname, ', ') into v_abiertas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
     and has_table_privilege('anon', c.oid, 'select');
  if v_abiertas is not null then
    raise exception '137: anon todavía lee: %', v_abiertas;
  end if;
  if not has_function_privilege('anon', 'public.cotizacion_por_token(text)', 'execute') then
    raise exception '137: /ver se quedó sin su función';
  end if;

  -- Con la sesión de gerencia, el PATCH directo rebota.
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_comp from comprobantes where estado <> 'anulado' limit 1;
  select id into v_guia from guias_remision where estado = 'emitida' limit 1;
  select producto_id into v_stock from stock limit 1;
  select id into v_cot from cotizaciones where estado in ('aprobada', 'atendida') limit 1;
  if v_usuario is null then
    raise notice '137: sin gerencia para probar el PATCH directo.';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    set local role authenticated;
    if v_comp is not null then
      begin
        update comprobantes set dias_credito = coalesce(dias_credito, 0) + 1 where id = v_comp;
        v_falla := 'comprobante';
      exception when insufficient_privilege then null;
      end;
    end if;
    if v_guia is not null and v_falla is null then
      begin
        update guias_remision set estado = 'anulada' where id = v_guia;
        v_falla := 'guía';
      exception when insufficient_privilege then null;
      end;
    end if;
    if v_stock is not null and v_falla is null then
      begin
        update stock set cantidad = cantidad + 1 where producto_id = v_stock;
        v_falla := 'stock';
      exception when insufficient_privilege then null;
      end;
    end if;
    if v_cot is not null and v_falla is null then
      begin
        update cotizaciones set tipo_cambio = coalesce(tipo_cambio, 0) + 1 where id = v_cot;
        v_falla := 'cotización';
      exception when insufficient_privilege then null;
      end;
    end if;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if v_falla is not null then
      raise exception '137: el PATCH directo de % pasó', v_falla;
    end if;
  end if;
  raise notice '137: anon solo ve /ver; vistas con security_invoker; PATCH directo cerrado en comprobantes, guías, stock y cotizaciones.';
end $$;
