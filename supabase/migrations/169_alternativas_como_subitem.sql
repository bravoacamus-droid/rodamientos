-- ###########################################################################
-- 169 · LA ALTERNATIVA SE AÑADE COMO SUB-ÍTEM (1.1, 1.2…)
-- ###########################################################################
--
-- El problema. En el constructor, «Alternativas» de una línea ofrecía «Usar
-- esta», que REEMPLAZABA el producto. Luis, 28/10, lo quiere al revés: que la
-- alternativa se AÑADA, numerada debajo de la línea de la que sale:
--
--   «la idea es que se añada como ítem pero no con el número siguiente: ítem
--   1 AS202; si tiene una alternativa, me deja agregarla, pero sería ítem
--   1.1, no 2. Si tiene más alternativas va creciendo: 1.2… Solo si es
--   producto nuevo sí es 2, y si tiene alternativas, 2.1».
--
-- Y sobre el total: «suman todos, porque si están pidiendo alternativas
-- también van a comprar; se añaden como un producto normal, solo lo que
-- cambia en el ítem es que se pone como 1.1, 1.2».
--
-- O sea: una alternativa es una línea NORMAL en todo —cantidad, precio,
-- costo, análisis, entrega, nota, suma al total, se aprueba, va al pedido, a
-- la guía y a la factura—. Lo único que cambia es el número que lleva en la
-- cotización. La guía y la factura no cambian: SUNAT exige ítems enteros y
-- correlativos.
--
-- La solución:
--
--   1. `cotizacion_items.alternativa_de`: la línea de la que sale. Un solo
--      nivel: una alternativa de una alternativa cuelga del mismo principal.
--
--      `on delete set null`, y no cascade: si se quita el principal, sus
--      alternativas se quedan como ítems normales y se renumeran (1.1 pasa a
--      ser 1 o 2, según lo que haya). Borrar en cascada se llevaría productos
--      que el cliente pidió, y eso no lo decide quien quita otra línea.
--
--   2. Guardar y editar borran y reinsertan las líneas (069), así que un id
--      no sobrevive. El vínculo viaja por POSICIÓN —`alternativa_de_orden` en
--      el payload, el `orden` del principal— y lo resuelve aquí
--      `enlazar_alternativas`, como ya resuelve `guardar_proveedores_de_lineas`
--      los proveedores de cada línea (111). Lo llaman `crear_cotizacion`
--      (también al clonar) y `actualizar_cotizacion`. Son las dos únicas
--      funciones que escriben líneas; aprobar, corregir lo confirmado y
--      repetir el pedido actualizan las que hay, y el vínculo se queda.
--
--   3. El enlace público (`cotizacion_por_token`) devuelve también
--      `alternativa_de_orden`, para numerar igual que el papel. Es una
--      posición, no un id ni un costo.
--
--   4. `detalle_cotizaciones` (el Excel) devuelve `orden` y
--      `alternativa_de_orden`, por lo mismo. Cambia lo que devuelve, así que
--      se borra y se crea (un `create or replace` no puede).
--
-- La numeración en sí (1, 1.1, 1.2, 2…) NO está aquí: es una función pura
-- de la pantalla (`cotizaciones/dominio/numeracion.ts`), con sus pruebas, y
-- la usan el constructor, la ficha, el papel, /ver, el Excel y la hoja de
-- pedido.
-- ###########################################################################

