-- ###########################################################################
-- 026 · LA PLANTILLA TRAE LOS CAMPOS QUE FALTABAN
-- ###########################################################################
--
-- Willy va a subir **más de 3.000 rodamientos ya clasificados** por el grupo
-- de WhatsApp. Lo que no tenga columna ese día se pierde, y volver a pedirle
-- el archivo es lo que no puede pasar.
--
-- La plantilla llevaba diez columnas. Le faltaban seis, y una de ellas duele:
--
--   · PESO. `guia_peso_pos` RECHAZA una guía con peso cero, y hoy no hay un
--     solo producto con peso cargado. Willy lo llamó «lo más importante»
--     (02:46). Sin esta columna, cada guía se sigue tecleando a mano.
--   · P. MERCADO. El campo nuevo de la 025.
--   · PROVEEDOR. El habitual, para saber a quién pedirle.
--   · UBICACION y STOCK MAXIMO, que ya existían en la tabla sin forma de
--     llenarse salvo producto a producto.
--   · COD. FABRICANTE, que es por donde busca medio mundo.
--
-- ---------------------------------------------------------------------------
-- Dos decisiones que no son obvias
-- ---------------------------------------------------------------------------
--
-- 1 · EL PROVEEDOR NO SE CREA SOLO. Con las marcas sí se hace —que aparezca
--     una marca nueva es lo normal y frenar la carga por eso sería absurdo—,
--     pero un proveedor lleva RUC, condiciones de pago y plazo de entrega.
--     Crear uno a partir de un nombre suelto en un Excel llenaría el maestro
--     de fichas huecas que después hay que limpiar a mano. Si el nombre no
--     resuelve, la fila entra igual SIN proveedor y se informa cuáles fueron:
--     es un aviso, no un rechazo.
--
-- 2 · UNA COLUMNA VACÍA NO BORRA LO QUE YA HABÍA. Al actualizar un producto
--     que ya existe, solo se pisa lo que el archivo trae con valor. Si alguien
--     sube un archivo parcial —los 200 que le faltaban clasificar— sin la
--     columna de peso, los pesos ya cargados tienen que seguir ahí. La regla
--     vale para peso, ubicación, mercado, stock máximo, código de fabricante
--     y proveedor.
--
--     No vale para precio de venta, precio mínimo ni costo: esos SÍ se pisan,
--     porque el archivo es la lista de precios vigente y ese comportamiento ya
--     estaba y es el que se espera.

set search_path = public, extensions;

drop function if exists public.importar_productos(jsonb, boolean);

