-- ###########################################################################
-- 123 · EL OTRO PEDIDO NO ARRASTRA LA ORDEN DE COMPRA VIEJA
-- ###########################################################################
--
-- Luis, 15/10, sobre «Atender otro pedido»: *«la orden de compra del cliente
-- se rellena recién en la guía; aquí no la necesito»*. La guía la toma de la
-- cotización, y la cotización todavía guarda la del pedido ANTERIOR: la guía
-- del pedido nuevo saldría con la O/C vieja puesta. Repetir el pedido ahora
-- la VACÍA (o pone la que llegue, si alguien la manda), y la guía la pide.
-- Las guías y facturas ya hechas guardan su propia copia: no cambian.
-- ###########################################################################

set local search_path = public, extensions;

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
         -- La del pedido nuevo, o vacía: la vieja no vale para este (123).
         orden_compra_cliente = nullif(trim(coalesce(p_oc, '')), '')
   where id = p_id;

  return jsonb_build_object('id', p_id, 'lineas', v_n);
end $$;

-- ------------------------------------------------------------------ Centinela
do $$
declare
  v_usuario uuid; v_cliente uuid; p1 uuid; r jsonb; v_cot uuid; i1 uuid;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '123: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 5, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    perform public.poner_orden_compra_cliente(v_cot, 'OC-VIEJA');
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    perform public.repetir_pedido(v_cot, jsonb_build_array(jsonb_build_object('item_id', i1, 'cantidad', 5)));
    if (select orden_compra_cliente from cotizaciones where id = v_cot) is not null then
      raise exception '123: el pedido nuevo arrastró la O/C vieja';
    end if;
    raise exception '__123_DESHACER__';
  exception when others then
    if sqlerrm <> '__123_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end $$;
