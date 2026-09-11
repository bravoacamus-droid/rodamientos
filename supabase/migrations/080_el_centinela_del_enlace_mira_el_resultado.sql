-- ###########################################################################
-- 080 · EL CENTINELA DEL ENLACE MIRA EL RESULTADO, NO EL TEXTO
-- ###########################################################################
--
-- Auditoría del 11/09, hallazgo 6 (§AK.4). Un control que no controla lo que
-- dice controlar.
--
-- ---------------------------------------------------------------------------
-- El problema
-- ---------------------------------------------------------------------------
-- El centinela de la 072 lee el FUENTE de `cotizacion_por_token` y comprueba
-- que no aparezcan las cadenas `margen_pct`, `costo_total` ni `costo_unitario`.
-- Su propio comentario dice para qué existe:
--
--   *«Un `select *` metido aquí de buena fe dentro de seis meses mandaría el
--   margen al cliente sin que nada fallara.»*
--
-- Y es exactamente el caso que NO detecta. Un `select *`, o un `to_jsonb(q)`,
-- no contienen ninguna de esas tres cadenas: pasarían el centinela mandando la
-- fila entera —costo, margen y el teléfono del cliente— a una página que se
-- abre sin sesión y que se manda por WhatsApp.
--
-- Tampoco cubría `costo_promedio` ni `precio_minimo`, que son las otras dos
-- columnas que nunca deben salir de casa.
--
-- **Hoy no filtra nada**: se leyó la función entera y devuelve solo campos del
-- papel. El fallo es del control, no del estado actual. Pero un control que se
-- puede saltar sin querer es peor que no tenerlo, porque se confía en él.
--
-- ---------------------------------------------------------------------------
-- Lo que se hace
-- ---------------------------------------------------------------------------
-- Comprobar las CLAVES DEL RESULTADO contra una lista blanca, no el texto del
-- fuente. La función ya se llama aquí abajo y el JSON ya estaba en la mano: es
-- más barato y no se lo salta un `select *`, porque un `select *` traería
-- claves que no están en la lista.
--
-- La 072 no se toca: su función sigue siendo la buena. Esto es solo el
-- guardián, rehecho.
-- ###########################################################################

do $$
declare
  v_token    text;
  v_json     jsonb;
  v_sobran   text;
  v_permitidas constant text[] := array[
    -- Lo que va impreso en el papel, y nada más.
    'numero', 'fecha', 'estado', 'validez_dias', 'tiempo_entrega',
    'orden_compra_cliente', 'contacto', 'condiciones', 'observaciones',
    'mostrar_descuento', 'mostrar_disponibilidad',
    'subtotal', 'descuento_total', 'igv', 'total',
    'vendedor', 'cliente', 'lineas'
  ];
  v_permitidas_cliente constant text[] := array[
    'razon_social', 'numero_documento', 'tipo_documento', 'direccion',
    'condicion_pago', 'dias_credito'
  ];
  v_permitidas_linea constant text[] := array[
    'orden', 'codigo', 'marca', 'descripcion', 'cantidad', 'unidad_codigo',
    'valor_unitario', 'descuento_pct', 'disponibilidad', 'dias_entrega'
  ];
begin
  select token_publico into v_token
    from cotizaciones
   where estado <> 'anulada' and token_publico is not null
   limit 1;

  if v_token is null then
    raise notice '080: todavía no hay ninguna cotización con token; el centinela queda sin correr.';
    return;
  end if;

  select public.cotizacion_por_token(v_token) into v_json;

  if v_json is null then
    raise exception 'cotizacion_por_token no devolvió nada con un token válido';
  end if;

  -- 1 · La cabecera.
  select string_agg(k, ', ') into v_sobran
    from jsonb_object_keys(v_json) as k
   where k <> all (v_permitidas);

  if v_sobran is not null then
    raise exception
      'cotizacion_por_token devuelve campos que el cliente no debe ver: %. El enlace público se abre sin sesión.',
      v_sobran;
  end if;

  -- 2 · El cliente.
  select string_agg(k, ', ') into v_sobran
    from jsonb_object_keys(v_json -> 'cliente') as k
   where k <> all (v_permitidas_cliente);

  if v_sobran is not null then
    raise exception
      'cotizacion_por_token devuelve datos del cliente que no van en el papel: %',
      v_sobran;
  end if;

  -- 3 · Las líneas. Es donde viven `costo_unitario` y `margen_pct`, así que es
  --     la que de verdad importa.
  if jsonb_array_length(coalesce(v_json -> 'lineas', '[]'::jsonb)) > 0 then
    select string_agg(k, ', ') into v_sobran
      from jsonb_object_keys(v_json -> 'lineas' -> 0) as k
     where k <> all (v_permitidas_linea);

    if v_sobran is not null then
      raise exception
        'cotizacion_por_token devuelve campos de línea que no van en el papel: %',
        v_sobran;
    end if;
  end if;

  -- 4 · Y que siga sin devolver nada con un token inventado.
  if public.cotizacion_por_token('no-existe-este-token') is not null then
    raise exception 'cotizacion_por_token devuelve algo con un token inventado';
  end if;

  raise notice '080: el enlace público devuelve solo los campos del papel.';
end $$;
