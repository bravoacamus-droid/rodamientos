-- ###########################################################################
-- 181 · LA ORDEN DE COMPRA NO LE DICE AL PROVEEDOR PARA QUÉ CLIENTE ES
-- ###########################################################################
--
-- El problema. Desde la 111, cada orden que nace de una cotización se
-- guardaba con la observación «Para CT02-001311 · FABRICA DE CUBIERTOS SAC».
-- Las observaciones salen al pie de la orden, que es el papel que se le manda
-- al proveedor: le decía a quién le vende Rodatech. `DocumentoOrdenCompra` ya
-- decía que eso NO debe salir: «en manos del proveedor es la forma más corta
-- de que le venda directo al cliente».
--
-- Se vio el 02/11, el día en que la orden pasó a mandarse en PDF (180).
-- Moisés, 02/11: «no debería mostrarle al proveedor».
--
-- La solución: no escribirla. La orden ya sabe de qué cotización viene por
-- `compras.cotizacion_id`, y la ficha lo enseña («Para el pedido…»). Las
-- observaciones quedan para lo que se le quiera decir al proveedor. Las
-- órdenes que ya la llevaban se limpian aparte, por SQL directo.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.generar_ordenes_de_compra(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cot     uuid := nullif(p_datos ->> 'cotizacion_id','')::uuid;
  v_estado  estado_cotizacion;
  v_numero  text;
  v_cliente text;
  v_orden   jsonb;
  v_r       jsonb;
  v_hechas  jsonb := '[]'::jsonb;
  v_malo    text;
begin
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede generar órdenes de compra'
      using errcode = 'insufficient_privilege';
  end if;

  select c.estado, c.numero, cl.razon_social into v_estado, v_numero, v_cliente
    from cotizaciones c join clientes cl on cl.id = c.cliente_id
   where c.id = v_cot;
  if v_estado is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;
  if v_estado not in ('aprobada', 'atendida') then
    raise exception 'Las órdenes de compra salen de una cotización confirmada, y esta está en %', v_estado
      using errcode = 'check_violation';
  end if;
  if jsonb_array_length(coalesce(p_datos -> 'ordenes', '[]'::jsonb)) = 0 then
    raise exception 'No hay nada que comprar' using errcode = 'invalid_parameter_value';
  end if;

  -- Solo productos que la cotización lleva.
  select pr.codigo into v_malo
    from jsonb_array_elements(p_datos -> 'ordenes') o
   cross join lateral jsonb_array_elements(o -> 'items') it
    join productos pr on pr.id = (it ->> 'producto_id')::uuid
   where not exists (
     select 1 from cotizacion_items ci
      where ci.cotizacion_id = v_cot and ci.producto_id = pr.id
   )
   limit 1;
  if v_malo is not null then
    raise exception '% no está en la cotización %', v_malo, v_numero
      using errcode = 'check_violation';
  end if;

  -- Ni dos veces lo mismo al mismo proveedor para la misma cotización…
  -- SALVO que haya un pedido nuevo (121): si lo confirmado de ese producto ya
  -- pasa de lo pedido entre todos los proveedores, la orden es la del pedido
  -- nuevo y no un duplicado (122).
  select pr.codigo || ' a ' || pv.razon_social || ' (' || c.numero || ')' into v_malo
    from jsonb_array_elements(p_datos -> 'ordenes') o
   cross join lateral jsonb_array_elements(o -> 'items') it
    join compras c on c.cotizacion_id = v_cot and c.estado <> 'anulada'
                  and c.proveedor_id = (o ->> 'proveedor_id')::uuid
    join compra_items ci on ci.compra_id = c.id and ci.producto_id = (it ->> 'producto_id')::uuid
    join productos pr on pr.id = ci.producto_id
    join proveedores pv on pv.id = c.proveedor_id
   where (select coalesce(sum(cix.cantidad), 0)
            from compras cx join compra_items cix on cix.compra_id = cx.id
           where cx.cotizacion_id = v_cot and cx.estado <> 'anulada' and cix.producto_id = pr.id)
      >= (select coalesce(sum(coalesce(q.cantidad_aprobada, q.cantidad)), 0)
            from cotizacion_items q where q.cotizacion_id = v_cot and q.producto_id = pr.id)
   limit 1;
  if v_malo is not null then
    raise exception 'Ya se le pidió %', v_malo using errcode = 'check_violation';
  end if;

  for v_orden in select * from jsonb_array_elements(p_datos -> 'ordenes') loop
    v_r := public.crear_compra(jsonb_build_object(
      'proveedor_id', v_orden ->> 'proveedor_id',
      'tipo', 'local',
      'moneda', coalesce(nullif(v_orden ->> 'moneda',''), 'USD'),
      'tipo_cambio', v_orden ->> 'tipo_cambio',
      'afecto_igv', true,
      -- Sin el cliente (181): este papel va al proveedor. El enlace es cotizacion_id.
      'observaciones', null,
      'items', v_orden -> 'items'
    ));
    update compras set cotizacion_id = v_cot where id = (v_r ->> 'id')::uuid;
    v_hechas := v_hechas || jsonb_build_array(jsonb_build_object('id', v_r ->> 'id', 'numero', v_r ->> 'numero'));
  end loop;

  return jsonb_build_object('ok', true, 'ordenes', v_hechas);
end $function$
;

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA: genera una orden desde una cotización y comprueba que queda
-- enlazada y sin el cliente en las observaciones. Todo se deshace.
do $$
declare
  v_usuario uuid; v_cliente uuid; v_prov uuid; p1 uuid; r jsonb; v_cot uuid; v_obs text; v_enlazadas int;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into v_prov from proveedores where activo order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or v_prov is null or p1 is null then
    raise notice '181: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 5, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    perform public.generar_ordenes_de_compra(jsonb_build_object('cotizacion_id', v_cot, 'ordenes', jsonb_build_array(
      jsonb_build_object('proveedor_id', v_prov, 'moneda', 'USD', 'tipo_cambio', null,
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 5, 'costo_unitario', 6, 'unidad_codigo', 'NIU'))))));
    select count(*), max(observaciones) into v_enlazadas, v_obs from compras where cotizacion_id = v_cot;
    if v_enlazadas <> 1 then raise exception '181: la orden no quedó enlazada a su cotización'; end if;
    if v_obs is not null then raise exception '181: la orden sigue diciendo «%»', v_obs; end if;
    raise exception '__181_DESHACER__';
  exception when others then
    if sqlerrm <> '__181_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '181: la orden nace enlazada y sin el cliente en el papel; deshecho limpio.';
end $$;
