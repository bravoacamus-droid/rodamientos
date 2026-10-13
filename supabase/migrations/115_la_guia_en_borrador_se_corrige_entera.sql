-- ###########################################################################
-- 115 · LA GUÍA EN BORRADOR SE CORRIGE ENTERA
-- ###########################################################################
--
-- Luis, 14/10: *«¿por qué en guía no puedo editar todos los datos, y por qué
-- no puedo poner las órdenes de compra?»*.
--
-- Una guía en borrador solo dejaba tocar la cabecera. Los productos y las
-- cantidades quedaban fijos desde que se generó, y para cambiar uno había que
-- anularla y hacer otra —y la anulada se queda con su número—. No había
-- motivo de fondo: el stock no se mueve hasta EMITIR (`emitir_guia`), así que
-- un borrador todavía no es un compromiso de nadie, que es la regla de todo
-- el ERP (CLAUDE.md §6).
--
-- Dos piezas:
--
--   · `despacho_por_item(cotizacion, excluir_guia)`: cuánto de cada línea de
--     la cotización va ya en guías no anuladas. Cuenta los KITS en kits: la
--     086 guarda un kit como sus piezas sueltas, así que sumar `cantidad` por
--     línea contaba 2 kits de 3 piezas como 6. Lo usan la guía nueva y la que
--     se corrige.
--
--   · `corregir_lineas_guia(guia, items)`: cambia los productos de un
--     borrador. Valida cada cantidad contra lo confirmado MENOS lo que llevan
--     las OTRAS guías, y vuelve a grabar las líneas (los kits se vuelven a
--     repartir solos por el trigger de la 086).
--
-- La orden de compra del cliente y el motivo los escribe la Server Action
-- directamente en la tabla, como el resto de la cabecera.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.despacho_por_item(p_cotizacion uuid, p_excluir_guia uuid default null)
returns table (cotizacion_item_id uuid, despachado numeric)
language sql stable security invoker set search_path = public, extensions
as $$
  with filas as (
    select g.id as guia_id, gi.cotizacion_item_id,
           -- Una pieza de kit vale «cantidad / lo que lleva el kit» kits.
           case when coalesce(p.es_kit, false)
                then gi.cantidad / nullif(kc.cantidad, 0)
                else gi.cantidad end as unidades,
           coalesce(p.es_kit, false) as es_kit
      from guias_remision g
      join guia_items gi on gi.guia_id = g.id
      join cotizacion_items ci on ci.id = gi.cotizacion_item_id
      left join productos p on p.id = ci.producto_id
      left join kit_componentes kc on kc.kit_id = ci.producto_id and kc.producto_id = gi.producto_id
     where g.cotizacion_id = p_cotizacion
       and g.estado <> 'anulada'
       and (p_excluir_guia is null or g.id <> p_excluir_guia)
  ), por_guia as (
    -- En un kit todas sus piezas dicen el mismo número de kits: se toma uno.
    select guia_id, cotizacion_item_id,
           case when bool_or(es_kit) then max(unidades) else sum(unidades) end as unidades
      from filas
     group by guia_id, cotizacion_item_id
  )
  select cotizacion_item_id, round(sum(unidades), 2)
    from por_guia
   group by cotizacion_item_id
$$;

comment on function public.despacho_por_item(uuid, uuid) is
  '115: lo que ya va en guías no anuladas por línea de cotización, con los kits contados en kits. p_excluir_guia deja fuera la guía que se corrige.';

