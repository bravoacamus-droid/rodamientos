-- ###########################################################################
-- 114 · EDITAR UN PEDIDO APROBADO RESPETA LO QUE EL CLIENTE NO QUISO
-- ###########################################################################
--
-- Luis, 13/10: aprobó la COT1-000009 con el B-118 en «No lo quiso» y, al
-- editarla, *«me sigue saliendo los 4, pero debería salir como desactivado
-- o algo así; si queremos volver a activarlo, seguro se animó a última
-- hora»*.
--
-- Y era peor de lo que se veía: `actualizar_cotizacion` (070) ponía
-- `cantidad_aprobada = cantidad` en TODAS las líneas al guardar una
-- aprobada. Editar y guardar volvía a aprobar lo que el cliente rechazó, y
-- el B-118 habría entrado en la compra y en la factura.
--
-- Ahora la pantalla manda `cantidad_aprobada` de cada línea: 0 para la que
-- no quiso, lo que sea para la que confirmó a medias, y nada para una línea
-- nueva (que entra confirmada entera). La función es la de la 112 con ese
-- único cambio.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.actualizar_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_estado   estado_cotizacion;
  v_cliente  uuid;
  v_contacto uuid := nullif(p_datos ->> 'contacto_id','')::uuid;
  v_colgado  int;
  v_n        int;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede editar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := nullif(p_datos ->> 'id','')::uuid;
  if v_id is null then
    raise exception 'Falta el id de la cotización' using errcode = 'check_violation';
  end if;

  select estado, cliente_id into v_estado, v_cliente from cotizaciones where id = v_id for update;
  if v_estado is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;

  if v_estado not in ('borrador', 'enviada', 'aprobada') then
    raise exception 'Una cotización en % ya no se edita', v_estado
      using errcode = 'check_violation';
  end if;

  select count(*) into v_colgado
    from guia_items gi
    join cotizacion_items ci on ci.id = gi.cotizacion_item_id
   where ci.cotizacion_id = v_id;
  if v_colgado > 0 then
    raise exception 'Esta cotización ya tiene mercadería despachada: no se puede editar'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_colgado
    from cotizacion_items
   where cotizacion_id = v_id and coalesce(cantidad_atendida, 0) > 0;
  if v_colgado > 0 then
    raise exception 'Esta cotización ya tiene líneas facturadas: no se puede editar'
      using errcode = 'check_violation';
  end if;

  v_cliente := coalesce(nullif(p_datos ->> 'cliente_id','')::uuid, v_cliente);
  if v_contacto is not null and not exists (
    select 1 from cliente_contactos cc where cc.id = v_contacto and cc.cliente_id = v_cliente
  ) then
    raise exception 'El contacto elegido no pertenece a ese cliente'
      using errcode = 'foreign_key_violation';
  end if;

  update cotizaciones set
    cliente_id             = v_cliente,
    validez_dias           = coalesce(nullif(p_datos ->> 'validez_dias','')::int, validez_dias),
    tiempo_entrega         = nullif(p_datos ->> 'tiempo_entrega',''),
    orden_compra_cliente   = nullif(p_datos ->> 'orden_compra_cliente',''),
    contacto               = nullif(p_datos ->> 'contacto',''),
    contacto_id            = v_contacto,
    condiciones            = nullif(p_datos ->> 'condiciones',''),
    observaciones          = nullif(p_datos ->> 'observaciones',''),
    mostrar_descuento      = coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    mostrar_disponibilidad = coalesce((p_datos ->> 'mostrar_disponibilidad')::boolean, false)
  where id = v_id;

  -- Los proveedores de cada línea se van con ella (on delete cascade) y
  -- vuelven con el payload, con su fecha de siempre.
  delete from cotizacion_items where cotizacion_id = v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    disponibilidad, dias_entrega, cantidad_aprobada, nota
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         (i.value ->> 'orden')::int,
         i.value ->> 'codigo',
         nullif(i.value ->> 'marca',''),
         i.value ->> 'descripcion',
         (i.value ->> 'cantidad')::numeric,
         i.value ->> 'unidad_codigo',
         (i.value ->> 'valor_unitario')::numeric,
         coalesce((i.value ->> 'descuento_pct')::numeric, 0),
         coalesce((i.value ->> 'costo_unitario')::numeric, 0),
         coalesce(nullif(i.value ->> 'disponibilidad','')::disponibilidad_item, 'inmediata'),
         nullif(i.value ->> 'dias_entrega','')::int,
         -- Editando una aprobada: lo confirmado que manda la pantalla (114).
         -- Hasta la 113 era siempre la cantidad, y editar volvía a aprobar
         -- lo que el cliente había dicho que no. Sin el dato (una línea
         -- nueva), lo tecleado es lo acordado, como en la 070. Nunca más
         -- que lo cotizado: lo exige `cotiz_item_aprobada_ok`.
         case when v_estado = 'aprobada'
              then least(
                     greatest(coalesce(nullif(i.value ->> 'cantidad_aprobada','')::numeric,
                                       (i.value ->> 'cantidad')::numeric), 0),
                     (i.value ->> 'cantidad')::numeric)
              else null end,
         nullif(left(btrim(i.value ->> 'nota'), 300), '')
    from jsonb_array_elements(p_datos -> 'items') i;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'La cotización no puede quedarse sin líneas'
      using errcode = 'check_violation';
  end if;

  perform public.guardar_proveedores_de_lineas(v_id, p_datos -> 'items');

  return jsonb_build_object('ok', true, 'id', v_id, 'lineas', v_n);
