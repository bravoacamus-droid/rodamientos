-- ###########################################################################
-- 101 · EL DESADUANAJE ENTRA EN LA K
-- ###########################################################################
--
-- Willy, 02/10, al ver el resumen del análisis (que decía «el desaduanaje no
-- está»): *«falta definir el K… es el índice que me indica la utilidad de la
-- operación, considerando los precios en origen + gastos de envío + gastos de
-- desaduanaje vs el importe correspondiente basado en los precios de venta de
-- mercado local»*. Y: *«al variar las cantidades debo ver cómo varía K»*.
--
-- Su hoja NO lo tenía: su K (F41) es TOT.PM ÷ TOT.$, sin desaduanaje. El 01/10
-- lo estimó *«como 700, 800 soles»*: por eso se guarda EN SOLES, como él lo
-- da, con el tipo de cambio para pasarlo a dólares. Son dos columnas de
-- cabecera; el cálculo es de pantalla (dominio/analisis.ts).
--
-- Ojo con el sentido: él escribió «K = costo / total PM», pero su hoja hace
-- PM ÷ costo (2.65, «más de 1 gana»). Se sigue la hoja; está preguntado.
-- ###########################################################################

alter table analisis_importacion
  add column if not exists desaduanaje_soles numeric(14,2) not null default 0,
  add column if not exists tipo_cambio numeric(8,4);

comment on column analisis_importacion.desaduanaje_soles is
  'Desaduanaje ESTIMADO de la carga, en soles (agente, almacén, tasas). Entra en la K.';
comment on column analisis_importacion.tipo_cambio is
  'Soles por dólar con el que se pasó el desaduanaje a dólares.';

-- guardar_analisis, igual que en la 100 y con las dos columnas de cabecera.
create or replace function public.guardar_analisis(p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_id     uuid := nullif(p_datos ->> 'id', '')::uuid;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_prov   uuid := nullif(p_datos ->> 'proveedor_id', '')::uuid;
  v_estado text;
  v_numero text;
begin
  -- Primero el rol: es `security definer` y se salta RLS.
  if not public.puede_escribir('analisis_importacion') then
    raise exception 'Tu rol no puede hacer análisis de importación'
      using errcode = 'insufficient_privilege';
  end if;
  if v_prov is null then
    raise exception 'El análisis necesita un proveedor' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El análisis no tiene productos' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_items) i
     where nullif(trim(i ->> 'codigo'), '') is null
  ) then
    raise exception 'Hay una línea sin código' using errcode = 'invalid_parameter_value';
  end if;

  if v_id is null then
    insert into analisis_importacion (proveedor_id, fecha, referencia, costo_envio, peso_declarado, notas, creado_por,
                                     desaduanaje_soles, tipo_cambio)
    values (
      v_prov,
      coalesce(nullif(p_datos ->> 'fecha', '')::date, current_date),
      nullif(trim(p_datos ->> 'referencia'), ''),
      greatest(coalesce(nullif(p_datos ->> 'costo_envio', '')::numeric, 0), 0),
      nullif(p_datos ->> 'peso_declarado', '')::numeric,
      nullif(trim(p_datos ->> 'notas'), ''),
      auth.uid(),
      greatest(coalesce(nullif(p_datos ->> 'desaduanaje_soles', '')::numeric, 0), 0),
      nullif(p_datos ->> 'tipo_cambio', '')::numeric
    ) returning id, numero into v_id, v_numero;
  else
    select estado, numero into v_estado, v_numero from analisis_importacion where id = v_id for update;
    if v_estado is null then
      raise exception 'El análisis no existe' using errcode = 'no_data_found';
    end if;
    if v_estado = 'comprado' then
      raise exception 'Este análisis ya se convirtió en compra: no se cambia. Haz uno nuevo.'
        using errcode = 'invalid_parameter_value';
    end if;
    update analisis_importacion
       set proveedor_id   = v_prov,
           fecha          = coalesce(nullif(p_datos ->> 'fecha', '')::date, fecha),
           referencia     = nullif(trim(p_datos ->> 'referencia'), ''),
           costo_envio    = greatest(coalesce(nullif(p_datos ->> 'costo_envio', '')::numeric, 0), 0),
           peso_declarado = nullif(p_datos ->> 'peso_declarado', '')::numeric,
           notas          = nullif(trim(p_datos ->> 'notas'), ''),
           desaduanaje_soles = greatest(coalesce(nullif(p_datos ->> 'desaduanaje_soles', '')::numeric, 0), 0),
           tipo_cambio    = nullif(p_datos ->> 'tipo_cambio', '')::numeric,
           actualizado_en = now()
     where id = v_id;
    delete from analisis_importacion_items where analisis_id = v_id;
  end if;

  insert into analisis_importacion_items (
    analisis_id, orden, producto_id, codigo, marca, descripcion,
    cantidad_ref, cantidad_pedido, precio_fob, peso_kg,
    precio_mercado, proveedor_mercado, frecuencia, cliente
  )
  select v_id, i.orden::smallint,
         nullif(i.valor ->> 'producto_id', '')::uuid,
         left(trim(i.valor ->> 'codigo'), 80),
         nullif(left(trim(i.valor ->> 'marca'), 60), ''),
         nullif(left(trim(i.valor ->> 'descripcion'), 300), ''),
         greatest(coalesce(nullif(i.valor ->> 'cantidad_ref', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'cantidad_pedido', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'precio_fob', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'peso_kg', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'precio_mercado', '')::numeric, 0), 0),
         nullif(left(trim(i.valor ->> 'proveedor_mercado'), 120), ''),
         nullif(i.valor ->> 'frecuencia', '')::numeric,
         nullif(left(trim(i.valor ->> 'cliente'), 120), '')
    from jsonb_array_elements(v_items) with ordinality as i(valor, orden);

  -- El catálogo se llena solo con lo que no tenía: el peso y el precio de
  -- mercado. Lo que ya tenía no se pisa: un análisis es una cotización, no
  -- una corrección del maestro.
  update productos p
     set peso_kg = round(ai.peso_kg, 3)
    from analisis_importacion_items ai
   where ai.analisis_id = v_id and ai.producto_id = p.id
     and ai.peso_kg > 0 and p.peso_kg = 0;
  update productos p
     set precio_mercado = ai.precio_mercado
    from analisis_importacion_items ai
   where ai.analisis_id = v_id and ai.producto_id = p.id
     and ai.precio_mercado > 0 and coalesce(p.precio_mercado, 0) = 0;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end $function$;

