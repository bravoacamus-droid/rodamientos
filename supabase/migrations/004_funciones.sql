-- ============================================================================
-- RODATECH ERP v2 · 003 · Funciones de negocio
-- ----------------------------------------------------------------------------
-- Regla del archivo: TODA función es `security definer set search_path`.
-- Regla de diseño: las operaciones que la UI hace sobre N líneas reciben
-- `jsonb` y resuelven el lote entero en UNA llamada. La demo hacía un rpc por
-- ítem al emitir, por línea al recibir y por fila pegada desde Excel; con
-- 2.000+ SKU eso es inusable (PLAN-V2 §1.3).
-- ============================================================================

set search_path = public, extensions;

-- ###########################################################################
-- 1. IDENTIDAD Y PERMISOS
-- ###########################################################################

create or replace function public.mi_rol()
returns rol_usuario
language sql stable security definer set search_path = public, extensions
as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create or replace function public.tiene_rol(variadic p_roles text[])
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(
    (select rol::text = any(p_roles) from perfiles where id = auth.uid() and activo),
    false)
$$;

comment on function public.tiene_rol(variadic text[]) is
  'Patrón heredado de la demo: la autorización se decide en Postgres, no en el cliente. security definer para poder leer `perfiles` con RLS activo.';

create or replace function public.es_gerencia()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select public.tiene_rol('gerencia','admin') $$;

-- Corazón del RLS declarativo: la política pregunta "¿este rol escribe esta
-- tabla?" y la respuesta está en datos, no en DDL.
create or replace function public.puede_escribir(p_tabla text)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1
    from permisos_rol pr
    join perfiles p on p.id = auth.uid() and p.activo
    where pr.tabla = p_tabla
      and pr.rol = p.rol
      and pr.escribir
  )
$$;

comment on function public.puede_escribir(text) is
  'Consulta la matriz declarativa permisos_rol. Cambiar quién escribe qué no requiere ALTER POLICY.';

-- Alta de perfil al crear el usuario en auth.
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into public.perfiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'rol')::rol_usuario, 'ventas')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_usuario_nuevo on auth.users;
create trigger trg_usuario_nuevo
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- ###########################################################################
-- 2. CORRELATIVOS
-- ###########################################################################

-- Reserva atómica. `greatest(actual + 1, inicial)` es lo que implementa
-- "los correlativos van a iniciar desde el número que usted se quedó" (06:08):
-- basta con cargar correlativo_inicial y el sistema continúa la numeración.
create or replace function public.siguiente_correlativo(p_tipo tipo_documento, p_serie text default null)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_next integer;
begin
  update series_documento
     set correlativo_actual = greatest(correlativo_actual + 1, correlativo_inicial)
   where tipo = p_tipo
     and activo
     and (serie = p_serie or (p_serie is null and predeterminada))
  returning correlativo_actual into v_next;

  if v_next is null then
    raise exception 'No hay serie activa % para el documento %', coalesce(p_serie,'(predeterminada)'), p_tipo
      using errcode = 'no_data_found';
  end if;
  return v_next;
end $$;

-- Numeración de documentos internos que no llevan serie fiscal
-- (compras, recepciones, ajustes): PREFIJO-AA-00001.
create or replace function public.siguiente_numero_interno(p_tipo tipo_documento)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_prefijo text := case p_tipo
    when 'compra'            then 'CMP'
    when 'recepcion'         then 'REC'
    when 'ajuste_inventario' then 'AJU'
    else upper(left(p_tipo::text, 3)) end;
  v_correlativo integer;
begin
  insert into series_documento (tipo, serie, correlativo_inicial, correlativo_actual, longitud, predeterminada, descripcion)
  values (p_tipo, v_prefijo, 1, 0, 5, true, 'Serie interna autogenerada')
  on conflict (tipo, serie) do nothing;

  v_correlativo := public.siguiente_correlativo(p_tipo, v_prefijo);
  return v_prefijo || '-' || to_char(current_date, 'YY') || '-' || lpad(v_correlativo::text, 5, '0');
end $$;

-- ###########################################################################
-- 3. KARDEX · costo promedio ponderado, POR LOTE
-- ###########################################################################

-- Contrato del jsonb (array de objetos):
--   [{ "producto_id": uuid, "tipo": "ingreso|salida|ajuste_positivo|ajuste_negativo",
--      "cantidad": number, "costo_unitario": number|null,
--      "referencia_tipo": text|null, "referencia_id": uuid|null,
--      "referencia_numero": text|null, "motivo": text|null, "fecha": timestamptz|null }]
--
-- El orden del array ES significativo: el costo promedio depende de la
-- secuencia. Por eso se recorre con `with ordinality`.
create or replace function public.registrar_movimientos(
  p_movimientos jsonb,
  p_usuario     uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_fila          jsonb;
  v_producto      uuid;
  v_tipo          tipo_movimiento;
  v_cantidad      numeric(14,2);
  v_costo_in      numeric(14,4);
  v_signo         smallint;
  v_prev_cant     numeric(14,2);
  v_prev_val      numeric(16,4);
  v_costo_mov     numeric(14,4);
  v_new_cant      numeric(14,2);
  v_new_val       numeric(16,4);
  v_costo_prom    numeric(14,4);
  v_id            bigint;
  v_ids           bigint[] := '{}';
  v_usuario       uuid := coalesce(p_usuario, auth.uid());
begin
  if p_movimientos is null or jsonb_typeof(p_movimientos) <> 'array' then
    raise exception 'registrar_movimientos espera un array jsonb' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_movimientos) = 0 then
    return jsonb_build_object('movimientos', 0, 'ids', '[]'::jsonb);
  end if;

  -- Garantiza la fila de saldo y la bloquea. El `order by` sobre el conjunto
  -- de productos evita deadlocks cuando dos lotes tocan los mismos SKU.
  insert into stock (producto_id)
  select distinct (m ->> 'producto_id')::uuid
  from jsonb_array_elements(p_movimientos) m
  on conflict (producto_id) do nothing;

  perform 1
  from stock s
  where s.producto_id in (
    select distinct (m ->> 'producto_id')::uuid from jsonb_array_elements(p_movimientos) m
  )
  order by s.producto_id
  for update;

  for v_fila in
    select value from jsonb_array_elements(p_movimientos) with ordinality as t(value, i) order by t.i
  loop
    v_producto := (v_fila ->> 'producto_id')::uuid;
    v_tipo     := (v_fila ->> 'tipo')::tipo_movimiento;
    v_cantidad := round((v_fila ->> 'cantidad')::numeric, 2);
    v_costo_in := nullif(v_fila ->> 'costo_unitario', '')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida (%) para el producto %', v_cantidad, v_producto
        using errcode = 'check_violation';
    end if;

    select s.cantidad, s.valorizado into v_prev_cant, v_prev_val
      from stock s where s.producto_id = v_producto;

    v_signo := case when v_tipo in ('ingreso','ajuste_positivo') then 1 else -1 end;

    -- Costo del movimiento: el declarado en la entrada; en la salida, el
    -- promedio vigente (que es la definición de promedio ponderado).
    v_costo_prom := case when v_prev_cant > 0 then v_prev_val / v_prev_cant else 0 end;
    v_costo_mov  := coalesce(
      v_costo_in,
      nullif(v_costo_prom, 0),
      (select p.costo_promedio from productos p where p.id = v_producto),
      0);

    v_new_cant := v_prev_cant + (v_signo * v_cantidad);
    v_new_val  := v_prev_val  + (v_signo * v_cantidad * v_costo_mov);

    -- Si el saldo se agota o queda negativo, el valorizado no puede quedar
    -- con residuo: se recuesta a cero y el promedio conserva el último válido.
    if v_new_cant <= 0 then
      v_new_val := 0;
    else
      v_costo_prom := v_new_val / v_new_cant;
    end if;

    insert into movimientos_inventario (
      fecha, producto_id, tipo, cantidad, costo_unitario,
      saldo_cantidad, saldo_valorizado, costo_promedio,
      referencia_tipo, referencia_id, referencia_numero, motivo, usuario_id
    ) values (
      coalesce(nullif(v_fila ->> 'fecha','')::timestamptz, now()),
      v_producto, v_tipo, v_cantidad, v_costo_mov,
      v_new_cant, v_new_val, v_costo_prom,
      nullif(v_fila ->> 'referencia_tipo',''),
      nullif(v_fila ->> 'referencia_id','')::uuid,
      nullif(v_fila ->> 'referencia_numero',''),
      nullif(v_fila ->> 'motivo',''),
      v_usuario
    ) returning id into v_id;

    v_ids := v_ids || v_id;

    update stock
       set cantidad = v_new_cant,
           valorizado = v_new_val,
           costo_promedio = v_costo_prom,
           actualizado_en = now()
     where producto_id = v_producto;

    -- Denormalización deliberada: `productos.costo_promedio` y `ultimo_costo`
    -- se replican para poder listar y ordenar el catálogo sin join al stock.
    update productos
       set costo_promedio = case when v_new_cant > 0 then v_costo_prom else costo_promedio end,
           ultimo_costo   = case when v_signo = 1 then v_costo_mov else ultimo_costo end,
           actualizado_en = now()
     where id = v_producto;
  end loop;

  return jsonb_build_object(
    'movimientos', array_length(v_ids, 1),
    'ids', to_jsonb(v_ids)
  );
