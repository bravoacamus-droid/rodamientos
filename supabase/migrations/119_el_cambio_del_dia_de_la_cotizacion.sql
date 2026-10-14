-- ###########################################################################
-- 119 · EL TIPO DE CAMBIO ES EL DEL DÍA DE LA COTIZACIÓN
-- ###########################################################################
--
-- La 116 congelaba el cambio al APROBAR. Willy, reunión del 14/10: *«yo hago
-- la cotización un día 10 con un tipo de cambio… se aprueba un día 14…
-- tiene que mantener el mismo precio; ese tipo de cambio tiene que ser del día
-- que se cotizó, por los 10, 15 días de validez»*.
--
-- Ahora el cambio se fija al PASAR LA COTIZACIÓN A SOLES, con el venta de
-- SUNAT de su fecha (lo trae la Server Action). `poner_moneda_cotizacion`
-- recibe el cambio; `aprobar_cotizacion` respeta el que ya tenga y solo lo
-- pide si falta (SUNAT no contestó al pasarla a soles).
-- ###########################################################################

set local search_path = public, extensions;

drop function if exists public.poner_moneda_cotizacion(uuid, text);

create or replace function public.poner_moneda_cotizacion(p_id uuid, p_moneda text, p_tipo_cambio numeric default null)
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
  if v_estado not in ('borrador','enviada') then
    raise exception 'La cotización ya está %: la moneda se elige antes de aprobarla', v_estado
      using errcode = 'check_violation';
  end if;
  update cotizaciones
     set moneda = p_moneda,
         tipo_cambio = case when p_moneda = 'PEN' and coalesce(p_tipo_cambio, 0) > 0 then round(p_tipo_cambio, 3) end
   where id = p_id;
end $$;

revoke all on function public.poner_moneda_cotizacion(uuid, text, numeric) from public, anon;
grant execute on function public.poner_moneda_cotizacion(uuid, text, numeric) to authenticated, service_role;

create or replace function public.aprobar_cotizacion(p_id uuid, p_lineas jsonb DEFAULT NULL::jsonb, p_tipo_cambio numeric DEFAULT NULL::numeric)
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
  v_tc        numeric(8,3);
begin
  -- Control de rol. Es `security definer`: se salta RLS, así que sin esto
  -- cualquiera con sesión aprueba cotizaciones por PostgREST. Va lo PRIMERO.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede aprobar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  select estado, moneda, tipo_cambio into v_estado, v_moneda, v_tc from cotizaciones where id = p_id for update;
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
  -- Desde la 119 el cambio se fija con la FECHA DE LA COTIZACIÓN, al pasarla a
  -- soles; aquí se respeta el que ya tenga y solo se pide si falta.
  v_tc := coalesce(v_tc, round(p_tipo_cambio, 3));
  if v_moneda = 'PEN' and coalesce(v_tc, 0) <= 0 then
    raise exception 'La cotización es en soles: hace falta el tipo de cambio para aprobarla'
      using errcode = 'check_violation';
  end if;

  update cotizaciones
     set estado = 'aprobada', aprobada_en = now(), aprobada_por = auth.uid(),
         tipo_cambio = case when v_moneda = 'PEN' then v_tc end
   where id = p_id;

  return jsonb_build_object(
    'id', p_id,
    'estado', 'aprobada',
    'lineas_confirmadas', v_confirmadas,
    'parcial', p_lineas is not null,
    'moneda', v_moneda,
    'tipo_cambio', case when v_moneda = 'PEN' then v_tc end
  );
end $function$
;

-- ------------------------------------------------------------------ Centinela
do $$
declare
  v_usuario uuid; v_cliente uuid; p1 uuid; r jsonb; v_cot uuid; v_fallo boolean;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '119: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 1, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;

    -- Con el cambio del día de la cotización: aprobar NO lo pisa.
    perform public.poner_moneda_cotizacion(v_cot, 'PEN', 3.401);
    perform public.aprobar_cotizacion(v_cot, null::jsonb, 3.9);
    if (select tipo_cambio from cotizaciones where id = v_cot) <> 3.401 then
      raise exception '119: aprobar pisó el cambio de la cotización';
    end if;

    raise exception '__119_PASO2__';
  exception when others then
    if sqlerrm <> '__119_PASO2__' then raise; end if;
  end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 1, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    -- Sin cambio (SUNAT no contestó): aprobar lo pide, y con él lo fija.
    perform public.poner_moneda_cotizacion(v_cot, 'PEN');
    v_fallo := false;
    begin
      perform public.aprobar_cotizacion(v_cot, null::jsonb);
    exception when check_violation then v_fallo := true;
    end;
    if not v_fallo then raise exception '119: aprobó en soles sin ningún cambio'; end if;
    perform public.aprobar_cotizacion(v_cot, null::jsonb, 3.512);
    if (select tipo_cambio from cotizaciones where id = v_cot) <> 3.512 then
      raise exception '119: aprobar no fijó el cambio que faltaba';
    end if;
    raise exception '__119_DESHACER__';
  exception when others then
    if sqlerrm <> '__119_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
end $$;
