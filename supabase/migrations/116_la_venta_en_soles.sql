-- =============================================================================
-- 116 · LA VENTA EN SOLES, DE LA COTIZACIÓN AL COBRO
-- =============================================================================
--
-- El problema. Todo el ERP vende en dólares: ni `cotizaciones` ni
-- `comprobantes` tienen moneda. Pero una parte de sus ventas es en soles —82
-- de las 1261 cotizaciones CT02 y 31 de las 561 facturas F002 del histórico—,
-- y Luis, 14/10: *«algunos cobros, rara vez, como dijo Willy, se pagan en
-- soles; entonces si lo convertimos a soles y se hace la guía, el cobro tiene
-- que ser en soles»*.
--
-- La decisión (Luis, 14/10): el tipo de cambio se CONGELA AL APROBAR la
-- cotización. El cliente paga en soles lo que aceptó aunque el dólar se mueva.
--
-- El diseño: los importes de siempre SIGUEN EN DÓLARES —los suman quince
-- funciones y ocho vistas de reportes, el tablero y la cartera, y el
-- histórico en soles ya entró convertido—. Lo nuevo es:
--
--   · cotizaciones.moneda / tipo_cambio — en qué se vende y a cuánto, fijado
--     por `aprobar_cotizacion` (que ahora lo pide si es en soles).
--   · comprobantes.moneda / tipo_cambio / pen_* — la factura en soles guarda
--     además sus importes en soles, que son los que se imprimen y van a
--     SUNAT. Se calculan con el mismo redondeo que el papel de la cotización
--     en soles: el valor unitario a céntimos y se vuelve a sumar.
--   · La nota hereda la moneda y el cambio de su comprobante.
--
-- Y de paso: `emitir_comprobante` exigía guía a TODO comprobante desde la 089,
-- también a las notas, que no la llevan. Las notas no se podían emitir.
-- =============================================================================

-- ---------------------------------------------------------------- Cotización
alter table cotizaciones
  add column if not exists moneda char(3) not null default 'USD',
  add column if not exists tipo_cambio numeric(8,3);

alter table cotizaciones drop constraint if exists cot_moneda_ok;
alter table cotizaciones add constraint cot_moneda_ok check (moneda in ('USD','PEN'));

-- Aprobada (o atendida) en soles sin tipo de cambio no puede existir: es lo
-- que la factura necesita para salir.
alter table cotizaciones drop constraint if exists cot_soles_con_cambio;
alter table cotizaciones add constraint cot_soles_con_cambio check (
  moneda = 'USD' or estado not in ('aprobada','atendida') or coalesce(tipo_cambio, 0) > 0);

comment on column cotizaciones.moneda is
  'En qué se vende (116). Los importes de la cotización siguen guardados en dólares; en soles se convierten con tipo_cambio.';
comment on column cotizaciones.tipo_cambio is
  'Tipo de cambio venta SUNAT congelado al aprobar una cotización en soles (116).';

-- --------------------------------------------------------------- Comprobante
alter table comprobantes
  add column if not exists moneda char(3) not null default 'USD',
  add column if not exists tipo_cambio numeric(8,3),
  add column if not exists pen_gravada numeric(14,2),
  add column if not exists pen_descuento numeric(14,2),
  add column if not exists pen_igv numeric(14,2),
  add column if not exists pen_total numeric(14,2),
  add column if not exists pen_retencion numeric(14,2);

alter table comprobantes drop constraint if exists comp_moneda_ok;
alter table comprobantes add constraint comp_moneda_ok check (
  moneda = 'USD' or (moneda = 'PEN' and coalesce(tipo_cambio, 0) > 0 and pen_total is not null));

comment on column comprobantes.moneda is
  'Moneda del DOCUMENTO (116). total/op_gravada/igv/saldo siguen en dólares para los reportes; en soles, los pen_* son lo impreso y lo enviado a SUNAT.';