end $$;

comment on function public.registrar_movimientos(jsonb, uuid) is
  'Kardex por LOTE: 50 líneas pegadas desde Excel = 1 round-trip. Sustituye el rpc-por-ítem de la demo. El orden del array es semántico porque el promedio ponderado depende de la secuencia.';

-- Conveniencia para el caso de una sola línea. Delega en la versión por lote:
-- una sola implementación del promedio ponderado, no dos que se desincronicen.
create or replace function public.registrar_movimiento(
  p_producto        uuid,
  p_tipo            tipo_movimiento,
  p_cantidad        numeric,
  p_costo           numeric default null,
  p_referencia_tipo text default null,
  p_referencia_id   uuid default null,
  p_referencia_numero text default null,
  p_motivo          text default null,
  p_usuario         uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_res jsonb;
begin
  v_res := public.registrar_movimientos(
    jsonb_build_array(jsonb_build_object(
      'producto_id', p_producto, 'tipo', p_tipo, 'cantidad', p_cantidad,
      'costo_unitario', p_costo, 'referencia_tipo', p_referencia_tipo,
      'referencia_id', p_referencia_id, 'referencia_numero', p_referencia_numero,
      'motivo', p_motivo)),
    p_usuario);
  return ((v_res -> 'ids') ->> 0)::bigint;
end $$;

-- ###########################################################################
-- 4. RECEPCIÓN DE MERCADERÍA · aquí se mueve el stock (25:21)
-- ###########################################################################

-- {"compra_id":uuid|null, "proveedor_id":uuid|null, "fecha":date,
--  "guia_proveedor":text, "factura_proveedor":text, "observaciones":text,
--  "items":[{"producto_id":uuid,"cantidad":n,"costo_unitario":n}]}
create or replace function public.recepcionar_mercaderia(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_recepcion uuid;
  v_numero    text;
  v_compra    uuid := nullif(p_datos ->> 'compra_id','')::uuid;
  v_items     jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_gastos    numeric(14,2) := 0;
  v_base      numeric(14,2) := 0;
  v_factor    numeric(12,6) := 1;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y recepcionar mercadería
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('recepciones') then
    raise exception 'Tu rol no puede recepcionar mercadería'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La recepción no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  v_numero := public.siguiente_numero_interno('recepcion');

  insert into recepciones (numero, compra_id, proveedor_id, fecha, guia_proveedor, factura_proveedor, recibido_por, observaciones)
  values (
    v_numero, v_compra,
    coalesce(nullif(p_datos ->> 'proveedor_id','')::uuid, (select c.proveedor_id from compras c where c.id = v_compra)),
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    nullif(p_datos ->> 'guia_proveedor',''),
    nullif(p_datos ->> 'factura_proveedor',''),
    auth.uid(),
    nullif(p_datos ->> 'observaciones','')
  ) returning id into v_recepcion;

  insert into recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario)
  select v_recepcion,
         (i ->> 'producto_id')::uuid,
         (i ->> 'cantidad')::numeric,
         coalesce(nullif(i ->> 'costo_unitario','')::numeric, 0)
  from jsonb_array_elements(v_items) i;

  -- Gastos de importación: reparto SIMPLE por valor, no landed cost (§2.11).
  -- Willy compra por DHL; el courier y el despacho express se distribuyen
  -- proporcionalmente al valor de la línea y con eso basta.
  if v_compra is not null then
    select coalesce(c.gastos_importacion, 0) into v_gastos from compras c where c.id = v_compra;
    select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
      from recepcion_items ri where ri.recepcion_id = v_recepcion;
    if v_gastos > 0 and v_base > 0 then
      v_factor := 1 + (v_gastos / v_base);
    end if;
  end if;

  -- UN solo llamado al kardex para toda la recepción.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
        'producto_id',       ri.producto_id,
        'tipo',              'ingreso',
        'cantidad',          ri.cantidad,
        'costo_unitario',    round(ri.costo_unitario * v_factor, 4),
        'referencia_tipo',   'recepcion',
        'referencia_id',     v_recepcion,
        'referencia_numero', v_numero,
        'motivo',            'Recepción de mercadería'
      ) order by ri.producto_id)
     from recepcion_items ri where ri.recepcion_id = v_recepcion)
  );

  -- Avance de la compra.
  if v_compra is not null then
    update compra_items ci
       set cantidad_recibida = least(ci.cantidad, ci.cantidad_recibida + ri.cantidad)
      from recepcion_items ri
     where ri.recepcion_id = v_recepcion
       and ci.compra_id = v_compra
       and ci.producto_id = ri.producto_id;

    update compras c
       set estado = case
             when not exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida < x.cantidad)
               then 'recibida'::estado_compra
             when exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida > 0)
               then 'recibida_parcial'::estado_compra
             else c.estado end
     where c.id = v_compra;
  end if;

  return jsonb_build_object('id', v_recepcion, 'numero', v_numero,
                            'items', jsonb_array_length(v_items), 'factor_gastos', v_factor);
end $$;

comment on function public.recepcionar_mercaderia(jsonb) is
  'Crea la recepción, sus ítems y TODOS los movimientos de ingreso en una sola llamada. Es el único camino por el que entra stock.';

-- ###########################################################################
-- 5. AJUSTE DE INVENTARIO · exclusivo de gerencia (26:49)
-- ###########################################################################

