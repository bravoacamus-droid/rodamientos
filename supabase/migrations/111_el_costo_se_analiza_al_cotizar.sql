-- ###########################################################################
-- 111 · EL COSTO SE ANALIZA AL COTIZAR
-- ###########################################################################
--
-- Luis, 09/10, con una hoja que Willy le dibujó a mano esa mañana:
--
--   *«el sistema lo hemos estado entendiendo mal […] no se sabe a qué precio
--   se va a vender, puede variar por el día o la semana»*.
--
-- El flujo que estaba hecho era: cotizar con el costo que hubiera en la ficha,
-- y SOLO si el cliente confirmaba y no había stock, pedir precios y comprar.
-- El de Willy es el contrario. Antes de mandar la cotización llama a sus
-- proveedores, apunta a cuánto le dan cada producto y CON ESE costo decide el
-- precio de venta. En su hoja:
--
--   1) 6205 2Z/C3   8 pz  → Prov1 a PC1
--   2) 6308 2RS    10 pz  → Prov2 tiene 7 a PC2, Prov3 tiene 3 a PC3
--                           costo = (PC2 × 7 + PC3 × 3) / 10
--   3) 6004 2Z/C3  12 pz  → Prov4 a PC4
--
--   CONFIRMACIÓN: el cliente acepta el 1 y el 2  →  ÓRDENES DE COMPRA
--   OC1 (Prov1), OC2 (Prov2), OC3 (Prov3).
--
-- Tres cosas, y las tres van aquí:
--
--   1. `cotizacion_item_proveedores`: a quién se le compraría cada línea,
--      cuántas y a cuánto. El costo de la línea pasa a ser el PROMEDIO
--      PONDERADO de esas compras, y lo calcula la base: es lo que decide el
--      margen, y un costo que viniera del navegador sería uno que el
--      navegador puede mentir. Una fila con cantidad 0 es un precio que se
--      apunta y no se compra — Luis, 07/10: *«igual tiene que guardarse el
--      precio del otro para ya no pedirle precio después»*.
--
--   2. `compras.cotizacion_id` y `generar_ordenes_de_compra`: al confirmar,
--      una orden de compra por proveedor, ENLAZADA a la cotización y al
--      cliente. Todas o ninguna.
--
--   3. Un arreglo que apareció al leer `crear_cotizacion` en la base: la que
--      corre es la de la 012/013, no la de la 043. Las cotizaciones NUEVAS
--      perdían la disponibilidad de cada línea («Exterior», «Fabricación»), su
--      plazo y la casilla de imprimir esa columna; solo se arreglaban si
--      alguien las editaba después, porque `actualizar_cotizacion` (070) sí
--      las guarda. Es el «¿cuántas más faltan?» de CLAUDE.md §4.
-- ###########################################################################

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · A quién se le compra cada línea
-- ---------------------------------------------------------------------------
create table if not exists cotizacion_item_proveedores (
  id                 uuid primary key default gen_random_uuid(),
  cotizacion_item_id uuid not null references cotizacion_items(id) on delete cascade,
  proveedor_id       uuid not null references proveedores(id),
  orden              smallint not null default 1,
  -- 0 = «solo apunto su precio, no le compro».
  cantidad           numeric(12,2) not null default 0 check (cantidad >= 0),
  -- Tal como lo dijo el proveedor: en su moneda y con o sin IGV.
  costo_unitario     numeric(14,4) not null check (costo_unitario >= 0),
  moneda             char(3) not null default 'USD' check (moneda in ('USD','PEN')),
  incluye_igv        boolean not null default false,
  tipo_cambio        numeric(9,4),
  -- Lo que vale para el margen: dólares, sin IGV. Lo pone la base.
  costo_usd          numeric(14,4) not null,
  -- El día que se lo dijo. Viaja en el payload para que editar la cotización
  -- (que reinserta las líneas) no le cambie la fecha a un precio viejo.
  fecha              date not null default current_date,
  unique (cotizacion_item_id, proveedor_id),
  constraint cip_tc_coherente check (moneda = 'USD' or (tipo_cambio is not null and tipo_cambio > 0))
);

