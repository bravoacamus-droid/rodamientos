-- ###########################################################################
-- 112 · LA NOTA DE CADA PRODUCTO, Y LA ORDEN DEL CLIENTE AL APROBAR
-- ###########################################################################
--
-- Luis, 09/10, mirando «Nueva cotización»:
--
--   *«saca eso de tiempo de entrega, porque se maneja dentro de cada
--   producto; orden de cliente tampoco va, porque eso es cuando ya tenemos
--   una orden […] también en cada producto falta poner un botón o enlace para
--   que agreguen notas en el producto»*.
--
-- Tres cosas:
--
--   1. `cotizacion_items.nota`: una nota por línea, que sale impresa debajo
--      de la descripción («marca alternativa», «entrega parcial», «con
--      certificado»…). Hasta 300 letras. Viaja en crear/actualizar_cotizacion,
--      que se recrean iguales a la 111 más la nota.
--
--   2. `poner_orden_compra_cliente`: la O/C del cliente sale del formulario de
--      la cotización y se escribe al APROBAR, que es cuando existe. Era el
--      único sitio donde se podía escribir, así que sin esto se perdía.
--
--   3. `cotizacion_por_token` devuelve la nota: el enlace público es el papel
--      que ve el cliente. El centinela vuelve a mirar la lista blanca de la
--      080 con la nota dentro, para que no se cuele nada más.
-- ###########################################################################

set local search_path = public, extensions;

alter table cotizacion_items add column if not exists nota text;
alter table cotizacion_items drop constraint if exists cotiz_item_nota_larga;
alter table cotizacion_items add constraint cotiz_item_nota_larga check (nota is null or char_length(nota) <= 300);
comment on column cotizacion_items.nota is
  'Nota de la línea, impresa debajo de la descripción (112). Luis, 09/10: «para que agreguen notas en el producto».';

-- ---------------------------------------------------------------------------
-- 1 · crear y actualizar: las de la 111, con la nota
-- ---------------------------------------------------------------------------
create or replace function public.crear_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_serie    text := coalesce(nullif(p_datos ->> 'serie',''),
                              (select serie from series_documento where tipo='cotizacion' and predeterminada and activo limit 1),
                              'COT1');
  v_corr     integer;
  v_items    jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_contacto uuid := nullif(p_datos ->> 'contacto_id','')::uuid;
  v_nombre   text := nullif(p_datos ->> 'contacto','');
  v_cliente  uuid := (p_datos ->> 'cliente_id')::uuid;