create or replace function public.importar_productos(
  p_filas   jsonb,
  p_simular boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_marcas_nuevas       text[] := '{}';
  v_proveedores_sin_ver text[] := '{}';
  v_resultado           jsonb;
  v_usuario             uuid := auth.uid();
begin
  if not public.puede_escribir('productos') then
    raise exception 'Tu rol no puede cargar el maestro de productos'
      using errcode = 'insufficient_privilege';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'importar_productos espera un array jsonb'
      using errcode = 'invalid_parameter_value';
  end if;

  -- -------------------------------------------------------------------
  -- 1. Normalizar la entrada
  -- -------------------------------------------------------------------
  create temp table _entrada on commit drop as
  select
    coalesce((f.value ->> 'fila')::int, f.ord::int + 1) as fila,
    btrim(coalesce(f.value ->> 'codigo', ''))           as codigo,
    upper(btrim(coalesce(f.value ->> 'familia', '')))   as familia,
    upper(btrim(coalesce(f.value ->> 'subfamilia', ''))) as subfamilia,
    upper(btrim(coalesce(f.value ->> 'tipo', '')))      as tipo,
    upper(btrim(coalesce(f.value ->> 'marca', '')))     as marca,
    coalesce(nullif(f.value ->> 'stock', '')::numeric, 0)         as stock,
    coalesce(nullif(f.value ->> 'stock_minimo', '')::numeric, 0)  as stock_minimo,
    coalesce(nullif(f.value ->> 'precio_compra', '')::numeric, 0) as precio_compra,
    coalesce(nullif(f.value ->> 'precio_venta', '')::numeric, 0)  as precio_venta,
    coalesce(nullif(f.value ->> 'precio_minimo', '')::numeric, 0) as precio_minimo,
    -- Columnas nuevas (026). Se guardan como NULL cuando el archivo no las
    -- trae, y no como cero: el cero es un valor y el null es «no me lo digas».
    -- De esa diferencia depende que un archivo parcial no borre lo que había.
    nullif(f.value ->> 'precio_mercado', '')::numeric   as precio_mercado,
    nullif(f.value ->> 'stock_maximo', '')::numeric     as stock_maximo,
    nullif(f.value ->> 'peso', '')::numeric             as peso,
    nullif(btrim(coalesce(f.value ->> 'ubicacion', '')), '')          as ubicacion,
    nullif(btrim(coalesce(f.value ->> 'codigo_fabricante', '')), '')  as codigo_fabricante,
    nullif(btrim(coalesce(f.value ->> 'proveedor', '')), '')          as proveedor,
    f.ord as orden
  from jsonb_array_elements(p_filas) with ordinality as f(value, ord);

  -- -------------------------------------------------------------------
  -- 2. Marcas que faltan
  -- -------------------------------------------------------------------
  select coalesce(array_agg(distinct e.marca order by e.marca), '{}')
    into v_marcas_nuevas
  from _entrada e
  where e.marca <> ''
    and not exists (
      select 1 from marcas m
       where m.nombre_norm = public.normalizar_codigo(e.marca)
    );

  if not p_simular and cardinality(v_marcas_nuevas) > 0 then
    insert into marcas (nombre)
    select unnest(v_marcas_nuevas)
    on conflict (nombre_norm) do nothing;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Resolver contra los catálogos y dictaminar cada fila
  -- -------------------------------------------------------------------
  create temp table _plan on commit drop as
  with resuelto as (
    select
      e.*,
      public.normalizar_codigo(e.codigo) as codigo_norm,
      m.id  as marca_id,
      f.id  as familia_id,
      s.id  as subfamilia_id,
      t.id  as tipo_id,
      t.nombre as tipo_nombre,
      s.familia_id     as sub_familia_id,
      t.subfamilia_id  as tipo_sub_id,
      p.id  as producto_id,
      -- El proveedor se busca por RUC si lo que viene son once dígitos, y por
      -- razón social si no. Willy los escribe por el nombre, pero el día que
      -- pegue una columna de RUC tiene que funcionar igual.
      prov.id as proveedor_id,
      row_number() over (
        partition by public.normalizar_codigo(e.codigo) order by e.orden
      ) as repeticion
    from _entrada e
    left join marcas m on m.nombre_norm = public.normalizar_codigo(e.marca)
    left join familias f    on f.nombre_norm = public.normalizar_codigo(e.familia)
    left join subfamilias s on s.nombre_norm = public.normalizar_codigo(e.subfamilia)
    left join tipos t       on t.nombre_norm = public.normalizar_codigo(e.tipo)
    left join productos p   on p.codigo_norm = public.normalizar_codigo(e.codigo)
    left join proveedores prov
      on e.proveedor is not null
     and (
       prov.numero_documento = regexp_replace(e.proveedor, '[^0-9]', '', 'g')
       or public.normalizar_codigo(prov.razon_social) = public.normalizar_codigo(e.proveedor)
     )
  )
  select
    r.*,
    case
      when r.codigo = ''            then 'Falta el código'
      when r.repeticion > 1         then 'El código se repite en el archivo'
      when r.familia = ''           then 'Falta la familia'
      when r.familia_id is null     then 'La familia "' || r.familia || '" no existe'
      when r.subfamilia = ''        then 'Falta la sub-familia'
      when r.subfamilia_id is null  then 'La sub-familia "' || r.subfamilia || '" no existe'
      when r.sub_familia_id <> r.familia_id
        then 'La sub-familia "' || r.subfamilia || '" no pertenece a ' || r.familia
      when r.tipo = ''              then 'Falta la descripción'
      when r.tipo_id is null        then 'La descripción "' || r.tipo || '" no existe'
      when r.tipo_sub_id <> r.subfamilia_id
        then 'La descripción no pertenece a "' || r.subfamilia || '"'
      when r.precio_compra < 0 or r.precio_venta < 0 or r.precio_minimo < 0
        then 'Hay un precio negativo'
      when coalesce(r.precio_mercado, 0) < 0
        then 'El precio de mercado es negativo'
      when r.stock < 0 or r.stock_minimo < 0 or coalesce(r.stock_maximo, 0) < 0
        then 'Hay un stock negativo'
      when coalesce(r.peso, 0) < 0
        then 'El peso es negativo'
      when r.precio_minimo > 0 and r.precio_venta > 0 and r.precio_minimo > r.precio_venta
        then 'El precio mínimo (' || r.precio_minimo || ') supera al de venta (' || r.precio_venta || ')'
      else null
    end as motivo
  from resuelto r;

  -- El P.V. en blanco se completa con la regla del cliente: costo x 1.20.
  update _plan
     set precio_venta = round(precio_compra * 1.20, 2)
   where motivo is null and precio_venta = 0 and precio_compra > 0;

  -- Proveedores nombrados en el archivo que no están en el maestro. No frenan
  -- nada: se informan para que alguien los dé de alta con su RUC y sus
  -- condiciones, que es donde se hace bien.
  select coalesce(array_agg(distinct p.proveedor order by p.proveedor), '{}')
    into v_proveedores_sin_ver
  from _plan p
  where p.motivo is null and p.proveedor is not null and p.proveedor_id is null;

  -- -------------------------------------------------------------------
  -- 4. Aplicar
  -- -------------------------------------------------------------------
  if not p_simular then
    update _plan p
       set marca_id = m.id
      from marcas m
     where p.marca_id is null
       and m.nombre_norm = public.normalizar_codigo(p.marca);

    insert into productos (
      codigo, descripcion, marca_id, familia_id, subfamilia_id, tipo_id,
      precio_venta, precio_minimo, ultimo_costo, costo_promedio, stock_minimo,
      precio_mercado, stock_maximo, peso_kg, ubicacion, codigo_fabricante,
      proveedor_id, creado_por
    )
    select p.codigo, p.tipo_nombre, p.marca_id, p.familia_id, p.subfamilia_id,
           p.tipo_id, p.precio_venta, p.precio_minimo, p.precio_compra,
           p.precio_compra, p.stock_minimo,
           coalesce(p.precio_mercado, 0), coalesce(p.stock_maximo, 0),
           coalesce(p.peso, 0), p.ubicacion, p.codigo_fabricante,
           p.proveedor_id, v_usuario
      from _plan p
     where p.motivo is null
    on conflict (codigo_norm) do update set
      descripcion    = excluded.descripcion,
      marca_id       = excluded.marca_id,
      familia_id     = excluded.familia_id,
      subfamilia_id  = excluded.subfamilia_id,
      tipo_id        = excluded.tipo_id,
      precio_venta   = excluded.precio_venta,
      precio_minimo  = excluded.precio_minimo,
      ultimo_costo   = excluded.ultimo_costo,
      stock_minimo   = excluded.stock_minimo,
      -- Los campos nuevos SOLO se pisan si el archivo trae valor. Un archivo
      -- parcial —los que faltaban por clasificar— no puede borrar los pesos y
      -- las ubicaciones que ya se cargaron.
      --
      -- El `nullif(…, 0)` es lo que distingue «no venía la columna» de «vale
      -- cero»: en la entrada, la ausencia se guardó como NULL a propósito, y
      -- aquí un cero explícito en el archivo tampoco debería borrar un peso
      -- real. Poner un peso a cero se hace desde la ficha, que deja rastro.
      precio_mercado = coalesce(nullif(excluded.precio_mercado, 0), productos.precio_mercado),
      stock_maximo   = coalesce(nullif(excluded.stock_maximo, 0), productos.stock_maximo),
      peso_kg        = coalesce(nullif(excluded.peso_kg, 0), productos.peso_kg),
      ubicacion      = coalesce(excluded.ubicacion, productos.ubicacion),
      codigo_fabricante = coalesce(excluded.codigo_fabricante, productos.codigo_fabricante),
      proveedor_id   = coalesce(excluded.proveedor_id, productos.proveedor_id),
      actualizado_en = now();
      -- costo_promedio NO se toca al actualizar: a partir de la primera
      -- recepción lo manda el kardex, y pisarlo con el costo del Excel
      -- falsearía el margen de todo el histórico.

    perform public.registrar_movimientos(
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'producto_id',    pr.id,
                 'tipo',           'ingreso',
                 'cantidad',       p.stock,
                 'costo_unitario', p.precio_compra,
                 'referencia_tipo','importacion',
                 'motivo',         'Carga inicial del maestro'
               ))
          from _plan p
          join productos pr on pr.codigo_norm = p.codigo_norm
         where p.motivo is null
           and p.stock > 0
           and p.producto_id is null
      ), '[]'::jsonb),
      v_usuario
    );
  end if;

  -- -------------------------------------------------------------------
  -- 5. Informe
  -- -------------------------------------------------------------------
  select jsonb_build_object(
    'simulado',        p_simular,
    'total',           (select count(*) from _plan),
    'nuevos',          (select count(*) from _plan where motivo is null and producto_id is null),
    'actualizados',    (select count(*) from _plan where motivo is null and producto_id is not null),
    'rechazados',      (select count(*) from _plan where motivo is not null),
    'marcas_nuevas',   to_jsonb(v_marcas_nuevas),
    'proveedores_desconocidos', to_jsonb(v_proveedores_sin_ver),
    -- Cuántas filas traen peso. Es el número que hay que mirar en la carga
    -- real: sin peso no se puede emitir una guía, y hoy no hay ninguno.
    'con_peso',        (select count(*) from _plan where motivo is null and coalesce(peso, 0) > 0),
    'stock_inicial',   (select count(*) from _plan where motivo is null and producto_id is null and stock > 0),
    'stock_ignorado',  (select count(*) from _plan where motivo is null and producto_id is not null and stock > 0),
    'detalle',         coalesce((
      select jsonb_agg(jsonb_build_object(
               'fila',   d.fila,
               'codigo', d.codigo,
               'accion', case
                           when d.motivo is not null   then 'rechazado'
                           when d.producto_id is null  then 'nuevo'
                           else 'actualizado'
                         end,
               'motivo', d.motivo,
               'precio_venta',  d.precio_venta,
               'precio_minimo', d.precio_minimo
             ) order by d.fila)
        from _plan d
    ), '[]'::jsonb)
  ) into v_resultado;

  drop table if exists _entrada;
  drop table if exists _plan;

  return v_resultado;