alter table cotizacion_items
  add column if not exists alternativa_de uuid null
    references cotizacion_items(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cotiz_item_alternativa_no_propia') then
    alter table cotizacion_items
      add constraint cotiz_item_alternativa_no_propia check (alternativa_de is null or alternativa_de <> id);
  end if;
end $$;

create index if not exists idx_cotiz_items_alternativa_de
  on cotizacion_items(alternativa_de) where alternativa_de is not null;

comment on column cotizacion_items.alternativa_de is
  'La línea de la que esta es alternativa (169). Solo cambia el número de ítem en la cotización (1.1, 1.2…); en todo lo demás es una línea normal. Null = ítem principal.';


-- ---------------------------------------------------------------------------
-- enlazar_alternativas: el vínculo por posición, resuelto tras insertar
-- ---------------------------------------------------------------------------
create or replace function public.enlazar_alternativas(p_cotizacion uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_malo text;
begin
  -- Lo que pide el payload: cada línea con su orden y, si es alternativa, el
  -- orden de su principal. Una alternativa de una alternativa sube un nivel:
  -- cuelga del principal de aquella.
  --
  -- Tiene que apuntar a una línea que está, que va ANTES y que es principal.
  -- Es lo que la pantalla garantiza; si llega otra cosa es un error, y se dice
  -- con el código de la línea, no con un fallo de clave ajena.
  with pedido as (
    select coalesce(nullif(i.value ->> 'orden','')::int, i.ord::int) as orden,
           i.value ->> 'codigo' as codigo,
           nullif(i.value ->> 'alternativa_de_orden','')::int as de
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as i(value, ord)
  ), resuelto as (
    select a.orden, a.codigo, coalesce(b.de, a.de) as de
      from pedido a
      left join pedido b on b.orden = a.de
     where a.de is not null
  )
  select r.codigo into v_malo
    from resuelto r
    left join pedido p on p.orden = r.de
   where p.orden is null or p.de is not null or r.de >= r.orden
   limit 1;

  if v_malo is not null then
    raise exception '% es una alternativa de una línea que no está antes que ella', v_malo
      using errcode = 'check_violation';
  end if;

  with pedido as (
    select coalesce(nullif(i.value ->> 'orden','')::int, i.ord::int) as orden,
           nullif(i.value ->> 'alternativa_de_orden','')::int as de
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as i(value, ord)
  ), resuelto as (
    select a.orden, coalesce(b.de, a.de) as de
      from pedido a
      left join pedido b on b.orden = a.de
     where a.de is not null
  )
  update cotizacion_items ci
     set alternativa_de = p.id
    from resuelto r
    join cotizacion_items p
      on p.cotizacion_id = p_cotizacion and p.orden = r.de
   where ci.cotizacion_id = p_cotizacion
     and ci.orden = r.orden
     and ci.alternativa_de is distinct from p.id;
end $$;

comment on function public.enlazar_alternativas(uuid, jsonb) is
  'Pone cotizacion_items.alternativa_de a partir de alternativa_de_orden del payload (169). La llaman crear_cotizacion y actualizar_cotizacion, después de insertar las líneas.';

-- Solo por dentro de las dos funciones que escriben líneas.
revoke all on function public.enlazar_alternativas(uuid, jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- crear_cotizacion y actualizar_cotizacion: una línea más, con ancla
-- ---------------------------------------------------------------------------
-- Se parchean sobre la versión viva, como la 168, para no pisar lo que otra
-- migración les haya añadido (152 en crear, 114 en actualizar).
do $$
declare
  v_def   text;
  v_ancla text;
begin
  -- crear
  v_def := replace(pg_get_functiondef('public.crear_cotizacion(jsonb)'::regprocedure), E'\r\n', E'\n');
  if position('enlazar_alternativas' in v_def) = 0 then
    v_ancla := 'perform public.guardar_proveedores_de_lineas(v_id, v_items);';
    if position(v_ancla in v_def) = 0 then
      raise exception '169: no encuentro el ancla «%» en crear_cotizacion', v_ancla;
    end if;
    v_def := replace(v_def, v_ancla,
      E'-- 169: qué línea es alternativa de cuál, por posición.\n'
      || E'  perform public.enlazar_alternativas(v_id, v_items);\n\n  '
      || v_ancla);
    execute v_def;
  end if;

  -- actualizar
  v_def := replace(pg_get_functiondef('public.actualizar_cotizacion(jsonb)'::regprocedure), E'\r\n', E'\n');
  if position('enlazar_alternativas' in v_def) = 0 then
    v_ancla := 'perform public.guardar_proveedores_de_lineas(v_id, p_datos -> ''items'');';
    if position(v_ancla in v_def) = 0 then
      raise exception '169: no encuentro el ancla «%» en actualizar_cotizacion', v_ancla;
    end if;
    v_def := replace(v_def, v_ancla,
      E'-- 169: el vínculo se pierde al borrar y reinsertar; vuelve por posición.\n'
      || E'  perform public.enlazar_alternativas(v_id, p_datos -> ''items'');\n\n  '
      || v_ancla);
    execute v_def;
  end if;

  -- El enlace público: la posición del principal, junto a la de la línea.
  v_def := replace(pg_get_functiondef('public.cotizacion_por_token(text)'::regprocedure), E'\r\n', E'\n');
  if position('alternativa_de_orden' in v_def) = 0 then
    v_ancla := '''dias_entrega'',   ci.dias_entrega';
    if position(v_ancla in v_def) = 0 then
      raise exception '169: no encuentro el ancla «%» en cotizacion_por_token', v_ancla;
    end if;
    v_def := replace(v_def, v_ancla,
      v_ancla || E',\n          -- 169: de qué línea es alternativa, por posición (1.1, 1.2…).\n'
      || E'          ''alternativa_de_orden'', (select a.orden from cotizacion_items a where a.id = ci.alternativa_de)');
    execute v_def;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- detalle_cotizaciones (el Excel): con la posición de la línea y su principal
-- ---------------------------------------------------------------------------
drop function if exists public.detalle_cotizaciones(date, date, uuid);

create function public.detalle_cotizaciones(
  p_desde   date,
  p_hasta   date,
  p_cliente uuid default null
)
returns table (
  fecha date,
  numero text,
  estado text,
  vence date,
  cliente text,
  documento text,
  vendedor text,
  codigo text,
  descripcion text,
  marca text,
  familia text,
  subfamilia text,
  unidad text,
  cantidad numeric,
  valor_unitario numeric,
  descuento_pct numeric,
  importe numeric,
  cantidad_aprobada numeric,
  entrega text,
  orden smallint,
  alternativa_de_orden smallint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.fecha,
         c.numero,
         -- El mismo estado que el tablero (104): enviada con la validez pasada
         -- es vencida; atendida es una aprobada que ya salió.
         case
           when c.estado = 'enviada' and c.fecha_vencimiento < current_date then 'vencida'
           else c.estado::text
         end,
         c.fecha_vencimiento,
         cl.razon_social,
         cl.numero_documento,
         pf.nombre,
         ci.codigo,
         ci.descripcion,
         coalesce(nullif(trim(ci.marca), ''), m.nombre),
         f.nombre,
         sf.nombre,
         ci.unidad_codigo,
         ci.cantidad,
         ci.valor_unitario,
         ci.descuento_pct,
         ci.importe,
         ci.cantidad_aprobada,
         ci.entrega,
         -- 169: para numerar 1, 1.1, 1.2… igual que el papel.
         ci.orden,
         pr.orden
    from cotizacion_items ci
    join cotizaciones c  on c.id = ci.cotizacion_id
    join clientes cl     on cl.id = c.cliente_id
    left join cotizacion_items pr on pr.id = ci.alternativa_de
    left join perfiles pf    on pf.id = c.vendedor_id
    left join productos p    on p.id = ci.producto_id
    left join marcas m       on m.id = p.marca_id
    left join familias f     on f.id = p.familia_id
    left join subfamilias sf on sf.id = p.subfamilia_id
   where c.fecha between p_desde and p_hasta
     and c.estado <> 'anulada'
     and (p_cliente is null or c.cliente_id = p_cliente)
   order by c.fecha, c.numero, ci.orden;
$$;

comment on function public.detalle_cotizaciones(date, date, uuid) is
  'Detalle línea a línea de lo cotizado para exportar a Excel (105). Sin las anuladas. Con orden y alternativa_de_orden para el número de ítem (169).';

revoke all on function public.detalle_cotizaciones(date, date, uuid) from public, anon;
grant execute on function public.detalle_cotizaciones(date, date, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Centinela: se EJECUTA todo, en COT1, y se deshace
-- ---------------------------------------------------------------------------
-- Una cotización con un principal, dos alternativas (la segunda pedida como
-- alternativa de la primera, que tiene que subir al principal) y un ítem
-- normal. Se guarda, se reedita dos veces —la segunda sin el principal— y se
-- mira el vínculo, el total, el enlace público y el Excel. Al final, la serie
-- tiene que quedar idéntica: el correlativo que gastó vuelve con el rollback.
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  r jsonb;
  v_id uuid;
  v_principal uuid;
  v_json jsonb;
  v_sobran text;
  v_series_antes jsonb;
  v_series_despues jsonb;
  v_n int;
  v_fallo boolean;
  v_linea text[] := array[
    'orden', 'codigo', 'marca', 'descripcion', 'nota', 'cantidad', 'unidad_codigo',
    'valor_unitario', 'descuento_pct', 'disponibilidad', 'dias_entrega',
    'alternativa_de_orden'
  ];
  v_items jsonb;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  select id into p2 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id <> p1 order by codigo limit 1;
  select id into p3 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id not in (p1, p2) order by codigo limit 1;
  select id into p4 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 and id not in (p1, p2, p3) order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p4 is null then
    raise exception '169: faltan datos para el centinela (usuario, cliente o cuatro productos)';
  end if;

  select jsonb_agg(to_jsonb(s) order by s.tipo, s.serie) into v_series_antes from series_documento s;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    v_items := jsonb_build_array(
      jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'P1', 'descripcion', 'principal',
        'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0),
      jsonb_build_object('producto_id', p2, 'orden', 2, 'codigo', 'A1', 'descripcion', 'alternativa uno',
        'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 20, 'costo_unitario', 0,
        'alternativa_de_orden', 1),
      -- Pedida como alternativa de la alternativa: tiene que colgar del 1.
      jsonb_build_object('producto_id', p3, 'orden', 3, 'codigo', 'A2', 'descripcion', 'alternativa dos',
        'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 30, 'costo_unitario', 0,
        'alternativa_de_orden', 2),
      jsonb_build_object('producto_id', p4, 'orden', 4, 'codigo', 'N2', 'descripcion', 'otro producto',
        'cantidad', 1, 'unidad_codigo', 'NIU', 'valor_unitario', 5, 'costo_unitario', 0));

    r := public.crear_cotizacion(jsonb_build_object(
      'serie', 'COT1', 'cliente_id', v_cliente, 'validez_dias', 15, 'items', v_items));
    v_id := (r ->> 'id')::uuid;
    if (r ->> 'numero') not like 'COT1-%' then
      raise exception '169: el centinela tenía que crear en COT1 y creó %', r ->> 'numero';
    end if;

    -- 1 · Al crear.
    select id into v_principal from cotizacion_items where cotizacion_id = v_id and orden = 1;
    select count(*) into v_n from cotizacion_items
     where cotizacion_id = v_id and orden in (2, 3) and alternativa_de = v_principal;
    if v_n <> 2 then
      raise exception '169: al crear, las dos alternativas no cuelgan del principal (%)', v_n;
    end if;
    if exists (select 1 from cotizacion_items where cotizacion_id = v_id and orden in (1, 4) and alternativa_de is not null) then
      raise exception '169: al crear, el principal o el ítem normal salen como alternativa';
    end if;
    -- Suman todas: 2×10 + 2×20 + 2×30 + 1×5 = 125.
    if (select subtotal from cotizaciones where id = v_id) <> 125 then
      raise exception '169: el subtotal no suma las alternativas: %', (select subtotal from cotizaciones where id = v_id);
    end if;

    -- 2 · Reeditar: borra y reinserta. El vínculo tiene que volver.
    v_items := jsonb_set(v_items, '{0,cantidad}', '3'::jsonb);
    perform public.actualizar_cotizacion(jsonb_build_object(
      'id', v_id, 'cliente_id', v_cliente, 'validez_dias', 15, 'items', v_items));
    select id into v_principal from cotizacion_items where cotizacion_id = v_id and orden = 1;
    select count(*) into v_n from cotizacion_items
     where cotizacion_id = v_id and orden in (2, 3) and alternativa_de = v_principal;
    if v_n <> 2 then
      raise exception '169: al editar, el vínculo no sobrevive a la reinserción (%)', v_n;
    end if;
    if (select subtotal from cotizaciones where id = v_id) <> 135 then
      raise exception '169: tras editar, el subtotal no es 135: %', (select subtotal from cotizaciones where id = v_id);
    end if;

    -- 3 · El enlace público: la posición del principal, y nada que no vaya
    --     en el papel.
    select public.cotizacion_por_token(token_publico) into v_json from cotizaciones where id = v_id;
    if (v_json -> 'lineas' -> 1 ->> 'alternativa_de_orden')::int is distinct from 1
       or (v_json -> 'lineas' -> 2 ->> 'alternativa_de_orden')::int is distinct from 1
       or v_json -> 'lineas' -> 0 -> 'alternativa_de_orden' <> 'null'::jsonb then
      raise exception '169: el enlace público no lleva bien de qué línea es alternativa: %', v_json -> 'lineas';
    end if;
    select string_agg(k, ', ') into v_sobran
      from jsonb_array_elements(v_json -> 'lineas') as l(v), jsonb_object_keys(l.v) as k
     where k <> all (v_linea);
    if v_sobran is not null then
      raise exception '169: el enlace público devuelve en las líneas campos que el cliente no debe ver: %', v_sobran;
    end if;

    -- 4 · El Excel.
    select count(*) into v_n
      from public.detalle_cotizaciones(current_date - 1, current_date + 1, v_cliente) d
     where d.numero = r ->> 'numero' and d.alternativa_de_orden = 1 and d.orden in (2, 3);
    if v_n <> 2 then
      raise exception '169: detalle_cotizaciones no devuelve la posición del principal (%)', v_n;
    end if;

    -- 5 · Una alternativa que apunta hacia delante o a sí misma, no.
    v_fallo := false;
    begin
      perform public.actualizar_cotizacion(jsonb_build_object(
        'id', v_id, 'cliente_id', v_cliente, 'validez_dias', 15,
        'items', jsonb_set(v_items, '{0,alternativa_de_orden}', '4'::jsonb)));
    exception when check_violation then
      v_fallo := true;
    end;
    if not v_fallo then
      raise exception '169: aceptó una alternativa de una línea que va después';
    end if;

    -- 6 · Sin el principal, las alternativas pasan a ser ítems normales.
    perform public.actualizar_cotizacion(jsonb_build_object(
      'id', v_id, 'cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(
        (v_items -> 1) - 'alternativa_de_orden' || '{"orden": 1}'::jsonb,
        (v_items -> 2) - 'alternativa_de_orden' || '{"orden": 2}'::jsonb,
        (v_items -> 3) || '{"orden": 3}'::jsonb)));
    if exists (select 1 from cotizacion_items where cotizacion_id = v_id and alternativa_de is not null) then
      raise exception '169: sin el principal, quedó alguna línea como alternativa';
    end if;
    if (select subtotal from cotizaciones where id = v_id) <> 105 then
      raise exception '169: sin el principal, el subtotal no es 105: %', (select subtotal from cotizaciones where id = v_id);
    end if;

    raise exception '__169_DESHACER__';
  exception when others then
    if sqlerrm <> '__169_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);

  select jsonb_agg(to_jsonb(s) order by s.tipo, s.serie) into v_series_despues from series_documento s;
  if v_series_despues is distinct from v_series_antes then
    raise exception '169: series_documento no quedó idéntica tras el centinela';
  end if;
  if exists (select 1 from cotizaciones where id = v_id) then
    raise exception '169: la cotización del centinela no se deshizo';
  end if;

  raise notice '169: alternativas como sub-ítem — crear, editar, enlace y Excel; deshecho limpio.';
end $$;
