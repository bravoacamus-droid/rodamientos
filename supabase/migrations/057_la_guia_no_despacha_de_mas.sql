-- ###########################################################################
-- 057 · LA GUÍA NO PUEDE DESPACHAR MÁS DE LO QUE EL CLIENTE CONFIRMÓ
-- ###########################################################################
--
-- Encontrado el 03/09 recorriendo la cadena entera de un tirón, que es algo
-- que no se había hecho nunca: cotizar, confirmar en parte, comprar, recibir,
-- despachar, facturar.
--
-- Es **el gemelo exacto del fallo que arregló la 047**, en el otro documento.
-- Allí la factura cobraba lo cotizado en vez de lo confirmado; aquí la guía
-- despacha lo cotizado en vez de lo confirmado. Se arregló uno y el otro se
-- quedó donde estaba.
--
-- ---------------------------------------------------------------------------
-- Lo que pasaba
-- ---------------------------------------------------------------------------
-- Cotización de 30 unidades. El cliente dice «me quedo con 25» y eso queda en
-- `cotizacion_items.cantidad_aprobada`. La bandeja de compras lo respeta, la
-- facturación lo respeta desde la 047 — y la guía proponía **30**, con el
-- almacén en 25.
--
-- Ni la pantalla ni la base lo impedían. Se puede despachar de más incluso a
-- mano, por la API, y el stock se va a negativo sin que salte nada.
--
-- Y en una guía duele distinto que en una factura: **la mercadería ya salió
-- del almacén en un camión**. Deshacerlo no es una nota de crédito, es ir a
-- buscarla.
--
-- ---------------------------------------------------------------------------
-- Dónde va el tope
-- ---------------------------------------------------------------------------
-- En `generar_guia_desde_cotizacion`, que es `security definer` y por tanto
-- se salta RLS: cualquiera con sesión la puede llamar sin pasar por la
-- pantalla. Va ANTES de pedir el correlativo — validar a media función deja
-- un número de guía quemado, y esos no vuelven.
--
-- Se cuenta lo YA despachado en guías no anuladas, no solo lo de esta: dos
-- guías de 15 sobre una línea de 25 confirmadas son 30, y ninguna de las dos
-- por separado se pasa.
--
-- Se parchea sobre la definición que haya en la base, misma técnica que la
-- 018, la 047 y la 056: copiar aquí las 120 líneas de esa función la
-- duplicaría, y a la siguiente vez que alguien tocara la 004 las dos versiones
-- se separarían sin que nadie lo notara.
-- ###########################################################################

set search_path = public, extensions;

do $bloque$
declare
  v_def text;
  v_patron text := 'v_corr\s*:=\s*public\.siguiente_correlativo\(''guia_remision'',\s*v_serie\);';
  v_nuevo text :=
'-- Nadie despacha más de lo que el cliente confirmó (057).' || chr(10) ||
'  --' || chr(10) ||
'  -- Va antes del correlativo: fallar después deja un número de guía' || chr(10) ||
'  -- quemado. Y cuenta lo ya despachado en otras guías, porque dos de 15' || chr(10) ||
'  -- sobre una línea de 25 son 30 y ninguna se pasa por su cuenta.' || chr(10) ||
'  declare' || chr(10) ||
'    v_exceso record;' || chr(10) ||
'  begin' || chr(10) ||
'    select ci.codigo,' || chr(10) ||
'           coalesce(ci.cantidad_aprobada, ci.cantidad) as tope,' || chr(10) ||
'           coalesce(ya.despachado, 0) as antes,' || chr(10) ||
'           sum((i.value ->> ''cantidad'')::numeric) as ahora' || chr(10) ||
'      into v_exceso' || chr(10) ||
'      from jsonb_array_elements(v_items) i' || chr(10) ||
'      join cotizacion_items ci' || chr(10) ||
'        on ci.id = nullif(i.value ->> ''cotizacion_item_id'','''')::uuid' || chr(10) ||
'      left join lateral (' || chr(10) ||
'        select sum(gi.cantidad) as despachado' || chr(10) ||
'          from guia_items gi' || chr(10) ||
'          join guias_remision g on g.id = gi.guia_id' || chr(10) ||
'         where gi.cotizacion_item_id = ci.id and g.estado <> ''anulada''' || chr(10) ||
'      ) ya on true' || chr(10) ||
'     group by ci.codigo, ci.cantidad_aprobada, ci.cantidad, ya.despachado' || chr(10) ||
'    having coalesce(ya.despachado, 0) + sum((i.value ->> ''cantidad'')::numeric)' || chr(10) ||
'           > coalesce(ci.cantidad_aprobada, ci.cantidad)' || chr(10) ||
'     limit 1;' || chr(10) ||
'' || chr(10) ||
'    if v_exceso.codigo is not null then' || chr(10) ||
'      raise exception ''De % el cliente confirmó %, y con esta guía saldrían % (ya salieron %)'',' || chr(10) ||
'        v_exceso.codigo, v_exceso.tope, v_exceso.antes + v_exceso.ahora, v_exceso.antes' || chr(10) ||
'        using errcode = ''check_violation'';' || chr(10) ||
'    end if;' || chr(10) ||
'  end;' || chr(10) ||
'' || chr(10) ||
'  v_corr := public.siguiente_correlativo(''guia_remision'', v_serie);';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generar_guia_desde_cotizacion';

  if v_def is null then
    raise exception 'No existe generar_guia_desde_cotizacion: falta aplicar la 004';
  end if;

  if v_def like '%el cliente confirmó%' then
    raise notice 'generar_guia_desde_cotizacion ya tiene el tope. Se omite.';
    return;
  end if;

  if v_def !~ v_patron then
    raise exception 'No encuentro dónde pedir el correlativo en generar_guia_desde_cotizacion. Revisa la 004.';
  end if;

  execute regexp_replace(v_def, v_patron, v_nuevo);

  -- Un `regexp_replace` que no encuentra nada devuelve el texto igual y no
  -- falla. Sin esta comprobación, la migración diría que sí y no habría
  -- cambiado nada.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generar_guia_desde_cotizacion';
  if v_def not like '%el cliente confirmó%' then
    raise exception 'El parche no llegó a aplicarse';
  end if;

  raise notice 'generar_guia_desde_cotizacion topa lo despachado en lo confirmado.';
