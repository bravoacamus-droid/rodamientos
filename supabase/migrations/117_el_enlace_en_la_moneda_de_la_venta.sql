-- ###########################################################################
-- 117 · EL ENLACE PÚBLICO, EN LA MONEDA DE LA VENTA
-- ###########################################################################
--
-- Desde la 116 una cotización puede venderse en soles, y la ficha, el papel,
-- el PDF y el WhatsApp ya la enseñan en soles. El enlace que se le manda al
-- cliente (`/ver/<token>`, 072) seguía en dólares: `cotizacion_por_token` no
-- devolvía la moneda. Era lo último que faltaba (§BZ).
--
-- Devuelve ahora `moneda`, `tipo_cambio`, `tipo_cambio_fijo` y
-- `tipo_cambio_fecha`:
--
--   · Aprobada en soles: el cambio congelado al aprobar (116).
--   · En soles sin aprobar: el último venta de SUNAT ya consultado, de
--     `consultas_cache`. El enlace no tiene sesión y no puede salir a SUNAT;
--     lo que hay en la caché es lo mismo que vio quien la mandó.
--   · En dólares: `tipo_cambio` nulo.
--
-- El tipo de cambio es un dato público. El centinela vuelve a mirar la lista
-- blanca de claves (080/112), ahora también la de la cabecera, para que con
-- la moneda no se cuele el costo ni el margen.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.cotizacion_por_token(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'numero',                 q.numero,
    'fecha',                  q.fecha,
    'estado',                 q.estado,
    'validez_dias',           q.validez_dias,
    'tiempo_entrega',         q.tiempo_entrega,
    'orden_compra_cliente',   q.orden_compra_cliente,
    'contacto',               q.contacto,
    'condiciones',            q.condiciones,
    'observaciones',          q.observaciones,
    'mostrar_descuento',      q.mostrar_descuento,
    'mostrar_disponibilidad', q.mostrar_disponibilidad,
    'subtotal',               q.subtotal,
    'descuento_total',        q.descuento_total,
    'igv',                    q.igv,
    'total',                  q.total,
    -- La moneda de la venta (117). Aprobada en soles, su cambio congelado;
    -- sin aprobar, el último venta de SUNAT que ya se consultó (la caché):
    -- el enlace no tiene sesión y no puede salir a preguntar.
    'moneda',                 q.moneda,
    'tipo_cambio',            case when q.moneda = 'PEN' then coalesce(q.tipo_cambio, tc.venta) end,
    'tipo_cambio_fijo',       q.moneda = 'PEN' and q.tipo_cambio is not null,
    'tipo_cambio_fecha',      case when q.moneda = 'PEN' then coalesce((q.aprobada_en at time zone 'America/Lima')::date, tc.fecha) end,
    'vendedor',               p.nombre,
    'cliente', jsonb_build_object(
      'razon_social',    cl.razon_social,
      'numero_documento', cl.numero_documento,
      'tipo_documento',  cl.tipo_documento,
      'direccion',       cl.direccion,
      'condicion_pago',  cl.condicion_pago,
      'dias_credito',    cl.dias_credito
    ),
    'lineas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'orden',          ci.orden,
          'codigo',         ci.codigo,
          'marca',          ci.marca,
          'descripcion',    ci.descripcion,
          'nota',           ci.nota,
          'cantidad',       ci.cantidad,
          'unidad_codigo',  ci.unidad_codigo,
          'valor_unitario', ci.valor_unitario,
          'descuento_pct',  ci.descuento_pct,
          'disponibilidad', ci.disponibilidad,
          'dias_entrega',   ci.dias_entrega
        ) order by ci.orden
      )
      from cotizacion_items ci
     where ci.cotizacion_id = q.id
    ), '[]'::jsonb)
  )
  from cotizaciones q
  join clientes cl on cl.id = q.cliente_id
  left join perfiles p on p.id = q.vendedor_id
  left join lateral (
    select (c.payload ->> 'sell_price')::numeric as venta, (c.payload ->> 'date')::date as fecha
      from consultas_cache c
     where c.espacio = 'tipo_cambio' and c.ok and (c.payload ->> 'sell_price') is not null
     order by (c.payload ->> 'date') desc, c.creado_en desc
     limit 1
  ) tc on q.moneda = 'PEN' and q.tipo_cambio is null
  -- El token completo y exacto (072). Una anulada no se enseña.
  where q.token_publico = p_token
    and q.estado <> 'anulada';
$function$
;

-- ------------------------------------------------------------------ Centinela
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid;
  r jsonb;
  v_id uuid;
  v_json jsonb;
  v_sobran text;
  v_cabecera text[] := array[
    'numero','fecha','estado','validez_dias','tiempo_entrega','orden_compra_cliente',
    'contacto','condiciones','observaciones','mostrar_descuento','mostrar_disponibilidad',
    'subtotal','descuento_total','igv','total','vendedor','cliente','lineas',
    'moneda','tipo_cambio','tipo_cambio_fijo','tipo_cambio_fecha'
  ];
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '117: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    r := public.crear_cotizacion(jsonb_build_object(
      'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 1, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 7))));
    v_id := (r ->> 'id')::uuid;

    -- En dólares: sin cambio.
    select public.cotizacion_por_token(token_publico) into v_json from cotizaciones where id = v_id;
    if v_json ->> 'moneda' <> 'USD' or v_json -> 'tipo_cambio' <> 'null'::jsonb then
      raise exception '117: en dólares no debería traer cambio: % %', v_json ->> 'moneda', v_json -> 'tipo_cambio';
    end if;

    -- En soles y aprobada: el congelado.
    perform public.poner_moneda_cotizacion(v_id, 'PEN');
    perform public.aprobar_cotizacion(v_id, null::jsonb, 3.512);
    select public.cotizacion_por_token(token_publico) into v_json from cotizaciones where id = v_id;
    if v_json ->> 'moneda' <> 'PEN' or (v_json ->> 'tipo_cambio')::numeric <> 3.512
       or not (v_json ->> 'tipo_cambio_fijo')::boolean or v_json ->> 'tipo_cambio_fecha' is null then
      raise exception '117: el enlace no trae el cambio congelado: %', v_json;
    end if;

    -- Y nada fuera de la lista blanca: ni costo ni margen.
    select string_agg(k, ', ') into v_sobran
      from jsonb_object_keys(v_json) as k
     where k <> all (v_cabecera);
    if v_sobran is not null then
      raise exception '117: el enlace público devuelve campos que el cliente no debe ver: %', v_sobran;
    end if;

    raise exception '__117_DESHACER__';
  exception when others then
    if sqlerrm <> '__117_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '117: el enlace trae la moneda y el cambio congelado, y nada más; deshecho limpio.';
end $$;