begin
  -- Control de rol. Va lo PRIMERO: validar a media función deja un correlativo
  -- quemado o stock movido.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede emitir una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  -- El contacto tiene que ser DE ESTE CLIENTE (035): el nombre sale impreso.
  if v_contacto is not null then
    if not exists (
      select 1 from cliente_contactos cc
       where cc.id = v_contacto and cc.cliente_id = v_cliente
    ) then
      raise exception 'El contacto elegido no pertenece a ese cliente'
        using errcode = 'foreign_key_violation';
    end if;
    if v_nombre is null then
      select cc.nombre into v_nombre from cliente_contactos cc where cc.id = v_contacto;
    end if;
  end if;

  v_corr := public.siguiente_correlativo('cotizacion', v_serie);

  insert into cotizaciones (
    serie, correlativo, cliente_id, fecha, validez_dias, orden_compra_cliente,
    mostrar_descuento, mostrar_disponibilidad, vendedor_id, contacto, contacto_id,
    condiciones, observaciones, tiempo_entrega, estado
  ) values (
    v_serie, v_corr,
    v_cliente,
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    coalesce(nullif(p_datos ->> 'validez_dias','')::smallint, 15),
    nullif(p_datos ->> 'orden_compra_cliente',''),
    coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    coalesce((p_datos ->> 'mostrar_disponibilidad')::boolean, false),
    coalesce(nullif(p_datos ->> 'vendedor_id','')::uuid, auth.uid()),
    v_nombre,
    v_contacto,
    nullif(p_datos ->> 'condiciones',''),
    nullif(p_datos ->> 'observaciones',''),
    nullif(p_datos ->> 'tiempo_entrega',''),
    coalesce(nullif(p_datos ->> 'estado','')::estado_cotizacion, 'borrador')
  ) returning id into v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    precio_minimo_ref, entrega, disponibilidad, dias_entrega, nota
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         coalesce(nullif(i.value ->> 'orden','')::int, i.ord)::smallint,
         coalesce(nullif(i.value ->> 'codigo',''), p.codigo),
         coalesce(nullif(i.value ->> 'marca',''), m.nombre),
         coalesce(nullif(i.value ->> 'descripcion',''), p.descripcion),
         coalesce(nullif(i.value ->> 'cantidad','')::numeric, 1),
         coalesce(nullif(i.value ->> 'unidad_codigo',''), p.unidad_codigo, 'NIU'),
         coalesce(nullif(i.value ->> 'valor_unitario','')::numeric, p.precio_venta, 0),
         coalesce(nullif(i.value ->> 'descuento_pct','')::numeric, 0),
         coalesce(nullif(i.value ->> 'costo_unitario','')::numeric, p.costo_promedio, 0),
         -- Del MAESTRO, nunca del payload: ahí está la regla del piso.
         coalesce(p.precio_minimo, 0),
         nullif(i.value ->> 'entrega',''),
         coalesce(nullif(i.value ->> 'disponibilidad','')::disponibilidad_item, 'inmediata'),
         -- El plazo solo tiene sentido si no es inmediata; se fuerza aquí para
         -- que el check de la tabla no tumbe la cotización entera.
         case
           when coalesce(nullif(i.value ->> 'disponibilidad','')::disponibilidad_item, 'inmediata') = 'inmediata'
             then null
           else nullif(i.value ->> 'dias_entrega','')::smallint
         end,
         nullif(left(btrim(i.value ->> 'nota'), 300), '')
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    left join productos p on p.id = nullif(i.value ->> 'producto_id','')::uuid
    left join marcas m    on m.id = p.marca_id;

  perform public.guardar_proveedores_de_lineas(v_id, v_items);

  return jsonb_build_object('ok', true, 'id', v_id,
                            'numero', (select numero from cotizaciones where id = v_id));
end $$;

comment on function public.crear_cotizacion(jsonb) is
  'Crea la cotización y sus líneas en una llamada: disponibilidad (043), a quién se le compra cada línea (111) y su nota (112).';