create or replace function public.corregir_lineas_guia(p_guia uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_estado estado_guia;
  v_cot    uuid;
  v_n      int;
  v_orden  smallint;
  r        record;
  v_peso   numeric(12,3);
begin
  -- Lo PRIMERO, como en `generar_guia_desde_cotizacion`: es security definer
  -- y se salta RLS.
  if not public.puede_escribir('guias_remision') then
    raise exception 'Tu rol no puede corregir una guía' using errcode = 'insufficient_privilege';
  end if;

  select estado, cotizacion_id into v_estado, v_cot
    from guias_remision where id = p_guia for update;
  if not found then
    raise exception 'Esa guía ya no existe' using errcode = 'no_data_found';
  end if;
  if v_estado <> 'borrador' then
    raise exception 'Solo se corrige un borrador. Esta guía ya está emitida: si algo está mal, hay que anularla.'
      using errcode = 'check_violation';
  end if;
  if v_cot is null then
    raise exception 'Esta guía no viene de una cotización: sus productos no se pueden corregir aquí.'
      using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La guía tiene que llevar al menos un producto.' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) - count(distinct i.value ->> 'cotizacion_item_id') into v_n
    from jsonb_array_elements(p_items) i;
  if v_n > 0 then
    raise exception 'Hay un producto repetido en dos líneas.' using errcode = 'invalid_parameter_value';
  end if;

  -- Cada línea: de ESTA cotización, mayor que cero y sin pasarse de lo que
  -- falta despachar contando solo las OTRAS guías.
  for r in
    select (i.value ->> 'cotizacion_item_id')::uuid as item,
           (i.value ->> 'cantidad')::numeric as cantidad,
           ci.id as existe, ci.codigo,
           coalesce(ci.cantidad_aprobada, ci.cantidad) as confirmado,
           coalesce(d.despachado, 0) as otras
      from jsonb_array_elements(p_items) i
      left join cotizacion_items ci
             on ci.id = (i.value ->> 'cotizacion_item_id')::uuid and ci.cotizacion_id = v_cot
      left join public.despacho_por_item(v_cot, p_guia) d
             on d.cotizacion_item_id = ci.id
  loop
    if r.existe is null then
      raise exception 'Una de las líneas no es de la cotización de esta guía.' using errcode = 'invalid_parameter_value';
    end if;
    if r.cantidad is null or r.cantidad <= 0 then
      raise exception '%: la cantidad tiene que ser mayor que cero (para quitarlo, sácalo de la guía).', r.codigo
        using errcode = 'invalid_parameter_value';
    end if;
    if r.cantidad > r.confirmado - r.otras then
      raise exception '%: salen % y solo quedan % por despachar (el cliente confirmó %, otras guías llevan %).',
        r.codigo, r.cantidad, greatest(r.confirmado - r.otras, 0), r.confirmado, r.otras
        using errcode = 'check_violation';
    end if;
  end loop;

  delete from guia_items where guia_id = p_guia;

  -- Una a una, con el orden pedido en cada vuelta: un kit se reparte en sus
  -- piezas (086) y ocupa varios números, y `guia_item_unico` es
  -- (guia_id, orden).
  for r in
    select ci.id, ci.producto_id, ci.codigo, ci.descripcion, ci.unidad_codigo,
           (i.value ->> 'cantidad')::numeric as cantidad, p.peso_kg
      from jsonb_array_elements(p_items) with ordinality i(value, ord)
      join cotizacion_items ci on ci.id = (i.value ->> 'cotizacion_item_id')::uuid
      left join productos p on p.id = ci.producto_id
     order by i.ord
  loop
    select coalesce(max(orden), 0) + 1 into v_orden from guia_items where guia_id = p_guia;
    insert into guia_items (guia_id, producto_id, cotizacion_item_id, orden, codigo, descripcion,
                            cantidad, unidad_codigo, peso_kg)
    values (p_guia, r.producto_id, r.id, v_orden, r.codigo, r.descripcion,
            r.cantidad, coalesce(r.unidad_codigo, 'NIU'), coalesce(r.peso_kg, 0) * r.cantidad);
  end loop;

  select coalesce(sum(peso_kg), 0) into v_peso from guia_items where guia_id = p_guia;
  return jsonb_build_object('lineas', (select count(*) from guia_items where guia_id = p_guia),
                            'peso_productos_kg', round(v_peso, 3));
end $$;

comment on function public.corregir_lineas_guia(uuid, jsonb) is
  '115: cambia los productos de una guía en BORRADOR. Valida contra lo confirmado menos lo que llevan las otras guías no anuladas.';

-- ---------------------------------------------------------------------------
-- Centinela que EJECUTA: dos guías de la misma cotización, se corrige una,
-- se intenta pasar del tope, y se deshace todo (incluidos los correlativos).
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid; p2 uuid;
  r jsonb;
  v_cot uuid;
  i1 uuid; i2 uuid;
  g1 uuid; g2 uuid;
  v_fallo boolean;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  select id into p2 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id <> p1 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p2 is null then
    raise notice '115: faltan datos para el centinela; no se ejecuta.';
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
          'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    select id into i1 from cotizacion_items where cotizacion_id = v_cot and orden = 1;
    select id into i2 from cotizacion_items where cotizacion_id = v_cot and orden = 2;

    -- Dos borradores: cada uno lleva 1 de las 3 del primero.
    g1 := (public.generar_guia_desde_cotizacion(jsonb_build_object(
      'cotizacion_id', v_cot, 'direccion_llegada', 'x', 'ubigeo_llegada', '150132', 'peso_bruto_kg', 1,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cotizacion_item_id', i1, 'cantidad', 1))))->>'id')::uuid;
    g2 := (public.generar_guia_desde_cotizacion(jsonb_build_object(
      'cotizacion_id', v_cot, 'direccion_llegada', 'x', 'ubigeo_llegada', '150132', 'peso_bruto_kg', 1,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cotizacion_item_id', i1, 'cantidad', 1))))->>'id')::uuid;

    -- La primera pasa a llevar 2 del primero (queda justo: 3 − 1 de la otra)
    -- y los 2 del segundo.
    perform public.corregir_lineas_guia(g1, jsonb_build_array(
      jsonb_build_object('cotizacion_item_id', i1, 'cantidad', 2),
      jsonb_build_object('cotizacion_item_id', i2, 'cantidad', 2)));
    if (select count(*) from guia_items where guia_id = g1) <> 2
       or (select cantidad from guia_items where guia_id = g1 and cotizacion_item_id = i1) <> 2 then
      raise exception '115: la corrección no dejó las líneas pedidas';
    end if;
    if (select despachado from public.despacho_por_item(v_cot) where cotizacion_item_id = i1) <> 3 then
      raise exception '115: despacho_por_item no cuenta las dos guías';
    end if;

    -- Pasarse: 3 del primero cuando la otra guía ya lleva 1.
    v_fallo := false;
    begin
      perform public.corregir_lineas_guia(g1, jsonb_build_array(
        jsonb_build_object('cotizacion_item_id', i1, 'cantidad', 3)));
    exception when check_violation then
      v_fallo := true;
    end;
    if not v_fallo then
      raise exception '115: dejó despachar más de lo confirmado';
    end if;

    -- Una emitida ya no se corrige.
    update guias_remision set estado = 'emitida', a_pie = true, conductor_documento = '00000000' where id = g2;
    v_fallo := false;
    begin
      perform public.corregir_lineas_guia(g2, jsonb_build_array(
        jsonb_build_object('cotizacion_item_id', i1, 'cantidad', 1)));
    exception when check_violation then
      v_fallo := true;
    end;
    if not v_fallo then
      raise exception '115: dejó corregir una guía emitida';
    end if;

    raise exception '__115_DESHACER__';
  exception when others then
    if sqlerrm <> '__115_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '115: corregir un borrador respeta el tope de las otras guías y no toca una emitida; deshecho limpio.';
end $$;
