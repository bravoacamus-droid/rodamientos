-- ###########################################################################
-- 010 · IMPORTADOR DEL MAESTRO DE PRODUCTOS
-- ###########################################################################
--
-- Una sola llamada con `jsonb` para todo el lote. La alternativa —un viaje por
-- fila— hacía que cargar 200 productos fueran 200 idas y vueltas.
--
-- La función corre en dos modos con EL MISMO código de resolución:
--
--   p_simular = true   analiza y devuelve el plan sin escribir nada
--   p_simular = false  aplica ese mismo plan
--
-- Que sea el mismo código es el punto: si la previsualización y la aplicación
-- fueran dos caminos distintos, la pantalla podría prometer algo que el
-- guardado no cumple.
--
-- Formato de cada fila (los nombres son los de la plantilla del cliente):
--
--   { "fila": 2, "codigo": "6205-2RS1/C3", "familia": "RODAMIENTO",
--     "subfamilia": "RIGIDO DE BOLAS", "tipo": "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
--     "marca": "SKF", "stock": 35, "stock_minimo": 8,
--     "precio_compra": 3.26, "precio_venta": 3.92, "precio_minimo": 3.86 }

set local search_path = public, extensions;

-- Retira la versión fila por fila que traía 004 antes de ver el archivo real
-- del cliente. Va por firma: `create or replace` no la habría sustituido —
-- tenía tres parámetros, así que Postgres las trataba como dos funciones
-- distintas y cualquier llamada quedaba ambigua ("function is not unique").
drop function if exists public.importar_productos(jsonb, boolean, boolean);

create or replace function public.importar_productos(
  p_filas   jsonb,
  p_simular boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_marcas_nuevas text[] := '{}';
  v_resultado     jsonb;
  v_usuario       uuid := auth.uid();
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y cargar el maestro de productos
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
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
  -- `on commit drop` no es opcional: PostgREST reutiliza conexiones, y una
  -- temp table que sobreviva al commit reaparecería en la siguiente petición
  -- de otro usuario.
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
    f.ord as orden
  from jsonb_array_elements(p_filas) with ordinality as f(value, ord);

  -- -------------------------------------------------------------------
  -- 2. Marcas que faltan
  -- -------------------------------------------------------------------
  -- Se crean, no se rechazan: que aparezca una marca nueva es lo normal, y
  -- frenar la carga entera por eso obligaría al cliente a pedirnos que la
  -- demos de alta antes de poder importar.
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
      -- Primera aparición del código dentro del propio archivo.
      row_number() over (
        partition by public.normalizar_codigo(e.codigo) order by e.orden
      ) as repeticion
    from _entrada e
    left join marcas m on m.nombre_norm = public.normalizar_codigo(e.marca)
    left join familias f    on f.nombre_norm = public.normalizar_codigo(e.familia)
    left join subfamilias s on s.nombre_norm = public.normalizar_codigo(e.subfamilia)
    left join tipos t       on t.nombre_norm = public.normalizar_codigo(e.tipo)
    left join productos p   on p.codigo_norm = public.normalizar_codigo(e.codigo)
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
      when r.stock < 0 or r.stock_minimo < 0
        then 'Hay un stock negativo'
      when r.precio_minimo > 0 and r.precio_venta > 0 and r.precio_minimo > r.precio_venta
        then 'El precio mínimo (' || r.precio_minimo || ') supera al de venta (' || r.precio_venta || ')'
      else null
    end as motivo
  from resuelto r;

  -- El P.V. en blanco se completa con la regla del cliente: costo x 1.20.
  update _plan
     set precio_venta = round(precio_compra * 1.20, 2)
   where motivo is null and precio_venta = 0 and precio_compra > 0;

  -- -------------------------------------------------------------------
  -- 4. Aplicar
  -- -------------------------------------------------------------------
  if not p_simular then
    -- Las marcas nuevas ya existen; hay que volver a resolverlas.
    update _plan p
       set marca_id = m.id
      from marcas m
     where p.marca_id is null
       and m.nombre_norm = public.normalizar_codigo(p.marca);

    -- `descripcion` es el nombre del TIPO. En el archivo del cliente la
    -- columna DESCRIPCION es justamente eso, y es lo que se imprime en la
    -- cotización; el código es lo que distingue una fila de otra (C3).
    insert into productos (
      codigo, descripcion, marca_id, familia_id, subfamilia_id, tipo_id,
      precio_venta, precio_minimo, ultimo_costo, costo_promedio, stock_minimo,
      creado_por
    )
    select p.codigo, p.tipo_nombre, p.marca_id, p.familia_id, p.subfamilia_id,
           p.tipo_id, p.precio_venta, p.precio_minimo, p.precio_compra,
           p.precio_compra, p.stock_minimo, v_usuario
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
      actualizado_en = now();
      -- costo_promedio NO se toca al actualizar: a partir de la primera
      -- recepción lo manda el kardex, y pisarlo con el costo del Excel
      -- falsearía el margen de todo el histórico.

    -- Stock inicial SOLO de los productos que se acaban de crear.
    --
    -- Para uno que ya existía, sobrescribir el stock desde un Excel rompería
    -- la trazabilidad: el saldo dejaría de ser la suma de sus movimientos.
    -- Ese caso se corrige por Ajuste de inventario, que sí deja rastro.
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
           and p.producto_id is null   -- era nuevo antes de esta importación
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
  'Importa el maestro de productos desde la plantilla del cliente. Con p_simular=true devuelve el plan sin escribir; con false aplica ESE MISMO plan. El stock inicial solo se carga para productos nuevos, y como movimiento de kardex, nunca como escritura directa del saldo.';

revoke all on function public.importar_productos(jsonb, boolean) from public, anon;
grant execute on function public.importar_productos(jsonb, boolean) to authenticated;