-- {"tipo":"cuadre_inicial|descuadre|merma|devolucion_interna","motivo":text,
--  "fecha":date, "items":[{"producto_id":uuid,"cantidad_fisica":n,"costo_unitario":n|null}]}
create or replace function public.registrar_ajuste_inventario(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ajuste uuid;
  v_numero text;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_movs   jsonb;
begin
  -- Doble cerrojo: además de la política RLS de la tabla, la función se niega.
  -- Es "un botón que lo va a usar con cuidado" (26:49) y nadie más lo toca.
  if not public.es_gerencia() then
    raise exception 'El ajuste de inventario está restringido a gerencia' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El ajuste no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  v_numero := public.siguiente_numero_interno('ajuste_inventario');

  insert into ajustes_inventario (numero, fecha, tipo, motivo, usuario_id)
  values (v_numero,
          coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
          coalesce(nullif(p_datos ->> 'tipo','')::tipo_ajuste, 'descuadre'),
          coalesce(nullif(p_datos ->> 'motivo',''), 'Ajuste de inventario'),
          auth.uid())
  returning id into v_ajuste;

  insert into ajuste_items (ajuste_id, producto_id, cantidad_sistema, cantidad_fisica, costo_unitario)
  select v_ajuste,
         (i ->> 'producto_id')::uuid,
         coalesce((select s.cantidad from stock s where s.producto_id = (i ->> 'producto_id')::uuid), 0),
         (i ->> 'cantidad_fisica')::numeric,
         coalesce(nullif(i ->> 'costo_unitario','')::numeric,
                  (select p.costo_promedio from productos p where p.id = (i ->> 'producto_id')::uuid), 0)
  from jsonb_array_elements(v_items) i;

  select jsonb_agg(jsonb_build_object(
           'producto_id',       ai.producto_id,
           'tipo',              case when ai.diferencia > 0 then 'ajuste_positivo' else 'ajuste_negativo' end,
           'cantidad',          abs(ai.diferencia),
           'costo_unitario',    ai.costo_unitario,
           'referencia_tipo',   'ajuste',
           'referencia_id',     v_ajuste,
           'referencia_numero', v_numero,
           'motivo',            (select a.motivo from ajustes_inventario a where a.id = v_ajuste)
         ) order by ai.producto_id)
    into v_movs
    from ajuste_items ai
   where ai.ajuste_id = v_ajuste and ai.diferencia <> 0;

  if v_movs is not null then
    perform public.registrar_movimientos(v_movs);
  end if;

  return jsonb_build_object('id', v_ajuste, 'numero', v_numero,
                            'ajustados', coalesce(jsonb_array_length(v_movs), 0));
end $$;

-- ###########################################################################
-- 6. IMPORTADOR DE PRODUCTOS POR LOTE
-- ###########################################################################
-- Vive en 010_importador.sql, no aquí.
--
-- Aquí había una versión fila por fila, escrita antes de ver el archivo real
-- del cliente. La de 010 lo reemplaza: es basada en conjuntos, corre en dos
-- modos (simular / aplicar) con el MISMO código de resolución, y habla las
-- columnas de la plantilla que él llena. Dejar las dos era garantizar que
-- alguna pantalla terminara llamando a la que no debía.

-- ###########################################################################
-- 7. BÚSQUEDA Y PAGINACIÓN
-- ###########################################################################

-- Caja única del constructor de cotizaciones.
drop function if exists public.buscar_productos(text, int, boolean);
create or replace function public.buscar_productos(
  p_q             text,
  p_limit         int default 30,
  p_solo_con_stock boolean default false
) returns table (
  id uuid, codigo text, codigo_fabricante text, descripcion text,
  marca text, familia text, subfamilia text, tipo text,
  unidad text, stock numeric, precio_venta numeric, precio_promedio numeric,
  costo_promedio numeric, estado_stock text, relevancia real
)
language sql stable security definer set search_path = public, extensions
as $$
  with q as (select public.normalizar_texto(p_q) as t)
  select p.id, p.codigo, p.codigo_fabricante, p.descripcion,
         m.nombre, c.nombre, f.nombre, sf.nombre,
         p.unidad_codigo,
         coalesce(s.cantidad, 0),
         p.precio_venta, p.precio_promedio, p.costo_promedio,
         case
           when coalesce(s.cantidad,0) <= 0 then 'sin_stock'
           when coalesce(s.cantidad,0) <= p.stock_minimo then 'critico'
           when p.stock_maximo > 0 and coalesce(s.cantidad,0) > p.stock_maximo then 'sobrestock'
           else 'normal' end,
         greatest(
           extensions.similarity(p.busq_codigo, (select t from q)),
           extensions.similarity(p.busq_codigo_fab, (select t from q)),
           extensions.similarity(p.busq_descripcion, (select t from q))
         )::real
  from productos p
  join marcas m       on m.id = p.marca_id
  join familias c   on c.id = p.familia_id
  join subfamilias f     on f.id = p.subfamilia_id
  left join tipos sf on sf.id = p.tipo_id
  left join stock s   on s.producto_id = p.id
  where not p.archivado
    and p.busqueda like '%' || (select t from q) || '%'
    and (not p_solo_con_stock or coalesce(s.cantidad,0) > 0)
  order by 15 desc, coalesce(s.cantidad,0) desc, p.codigo_norm
  limit greatest(p_limit, 1);
$$;

comment on function public.buscar_productos(text, int, boolean) is
  'Un solo RPC en lugar del `.or(ilike,ilike,ilike)` de la demo. El LIKE va contra `busqueda`, que sí tiene índice GIN trigram, y `archivado` está en el mismo índice.';

-- --------------------------------------------------------------------------
-- Catálogo paginado por KEYSET.
-- --------------------------------------------------------------------------
-- `.range()` (OFFSET) se degrada linealmente: la página 40 de 2.000 SKU obliga
-- a Postgres a descartar 2.000 filas. El cursor es `codigo_norm`, que es único
-- e indexado, así que cada página cuesta lo mismo que la primera.
create or replace function public.productos_pagina(
  p_cursor    text default null,
  p_limit     int  default 50,
  p_q         text default null,
  p_familia uuid default null,
  p_subfamilia   uuid default null,
  p_tipo uuid default null,
  p_marca     uuid default null,
  p_archivados boolean default false
) returns table (
  id uuid, codigo text, codigo_norm text, codigo_fabricante text, descripcion text,
  marca text, familia text, subfamilia text, tipo text, unidad text,
  stock numeric, stock_minimo numeric, stock_maximo numeric,
  precio_venta numeric, precio_promedio numeric, costo_promedio numeric,
  archivado boolean, estado_stock text
)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, p.codigo, p.codigo_norm, p.codigo_fabricante, p.descripcion,
         m.nombre, c.nombre, f.nombre, sf.nombre, p.unidad_codigo,
         coalesce(s.cantidad,0), p.stock_minimo, p.stock_maximo,
         p.precio_venta, p.precio_promedio, p.costo_promedio, p.archivado,
         case
           when coalesce(s.cantidad,0) <= 0 then 'sin_stock'
           when coalesce(s.cantidad,0) <= p.stock_minimo then 'critico'
           when p.stock_maximo > 0 and coalesce(s.cantidad,0) > p.stock_maximo then 'sobrestock'
           else 'normal' end
  from productos p
  join marcas m     on m.id = p.marca_id
  join familias c on c.id = p.familia_id
  join subfamilias f   on f.id = p.subfamilia_id
  left join tipos sf on sf.id = p.tipo_id
  left join stock s on s.producto_id = p.id
  where (p_archivados or not p.archivado)
    and (p_cursor is null or p.codigo_norm > p_cursor)
    and (p_familia  is null or p.familia_id  = p_familia)
    and (p_subfamilia    is null or p.subfamilia_id    = p_subfamilia)
    and (p_tipo is null or p.tipo_id = p_tipo)
    and (p_marca      is null or p.marca_id      = p_marca)
    and (p_q is null or p_q = '' or p.busqueda like '%' || public.normalizar_texto(p_q) || '%')
  order by p.codigo_norm
  limit greatest(p_limit, 1);
$$;

comment on function public.productos_pagina(text, int, text, uuid, uuid, uuid, uuid, boolean) is
  'Paginación por keyset sobre codigo_norm (único e indexado). Sustituye el .range() por offset, que se degrada con 2.000+ SKU.';

-- Autocompletado de ubigeo (02:46).
create or replace function public.buscar_ubigeo(p_q text, p_limit int default 15)
returns table (codigo char(6), departamento text, provincia text, distrito text, etiqueta text, relevancia real)
language sql stable security definer set search_path = public, extensions
as $$
  with q as (select public.normalizar_texto(p_q) as t)
  select u.codigo, u.departamento, u.provincia, u.distrito, u.etiqueta,
         extensions.similarity(u.busqueda, (select t from q))::real
  from ubigeo u
  where u.busqueda like '%' || (select t from q) || '%'
  order by
    -- El distrito que EMPIEZA con lo tecleado va primero: es lo que espera
    -- quien escribe "san is…" buscando San Isidro.
    (public.normalizar_texto(u.distrito) like (select t from q) || '%') desc,
    6 desc,
    u.departamento, u.provincia, u.distrito
  limit greatest(p_limit, 1);
$$;

-- ###########################################################################
-- 8. SUSTITUTOS (49:56)
-- ###########################################################################

-- Estrategia en cascada, justificada en el comentario de
-- `producto_equivalencias` en 002:
--   prioridad 1 → equivalencias capturadas a mano (precisas, escasas)
--   prioridad 2 → misma tipo, banda de precio y CON stock
--   prioridad 3 → misma subfamilia, banda de precio y con stock
drop function if exists public.sustitutos_de(uuid, numeric, int);
create or replace function public.sustitutos_de(
  p_producto       uuid,
  p_tolerancia_pct numeric default 25,
  p_limit          int default 10
) returns table (
  id uuid, codigo text, descripcion text, marca text,
  stock numeric, precio_venta numeric, diferencia_pct numeric,
  origen text, prioridad smallint, mejor_oferta boolean
)
language sql stable security definer set search_path = public, extensions
as $$
  with base as (
    select p.id, p.precio_venta, p.subfamilia_id, p.tipo_id
    from productos p where p.id = p_producto
  ),
  candidatos as (
    -- 1 · equivalencias explícitas (bidireccionales)
    select p.id, 'equivalencia'::text as origen, 1::smallint as prioridad
    from producto_equivalencias e
    join productos p on p.id = e.equivalente_id
    where e.producto_id = p_producto and not p.archivado
    union
    select p.id, 'equivalencia'::text, 1::smallint
    from producto_equivalencias e
    join productos p on p.id = e.producto_id
    where e.equivalente_id = p_producto and not p.archivado
    union
    -- 2 · misma tipo, precio alineado
    select p.id, 'tipo'::text, 2::smallint
    from productos p, base b
    where p.id <> b.id and not p.archivado
      and p.tipo_id is not null and p.tipo_id = b.tipo_id
      and (b.precio_venta = 0 or p.precio_venta
           between b.precio_venta * (1 - p_tolerancia_pct/100.0)
               and b.precio_venta * (1 + p_tolerancia_pct/100.0))
    union
    -- 3 · misma subfamilia, precio alineado
    select p.id, 'subfamilia'::text, 3::smallint
    from productos p, base b
    where p.id <> b.id and not p.archivado
      and p.subfamilia_id = b.subfamilia_id
      and (b.precio_venta = 0 or p.precio_venta
           between b.precio_venta * (1 - p_tolerancia_pct/100.0)
               and b.precio_venta * (1 + p_tolerancia_pct/100.0))
  ),
  mejores as (
    select c.id, min(c.prioridad) as prioridad,
           (array_agg(c.origen order by c.prioridad))[1] as origen
    from candidatos c group by c.id
  ),
  enriquecidos as (
    select p.id, p.codigo, p.descripcion, m.nombre as marca,
           coalesce(s.cantidad,0) as stock, p.precio_venta,
           case when b.precio_venta > 0
                then round((p.precio_venta - b.precio_venta) / b.precio_venta * 100, 2)
                else 0 end as diferencia_pct,
           mj.origen, mj.prioridad
    from mejores mj
    join productos p on p.id = mj.id
    join marcas m on m.id = p.marca_id
    left join stock s on s.producto_id = p.id
    cross join base b
  )
  select e.id, e.codigo, e.descripcion, e.marca, e.stock, e.precio_venta,
         e.diferencia_pct, e.origen, e.prioridad,
         -- "que le marque mejor oferta" (49:56): con stock y más barato.
         (e.stock > 0 and e.diferencia_pct < 0
          and e.precio_venta = min(e.precio_venta) filter (where e.stock > 0) over ()) as mejor_oferta
  from enriquecidos e
  -- Un sustituto sin stock no resuelve el problema que motivó la búsqueda.
  order by (e.stock > 0) desc, e.prioridad, abs(e.diferencia_pct), e.precio_venta
  limit greatest(p_limit, 1);
$$;

comment on function public.sustitutos_de(uuid, numeric, int) is
  'Cascada equivalencia explícita → tipo → subfamilia, con banda de precio y priorizando stock disponible. Útil desde el día uno sin data capturada, y mejora sola a medida que se registran equivalencias.';

-- ###########################################################################
-- 9. PRECIO PROMEDIO (28:30)
-- ###########################################################################

-- "el promedio se obtiene del costo y de todas las ventas que ha tenido un
-- producto… el precio se va ajustando en promedio de venta".
-- Implementación: promedio ponderado por cantidad de los valores unitarios
-- efectivamente facturados en los últimos N meses, con piso en el costo más
-- el margen objetivo. Sin ventas, cae al costo + margen.
create or replace function public.recalcular_precios_promedio(
  p_productos jsonb default null,     -- array de uuid; null = todos
  p_meses     int  default 12
) returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_afectados integer;
begin
  with objetivo as (
    select p.id
    from productos p
    where p_productos is null
       or p.id::text in (select t from jsonb_array_elements_text(coalesce(p_productos, '[]'::jsonb)) as e(t))
  ),
  ventas as (
    select ci.producto_id,
           sum(ci.cantidad * ci.valor_unitario * (1 - ci.descuento_pct/100.0)) as valor,
           sum(ci.cantidad) as unidades
    from comprobante_items ci
    join comprobantes c on c.id = ci.comprobante_id
    where c.estado <> 'anulado'
      and c.tipo in ('factura','boleta')
      and c.fecha_emision >= current_date - make_interval(months => greatest(p_meses,1))
      and ci.producto_id in (select id from objetivo)
    group by ci.producto_id
  )
  update productos p
     set precio_promedio = greatest(
           round(coalesce(v.valor / nullif(v.unidades, 0), 0), 4),
           round(p.costo_promedio * (1 + p.margen_objetivo_pct/100.0), 4)
         ),
         precio_promedio_actualizado_en = now()
    from objetivo o
    left join ventas v on v.producto_id = o.id
   where p.id = o.id;

  get diagnostics v_afectados = row_count;
  return v_afectados;
end $$;

comment on function public.recalcular_precios_promedio(jsonb, int) is
  'Precio referencial que "se ajusta solo" (28:30): promedio ponderado de las ventas reales, con piso en costo + margen objetivo. Pensado para correr en batch nocturno, no por producto.';

-- ###########################################################################
-- 10. COTIZACIÓN
-- ###########################################################################

create or replace function public.recalcular_totales_cotizacion()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id  uuid := coalesce(new.cotizacion_id, old.cotizacion_id);
  v_sub numeric(14,2);
  v_desc numeric(14,2);
  v_costo numeric(14,2);
  v_igv_pct numeric(5,2);
begin
  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;

  select coalesce(sum(ci.importe), 0),
         coalesce(sum(round(ci.cantidad * ci.valor_unitario * ci.descuento_pct / 100.0, 2)), 0),
         coalesce(sum(round(ci.cantidad * ci.costo_unitario, 2)), 0)
    into v_sub, v_desc, v_costo
    from cotizacion_items ci where ci.cotizacion_id = v_id;

  update cotizaciones c
     set subtotal        = v_sub,
         descuento_total = v_desc,
         igv             = round(v_sub * v_igv_pct / 100.0, 2),
         total           = v_sub + round(v_sub * v_igv_pct / 100.0, 2),
         costo_total     = v_costo,
         margen_pct      = case when v_sub > 0 then round((v_sub - v_costo) / v_sub * 100, 2) else 0 end,
         actualizado_en  = now()
   where c.id = v_id;
  return null;
end $$;

drop trigger if exists trg_cotiz_items_totales on cotizacion_items;
create trigger trg_cotiz_items_totales
  after insert or update or delete on cotizacion_items
  for each row execute function public.recalcular_totales_cotizacion();

-- ---------------------------------------------------------------------------
-- El piso de venta lo pone la base, no quien escribe.
-- ---------------------------------------------------------------------------
-- El check `cotiz_item_respeta_piso` compara contra `precio_minimo_ref`, así
-- que ese valor ES la regla. Si pudiera llegar desde afuera, saltarse el piso
-- sería tan fácil como mandar:
--
--     PATCH /cotizacion_items  { "precio_minimo_ref": 0, "valor_unitario": 5 }
--
-- y las políticas de RLS no lo atajan: RLS decide a qué FILAS se llega, no qué
-- COLUMNAS se pueden tocar dentro de una fila que ya es tuya.
--
-- Este trigger lo resuelve imponiendo el valor siempre:
--
--   * Al insertar, y al cambiar el producto de una línea, se toma de
--     productos.precio_minimo. Lo que venga en la petición se ignora.
--   * En cualquier otra modificación se conserva el que ya tenía. El piso es
--     el que regía CUANDO SE COTIZÓ; que después suba no puede invalidar
--     retroactivamente una cotización ya entregada al cliente.
--
-- Líneas sin producto (texto libre, servicios) quedan en 0 = sin piso: no hay
-- maestro contra el cual comparar.
create or replace function public.fijar_piso_cotizacion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' or new.producto_id is distinct from old.producto_id then
    select p.precio_minimo into new.precio_minimo_ref
      from productos p where p.id = new.producto_id;
    new.precio_minimo_ref := coalesce(new.precio_minimo_ref, 0);
  else
    new.precio_minimo_ref := old.precio_minimo_ref;
  end if;
  return new;
end $$;

drop trigger if exists trg_cotiz_items_piso on cotizacion_items;
create trigger trg_cotiz_items_piso
  before insert or update on cotizacion_items
  for each row execute function public.fijar_piso_cotizacion();

-- Alta de cotización completa en una llamada (cabecera + N ítems).
create or replace function public.crear_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id     uuid;
  v_serie  text := coalesce(nullif(p_datos ->> 'serie',''),
                            (select serie from series_documento where tipo='cotizacion' and predeterminada and activo limit 1),
                            'COT1');
  v_corr   integer := public.siguiente_correlativo('cotizacion', v_serie);
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y emitir una cotización
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede emitir una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  insert into cotizaciones (
    serie, correlativo, cliente_id, fecha, validez_dias, orden_compra_cliente,
    mostrar_descuento, vendedor_id, contacto, condiciones, observaciones, tiempo_entrega, estado
  ) values (
    v_serie, v_corr,
    (p_datos ->> 'cliente_id')::uuid,
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    coalesce(nullif(p_datos ->> 'validez_dias','')::smallint, 15),
    nullif(p_datos ->> 'orden_compra_cliente',''),
    coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    coalesce(nullif(p_datos ->> 'vendedor_id','')::uuid, auth.uid()),
    nullif(p_datos ->> 'contacto',''),
    nullif(p_datos ->> 'condiciones',''),
    nullif(p_datos ->> 'observaciones',''),
    nullif(p_datos ->> 'tiempo_entrega',''),
    coalesce(nullif(p_datos ->> 'estado','')::estado_cotizacion, 'borrador')
  ) returning id into v_id;

  -- `precio_minimo_ref` se pone explícitamente desde `p.precio_minimo` aunque
  -- el trigger `trg_cotiz_items_piso` lo impondría igual: así el valor queda
  -- correcto también si alguien deshabilita el trigger para una carga masiva,
  -- y sobre todo se lee aquí de dónde sale. Lo que NUNCA se hace es tomarlo
  -- del payload — ahí está la regla del piso y aceptarla de quien llama sería
  -- regalarla.
  --
  -- Si el producto todavía no tiene P.M. cargado queda en 0, que es "sin piso
  -- definido" y deja pasar cualquier precio: es lo correcto mientras se está
  -- cargando el maestro, y se cierra solo conforme Willy llena la columna.
  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    precio_minimo_ref, entrega
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         i.ord::smallint,
         coalesce(nullif(i.value ->> 'codigo',''), p.codigo),
         coalesce(nullif(i.value ->> 'marca',''), m.nombre),
         coalesce(nullif(i.value ->> 'descripcion',''), p.descripcion),
         coalesce(nullif(i.value ->> 'cantidad','')::numeric, 1),
         coalesce(nullif(i.value ->> 'unidad_codigo',''), p.unidad_codigo, 'NIU'),
         coalesce(nullif(i.value ->> 'valor_unitario','')::numeric, p.precio_venta, 0),
         coalesce(nullif(i.value ->> 'descuento_pct','')::numeric, 0),
         coalesce(nullif(i.value ->> 'costo_unitario','')::numeric, p.costo_promedio, 0),
         coalesce(p.precio_minimo, 0),
         nullif(i.value ->> 'entrega','')
  from jsonb_array_elements(v_items) with ordinality as i(value, ord)
  left join productos p on p.id = nullif(i.value ->> 'producto_id','')::uuid
  left join marcas m    on m.id = p.marca_id;

  return jsonb_build_object('id', v_id, 'numero', (select numero from cotizaciones where id = v_id));
end $$;

create or replace function public.aprobar_cotizacion(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_estado estado_cotizacion;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y aprobar una cotización
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede aprobar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  select estado into v_estado from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado not in ('borrador','enviada') then
    raise exception 'La cotización está en estado % y no se puede aprobar', v_estado using errcode = 'check_violation';
  end if;

  update cotizaciones
     set estado = 'aprobada', aprobada_en = now(), aprobada_por = auth.uid()
   where id = p_id;

  return jsonb_build_object('id', p_id, 'estado', 'aprobada');
end $$;

-- ###########################################################################
-- 11. GUÍA DE REMISIÓN
-- ###########################################################################

-- Willy prefiere el flujo manual al automático (18:01): la guía se genera con
-- un botón desde la cotización aprobada y admite editar ítems y cantidades
-- antes de emitir.
create or replace function public.generar_guia_desde_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_cot    uuid := (p_datos ->> 'cotizacion_id')::uuid;
  v_cliente uuid;
  v_estado estado_cotizacion;
  v_oc     text;
  v_serie  text := coalesce(nullif(p_datos ->> 'serie',''),
                            (select serie from series_documento where tipo='guia_remision' and predeterminada and activo limit 1),
                            'T001');
  v_corr   integer;
  v_guia   uuid;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_peso   numeric(12,3);
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y generar una guía
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('guias_remision') then
    raise exception 'Tu rol no puede generar una guía'
      using errcode = 'insufficient_privilege';
  end if;

  select c.cliente_id, c.estado, c.orden_compra_cliente
    into v_cliente, v_estado, v_oc
    from cotizaciones c where c.id = v_cot;

  if v_cliente is null then
    raise exception 'Cotización % no existe', v_cot using errcode = 'no_data_found';
  end if;
  if v_estado <> 'aprobada' then
    raise exception 'Solo se genera guía desde una cotización aprobada (estado actual: %)', v_estado
      using errcode = 'check_violation';
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'La guía no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  v_corr := public.siguiente_correlativo('guia_remision', v_serie);

  -- El peso puede venir declarado; si no, se calcula del maestro. Nunca 0:
  -- es el dato que Willy llamó "lo más importante" (02:46).
  select coalesce(nullif(p_datos ->> 'peso_bruto_kg','')::numeric,
                  sum(coalesce(p.peso_kg,0) * (i.value ->> 'cantidad')::numeric))
    into v_peso
    from jsonb_array_elements(v_items) i
    left join productos p on p.id = (i.value ->> 'producto_id')::uuid;

  if coalesce(v_peso, 0) <= 0 then
    raise exception 'La guía requiere peso bruto mayor a cero (los productos no tienen peso registrado)'
      using errcode = 'check_violation';
  end if;

  insert into guias_remision (
    serie, correlativo, cotizacion_id, cliente_id, orden_compra_cliente,
    fecha_emision, fecha_traslado, motivo_codigo,
    ubigeo_partida, direccion_partida, ubigeo_llegada, direccion_llegada,
    peso_bruto_kg, numero_bultos, modalidad_traslado,
    transportista_documento, transportista_razon_social, transportista_placa,
    conductor_documento, conductor_nombre, conductor_licencia,
    entregado_por, observaciones, estado, creado_por
  ) values (
    v_serie, v_corr, v_cot, v_cliente,
    coalesce(nullif(p_datos ->> 'orden_compra_cliente',''), v_oc),
    coalesce(nullif(p_datos ->> 'fecha_emision','')::date, current_date),
    coalesce(nullif(p_datos ->> 'fecha_traslado','')::date, current_date),
    coalesce(nullif(p_datos ->> 'motivo_codigo',''), '01'),
    coalesce(nullif(p_datos ->> 'ubigeo_partida',''), (select ubigeo_codigo from empresa where id=1)),
    coalesce(nullif(p_datos ->> 'direccion_partida',''), (select direccion from empresa where id=1)),
    (p_datos ->> 'ubigeo_llegada'),
    (p_datos ->> 'direccion_llegada'),
    round(v_peso, 3),
    coalesce(nullif(p_datos ->> 'numero_bultos','')::int, 1),
    coalesce(nullif(p_datos ->> 'modalidad_traslado',''), '02'),
    nullif(p_datos ->> 'transportista_documento',''),
    nullif(p_datos ->> 'transportista_razon_social',''),
    nullif(p_datos ->> 'transportista_placa',''),
    nullif(p_datos ->> 'conductor_documento',''),
    nullif(p_datos ->> 'conductor_nombre',''),
    nullif(p_datos ->> 'conductor_licencia',''),
    nullif(p_datos ->> 'entregado_por',''),
    nullif(p_datos ->> 'observaciones',''),
    -- Nace en BORRADOR: Willy quiere vista previa antes de emitir (§2.2) y la
    -- restricción `guia_transporte_ok` solo exige placa/transportista cuando
    -- la guía deja de ser borrador.
    coalesce(nullif(p_datos ->> 'estado','')::estado_guia, 'borrador'),
    auth.uid()
  ) returning id into v_guia;

  insert into guia_items (guia_id, producto_id, cotizacion_item_id, orden, codigo, descripcion, cantidad, unidad_codigo, peso_kg)
  select v_guia,
         (i.value ->> 'producto_id')::uuid,
         nullif(i.value ->> 'cotizacion_item_id','')::uuid,
         i.ord::smallint,
         coalesce(nullif(i.value ->> 'codigo',''), p.codigo),
         coalesce(nullif(i.value ->> 'descripcion',''), p.descripcion),
         (i.value ->> 'cantidad')::numeric,
         coalesce(nullif(i.value ->> 'unidad_codigo',''), p.unidad_codigo, 'NIU'),
         coalesce(nullif(i.value ->> 'peso_kg','')::numeric, coalesce(p.peso_kg,0) * (i.value ->> 'cantidad')::numeric, 0)
  from jsonb_array_elements(v_items) with ordinality as i(value, ord)
  left join productos p on p.id = (i.value ->> 'producto_id')::uuid;

  return jsonb_build_object('id', v_guia, 'numero', (select numero from guias_remision where id = v_guia),
                            'peso_bruto_kg', round(v_peso,3));
end $$;

-- Emisión de la guía: es AQUÍ donde la mercadería deja el almacén, así que es
-- aquí donde sale el stock. La factura posterior no vuelve a descargarlo (por
-- eso `emitir_comprobante` tiene `descargar_stock` en false por defecto).
create or replace function public.emitir_guia(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_estado estado_guia;
  v_numero text;
  v_movs   jsonb;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y emitir una guía
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('guias_remision') then
    raise exception 'Tu rol no puede emitir una guía'
      using errcode = 'insufficient_privilege';
  end if;

  select estado, numero into v_estado, v_numero from guias_remision where id = p_id for update;
  if v_estado is null then
    raise exception 'Guía % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado <> 'borrador' then
    raise exception 'La guía ya fue emitida o anulada (estado %)', v_estado using errcode = 'check_violation';
  end if;

  update guias_remision
     set estado = 'emitida', estado_sunat = 'pendiente'
   where id = p_id;

  select jsonb_agg(jsonb_build_object(
           'producto_id', gi.producto_id, 'tipo', 'salida', 'cantidad', gi.cantidad,
           'referencia_tipo', 'guia', 'referencia_id', p_id, 'referencia_numero', v_numero,
           'motivo', 'Despacho con guía de remisión') order by gi.producto_id)
    into v_movs
    from guia_items gi where gi.guia_id = p_id;

  if v_movs is not null then perform public.registrar_movimientos(v_movs); end if;

  return jsonb_build_object('id', p_id, 'numero', v_numero, 'estado', 'emitida');
end $$;

create or replace function public.anular_guia(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y anular una guía
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.es_gerencia() then
    raise exception 'Tu rol no puede anular una guía'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_motivo,''))) < 5 then
    raise exception 'La anulación requiere un motivo' using errcode = 'check_violation';
  end if;
  if exists (select 1 from comprobantes c where c.guia_id = p_id and c.estado <> 'anulado') then
    raise exception 'No se puede anular: la guía está referenciada por un comprobante vigente'
      using errcode = 'foreign_key_violation';
  end if;

  -- Devolver al almacén lo que la guía sacó.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
              'producto_id', m.producto_id, 'tipo', 'ingreso', 'cantidad', m.cantidad,
              'costo_unitario', m.costo_unitario,
              'referencia_tipo', 'guia', 'referencia_id', p_id,
              'motivo', 'Reposición por anulación de guía') order by m.producto_id)
     from movimientos_inventario m
     where m.referencia_tipo = 'guia' and m.referencia_id = p_id and m.tipo = 'salida'))
  where exists (select 1 from movimientos_inventario m
                where m.referencia_tipo = 'guia' and m.referencia_id = p_id and m.tipo = 'salida');

  update guias_remision
     set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(),
         motivo_anulacion = p_motivo,
         estado_sunat = case when estado_sunat = 'aceptado' then 'baja_solicitada'::estado_sunat else estado_sunat end
   where id = p_id and estado <> 'anulada';

  if not found then
    raise exception 'Guía % no existe o ya está anulada', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'estado', 'anulada');
