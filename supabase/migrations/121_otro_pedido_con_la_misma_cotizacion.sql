-- ###########################################################################
-- 121 · OTRO PEDIDO CON LA MISMA COTIZACIÓN
-- ###########################################################################
--
-- Willy, reunión del 14/10: *«hay un cliente que ya tengo fidelizado… un
-- producto que me pide 20 unidades cada cierto tiempo. Yo cojo de una misma
-- cotización, le vuelvo a hacer la guía y la factura… con esa misma
-- cotización. Eso es posible en mi sistema»*. Ya tiene el precio fijado: el
-- cliente solo manda la orden.
--
-- La guía y la factura salen con su propio correlativo, como siempre; lo que
-- cambia es que cuelgan de la misma cotización. En el ERP eso es SUMAR el
-- pedido nuevo a lo confirmado y volver a abrirla:
--
--   · `cantidad_aprobada` deja de tener por techo lo cotizado. Ahora es «lo
--     que el cliente ha pedido de esta cotización», que con pedidos repetidos
--     pasa de lo cotizado. El techo de la guía y de la factura sigue siendo
--     ese mismo número, así que nada se despacha ni se factura de más.
--   · `repetir_pedido(id, líneas, O/C)`: suma, deja la cotización en
--     «aprobada» y pone la O/C del pedido nuevo. Solo sobre una aprobada o
--     atendida.
-- ###########################################################################

set local search_path = public, extensions;

alter table cotizacion_items drop constraint if exists cotiz_item_aprobada_ok;
alter table cotizacion_items add constraint cotiz_item_aprobada_ok
  check (cantidad_aprobada is null or cantidad_aprobada >= 0);

create or replace function public.repetir_pedido(p_id uuid, p_lineas jsonb, p_oc text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_estado estado_cotizacion;
  v_fila   jsonb;
  v_item   uuid;
  v_cant   numeric(14,2);
  v_n      int := 0;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede atender pedidos' using errcode = 'insufficient_privilege';
  end if;

  select estado into v_estado from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado not in ('aprobada', 'atendida') then
    raise exception 'Solo se repite el pedido de una cotización aprobada o atendida (está %)', v_estado
      using errcode = 'check_violation';
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_item := nullif(v_fila ->> 'item_id', '')::uuid;
    v_cant := coalesce((v_fila ->> 'cantidad')::numeric, 0);
    if v_item is null or v_cant < 0 then
      raise exception 'Una línea llegó sin item_id o con cantidad negativa' using errcode = 'invalid_parameter_value';
    end if;
    continue when v_cant = 0;
    update cotizacion_items
       set cantidad_aprobada = coalesce(cantidad_aprobada, cantidad) + v_cant
     where id = v_item and cotizacion_id = p_id;
    if not found then
      raise exception 'La línea % no es de esta cotización', v_item using errcode = 'foreign_key_violation';
    end if;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'El pedido nuevo no lleva nada: pon al menos una cantidad' using errcode = 'check_violation';
  end if;

  update cotizaciones
     set estado = 'aprobada',
         orden_compra_cliente = coalesce(nullif(trim(p_oc), ''), orden_compra_cliente)
   where id = p_id;

  return jsonb_build_object('id', p_id, 'lineas', v_n);
end $$;

revoke all on function public.repetir_pedido(uuid, jsonb, text) from public, anon;
grant execute on function public.repetir_pedido(uuid, jsonb, text) to authenticated, service_role;

-- ------------------------------------------------------------------ Centinela
do $$
declare
  v_usuario uuid; v_cliente uuid; p1 uuid; r jsonb; v_cot uuid; i1 uuid;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '121: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 20, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    -- Como si ya se hubiera atendido todo.
    update cotizacion_items set cantidad_atendida = 20 where id = i1;
    update cotizaciones set estado = 'atendida' where id = v_cot;

    perform public.repetir_pedido(v_cot, jsonb_build_array(jsonb_build_object('item_id', i1, 'cantidad', 20)), 'OC-NUEVA');
    if (select cantidad_aprobada from cotizacion_items where id = i1) <> 40
       or (select estado from cotizaciones where id = v_cot) <> 'aprobada'
       or (select orden_compra_cliente from cotizaciones where id = v_cot) <> 'OC-NUEVA' then
      raise exception '121: repetir el pedido no sumó, no reabrió o no puso la O/C';
    end if;
    raise exception '__121_DESHACER__';
  exception when others then
    if sqlerrm <> '__121_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '121: otro pedido suma a lo confirmado y reabre la cotización; deshecho limpio.';
end $$;
