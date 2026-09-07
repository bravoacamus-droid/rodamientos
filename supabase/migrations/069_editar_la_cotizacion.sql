-- ###########################################################################
-- 069 · EDITAR LA COTIZACIÓN
-- ###########################################################################
--
-- Willy, 07/09 (15:49), cuando el cliente pide cambiar algo antes de aceptar:
--
--   *«Ya sería editar la cotización. Esa es otra opción.»*
--
-- Y Giussepe, en la misma reunión: *«en este caso no le puedo hacer porque
-- falta editar la cotización… solamente falta el botoncito de editar»*.
--
-- Lo que se hizo el 07/09 fue OTRA cosa: corregir las cantidades de un pedido
-- ya confirmado (066). Esto es lo de antes — el documento todavía no lo
-- aceptaron y hay que cambiarle un precio, quitar una línea o añadir otra.
--
-- ---------------------------------------------------------------------------
-- Solo BORRADOR y ENVIADA
-- ---------------------------------------------------------------------------
-- Una cotización `aprobada` es lo que el cliente ACEPTÓ. Cambiarle un precio
-- después es reescribir un acuerdo: de esa cifra salen la factura y el margen,
-- y nadie se enteraría de que el número cambió. Para eso está `corregir_
-- confirmado`, que solo toca cantidades y con topes.
--
-- `enviada` sí se edita: el cliente la vio pero no ha dicho que sí, y corregir
-- y reenviar es exactamente lo que se hace cuando pide otro precio.
--
-- ---------------------------------------------------------------------------
-- Se reemplazan TODAS las líneas
-- ---------------------------------------------------------------------------
-- No se intenta casar línea a línea. Al editar se puede quitar la segunda,
-- añadir dos y reordenar el resto, y adivinar cuál era cuál es la clase de
-- lógica que falla en silencio y deja una línea vieja pegada al documento.
--
-- Borrar y reinsertar dentro de la misma transacción es más simple y no puede
-- quedar a medias. El coste es que los `id` de las líneas cambian — y eso NO
-- importa aquí, porque una cotización en borrador o enviada no tiene todavía
-- nada colgando: ni guías, ni facturas, ni cantidades aprobadas.
--
-- Esa última frase es justo lo que la función comprueba antes de borrar nada.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.actualizar_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id      uuid;
  v_estado  estado_cotizacion;
  v_colgado int;
  v_n       int;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede editar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := nullif(p_datos ->> 'id','')::uuid;
  if v_id is null then
    raise exception 'Falta el id de la cotización' using errcode = 'check_violation';
  end if;

  select estado into v_estado from cotizaciones where id = v_id for update;
  if v_estado is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;
  if v_estado not in ('borrador', 'enviada') then
    raise exception 'Una cotización en % ya no se edita: eso es lo que el cliente acepto', v_estado
      using errcode = 'check_violation';
  end if;

  -- El cinturón además del tirante. El estado ya debería bastar, pero si algún
  -- día se despacha o se factura sin pasar por `aprobada`, borrar las líneas
  -- dejaría una guía apuntando a un ítem que ya no existe.
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

  update cotizaciones set
    cliente_id             = coalesce(nullif(p_datos ->> 'cliente_id','')::uuid, cliente_id),
    validez_dias           = coalesce(nullif(p_datos ->> 'validez_dias','')::int, validez_dias),
    tiempo_entrega         = nullif(p_datos ->> 'tiempo_entrega',''),
    orden_compra_cliente   = nullif(p_datos ->> 'orden_compra_cliente',''),
    contacto               = nullif(p_datos ->> 'contacto',''),
    condiciones            = nullif(p_datos ->> 'condiciones',''),
    observaciones          = nullif(p_datos ->> 'observaciones',''),
    mostrar_descuento      = coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    mostrar_disponibilidad = coalesce((p_datos ->> 'mostrar_disponibilidad')::boolean, false)
  where id = v_id;

  delete from cotizacion_items where cotizacion_id = v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    disponibilidad, dias_entrega
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
         nullif(i.value ->> 'dias_entrega','')::int
    from jsonb_array_elements(p_datos -> 'items') i;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'La cotización no puede quedarse sin líneas'
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'lineas', v_n);
end;
$$;

comment on function public.actualizar_cotizacion(jsonb) is
  'Reescribe una cotización en BORRADOR o ENVIADA: cabecera y todas sus líneas. Willy 07/09: «ya sería editar la cotización». Una `aprobada` no se toca —es lo que el cliente aceptó, y de esa cifra salen la factura y el margen—; para eso está `corregir_confirmado`, que solo mueve cantidades y con topes. Las líneas se reemplazan enteras en vez de casarlas una a una: adivinar cuál era cuál falla en silencio y deja líneas viejas pegadas al documento.';

revoke all on function public.actualizar_cotizacion(jsonb) from public;
grant execute on function public.actualizar_cotizacion(jsonb) to authenticated;