end $$;

-- ###########################################################################
-- 12. COMPROBANTES
-- ###########################################################################

-- Emisión completa en UNA llamada: correlativo + cabecera + N ítems + cuotas
-- + descarga de stock. En la demo esto eran 1 + N + N round-trips desde el
-- navegador (`pedidos/[id]/acciones.tsx:169-181`).
create or replace function public.emitir_comprobante(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
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
    vendedor_id, observaciones, estado, estado_sunat
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
    public.numero_a_letras(v_total, 'USD'),
    v_detr_ap, nullif(v_detr ->> 'codigo',''), case when v_detr_ap then v_detr_pct else 0 end,
      case when v_detr_ap then round(v_total * v_detr_pct / 100.0, 2) else 0 end,
      case when v_detr_ap then (select cuenta_detraccion from empresa where id=1) else null end,
    v_ret_ap, case when v_ret_ap then v_ret_pct else 0 end,
      case when v_ret_ap then round(v_total * v_ret_pct / 100.0, 2) else 0 end,
    coalesce(nullif(p_datos ->> 'vendedor_id','')::uuid, auth.uid()),
    nullif(p_datos ->> 'observaciones',''),
    'emitido', 'pendiente'
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
    'retencion',  (select retencion_monto  from comprobantes where id = v_id));