end;
$$;

revoke all on function public.actualizar_cotizacion(jsonb) from public;
grant execute on function public.actualizar_cotizacion(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Centinela: el caso de la COT1-000009, ejecutado y deshecho
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid; p2 uuid; p3 uuid;
  r jsonb;
  v_id uuid;
  v_item jsonb;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  select id into p2 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id <> p1 order by codigo limit 1;
  select id into p3 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id not in (p1, p2) order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p3 is null then
    raise notice '114: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    r := public.crear_cotizacion(jsonb_build_object(
      'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 3, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0),
        jsonb_build_object('producto_id', p2, 'orden', 2, 'codigo', 'X2', 'descripcion', 'dos',
          'cantidad', 1, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0))));
    v_id := (r ->> 'id')::uuid;
    -- El cliente confirma el primero y NO quiere el segundo.
    perform public.aprobar_cotizacion(v_id, (
      select jsonb_agg(jsonb_build_object('item_id', id, 'cantidad', case when orden = 1 then 3 else 0 end))
        from cotizacion_items where cotizacion_id = v_id));

    -- Se edita: el segundo sigue fuera, se añade un tercero y el primero
    -- baja a 2 confirmados de 3.
    perform public.actualizar_cotizacion(jsonb_build_object(
      'id', v_id, 'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 3, 'cantidad_aprobada', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0),
        jsonb_build_object('producto_id', p2, 'orden', 2, 'codigo', 'X2', 'descripcion', 'dos',
          'cantidad', 1, 'cantidad_aprobada', 0, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0),
        jsonb_build_object('producto_id', p3, 'orden', 3, 'codigo', 'X3', 'descripcion', 'tres',
          'cantidad', 4, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0))));

    if (select cantidad_aprobada from cotizacion_items where cotizacion_id = v_id and orden = 2) <> 0 then
      raise exception '114: editar volvió a aprobar lo que el cliente no quiso';
    end if;
    if (select cantidad_aprobada from cotizacion_items where cotizacion_id = v_id and orden = 1) <> 2 then
      raise exception '114: no respetó lo confirmado a medias';
    end if;
    if (select cantidad_aprobada from cotizacion_items where cotizacion_id = v_id and orden = 3) <> 4 then
      raise exception '114: una línea nueva tenía que entrar confirmada entera';
    end if;

    raise exception '__114_DESHACER__';
  exception when others then
    if sqlerrm <> '__114_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '114: editar una aprobada respeta lo no querido, lo confirmado a medias y lo nuevo; deshecho limpio.';
end $$;