end $$;

comment on function public.importar_productos(jsonb, boolean) is
  'Importa el maestro de productos desde la plantilla del cliente. Con p_simular=true devuelve el plan sin escribir; con false aplica ESE MISMO plan. El stock inicial solo se carga para productos nuevos, y como movimiento de kardex. Desde la 026 acepta precio de mercado, stock máximo, peso, ubicación, código de fabricante y proveedor; los campos nuevos solo se pisan si el archivo trae valor, para que un archivo parcial no borre lo ya cargado.';

revoke all on function public.importar_productos(jsonb, boolean) from public, anon;
grant execute on function public.importar_productos(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- La comprobación es ESTÁTICA, sobre el cuerpo de la función, y no una
-- llamada de prueba. Llamarla aquí sería lo natural —`p_simular = true` no
-- escribe nada— pero la migración corre sin sesión, así que `auth.uid()` es
-- null, `puede_escribir('productos')` devuelve false y la propia función se
-- niega antes de hacer nada. Que se niegue es exactamente lo que se quiere de
-- ella; lo que no se puede es usarla para probarse a sí misma.
--
-- El camino con datos de verdad está en la prueba de punta a punta, que sí
-- tiene sesión.
do $$
declare v_cuerpo text;
begin
  v_cuerpo := pg_get_functiondef('public.importar_productos(jsonb, boolean)'::regprocedure);

  -- Las seis columnas nuevas tienen que leerse de la entrada.
  if v_cuerpo !~ 'precio_mercado' then raise exception 'El importador no lee precio_mercado'; end if;
  if v_cuerpo !~ 'stock_maximo'   then raise exception 'El importador no lee stock_maximo';   end if;
  if v_cuerpo !~ '''peso'''       then raise exception 'El importador no lee peso';           end if;
  if v_cuerpo !~ 'ubicacion'      then raise exception 'El importador no lee ubicacion';      end if;
  if v_cuerpo !~ 'codigo_fabricante' then raise exception 'El importador no lee codigo_fabricante'; end if;
  if v_cuerpo !~ 'proveedor_id'   then raise exception 'El importador no resuelve el proveedor'; end if;

  -- Y el guardián de rol tiene que seguir en pie: es security definer y está
  -- abierta a `authenticated`, o sea la combinación que vigila la 013.
  if v_cuerpo !~* '(puede_escribir|tiene_rol|es_gerencia)' then
    raise exception 'El importador perdió el control de rol';
  end if;

  -- El peso de un producto que ya existe no se puede borrar con una columna
  -- vacía: es la regla que protege una segunda carga parcial.
  if v_cuerpo !~ 'coalesce\(nullif\(excluded\.peso_kg, 0\), productos\.peso_kg\)' then
    raise exception 'Una columna de peso vacía podría borrar el peso ya cargado';
  end if;

  raise notice 'Importador: seis columnas nuevas, y las vacías ya no borran.';
end $$;