end $$;

comment on function public.emitir_comprobante(jsonb) is
  'Emisión completa en un round-trip: correlativo, cabecera, ítems, cuotas, SPOT y (opcional) descarga de stock. Los totales se calculan en el servidor.';

create or replace function public.anular_comprobante(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_movs jsonb;
begin
  if not public.tiene_rol('gerencia','admin') then
    raise exception 'Solo gerencia puede anular comprobantes' using errcode = 'insufficient_privilege';
  end if;

  -- Reponer el stock que descargó este comprobante, si lo hizo.
  select jsonb_agg(jsonb_build_object(
           'producto_id', m.producto_id, 'tipo', 'ingreso', 'cantidad', m.cantidad,
           'costo_unitario', m.costo_unitario,
           'referencia_tipo', 'comprobante', 'referencia_id', p_id,
           'motivo', 'Reposición por anulación') order by m.producto_id)
    into v_movs
    from movimientos_inventario m
   where m.referencia_tipo = 'comprobante' and m.referencia_id = p_id and m.tipo = 'salida';

  if v_movs is not null then perform public.registrar_movimientos(v_movs); end if;

  update comprobantes
     set estado = 'anulado', anulado_en = now(), anulado_por = auth.uid(),
         motivo_anulacion = p_motivo,
         estado_sunat = case when estado_sunat = 'aceptado' then 'baja_solicitada'::estado_sunat else estado_sunat end
   where id = p_id and estado <> 'anulado';

  if not found then
    raise exception 'Comprobante % no existe o ya está anulado', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'estado', 'anulado');