-- --------------------------------------------- Poner la moneda a la cotización
create or replace function public.poner_moneda_cotizacion(p_id uuid, p_moneda text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_estado estado_cotizacion;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede cambiar una cotización' using errcode = 'insufficient_privilege';
  end if;
  if p_moneda not in ('USD','PEN') then
    raise exception 'Moneda no válida: %', p_moneda using errcode = 'invalid_parameter_value';
  end if;
  select estado into v_estado from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  -- Una vez aprobada, la moneda y el cambio son lo que el cliente aceptó.
  if v_estado not in ('borrador','enviada') then
    raise exception 'La cotización ya está %: la moneda se elige antes de aprobarla', v_estado
      using errcode = 'check_violation';
  end if;
  update cotizaciones set moneda = p_moneda, tipo_cambio = null where id = p_id;
end $$;

revoke all on function public.poner_moneda_cotizacion(uuid, text) from public, anon;
grant execute on function public.poner_moneda_cotizacion(uuid, text) to authenticated, service_role;

-- ------------------------------------------- Aprobar congela el tipo de cambio
-- Se quitan las dos firmas de antes: la de un argumento aprobaba sin mirar la
-- moneda, y dejar la de dos al lado de la de tres hace ambigua la llamada.
drop function if exists public.aprobar_cotizacion(uuid);
drop function if exists public.aprobar_cotizacion(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.aprobar_cotizacion(p_id uuid, p_lineas jsonb DEFAULT NULL::jsonb, p_tipo_cambio numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_estado    estado_cotizacion;
  v_fila      jsonb;
  v_item      uuid;
  v_cant      numeric(14,2);
  v_tocadas   int := 0;
  v_confirmadas int;
  v_moneda    char(3);
begin
  -- Control de rol. Es `security definer`: se salta RLS, así que sin esto
  -- cualquiera con sesión aprueba cotizaciones por PostgREST. Va lo PRIMERO.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede aprobar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  select estado, moneda into v_estado, v_moneda from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado not in ('borrador','enviada') then
    raise exception 'La cotización está en estado % y no se puede aprobar', v_estado
      using errcode = 'check_violation';
  end if;

  if p_lineas is null then
    -- Confirmación completa: cada línea se aprueba por lo que se cotizó.
    update cotizacion_items
       set cantidad_aprobada = cantidad
     where cotizacion_id = p_id;
  else
    -- Confirmación parcial. Se parte de CERO y se sube lo que el cliente dijo:
    -- al revés —dejar lo no mencionado en su cantidad— una línea que se
    -- olvidara de listar se daría por vendida en silencio, que es justo el
    -- fallo que esta migración viene a arreglar.
    update cotizacion_items set cantidad_aprobada = 0 where cotizacion_id = p_id;

    for v_fila in select * from jsonb_array_elements(p_lineas) loop
      v_item := nullif(v_fila ->> 'item_id','')::uuid;
      v_cant := coalesce((v_fila ->> 'cantidad')::numeric, 0);

      if v_item is null then
        raise exception 'Una de las líneas llegó sin item_id'
          using errcode = 'invalid_parameter_value';
      end if;

      update cotizacion_items
         set cantidad_aprobada = v_cant
       where id = v_item and cotizacion_id = p_id;

      if not found then
        -- Una línea de OTRA cotización. Sin esta comprobación se aceptaría en
        -- silencio y el total confirmado saldría mal sin que nadie lo notara.
        raise exception 'La línea % no pertenece a esta cotización', v_item
          using errcode = 'foreign_key_violation';
      end if;
      v_tocadas := v_tocadas + 1;
    end loop;

    if v_tocadas = 0 then
      raise exception 'No llegó ninguna línea confirmada. Para aprobarla entera, no mandes el detalle.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  select count(*) into v_confirmadas
    from cotizacion_items
   where cotizacion_id = p_id and coalesce(cantidad_aprobada, 0) > 0;

  -- Cero líneas confirmadas no es una aprobación, es un rechazo. Y decirlo
  -- importa: una cotización «aprobada» sin nada dentro se quedaría esperando
  -- una guía que nunca se va a emitir.
  if v_confirmadas = 0 then
    raise exception 'No confirmaron ninguna línea. Si el cliente dijo que no, márcala como rechazada.'
      using errcode = 'check_violation';
  end if;

  -- En soles, el tipo de cambio se congela AQUÍ (116): es lo que el cliente
  -- aceptó. La base no consulta SUNAT; lo trae la Server Action.
  if v_moneda = 'PEN' and coalesce(p_tipo_cambio, 0) <= 0 then
    raise exception 'La cotización es en soles: hace falta el tipo de cambio para aprobarla'
      using errcode = 'check_violation';
  end if;

  update cotizaciones
     set estado = 'aprobada', aprobada_en = now(), aprobada_por = auth.uid(),
         tipo_cambio = case when v_moneda = 'PEN' then round(p_tipo_cambio, 3) end
   where id = p_id;

  return jsonb_build_object(
    'id', p_id,
    'estado', 'aprobada',
    'lineas_confirmadas', v_confirmadas,
    'parcial', p_lineas is not null,
    'moneda', v_moneda,
    'tipo_cambio', case when v_moneda = 'PEN' then round(p_tipo_cambio, 3) end
  );
end $function$
;

revoke all on function public.aprobar_cotizacion(uuid, jsonb, numeric) from public, anon;
grant execute on function public.aprobar_cotizacion(uuid, jsonb, numeric) to authenticated, service_role;

-- ---------------------------------------------- Emitir, en la moneda del documento
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

  if (p_datos ->> 'cotizacion_id') is not null then
    update cotizaciones set estado = 'atendida'
     where id = (p_datos ->> 'cotizacion_id')::uuid and estado = 'aprobada';
  end if;

  return jsonb_build_object(
    'id', v_id,
    'numero', (select numero from comprobantes where id = v_id),
    'total', v_total, 'igv', v_igv,
    'detraccion', (select detraccion_monto from comprobantes where id = v_id),
    'retencion',  (select retencion_monto  from comprobantes where id = v_id),
    'moneda', v_moneda,
    'total_documento', case when v_moneda = 'PEN' then v_pt else v_total end);
end $function$
;

-- ------------------------------------------------------------------ Centinela
-- EJECUTA lo caro y lo deshace (regla de CLAUDE.md §2): crea una cotización,
-- la pasa a soles, prueba que aprobar sin cambio falla y con cambio lo
-- congela, emite la factura en soles y una nota de crédito sobre ella, y sale
-- por excepción —lo que borra todo y devuelve los correlativos—.
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid;
  r jsonb;
  v_cot uuid;
  v_fac uuid;
  v_nota uuid;
  v_fallo boolean;
  c comprobantes%rowtype;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '116: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    r := public.crear_cotizacion(jsonb_build_object(
      'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 3, 'unidad_codigo', 'NIU', 'valor_unitario', 10.87, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    perform public.poner_moneda_cotizacion(v_cot, 'PEN');

    v_fallo := false;
    begin
      perform public.aprobar_cotizacion(v_cot, null::jsonb);
    exception when check_violation then v_fallo := true;
    end;
    if not v_fallo then raise exception '116: aprobó en soles sin tipo de cambio'; end if;

    perform public.aprobar_cotizacion(v_cot, null::jsonb, 3.448);
    if (select tipo_cambio from cotizaciones where id = v_cot) <> 3.448 then
      raise exception '116: aprobar no congeló el tipo de cambio';
    end if;

    v_fallo := false;
    begin
      perform public.poner_moneda_cotizacion(v_cot, 'USD');
    exception when check_violation then v_fallo := true;
    end;
    if not v_fallo then raise exception '116: dejó cambiar la moneda de una aprobada'; end if;

    -- 10.87 × 3.448 = 37.48 por unidad; × 3 = 112.44; IGV 20.24; total 132.68.
    r := public.emitir_comprobante(jsonb_build_object(
      'tipo', 'factura', 'cliente_id', v_cliente, 'cotizacion_id', v_cot,
      'condicion_pago', 'credito', 'dias_credito', 30,
      'retencion', jsonb_build_object('aplica', true),
      'guias', jsonb_build_array(gen_random_uuid()),
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', p1, 'codigo', 'X1', 'descripcion', 'uno', 'cantidad', 3,
        'unidad_codigo', 'NIU', 'valor_unitario', 10.87))));
    v_fac := (r ->> 'id')::uuid;
    select * into c from comprobantes where id = v_fac;
    if c.moneda <> 'PEN' or c.tipo_cambio <> 3.448 then
      raise exception '116: la factura no salió en soles (% / %)', c.moneda, c.tipo_cambio;
    end if;
    if c.pen_gravada <> 112.44 or c.pen_igv <> 20.24 or c.pen_total <> 132.68 or c.pen_retencion <> 3.98 then
      raise exception '116: importes en soles mal: % % % %', c.pen_gravada, c.pen_igv, c.pen_total, c.pen_retencion;
    end if;
    if c.total <> 38.48 then
      raise exception '116: el total en dólares cambió: %', c.total;
    end if;
    if c.total_letras not ilike '%SOLES%' then
      raise exception '116: el importe en letras no dice soles: %', c.total_letras;
    end if;

    -- La nota hereda la moneda, y ya no pide guía.
    r := public.emitir_comprobante(jsonb_build_object(
      'tipo', 'nota_credito', 'cliente_id', v_cliente, 'referencia_id', v_fac,
      'motivo_nota_codigo', '01', 'condicion_pago', 'contado', 'dias_credito', 0,
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', p1, 'codigo', 'X1', 'descripcion', 'uno', 'cantidad', 3,
        'unidad_codigo', 'NIU', 'valor_unitario', 10.87))));
    v_nota := (r ->> 'id')::uuid;
    if (select moneda from comprobantes where id = v_nota) <> 'PEN'
       or (select pen_total from comprobantes where id = v_nota) <> 132.68 then
      raise exception '116: la nota no heredó la moneda de su factura';
    end if;

    raise exception '__116_DESHACER__';
  exception when others then
    if sqlerrm <> '__116_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '116: cotización en soles → factura y nota en soles, con el cambio congelado; deshecho limpio.';
end $$;