-- ###########################################################################
-- Centinela · SE EJECUTA Y SE DESHACE (regla de la 091)
-- ###########################################################################
do $$
declare
  v_perfil uuid; v_prov uuid; v_r jsonb; v_r2 jsonb;
  v_des numeric; v_tc numeric; v_des2 numeric; v_cli text; v_fallo text; v_max int;
begin
  select p.id into v_perfil from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.escribir and pr.tabla = 'analisis_importacion'
   where p.activo limit 1;
  select id into v_prov from proveedores limit 1;
  if v_perfil is null or v_prov is null then
    raise notice '101: faltan datos para el centinela; no corre.';
    return;
  end if;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);
    v_r := public.guardar_analisis(jsonb_build_object(
      'proveedor_id', v_prov, 'costo_envio', 1039, 'desaduanaje_soles', 750, 'tipo_cambio', 3.75,
      'items', jsonb_build_array(jsonb_build_object('codigo', 'NO-ESTA-1', 'cliente', 'ACME', 'precio_fob', 1))));
    select desaduanaje_soles, tipo_cambio into v_des, v_tc from analisis_importacion where id = (v_r ->> 'id')::uuid;
    select cliente into v_cli from analisis_importacion_items where analisis_id = (v_r ->> 'id')::uuid;
    -- Al reescribirlo sin desaduanaje, vuelve a 0.
    v_r2 := public.guardar_analisis(jsonb_build_object(
      'id', v_r ->> 'id', 'proveedor_id', v_prov, 'costo_envio', 1039,
      'items', jsonb_build_array(jsonb_build_object('codigo', 'NO-ESTA-1'))));
    select desaduanaje_soles into v_des2 from analisis_importacion where id = (v_r ->> 'id')::uuid;
    raise exception using message = '__101_DESHACER__';
  exception when others then
    if sqlerrm <> '__101_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  -- La secuencia no se deshace con la transacción.
  select coalesce(max(right(numero, 5)::int), 0) into v_max from analisis_importacion;
  if v_max = 0 then
    perform setval('analisis_importacion_seq', 1, false);
  else
    perform setval('analisis_importacion_seq', v_max, true);
  end if;

  if v_fallo is not null then
    raise exception '101: el centinela se rompió: %', v_fallo;
  end if;
  if v_des <> 750 or v_tc <> 3.75 or v_des2 <> 0 or v_cli is distinct from 'ACME' then
    raise exception '101: desaduanaje %, tc %, al reescribir %, cliente %', v_des, v_tc, v_des2, v_cli;
  end if;
  raise notice '101: el desaduanaje y el tipo de cambio se guardan, y el cliente sigue en su sitio.';
end $$;