end $bloque$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Fabrica el caso: una cotización de 10 con 4 confirmadas, y se intenta
-- despachar 10. Si sale, es que el tope no está.
do $$
declare
  v_quien   uuid;
  v_cliente uuid;
  v_prod    uuid;
  v_cot     uuid;
  v_item    uuid;
  v_r       jsonb;
  v_guias   int;
  v_corr    int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select id into v_cliente from clientes where activo order by razon_social limit 1;
  select id into v_prod from productos where not archivado and peso_kg > 0 order by codigo limit 1;

  if v_quien is null or v_cliente is null or v_prod is null then
    raise notice 'Faltan datos para probarlo (perfil, cliente, producto con peso). Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  select correlativo_actual into v_corr
    from series_documento where tipo = 'guia_remision' and predeterminada;

  insert into cotizaciones (numero, cliente_id, estado, fecha, validez_dias)
  values ('ZZTEST-057', v_cliente, 'aprobada', current_date, 15)
  returning id into v_cot;

  insert into cotizacion_items
    (cotizacion_id, producto_id, orden, codigo, descripcion, cantidad,
     cantidad_aprobada, unidad_codigo, valor_unitario)
  select v_cot, v_prod, 1, p.codigo, p.descripcion, 10, 4, 'NIU', 1
    from productos p where p.id = v_prod
  returning id into v_item;

  -- 10 sobre 4 confirmadas: tiene que reventar.
  begin
    v_r := public.generar_guia_desde_cotizacion(jsonb_build_object(
      'cotizacion_id', v_cot,
      'ubigeo_llegada', '150101',
      'direccion_llegada', 'ZZTEST',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cotizacion_item_id', v_item, 'cantidad', 10))));
    raise exception 'Dejó despachar 10 de una línea con 4 confirmadas';
  exception when check_violation then null;
  end;

  -- Y 4 sí tiene que pasar: el arreglo no puede haber roto el caso normal.
  v_r := public.generar_guia_desde_cotizacion(jsonb_build_object(
    'cotizacion_id', v_cot,
    'ubigeo_llegada', '150101',
    'direccion_llegada', 'ZZTEST',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'cotizacion_item_id', v_item, 'cantidad', 4))));

  select count(*) into v_guias from guias_remision where cotizacion_id = v_cot;
  if v_guias <> 1 then
    raise exception 'La guía de 4 no salió: hay % guías', v_guias;
  end if;

  -- Y una segunda de 1 sobre las 4 ya despachadas tampoco: es el caso que un
  -- tope por guía suelta no vería.
  begin
    v_r := public.generar_guia_desde_cotizacion(jsonb_build_object(
      'cotizacion_id', v_cot,
      'ubigeo_llegada', '150101',
      'direccion_llegada', 'ZZTEST',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cotizacion_item_id', v_item, 'cantidad', 1))));
    raise exception 'Dejó despachar una segunda guía por encima de lo confirmado';
  exception when check_violation then null;
  end;

  -- Limpieza, incluido el correlativo de guía que la prueba gastó: es fiscal.
  delete from guias_remision where cotizacion_id = v_cot;
  delete from cotizaciones where id = v_cot;
  update series_documento set correlativo_actual = v_corr
   where tipo = 'guia_remision' and predeterminada;

  perform set_config('request.jwt.claims', '', true);

  -- Y el rastro en la bitácora (051): esta prueba crea y borra una cotización.
  delete from actividad
   where entidad in ('cotizaciones')
     and creado_en > now() - interval '2 minutes';

  raise notice 'La guía ya no despacha más de lo que el cliente confirmó.';
end $$;