create index if not exists ix_cip_proveedor on cotizacion_item_proveedores (proveedor_id);

comment on table cotizacion_item_proveedores is
  'A quién se le compraría cada línea de una cotización, cuántas y a cuánto (111). El costo de la línea es el promedio ponderado de las filas con cantidad > 0; las de cantidad 0 son precios apuntados para la próxima vez.';

alter table cotizacion_item_proveedores enable row level security;
-- Solo lectura: se escribe a través de crear/actualizar_cotizacion, que son
-- las que recalculan el costo de la línea.
drop policy if exists "lectura_autenticados" on cotizacion_item_proveedores;
create policy "lectura_autenticados" on cotizacion_item_proveedores
  for select to authenticated using ((select public.mi_rol()) is not null);

-- Guarda los proveedores de cada línea y deja el costo de la línea en su
-- promedio ponderado. Interna: la llaman las dos funciones de la cotización.
create or replace function public.guardar_proveedores_de_lineas(p_cotizacion uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_igv numeric := coalesce((select igv_porcentaje from empresa where id = 1), 18.00);
  v_malo text;
begin
  -- Una línea escrita a mano no tiene producto: no hay a quién comprárselo.
  select i.value ->> 'codigo' into v_malo
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where nullif(i.value ->> 'producto_id','') is null
     and jsonb_array_length(coalesce(i.value -> 'proveedores', '[]'::jsonb)) > 0
   limit 1;
  if v_malo is not null then
    raise exception '% no está en el catálogo: no se le puede analizar la compra', v_malo
      using errcode = 'check_violation';
  end if;

  -- El mismo proveedor dos veces en una línea es un error de pantalla, y el
  -- unique daría un mensaje que no entiende nadie.
  select i.value ->> 'codigo' into v_malo
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where (select count(*) from jsonb_array_elements(coalesce(i.value -> 'proveedores', '[]'::jsonb)))
      <> (select count(distinct p ->> 'proveedor_id') from jsonb_array_elements(coalesce(i.value -> 'proveedores', '[]'::jsonb)) p)
   limit 1;
  if v_malo is not null then
    raise exception 'En % hay un proveedor repetido', v_malo using errcode = 'check_violation';
  end if;

  insert into cotizacion_item_proveedores (
    cotizacion_item_id, proveedor_id, orden, cantidad, costo_unitario,
    moneda, incluye_igv, tipo_cambio, costo_usd, fecha
  )
  select ci.id,
         (p.value ->> 'proveedor_id')::uuid,
         p.ord::smallint,
         coalesce(nullif(p.value ->> 'cantidad','')::numeric, 0),
         (p.value ->> 'costo_unitario')::numeric,
         coalesce(nullif(p.value ->> 'moneda',''), 'USD'),
         coalesce((p.value ->> 'incluye_igv')::boolean, false),
         case when coalesce(nullif(p.value ->> 'moneda',''), 'USD') = 'PEN'
              then nullif(p.value ->> 'tipo_cambio','')::numeric end,
         round(
           (p.value ->> 'costo_unitario')::numeric
           / case when coalesce(nullif(p.value ->> 'moneda',''), 'USD') = 'PEN'
                  then nullif(nullif(p.value ->> 'tipo_cambio','')::numeric, 0) else 1 end
           / case when coalesce((p.value ->> 'incluye_igv')::boolean, false)
                  then 1 + v_igv / 100.0 else 1 end,
           4),
         coalesce(nullif(p.value ->> 'fecha','')::date, current_date)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as i(value, ord)
    join cotizacion_items ci
      on ci.cotizacion_id = p_cotizacion
     and ci.orden = coalesce(nullif(i.value ->> 'orden','')::int, i.ord)
   cross join lateral jsonb_array_elements(coalesce(i.value -> 'proveedores', '[]'::jsonb))
         with ordinality as p(value, ord);

  -- El costo de la línea: (PC2 × 7 + PC3 × 3) / 10. Las de cantidad 0 son
  -- precios apuntados y no pesan.
  update cotizacion_items ci
     set costo_unitario = round(s.costo, 4)
    from (
      select cip.cotizacion_item_id,
             sum(cip.cantidad * cip.costo_usd) / sum(cip.cantidad) as costo
        from cotizacion_item_proveedores cip
        join cotizacion_items x on x.id = cip.cotizacion_item_id
       where x.cotizacion_id = p_cotizacion and cip.cantidad > 0
       group by cip.cotizacion_item_id
    ) s
   where ci.id = s.cotizacion_item_id;
end $$;

revoke all on function public.guardar_proveedores_de_lineas(uuid, jsonb) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2 · crear_cotizacion: la de la 043, que no estaba, más los proveedores
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
    precio_minimo_ref, entrega, disponibilidad, dias_entrega
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
         end
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    left join productos p on p.id = nullif(i.value ->> 'producto_id','')::uuid
    left join marcas m    on m.id = p.marca_id;

  perform public.guardar_proveedores_de_lineas(v_id, v_items);

  return jsonb_build_object('ok', true, 'id', v_id,
                            'numero', (select numero from cotizaciones where id = v_id));
end $$;

comment on function public.crear_cotizacion(jsonb) is
  'Crea la cotización y sus líneas en una llamada. Guarda la disponibilidad de cada ítem (043, que no llegó a la base hasta la 111) y, desde la 111, a quién se le compraría cada línea y a cuánto.';

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
    disponibilidad, dias_entrega, cantidad_aprobada
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
              else null end
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
-- 4 · Las órdenes de compra, enlazadas a la cotización
-- ---------------------------------------------------------------------------
alter table compras add column if not exists cotizacion_id uuid references cotizaciones(id);
create index if not exists ix_compras_cotizacion on compras (cotizacion_id) where cotizacion_id is not null;
comment on column compras.cotizacion_id is
  'La cotización (y por ella el cliente) para la que se compra (111). Null = compra para stock.';

-- Una orden por proveedor, todas en una transacción. Lo que se compra lo
-- decide quien la genera —el cliente puede confirmar menos de lo cotizado—,
-- pero solo productos de ESA cotización confirmada.
create or replace function public.generar_ordenes_de_compra(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_cot     uuid := nullif(p_datos ->> 'cotizacion_id','')::uuid;
  v_estado  estado_cotizacion;
  v_numero  text;
  v_cliente text;
  v_orden   jsonb;
  v_r       jsonb;
  v_hechas  jsonb := '[]'::jsonb;
  v_malo    text;
begin
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede generar órdenes de compra'
      using errcode = 'insufficient_privilege';
  end if;

  select c.estado, c.numero, cl.razon_social into v_estado, v_numero, v_cliente
    from cotizaciones c join clientes cl on cl.id = c.cliente_id
   where c.id = v_cot;
  if v_estado is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;
  if v_estado not in ('aprobada', 'atendida') then
    raise exception 'Las órdenes de compra salen de una cotización confirmada, y esta está en %', v_estado
      using errcode = 'check_violation';
  end if;
  if jsonb_array_length(coalesce(p_datos -> 'ordenes', '[]'::jsonb)) = 0 then
    raise exception 'No hay nada que comprar' using errcode = 'invalid_parameter_value';
  end if;

  -- Solo productos que la cotización lleva.
  select pr.codigo into v_malo
    from jsonb_array_elements(p_datos -> 'ordenes') o
   cross join lateral jsonb_array_elements(o -> 'items') it
    join productos pr on pr.id = (it ->> 'producto_id')::uuid
   where not exists (
     select 1 from cotizacion_items ci
      where ci.cotizacion_id = v_cot and ci.producto_id = pr.id
   )
   limit 1;
  if v_malo is not null then
    raise exception '% no está en la cotización %', v_malo, v_numero
      using errcode = 'check_violation';
  end if;

  -- Ni dos veces lo mismo al mismo proveedor para la misma cotización.
  select pr.codigo || ' a ' || pv.razon_social || ' (' || c.numero || ')' into v_malo
    from jsonb_array_elements(p_datos -> 'ordenes') o
   cross join lateral jsonb_array_elements(o -> 'items') it
    join compras c on c.cotizacion_id = v_cot and c.estado <> 'anulada'
                  and c.proveedor_id = (o ->> 'proveedor_id')::uuid
    join compra_items ci on ci.compra_id = c.id and ci.producto_id = (it ->> 'producto_id')::uuid
    join productos pr on pr.id = ci.producto_id
    join proveedores pv on pv.id = c.proveedor_id
   limit 1;
  if v_malo is not null then
    raise exception 'Ya se le pidió %', v_malo using errcode = 'check_violation';
  end if;

  for v_orden in select * from jsonb_array_elements(p_datos -> 'ordenes') loop
    v_r := public.crear_compra(jsonb_build_object(
      'proveedor_id', v_orden ->> 'proveedor_id',
      'tipo', 'local',
      'moneda', coalesce(nullif(v_orden ->> 'moneda',''), 'USD'),
      'tipo_cambio', v_orden ->> 'tipo_cambio',
      'afecto_igv', true,
      'observaciones', 'Para ' || v_numero || ' · ' || v_cliente,
      'items', v_orden -> 'items'
    ));
    update compras set cotizacion_id = v_cot where id = (v_r ->> 'id')::uuid;
    v_hechas := v_hechas || jsonb_build_array(jsonb_build_object('id', v_r ->> 'id', 'numero', v_r ->> 'numero'));
  end loop;

  return jsonb_build_object('ok', true, 'ordenes', v_hechas);
end $$;

revoke all on function public.generar_ordenes_de_compra(jsonb) from public;
grant execute on function public.generar_ordenes_de_compra(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Centinela: se EJECUTA todo y se deshace (CLAUDE.md §2, «la variante cara»)
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid; p2 uuid;
  v1 uuid; v2 uuid; v3 uuid;
  r jsonb;
  v_id uuid;
  n int;
  c numeric;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  select id into p2 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id <> p1 order by codigo limit 1;
  select id into v1 from proveedores where activo order by razon_social limit 1;
  select id into v2 from proveedores where activo and id <> v1 order by razon_social limit 1;
  select id into v3 from proveedores where activo and id not in (v1, v2) order by razon_social limit 1;

  if v_usuario is null or v_cliente is null or p2 is null or v3 is null then
    raise notice '111: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    -- La hoja de Willy: p1 a un solo proveedor; p2, 7 a uno y 3 a otro, y un
    -- tercero que solo da precio.
    r := public.crear_cotizacion(jsonb_build_object(
      'cliente_id', v_cliente, 'validez_dias', 15, 'mostrar_disponibilidad', true,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 8, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0,
          'disponibilidad', 'exterior', 'dias_entrega', 20,
          'proveedores', jsonb_build_array(
            jsonb_build_object('proveedor_id', v1, 'cantidad', 8, 'costo_unitario', 5))),
        jsonb_build_object('producto_id', p2, 'orden', 2, 'codigo', 'X2', 'descripcion', 'dos',
          'cantidad', 10, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0,
          'proveedores', jsonb_build_array(
            jsonb_build_object('proveedor_id', v2, 'cantidad', 7, 'costo_unitario', 10),
            -- 3 a S/ 49.56 con IGV y TC 3.50 = 49.56 / 3.5 / 1.18 = $ 12.00
            jsonb_build_object('proveedor_id', v3, 'cantidad', 3, 'costo_unitario', 49.56,
              'moneda', 'PEN', 'tipo_cambio', 3.5, 'incluye_igv', true),
            jsonb_build_object('proveedor_id', v1, 'cantidad', 0, 'costo_unitario', 11))))));
    v_id := (r ->> 'id')::uuid;

    if (select disponibilidad from cotizacion_items where cotizacion_id = v_id and orden = 1) <> 'exterior'
       or not (select mostrar_disponibilidad from cotizaciones where id = v_id) then
      raise exception '111: crear_cotizacion sigue perdiendo la disponibilidad';
    end if;

    -- 49.56 / 3.5 / 1.18 = 12.00 → (7 × 10 + 3 × 12) / 10 = 10.60
    select costo_unitario into c from cotizacion_items where cotizacion_id = v_id and orden = 2;
    if c <> 10.6 then raise exception '111: el costo ponderado salió % y no 10.60', c; end if;
    select costo_unitario into c from cotizacion_items where cotizacion_id = v_id and orden = 1;
    if c <> 5 then raise exception '111: el costo de un solo proveedor salió % y no 5', c; end if;
    select count(*) into n from cotizacion_item_proveedores cip
      join cotizacion_items ci on ci.id = cip.cotizacion_item_id where ci.cotizacion_id = v_id;
    if n <> 4 then raise exception '111: esperaba 4 proveedores guardados y hay %', n; end if;

    -- Editar: p2 se queda con un solo proveedor; los proveedores vuelven con
    -- la línea y su fecha.
    perform public.actualizar_cotizacion(jsonb_build_object(
      'id', v_id, 'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
          'cantidad', 8, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 5,
          'proveedores', jsonb_build_array(
            jsonb_build_object('proveedor_id', v1, 'cantidad', 8, 'costo_unitario', 5, 'fecha', '2026-01-02'))),
        jsonb_build_object('producto_id', p2, 'orden', 2, 'codigo', 'X2', 'descripcion', 'dos',
          'cantidad', 10, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0,
          'proveedores', jsonb_build_array(
            jsonb_build_object('proveedor_id', v2, 'cantidad', 12, 'costo_unitario', 9))))));

    select costo_unitario into c from cotizacion_items where cotizacion_id = v_id and orden = 2;
    if c <> 9 then raise exception '111: tras editar, el costo salió % y no 9', c; end if;
    if (select cip.fecha from cotizacion_item_proveedores cip
          join cotizacion_items ci on ci.id = cip.cotizacion_item_id
         where ci.cotizacion_id = v_id and ci.orden = 1) <> date '2026-01-02' then
      raise exception '111: editar le cambió la fecha a un precio viejo';
    end if;

    -- Confirmada: las órdenes de compra.
    perform public.aprobar_cotizacion(v_id, null::jsonb);

    r := public.generar_ordenes_de_compra(jsonb_build_object(
      'cotizacion_id', v_id,
      'ordenes', jsonb_build_array(
        jsonb_build_object('proveedor_id', v1, 'moneda', 'USD', 'items', jsonb_build_array(
          jsonb_build_object('producto_id', p1, 'cantidad', 8, 'costo_unitario', 5))),
        jsonb_build_object('proveedor_id', v2, 'moneda', 'USD', 'items', jsonb_build_array(
          jsonb_build_object('producto_id', p2, 'cantidad', 12, 'costo_unitario', 9))))));
    if (select count(*) from compras where cotizacion_id = v_id) <> 2 then
      raise exception '111: esperaba 2 órdenes de compra enlazadas';
    end if;

    -- La segunda vez, lo mismo al mismo proveedor, se rechaza.
    begin
      perform public.generar_ordenes_de_compra(jsonb_build_object(
        'cotizacion_id', v_id,
        'ordenes', jsonb_build_array(
          jsonb_build_object('proveedor_id', v1, 'moneda', 'USD', 'items', jsonb_build_array(
            jsonb_build_object('producto_id', p1, 'cantidad', 1, 'costo_unitario', 5))))));
      raise exception '111: dejó pedir dos veces lo mismo';
    exception when check_violation then null;
    end;

    raise exception '__111_DESHACER__';
  exception when others then
    if sqlerrm <> '__111_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '111: costo ponderado, proveedores al editar, disponibilidad y órdenes de compra; deshecho limpio.';
end $$;
