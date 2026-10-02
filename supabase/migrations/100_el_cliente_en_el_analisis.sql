-- ###########################################################################
-- 100 · EL ANÁLISIS DE IMPORTACIÓN, COLUMNA POR COLUMNA COMO SU HOJA
-- ###########################################################################
--
-- Luis, 02/10, probando el módulo de la 098 con la hoja de Willy: *«no me
-- sale el mismo resultado […] todas las fórmulas del excel tienen que
-- funcionar y tiene que darme todos los datos como están ahí»*.
--
-- Dos cosas faltaban:
--
--   1. La columna A de su hoja, CLIENTE: para quién se trae cada producto.
--      La 098 no la tenía, y es lo primero que Willy mira al decidir cuánto
--      pedir de algo que solo compra un cliente.
--   2. El $/kg. Su hoja calcula DHL ÷ peso total = 1039 ÷ 102.3054 = 10.1559,
--      pero el PU LIMA de cada fila lleva el factor ESCRITO A MANO y
--      redondeado: `=+F2+10.15*H2`. Con el exacto, el total del pedido salía
--      1279.95 contra sus 1279.57. Eso es pantalla (dominio/analisis.ts), no
--      base: aquí no se guarda ningún cálculo.
--
-- Comprobado con sus 29 filas: con el factor a dos decimales, PU LIMA, TOT.$,
-- TOT.PM, % y K salen idénticos a su hoja, sin un céntimo de diferencia.
-- ###########################################################################

alter table analisis_importacion_items
  add column if not exists cliente text;

comment on column analisis_importacion_items.cliente is
  'Para quién se trae (columna CLIENTE de la hoja de Willy). Texto libre: '
  'en su hoja hay nombres cortos que no son clientes del maestro.';

-- guardar_analisis, igual que en la 098 y con `cliente` AL FINAL de la lista
-- de columnas: un insert descuadrado es lo que tuvo la facturación rota de la
-- 071 a la 091 (CLAUDE.md §2).
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
    insert into analisis_importacion (proveedor_id, fecha, referencia, costo_envio, peso_declarado, notas, creado_por)
    values (
      v_prov,
      coalesce(nullif(p_datos ->> 'fecha', '')::date, current_date),
      nullif(trim(p_datos ->> 'referencia'), ''),
      greatest(coalesce(nullif(p_datos ->> 'costo_envio', '')::numeric, 0), 0),
      nullif(p_datos ->> 'peso_declarado', '')::numeric,
      nullif(trim(p_datos ->> 'notas'), ''),
      auth.uid()
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
-- Guarda dos líneas, una con cliente y otra sin él, y comprueba que el
-- cliente cae en SU columna y que lo demás no se movió de sitio.
do $$
declare
  v_perfil uuid; v_prov uuid;
  v_r jsonb; v_cli text; v_cli2 text; v_fob numeric; v_frec numeric; v_fallo text;
  v_max int;
begin
  select p.id into v_perfil from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.escribir and pr.tabla = 'analisis_importacion'
   where p.activo limit 1;
  select id into v_prov from proveedores limit 1;
  if v_perfil is null or v_prov is null then
    raise notice '100: faltan datos para el centinela; no corre.';
    return;
  end if;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);

    v_r := public.guardar_analisis(jsonb_build_object(
      'proveedor_id', v_prov, 'costo_envio', 1039,
      'items', jsonb_build_array(
        jsonb_build_object('codigo', 'NO-ESTA-1', 'cliente', 'SIDERPERU', 'cantidad_ref', 6,
                           'cantidad_pedido', 6, 'precio_fob', 9.432, 'peso_kg', 1.73,
                           'proveedor_mercado', 'IMPORT. X', 'frecuencia', 4),
        jsonb_build_object('codigo', 'NO-ESTA-2', 'precio_fob', 1))));

    select cliente, precio_fob, frecuencia into v_cli, v_fob, v_frec
      from analisis_importacion_items
     where analisis_id = (v_r ->> 'id')::uuid and orden = 1;
    select cliente into v_cli2
      from analisis_importacion_items
     where analisis_id = (v_r ->> 'id')::uuid and orden = 2;

    raise exception using message = '__100_DESHACER__';
  exception when others then
    if sqlerrm <> '__100_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  -- La secuencia no se deshace con la transacción: el número que gastó el
  -- centinela se devuelve a mano, o el primer análisis de Willy saldría 00002.
  select coalesce(max(right(numero, 5)::int), 0) into v_max from analisis_importacion;
  if v_max = 0 then
    perform setval('analisis_importacion_seq', 1, false);
  else
    perform setval('analisis_importacion_seq', v_max, true);
  end if;

  if v_fallo is not null then
    raise exception '100: el centinela se rompió: %', v_fallo;
  end if;
  if v_cli is distinct from 'SIDERPERU' or v_cli2 is not null then
    raise exception '100: el cliente se guardó como «%» y «%»', v_cli, v_cli2;
  end if;
  if v_fob <> 9.432 or v_frec <> 4 then
    raise exception '100: el FOB (%) o la f (%) se movieron de columna', v_fob, v_frec;
  end if;
  raise notice '100: el cliente cae en su columna y lo demás sigue en su sitio.';
end $$;