revoke all on function public.crear_cotizacion(jsonb) from public;
grant execute on function public.crear_cotizacion(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · actualizar_cotizacion: la de la 070, más el contacto y los proveedores
-- ---------------------------------------------------------------------------
create or replace function public.actualizar_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_estado   estado_cotizacion;
  v_cliente  uuid;
  v_contacto uuid := nullif(p_datos ->> 'contacto_id','')::uuid;
  v_colgado  int;
  v_n        int;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede editar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := nullif(p_datos ->> 'id','')::uuid;
  if v_id is null then
    raise exception 'Falta el id de la cotización' using errcode = 'check_violation';
  end if;

  select estado, cliente_id into v_estado, v_cliente from cotizaciones where id = v_id for update;
  if v_estado is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;

  if v_estado not in ('borrador', 'enviada', 'aprobada') then
    raise exception 'Una cotización en % ya no se edita', v_estado
      using errcode = 'check_violation';
  end if;

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

  v_cliente := coalesce(nullif(p_datos ->> 'cliente_id','')::uuid, v_cliente);
  if v_contacto is not null and not exists (
    select 1 from cliente_contactos cc where cc.id = v_contacto and cc.cliente_id = v_cliente
  ) then
    raise exception 'El contacto elegido no pertenece a ese cliente'
      using errcode = 'foreign_key_violation';
  end if;

  update cotizaciones set
    cliente_id             = v_cliente,
    validez_dias           = coalesce(nullif(p_datos ->> 'validez_dias','')::int, validez_dias),
    tiempo_entrega         = nullif(p_datos ->> 'tiempo_entrega',''),
    orden_compra_cliente   = nullif(p_datos ->> 'orden_compra_cliente',''),
    contacto               = nullif(p_datos ->> 'contacto',''),
    contacto_id            = v_contacto,
    condiciones            = nullif(p_datos ->> 'condiciones',''),
    observaciones          = nullif(p_datos ->> 'observaciones',''),
    mostrar_descuento      = coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    mostrar_disponibilidad = coalesce((p_datos ->> 'mostrar_disponibilidad')::boolean, false)
  where id = v_id;

  -- Los proveedores de cada línea se van con ella (on delete cascade) y
  -- vuelven con el payload, con su fecha de siempre.
  delete from cotizacion_items where cotizacion_id = v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    disponibilidad, dias_entrega, cantidad_aprobada, nota
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
         nullif(i.value ->> 'dias_entrega','')::int,
         -- Editando una aprobada, lo tecleado ES lo acordado ahora (070).
         case when v_estado = 'aprobada'
              then (i.value ->> 'cantidad')::numeric
              else null end,
         nullif(left(btrim(i.value ->> 'nota'), 300), '')
    from jsonb_array_elements(p_datos -> 'items') i;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'La cotización no puede quedarse sin líneas'
      using errcode = 'check_violation';
  end if;

  perform public.guardar_proveedores_de_lineas(v_id, p_datos -> 'items');

  return jsonb_build_object('ok', true, 'id', v_id, 'lineas', v_n);
end;
$$;

revoke all on function public.actualizar_cotizacion(jsonb) from public;
grant execute on function public.actualizar_cotizacion(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · La orden de compra del cliente, al aprobar
-- ---------------------------------------------------------------------------
create or replace function public.poner_orden_compra_cliente(p_id uuid, p_oc text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede tocar una cotización'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(coalesce(p_oc, '')) > 60 then
    raise exception 'La orden de compra no puede pasar de 60 caracteres'
      using errcode = 'check_violation';
  end if;
  update cotizaciones
     set orden_compra_cliente = nullif(btrim(p_oc), '')
   where id = p_id and estado <> 'anulada';
  if not found then
    raise exception 'La cotización no existe o está anulada' using errcode = 'no_data_found';
  end if;
end $$;

revoke all on function public.poner_orden_compra_cliente(uuid, text) from public;
grant execute on function public.poner_orden_compra_cliente(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · El enlace público, con la nota
-- ---------------------------------------------------------------------------
create or replace function public.cotizacion_por_token(p_token text)
returns jsonb
language sql
stable security definer
set search_path = public, extensions
as $function$
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
  -- El token completo y exacto (072). Una anulada no se enseña.
  where q.token_publico = p_token
    and q.estado <> 'anulada';
$function$;

-- ---------------------------------------------------------------------------
-- Centinela: se ejecuta todo y se deshace
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid;
  r jsonb;
  v_id uuid;
  v_json jsonb;
  v_sobran text;
  v_linea text[] := array[
    'orden', 'codigo', 'marca', 'descripcion', 'nota', 'cantidad', 'unidad_codigo',
    'valor_unitario', 'descuento_pct', 'disponibilidad', 'dias_entrega'
  ];
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '112: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    r := public.crear_cotizacion(jsonb_build_object(
      'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0,
          'nota', '  con certificado  ',
          'proveedores', '[]'::jsonb))));
    v_id := (r ->> 'id')::uuid;
    if (select nota from cotizacion_items where cotizacion_id = v_id) <> 'con certificado' then
      raise exception '112: crear_cotizacion no guardó la nota';
    end if;

    perform public.actualizar_cotizacion(jsonb_build_object(
      'id', v_id, 'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0,
          'nota', 'entrega parcial'))));
    if (select nota from cotizacion_items where cotizacion_id = v_id) <> 'entrega parcial' then
      raise exception '112: actualizar_cotizacion no guardó la nota';
    end if;

    perform public.poner_orden_compra_cliente(v_id, ' OC-4500123 ');
    if (select orden_compra_cliente from cotizaciones where id = v_id) <> 'OC-4500123' then
      raise exception '112: la orden de compra del cliente no se guardó';
    end if;

    select public.cotizacion_por_token(token_publico) into v_json from cotizaciones where id = v_id;
    if v_json -> 'lineas' -> 0 ->> 'nota' <> 'entrega parcial' then
      raise exception '112: el enlace público no lleva la nota';
    end if;
    select string_agg(k, ', ') into v_sobran
      from jsonb_object_keys(v_json -> 'lineas' -> 0) as k
     where k <> all (v_linea);
    if v_sobran is not null then
      raise exception '112: el enlace público devuelve en las líneas campos que el cliente no debe ver: %', v_sobran;
    end if;

    raise exception '__112_DESHACER__';
  exception when others then
    if sqlerrm <> '__112_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '112: la nota se guarda al crear y al editar, sale en el enlace, y la O/C se pone aparte; deshecho limpio.';
end $$;