end $$;

-- ###########################################################################
-- 13. COBRANZAS
-- ###########################################################################

create or replace function public.recalcular_comprobante()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id     uuid := coalesce(new.comprobante_id, old.comprobante_id);
  v_pagado numeric(14,2);
  v_total  numeric(14,2);
  v_venc   date;
begin
  select coalesce(sum(monto), 0) into v_pagado from pagos where comprobante_id = v_id;
  select total, fecha_vencimiento into v_total, v_venc from comprobantes where id = v_id;

  update comprobantes
     set pagado = least(v_pagado, v_total),
         estado = (case
           when estado = 'anulado' then 'anulado'
           when v_pagado >= v_total - 0.01 then 'pagado'
           when v_venc is not null and v_venc < current_date then 'vencido'
           when v_pagado > 0 then 'parcial'
           else 'emitido' end)::estado_comprobante
   where id = v_id;

  -- Reparto sobre las cuotas, de la más antigua a la más nueva.
  update comprobante_cuotas cu
     set pagado = 0
   where cu.comprobante_id = v_id;

  with orden as (
    select id, monto,
           sum(monto) over (order by numero rows between unbounded preceding and 1 preceding) as previo
    from comprobante_cuotas where comprobante_id = v_id
  )
  update comprobante_cuotas cu
     set pagado = least(cu.monto, greatest(v_pagado - coalesce(o.previo, 0), 0))
    from orden o
   where cu.id = o.id;

  return null;
