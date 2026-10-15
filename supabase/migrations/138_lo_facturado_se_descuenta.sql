-- ###########################################################################
-- 138 · LO FACTURADO SE DESCUENTA, Y EL PEDIDO REPETIDO NO REABRE LO VIEJO
-- ###########################################################################
--
-- Revisión del flujo antes de producción (15/10). Tres fallos encadenados,
-- invisibles a tsc y a los 1513 tests:
--
-- 1. FACTURAR NO DESCONTABA. La 047 metió en `emitir_comprobante` la
--    llamada a `registrar_atencion_de_cotizacion`, que sube
--    `cantidad_atendida` línea a línea. La 116 reescribió la función entera
--    y volvió al viejo `update … set estado = 'atendida'`. Desde entonces lo
--    facturado no bajaba de lo pendiente: la pantalla volvía a ofrecerlo, y
--    la cotización se cerraba con cualquier factura, aunque fuera parcial.
--    Prueba en vivo: F001-00000001 (14/10) facturó COT1-000014 y sus líneas
--    seguían con `cantidad_atendida = 0`. Se vuelve a llamar; y de paso la
--    guía declarada tiene que existir, estar EMITIDA y ser del cliente
--    (bastaba con mandar cualquier id).
--
-- 2. REPETIR UNA COTIZACIÓN DEL HISTÓRICO la reabría entera. Las 631 CT02
--    «atendidas» vienen del Excel sin `cantidad_aprobada` y con
--    `cantidad_atendida = 0`; `repetir_pedido` sumaba lo nuevo a lo cotizado
--    hace meses, y la guía y la factura ofrecían las dos cosas. Ahora, la
--    primera vez que se repite una cotización ATENDIDA sin pedidos, lo viejo
--    se da por servido (aprobado = atendido = cotizado) antes de sumar.
--    Y no se repite un pedido con lo anterior a medias: lo nuevo cuelga del
--    pedido vigente (130), y la guía o la factura del anterior caerían en él.
--
-- 3. ELIMINAR EL ÚNICO PEDIDO de una cotización del histórico deshacía una
--    «aprobación» que nunca existió y la dejaba «enviada». Se decide por
--    `desde_aprobacion`, no por cuántos pedidos hay: el repetido resta lo
--    suyo y la cotización vuelve a «atendida».
--
-- 3b. Por lo mismo, el costo de una venta del histórico (132) se mide con lo
--    COTIZADO, como su venta (`subtotal`): con lo aprobado, un pedido
--    repetido inflaba el costo de la venta vieja.
--
-- 4. `vincular_guias_comprobante` exige también la guía EMITIDA.
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.emitir_comprobante(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tipo    tipo_documento := coalesce(nullif(p_datos ->> 'tipo','')::tipo_documento, 'factura');
  v_serie   text;
  v_corr    integer;
  v_id      uuid;
  v_items   jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_cuotas  jsonb := coalesce(p_datos -> 'cuotas', '[]'::jsonb);
  v_igv_pct numeric(5,2);
  v_gravada numeric(14,2);
  v_igv     numeric(14,2);
  v_total   numeric(14,2);
  v_desc_glob numeric(14,2) := coalesce(nullif(p_datos ->> 'descuento_global','')::numeric, 0);
  v_condicion condicion_pago := coalesce(nullif(p_datos ->> 'condicion_pago','')::condicion_pago, 'credito');
  v_dias    smallint := coalesce(nullif(p_datos ->> 'dias_credito','')::smallint, 0);
  v_detr    jsonb := coalesce(p_datos -> 'detraccion', '{}'::jsonb);
  v_ret     jsonb := coalesce(p_datos -> 'retencion', '{}'::jsonb);
  v_detr_ap boolean := (v_detr ->> 'aplica')::boolean;    -- null = decidir por umbral
  v_ret_ap  boolean := coalesce((v_ret  ->> 'aplica')::boolean, false);
  v_detr_pct numeric(5,2);
  v_ret_pct  numeric(5,2);
  v_detr_min numeric(14,2);
  v_movs    jsonb;
  -- La moneda del DOCUMENTO (116). Los importes de siempre siguen en dólares
  -- —los suman los reportes—; en soles van además los pen_*.
  v_moneda  char(3) := 'USD';
  v_tc      numeric(8,3);
  v_pg      numeric(14,2);
  v_pdesc   numeric(14,2);
  v_pigv    numeric(14,2);
  v_pt      numeric(14,2);
  v_pret    numeric(14,2);
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y emitir un comprobante
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('comprobantes') then
    raise exception 'Tu rol no puede emitir un comprobante'
      using errcode = 'insufficient_privilege';
  end if;

  -- La guía va antes que la factura (Willy). Se exige DECLARADA aquí:
  -- el vínculo lo escribe `vincular_guias_comprobante` justo después (084).
  -- Solo la factura y la boleta: una NOTA no lleva guía, y exigírsela a
  -- todas (089) dejó las notas sin poder emitirse (116).
  if v_tipo in ('factura','boleta')
     and coalesce(jsonb_array_length(p_datos -> 'guias'), 0) = 0 then
    raise exception 'No se puede facturar sin una guia de remision: la mercaderia sale primero'
      using errcode = 'check_violation';
  end if;

  -- 138: y que la declarada EXISTA, esté EMITIDA y sea del mismo cliente.
  -- Bastaba con mandar cualquier id para pasar la regla de la guía.
  if v_tipo in ('factura','boleta') and exists (
    select 1 from jsonb_array_elements_text(p_datos -> 'guias') g(id)
     where not exists (
       select 1 from guias_remision gr
        where gr.id = g.id::uuid
          and gr.estado = 'emitida'
          and gr.cliente_id = (p_datos ->> 'cliente_id')::uuid)
  ) then
    raise exception 'La guia declarada no existe, no esta emitida o es de otro cliente'
      using errcode = 'check_violation';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'El comprobante no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(igv_porcentaje, 18.00),
         coalesce(nullif((v_detr ->> 'porcentaje')::numeric, 0), detraccion_porcentaje),
         coalesce(nullif((v_ret  ->> 'porcentaje')::numeric, 0), retencion_porcentaje),
         detraccion_monto_minimo
    into v_igv_pct, v_detr_pct, v_ret_pct, v_detr_min
    from empresa where id = 1;

  v_serie := coalesce(nullif(p_datos ->> 'serie',''),
                      (select serie from series_documento where tipo = v_tipo and predeterminada and activo limit 1));
  v_corr := public.siguiente_correlativo(v_tipo, v_serie);

  -- Totales: se calculan aquí, del lado del servidor. El importe por línea es
  -- una columna generada, así que la suma no puede discrepar del detalle.
  select coalesce(sum(round(
           (i.value ->> 'cantidad')::numeric *
           (i.value ->> 'valor_unitario')::numeric *
           (1 - coalesce(nullif(i.value ->> 'descuento_pct','')::numeric, 0)/100.0), 2)), 0)
    into v_gravada
    from jsonb_array_elements(v_items) i;

  v_gravada := greatest(v_gravada - v_desc_glob, 0);
  v_igv     := round(v_gravada * v_igv_pct / 100.0, 2);
  v_total   := v_gravada + v_igv;

  -- La moneda NO la dice quien llama: la nota hereda la de su comprobante y
  -- la factura, la de su cotización, con el tipo de cambio que se congeló al
  -- aprobarla (116). Así no puede salir en soles algo que se cotizó en
  -- dólares, ni con otro cambio.
  if nullif(p_datos ->> 'referencia_id','') is not null then
    select moneda, tipo_cambio into v_moneda, v_tc
      from comprobantes where id = (p_datos ->> 'referencia_id')::uuid;
  elsif nullif(p_datos ->> 'cotizacion_id','') is not null then
    select moneda, tipo_cambio into v_moneda, v_tc
      from cotizaciones where id = (p_datos ->> 'cotizacion_id')::uuid;
  end if;
  v_moneda := coalesce(v_moneda, 'USD');
  if v_moneda = 'PEN' then
    if coalesce(v_tc, 0) <= 0 then
      raise exception 'La venta es en soles y no tiene tipo de cambio: vuelve a aprobar la cotizacion'
        using errcode = 'check_violation';
    end if;
    -- El mismo redondeo que el papel de la cotización en soles (`enSoles`):
    -- el valor unitario a céntimos y se vuelve a sumar.
    select coalesce(sum(round(
             (i.value ->> 'cantidad')::numeric *
             round((i.value ->> 'valor_unitario')::numeric * v_tc, 2) *
             (1 - coalesce(nullif(i.value ->> 'descuento_pct','')::numeric, 0)/100.0), 2)), 0)
      into v_pg
      from jsonb_array_elements(v_items) i;
    v_pdesc := round(v_desc_glob * v_tc, 2);
    v_pg    := greatest(v_pg - v_pdesc, 0);
    v_pigv  := round(v_pg * v_igv_pct / 100.0, 2);
    v_pt    := v_pg + v_pigv;
  end if;

  -- Detracción: si el llamador NO se pronuncia, decide el umbral SPOT
  -- configurado en `empresa` (hoy S/ 700 equivalentes). Si se pronuncia,
  -- manda él —hay clientes que exigen detraer por debajo del umbral—.
  -- La boleta nunca detrae ni retiene (lo bloquea comp_boleta_sin_spot).
  if v_detr_ap is null then
    v_detr_ap := (v_tipo = 'factura' and v_total >= coalesce(v_detr_min, 700))
                 and (v_detr ->> 'codigo') is not null;
  end if;
  if v_tipo = 'boleta' then
    v_detr_ap := false;
    v_ret_ap  := false;
  end if;

  insert into comprobantes (
    tipo, serie, correlativo, cliente_id, cotizacion_id, guia_id, orden_compra_cliente,
    referencia_id, motivo_nota_codigo,
    fecha_emision, condicion_pago, dias_credito, fecha_vencimiento,
    op_gravada, descuento_global, igv, total, total_letras,
    detraccion_aplica, detraccion_codigo, detraccion_porcentaje, detraccion_monto, detraccion_cuenta,
    retencion_aplica, retencion_porcentaje, retencion_monto,
    vendedor_id, observaciones, estado, estado_sunat, mostrar_cuenta,
    moneda, tipo_cambio, pen_gravada, pen_descuento, pen_igv, pen_total, pen_retencion
  ) values (
    v_tipo, v_serie, v_corr,
    (p_datos ->> 'cliente_id')::uuid,
    nullif(p_datos ->> 'cotizacion_id','')::uuid,
    nullif(p_datos ->> 'guia_id','')::uuid,
    nullif(p_datos ->> 'orden_compra_cliente',''),
    nullif(p_datos ->> 'referencia_id','')::uuid,
    nullif(p_datos ->> 'motivo_nota_codigo',''),
    coalesce(nullif(p_datos ->> 'fecha_emision','')::date, current_date),
    v_condicion, case when v_condicion = 'contado' then 0 else v_dias end,
    case when v_condicion = 'credito'
         then coalesce(nullif(p_datos ->> 'fecha_vencimiento','')::date,
                       coalesce(nullif(p_datos ->> 'fecha_emision','')::date, current_date) + v_dias)
         else nullif(p_datos ->> 'fecha_vencimiento','')::date end,
    v_gravada, v_desc_glob, v_igv, v_total,
    public.numero_a_letras(case when v_moneda = 'PEN' then v_pt else v_total end, v_moneda::text),
    v_detr_ap, nullif(v_detr ->> 'codigo',''), case when v_detr_ap then v_detr_pct else 0 end,
      case when v_detr_ap then round(v_total * v_detr_pct / 100.0, 2) else 0 end,
      case when v_detr_ap then (select cuenta_detraccion from empresa where id=1) else null end,
    v_ret_ap, case when v_ret_ap then v_ret_pct else 0 end,
      case when v_ret_ap then round(v_total * v_ret_pct / 100.0, 2) else 0 end,
    coalesce(nullif(p_datos ->> 'vendedor_id','')::uuid, auth.uid()),
    nullif(p_datos ->> 'observaciones',''),
'emitido', 'pendiente',
    -- Ausente = true. Las cuentas salen desde la 029; quitarlas por omisión
    -- cambiaría en silencio lo que imprime una pantalla que no mande el
    -- campo. Esto añade poder decir «esta no», no un comportamiento nuevo.
    coalesce((p_datos ->> 'mostrar_cuenta')::boolean, true),
    v_moneda,
    case when v_moneda = 'PEN' then v_tc end,
    case when v_moneda = 'PEN' then v_pg end,
    case when v_moneda = 'PEN' then v_pdesc end,
    case when v_moneda = 'PEN' then v_pigv end,
    case when v_moneda = 'PEN' then v_pt end,
    case when v_moneda = 'PEN' then
      case when v_ret_ap and v_tipo <> 'boleta' then round(v_pt * v_ret_pct / 100.0, 2) else 0 end end
  ) returning id into v_id;

  insert into comprobante_items (
    comprobante_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, igv_item, tipo_afectacion, costo_unitario
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         i.ord::smallint,
         coalesce(nullif(i.value ->> 'codigo',''), p.codigo),
         coalesce(nullif(i.value ->> 'marca',''), m.nombre),
         coalesce(nullif(i.value ->> 'descripcion',''), p.descripcion),
         (i.value ->> 'cantidad')::numeric,
         coalesce(nullif(i.value ->> 'unidad_codigo',''), p.unidad_codigo, 'NIU'),
         (i.value ->> 'valor_unitario')::numeric,
         coalesce(nullif(i.value ->> 'descuento_pct','')::numeric, 0),
         round((i.value ->> 'cantidad')::numeric * (i.value ->> 'valor_unitario')::numeric
               * (1 - coalesce(nullif(i.value ->> 'descuento_pct','')::numeric,0)/100.0)
               * v_igv_pct / 100.0, 2),
         coalesce(nullif(i.value ->> 'tipo_afectacion',''), '10'),
         coalesce(nullif(i.value ->> 'costo_unitario','')::numeric, p.costo_promedio, 0)
  from jsonb_array_elements(v_items) with ordinality as i(value, ord)
  left join productos p on p.id = nullif(i.value ->> 'producto_id','')::uuid
  left join marcas m    on m.id = p.marca_id;

  update comprobantes c
     set costo_total = (select coalesce(sum(round(ci.cantidad * ci.costo_unitario, 2)), 0)
                          from comprobante_items ci where ci.comprobante_id = c.id)
   where c.id = v_id;

  -- Cuotas: las declaradas, o una sola al vencimiento si es crédito.
  if jsonb_array_length(v_cuotas) > 0 then
    insert into comprobante_cuotas (comprobante_id, numero, fecha_vencimiento, monto)
    select v_id, coalesce(nullif(q.value ->> 'numero','')::smallint, q.ord::smallint),
           (q.value ->> 'fecha_vencimiento')::date,
           (q.value ->> 'monto')::numeric
    from jsonb_array_elements(v_cuotas) with ordinality as q(value, ord);

    -- La suma de cuotas tiene que ser el total: SUNAT lo valida y un
    -- cronograma que no cuadra es un rechazo garantizado.
    if (select round(sum(monto),2) from comprobante_cuotas where comprobante_id = v_id) <> v_total then
      raise exception 'La suma de las cuotas (%) no coincide con el total (%)',
        (select round(sum(monto),2) from comprobante_cuotas where comprobante_id = v_id), v_total
        using errcode = 'check_violation';
    end if;
  elsif v_condicion = 'credito' then
    insert into comprobante_cuotas (comprobante_id, numero, fecha_vencimiento, monto)
    select v_id, 1, c.fecha_vencimiento, c.total from comprobantes c where c.id = v_id;
  end if;

  -- Descarga de stock. Por defecto NO: el stock ya salió con la guía de
  -- remisión (que es cuando la mercadería deja el almacén). Se activa solo
  -- para la venta de mostrador que factura sin guía previa.
  if coalesce((p_datos ->> 'descargar_stock')::boolean, false)
     and v_tipo in ('factura','boleta') then
    select jsonb_agg(jsonb_build_object(
             'producto_id', ci.producto_id,
             'tipo', 'salida',
             'cantidad', ci.cantidad,
             'referencia_tipo', 'comprobante',
             'referencia_id', v_id,
             'referencia_numero', (select numero from comprobantes where id = v_id),
             'motivo', 'Venta') order by ci.producto_id)
      into v_movs
      from comprobante_items ci
     where ci.comprobante_id = v_id and ci.producto_id is not null;
    if v_movs is not null then perform public.registrar_movimientos(v_movs); end if;
  end if;

  -- 138: lo facturado se descuenta de lo confirmado, línea a línea (047), y
  -- la cotización se cierra solo cuando está todo. La 116 lo había cambiado
  -- por un «atendida» a secas y lo facturado no bajaba nunca: se podía
  -- volver a facturar lo mismo.
  if nullif(p_datos ->> 'cotizacion_id', '') is not null and v_tipo in ('factura','boleta') then
    perform public.registrar_atencion_de_cotizacion((p_datos ->> 'cotizacion_id')::uuid, v_id);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'numero', (select numero from comprobantes where id = v_id),
    'total', v_total, 'igv', v_igv,
    'detraccion', (select detraccion_monto from comprobantes where id = v_id),
    'retencion',  (select retencion_monto  from comprobantes where id = v_id),
    'moneda', v_moneda,
    'total_documento', case when v_moneda = 'PEN' then v_pt else v_total end);
end $function$;

revoke all on function public.emitir_comprobante(jsonb) from public, anon;
grant execute on function public.emitir_comprobante(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 · Repetir: lo viejo del histórico, servido; y no con lo anterior a medias.
-- ---------------------------------------------------------------------------
create or replace function public.repetir_pedido(p_id uuid, p_lineas jsonb, p_oc text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_estado estado_cotizacion;
  v_fila   jsonb;
  v_item   uuid;
  v_cant   numeric(14,2);
  v_n      int := 0;
  v_items  jsonb := '[]'::jsonb;
  v_pedido uuid;
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

  -- 138: con lo anterior a medias, no. Lo nuevo cuelga del pedido vigente, y
  -- la guía o la factura de lo que falta caerían en el pedido equivocado.
  if v_estado = 'aprobada' and exists (
    select 1 from cotizacion_items
     where cotizacion_id = p_id
       and cantidad_atendida < coalesce(cantidad_aprobada, cantidad)
  ) then
    raise exception 'El pedido anterior todavía no está facturado entero: termínalo antes de repetirlo'
      using errcode = 'check_violation';
  end if;

  -- 138: una cotización ATENDIDA sin pedidos es del histórico (Excel): lo
  -- viejo se da por servido antes de sumar, o se volvería a ofrecer.
  if v_estado = 'atendida' and not exists (select 1 from pedidos where cotizacion_id = p_id) then
    update cotizacion_items
       set cantidad_aprobada = coalesce(cantidad_aprobada, cantidad),
           cantidad_atendida = greatest(cantidad_atendida, coalesce(cantidad_aprobada, cantidad))
     where cotizacion_id = p_id;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_item := nullif(v_fila ->> 'item_id', '')::uuid;
    v_cant := coalesce((v_fila ->> 'cantidad')::numeric, 0);
    if v_item is null or v_cant < 0 then
      raise exception 'Una línea llegó sin item_id o con cantidad negativa' using errcode = 'invalid_parameter_value';
    end if;
    if v_cant > 1000000 then
      raise exception 'La cantidad % no es razonable', v_cant using errcode = 'invalid_parameter_value';
    end if;
    continue when v_cant = 0;
    update cotizacion_items
       set cantidad_aprobada = coalesce(cantidad_aprobada, cantidad) + v_cant
     where id = v_item and cotizacion_id = p_id;
    if not found then
      raise exception 'La línea % no es de esta cotización', v_item using errcode = 'foreign_key_violation';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('cotizacion_item_id', v_item, 'cantidad', v_cant));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'El pedido nuevo no lleva nada: pon al menos una cantidad' using errcode = 'check_violation';
  end if;

  v_pedido := public.crear_pedido(p_id, v_items);

  update cotizaciones
     set estado = 'aprobada',
         orden_compra_cliente = nullif(trim(coalesce(p_oc, '')), '')
   where id = p_id;

  return jsonb_build_object('id', p_id, 'lineas', v_n, 'pedido_id', v_pedido,
    'pedido', (select numero from pedidos where id = v_pedido));
end $$;

revoke all on function public.repetir_pedido(uuid, jsonb, text) from public, anon;
grant execute on function public.repetir_pedido(uuid, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3 · Eliminar: por cómo nació el pedido, no por cuántos hay.
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_pedido(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ped    record;
  v_ult    int;
  v_estado estado_cotizacion;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede eliminar pedidos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_ped from pedidos where id = p_id;
  if v_ped.id is null then
    raise exception 'El pedido no existe' using errcode = 'no_data_found';
  end if;
  perform 1 from cotizaciones where id = v_ped.cotizacion_id for update;

  select max(secuencia) into v_ult from pedidos where cotizacion_id = v_ped.cotizacion_id;
  if v_ped.secuencia <> v_ult then
    raise exception 'Solo se puede eliminar el último pedido de la cotización'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from compras where pedido_id = p_id and estado <> 'anulada') then
    raise exception 'El pedido % ya tiene órdenes de compra: anúlalas antes de eliminarlo', v_ped.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from guias_remision where pedido_id = p_id and estado <> 'anulada') then
    raise exception 'El pedido % ya tiene guía: anúlala antes de eliminarlo', v_ped.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comprobantes where pedido_id = p_id and estado <> 'anulado') then
    raise exception 'El pedido % ya está facturado: no se puede eliminar', v_ped.numero
      using errcode = 'check_violation';
  end if;

  if v_ped.desde_aprobacion then
    -- El que nació al aprobar (y por ser el último, el único): se deshace la aprobación.
    update cotizacion_items set cantidad_aprobada = null where cotizacion_id = v_ped.cotizacion_id;
    delete from pedidos where id = p_id;
    update cotizaciones
       set estado = 'enviada', aprobada_en = null, aprobada_por = null
     where id = v_ped.cotizacion_id;
    v_estado := 'enviada';
  else
    -- Uno repetido: lo suyo sale de lo confirmado.
    update cotizacion_items ci
       set cantidad_aprobada = greatest(coalesce(ci.cantidad_aprobada, ci.cantidad) - pi.cantidad, 0)
      from pedido_items pi
     where pi.pedido_id = p_id and pi.cotizacion_item_id = ci.id;
    delete from pedidos where id = p_id;
    update cotizaciones q
       set estado = case
             when not exists (
               select 1 from cotizacion_items ci
                where ci.cotizacion_id = q.id
                  and ci.cantidad_atendida < coalesce(ci.cantidad_aprobada, ci.cantidad))
             then 'atendida'::estado_cotizacion
             else 'aprobada'::estado_cotizacion
           end
     where q.id = v_ped.cotizacion_id
    returning estado into v_estado;
  end if;

  return jsonb_build_object('cotizacion_id', v_ped.cotizacion_id, 'numero', v_ped.numero, 'estado', v_estado);
end $$;

revoke all on function public.eliminar_pedido(uuid) from public, anon;
grant execute on function public.eliminar_pedido(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3b · Lo vendido del histórico, con lo cotizado si la cotización se repitió.
-- ---------------------------------------------------------------------------
create or replace view v_ventas_concretadas
with (security_invoker = true) as
select p.id as pedido_id, p.numero, p.cotizacion_id, p.cliente_id, p.fecha,
       coalesce(l.venta, 0)::numeric(14,2) as venta,
       coalesce(l.costo, 0)::numeric(14,2) as costo,
       (p.secuencia > 1 or not p.desde_aprobacion) as es_repeticion,
       'pedido'::text as origen
  from pedidos p
  left join lateral (
    select sum(importe) as venta, sum(costo) as costo
      from v_pedido_lineas vl where vl.pedido_id = p.id
  ) l on true
union all
select null::uuid, c.numero, c.id, c.cliente_id,
       coalesce((c.aprobada_en at time zone 'America/Lima')::date, c.fecha),
       coalesce(c.subtotal, 0)::numeric(14,2),
       coalesce((select sum(round(
                   case when exists (select 1 from pedidos p2 where p2.cotizacion_id = c.id)
                        then ci.cantidad else coalesce(ci.cantidad_aprobada, ci.cantidad) end
                   * coalesce(ci.costo_unitario, 0), 2))
                   from cotizacion_items ci where ci.cotizacion_id = c.id), 0)::numeric(14,2),
       false,
       'historico'
  from cotizaciones c
 where c.estado in ('aprobada', 'atendida')
   and not exists (select 1 from pedidos p where p.cotizacion_id = c.id and p.desde_aprobacion);

create or replace view v_ventas_lineas
with (security_invoker = true) as
select l.pedido_id, p.cotizacion_id, p.cliente_id, p.fecha, l.producto_id, l.codigo,
       l.cantidad, l.importe, l.costo, 'pedido'::text as origen
  from v_pedido_lineas l join pedidos p on p.id = l.pedido_id
 where l.cantidad > 0
union all
select null::uuid, c.id, c.cliente_id, coalesce((c.aprobada_en at time zone 'America/Lima')::date, c.fecha),
       ci.producto_id, ci.codigo,
       q.cantidad,
       round(q.cantidad * ci.valor_unitario * (1 - coalesce(ci.descuento_pct, 0) / 100.0), 2),
       round(q.cantidad * coalesce(ci.costo_unitario, 0), 2),
       'historico'
  from cotizaciones c join cotizacion_items ci on ci.cotizacion_id = c.id
  cross join lateral (
    select case when exists (select 1 from pedidos p2 where p2.cotizacion_id = c.id)
                then ci.cantidad else coalesce(ci.cantidad_aprobada, ci.cantidad) end as cantidad
  ) q
 where c.estado in ('aprobada', 'atendida')
   and q.cantidad > 0
   and not exists (select 1 from pedidos p where p.cotizacion_id = c.id and p.desde_aprobacion);

revoke all on v_ventas_concretadas, v_ventas_lineas from anon;
grant select on v_ventas_concretadas, v_ventas_lineas to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Vincular: la guía, emitida.
-- ---------------------------------------------------------------------------
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
  if coalesce(v_sunat, 'no_enviado') <> 'no_enviado' then
    raise exception 'El comprobante ya se mandó a SUNAT: sus guías ya no se cambian.'
      using errcode = 'check_violation';
  end if;

  delete from comprobante_guias where comprobante_id = p_comprobante;

  foreach v_g in array coalesce(p_guias, array[]::uuid[]) loop
    -- Del MISMO cliente (084) y EMITIDA (138): un borrador no ampara nada.
    if not exists (
      select 1 from guias_remision g
      where g.id = v_g and g.cliente_id = v_cliente and g.estado = 'emitida'
    ) then
      raise exception
        'Esa guía no existe, no está emitida o es de otro cliente.'
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

-- ---------------------------------------------------------------------------
-- Centinela: EMITE de verdad y lo deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1        uuid;
  v_cot     uuid;
  v_guia    uuid;
  i1        uuid;
  r         jsonb;
  v_fallo   boolean;
  x         record;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '138: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 10, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);

    insert into guias_remision (serie, correlativo, cliente_id, cotizacion_id, ubigeo_partida, direccion_partida,
      ubigeo_llegada, direccion_llegada, peso_bruto_kg, estado, modalidad_traslado, transportista_documento)
    values ('T999', 999999, v_cliente, v_cot, '150132', 'Centinela', '150132', 'Centinela', 1, 'emitida', '01', '20000000001')
    returning id into v_guia;

    -- Una guía inventada ya no pasa.
    v_fallo := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object(
        'tipo', 'factura', 'cliente_id', v_cliente, 'cotizacion_id', v_cot,
        'condicion_pago', 'contado', 'dias_credito', 0, 'guias', jsonb_build_array(gen_random_uuid()),
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 4, 'unidad_codigo', 'NIU', 'valor_unitario', 10))));
    exception when check_violation then v_fallo := true;
    end;
    if not v_fallo then raise exception '138: facturó con una guía que no existe'; end if;

    -- Facturar 4 de 10: baja lo pendiente y la cotización NO se cierra.
    perform public.emitir_comprobante(jsonb_build_object(
      'tipo', 'factura', 'cliente_id', v_cliente, 'cotizacion_id', v_cot,
      'condicion_pago', 'contado', 'dias_credito', 0, 'guias', jsonb_build_array(v_guia),
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 4, 'unidad_codigo', 'NIU', 'valor_unitario', 10))));
    select (select cantidad_atendida from cotizacion_items where id = i1) atendida,
           (select estado from cotizaciones where id = v_cot) estado into x;
    if x.atendida <> 4 or x.estado <> 'aprobada' then
      raise exception '138: facturar 4 de 10 no descontó bien: %', row_to_json(x);
    end if;

    -- Repetir con lo anterior a medias: no.
    v_fallo := false;
    begin
      perform public.repetir_pedido(v_cot, jsonb_build_array(jsonb_build_object('item_id', i1, 'cantidad', 2)), null);
    exception when check_violation then v_fallo := true;
    end;
    if not v_fallo then raise exception '138: repitió con el pedido anterior a medias'; end if;

    -- Facturar los 6 que faltan: se cierra.
    perform public.emitir_comprobante(jsonb_build_object(
      'tipo', 'factura', 'cliente_id', v_cliente, 'cotizacion_id', v_cot,
      'condicion_pago', 'contado', 'dias_credito', 0, 'guias', jsonb_build_array(v_guia),
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 6, 'unidad_codigo', 'NIU', 'valor_unitario', 10))));
    if (select estado from cotizaciones where id = v_cot) <> 'atendida' then
      raise exception '138: facturado entero y no quedó atendida';
    end if;

    -- El histórico: una atendida SIN pedidos, como las CT02.
    delete from pedidos where cotizacion_id = v_cot;
    update cotizacion_items set cantidad_aprobada = null, cantidad_atendida = 0 where id = i1;
    r := public.repetir_pedido(v_cot, jsonb_build_array(jsonb_build_object('item_id', i1, 'cantidad', 3)), null);
    select (select cantidad_aprobada - cantidad_atendida from cotizacion_items where id = i1) pendiente,
           (select desde_aprobacion from pedidos where id = (r ->> 'pedido_id')::uuid) desde into x;
    if x.pendiente <> 3 then
      raise exception '138: repetir una del histórico reabrió lo viejo (pendiente %)', x.pendiente;
    end if;

    -- Y eliminarlo la devuelve a atendida, no a enviada.
    r := public.eliminar_pedido((r ->> 'pedido_id')::uuid);
    if (r ->> 'estado') <> 'atendida' then
      raise exception '138: eliminar el repetido del histórico la dejó en %', r ->> 'estado';
    end if;

    raise exception '__138_DESHACER__';
  exception when others then
    if sqlerrm <> '__138_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '138: facturar descuenta y cierra al completar; guía inventada rechazada; repetir/eliminar con el histórico; deshecho limpio.';
end $$;