end $$;

drop trigger if exists trg_pagos_recalcular on pagos;
create trigger trg_pagos_recalcular
  after insert or update or delete on pagos
  for each row execute function public.recalcular_comprobante();

-- Registro de pagos POR LOTE (una transferencia que cancela 6 facturas).
create or replace function public.registrar_pagos(p_pagos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_n int;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y registrar pagos
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('pagos') then
    raise exception 'Tu rol no puede registrar pagos'
      using errcode = 'insufficient_privilege';
  end if;

  insert into pagos (comprobante_id, cuota_id, fecha, monto, medio, referencia, observaciones, registrado_por)
  select (i ->> 'comprobante_id')::uuid,
         nullif(i ->> 'cuota_id','')::uuid,
         coalesce(nullif(i ->> 'fecha','')::date, current_date),
         (i ->> 'monto')::numeric,
         coalesce(nullif(i ->> 'medio',''), 'transferencia'),
         nullif(i ->> 'referencia',''),
         nullif(i ->> 'observaciones',''),
         auth.uid()
  from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i;
  get diagnostics v_n = row_count;
  return jsonb_build_object('pagos', v_n);
end $$;

-- ###########################################################################
-- 14. NÚMERO A LETRAS
-- ###########################################################################

create or replace function public._tres_letras(n int)
returns text
language plpgsql immutable
as $$
declare
  unidades text[] := array['UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ',
    'ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE',
    'VEINTIUNO','VEINTIDOS','VEINTITRES','VEINTICUATRO','VEINTICINCO','VEINTISEIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
  decenas  text[] := array['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  centenas text[] := array['CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  t text := '';
begin
  if n is null or n = 0 then return ''; end if;
  if n = 100 then return 'CIEN'; end if;
  if n >= 100 then t := centenas[(n / 100)] || ' '; n := n % 100; end if;
  if n = 0 then return btrim(t); end if;
  if n <= 29 then return btrim(t || unidades[n]); end if;
  t := t || decenas[(n / 10) + 1];
  if n % 10 <> 0 then t := t || ' Y ' || unidades[n % 10]; end if;
  return btrim(t);
end $$;

create or replace function public.numero_a_letras(p_monto numeric, p_moneda text default 'USD')
returns text
language plpgsql immutable
as $$
declare
  v_ent bigint; v_dec int; v_txt text := ''; v_mill bigint; v_miles int; v_resto int; v_sufijo text;
begin
  v_ent := floor(abs(coalesce(p_monto, 0)))::bigint;
  v_dec := round((abs(coalesce(p_monto, 0)) - v_ent) * 100)::int;
  if v_dec = 100 then v_ent := v_ent + 1; v_dec := 0; end if;

  v_sufijo := case upper(coalesce(p_moneda,'USD'))
                when 'PEN' then 'SOLES'
                when 'EUR' then 'EUROS'
                else 'DOLARES AMERICANOS' end;

  if v_ent = 0 then
    v_txt := 'CERO';
  else
    v_mill  := v_ent / 1000000;
    v_miles := ((v_ent % 1000000) / 1000)::int;
    v_resto := (v_ent % 1000)::int;
    if v_mill > 0 then
      v_txt := case when v_mill = 1 then 'UN MILLON'
                    else public._tres_letras(v_mill::int) || ' MILLONES' end || ' ';
    end if;
    if v_miles > 0 then
      v_txt := v_txt || case when v_miles = 1 then 'MIL'
                             else public._tres_letras(v_miles) || ' MIL' end || ' ';
    end if;
    if v_resto > 0 then v_txt := v_txt || public._tres_letras(v_resto); end if;
  end if;

  return btrim(regexp_replace(v_txt, '\s+', ' ', 'g')) || ' CON ' || lpad(v_dec::text, 2, '0') || '/100 ' || v_sufijo;
end $$;

comment on function public.numero_a_letras(numeric, text) is
  'Monto en letras para el comprobante. Por defecto USD: Willy factura siempre en dólares (14:54).';

-- ###########################################################################
-- 15. CONSULTAS RUC/DNI · se define en 007_consultas.sql
-- ###########################################################################
-- Las tablas de caché y cuota, y sus funciones de reserva, las declara el
-- paquete @rodatech/consultas: su código ya llama a esos nombres de RPC
-- (consultas_reservar_cuota, consultas_liberar_cuota, consultas_marcar_agotado)
-- y el contrato lo fija el llamador, no el esquema.

-- ###########################################################################
-- 16. ALERTAS
-- ###########################################################################

-- Idempotente por `huella`: se puede correr cada hora sin inundar la bandeja.
create or replace function public.generar_alertas()
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_nuevas int := 0; v_n int;
begin
  -- Quiebre y stock bajo -----------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select case when coalesce(s.cantidad,0) <= 0 then 'quiebre_stock' else 'stock_bajo' end,
         case when coalesce(s.cantidad,0) <= 0 then 'critica'::severidad_alerta else 'alta'::severidad_alerta end,
         case when coalesce(s.cantidad,0) <= 0 then 'Quiebre de stock' else 'Stock bajo el mínimo' end,
         p.codigo || ' · ' || p.descripcion || ' — saldo ' || coalesce(s.cantidad,0) ||
           ' (mínimo ' || p.stock_minimo || ')',
         'producto', p.id, p.codigo, coalesce(s.cantidad,0),
         '/inventario/productos/' || p.id,
         'stock:' || p.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from productos p
  left join stock s on s.producto_id = p.id
  where not p.archivado
    and p.stock_minimo > 0
    and coalesce(s.cantidad, 0) <= p.stock_minimo
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Sobrestock / capital inmovilizado (25:21) ---------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'sobrestock', 'media',
         'Sobrestock · capital inmovilizado',
         p.codigo || ' · ' || p.descripcion || ' — ' || s.cantidad || ' unidades (máximo ' || p.stock_maximo ||
           '), valorizado USD ' || round(s.valorizado, 2),
         'producto', p.id, p.codigo, round(s.valorizado, 2),
         '/inventario/productos/' || p.id,
         'sobrestock:' || p.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from productos p
  join stock s on s.producto_id = p.id
  where not p.archivado and p.stock_maximo > 0 and s.cantidad > p.stock_maximo
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Saldo negativo: siempre es un error de operación que hay que cuadrar.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'stock_negativo', 'critica', 'Saldo negativo en almacén',
         p.codigo || ' · saldo ' || s.cantidad || '. Requiere cuadre de gerencia.',
         'producto', p.id, p.codigo, s.cantidad, '/inventario/ajustes',
         'negativo:' || p.id::text || ':' || to_char(current_date, 'YYYY-MM-DD')
  from stock s join productos p on p.id = s.producto_id
  where s.cantidad < 0
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Cartera vencida y por vencer ----------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select case when c.fecha_vencimiento < current_date then 'credito_vencido' else 'credito_por_vencer' end,
         case when c.fecha_vencimiento < current_date - 30 then 'critica'::severidad_alerta
              when c.fecha_vencimiento < current_date then 'alta'::severidad_alerta
              else 'media'::severidad_alerta end,
         case when c.fecha_vencimiento < current_date then 'Factura vencida' else 'Factura por vencer' end,
         c.numero || ' · ' || cl.razon_social || ' — saldo USD ' || c.saldo ||
           ' vence ' || to_char(c.fecha_vencimiento, 'DD/MM/YYYY'),
         'comprobante', c.id, c.numero, c.saldo, '/cobranzas/' || c.id,
         'cartera:' || c.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.estado in ('emitido','parcial','vencido')
    and c.saldo > 0
    and c.fecha_vencimiento is not null
    and c.fecha_vencimiento <= current_date + 7
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Línea de crédito excedida --------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'linea_credito', 'alta', 'Línea de crédito excedida',
         cl.razon_social || ' — expuesto USD ' || round(x.saldo, 2) ||
           ' sobre una línea de USD ' || cl.linea_credito,
         'cliente', cl.id, cl.razon_social, round(x.saldo, 2), '/clientes/' || cl.id,
         'linea:' || cl.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from clientes cl
  join lateral (
    select coalesce(sum(c.saldo), 0) as saldo
    from comprobantes c
    where c.cliente_id = cl.id and c.estado in ('emitido','parcial','vencido')
  ) x on true
  where cl.linea_credito > 0 and x.saldo > cl.linea_credito
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Cotizaciones por vencer -----------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'cotizacion_por_vencer', 'baja', 'Cotización por vencer',
         q.numero || ' · ' || cl.razon_social || ' — vence ' || to_char(q.fecha_vencimiento, 'DD/MM/YYYY'),
         'cotizacion', q.id, q.numero, q.total, '/cotizaciones/' || q.id,
         'cotiz:' || q.id::text
  from cotizaciones q join clientes cl on cl.id = q.cliente_id
  where q.estado in ('enviada','aprobada')
    and q.fecha_vencimiento between current_date and current_date + 3
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Rechazos de SUNAT -----------------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'sunat_rechazo', 'critica', 'Comprobante rechazado por SUNAT',
         c.numero || ' — ' || coalesce(c.sunat_codigo_respuesta, '') || ' ' || coalesce(c.sunat_mensaje, ''),
         'comprobante', c.id, c.numero, c.total, '/facturacion/' || c.id,
         'sunat:' || c.id::text || ':' || coalesce(c.sunat_codigo_respuesta, 'x')
  from comprobantes c
  where c.estado_sunat in ('rechazado','observado')
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  return jsonb_build_object('nuevas', v_nuevas, 'generado_en', now());
end $$;

comment on function public.generar_alertas() is
  'Idempotente por `huella`. Deja las alertas con notificado_en NULL para que un worker las EMPUJE (WhatsApp/email): Willy no quiere entrar a buscarlas (25:21).';
