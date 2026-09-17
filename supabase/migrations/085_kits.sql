-- ###########################################################################
-- KITS: varios productos que se cotizan y se facturan como UNO
-- ###########################################################################
--
-- Willy, 16/09 (8:58): *«cotízame esta lista de productos, unos 5 ítems. Pero
-- al final todo eso entra como entra una sola máquina: me lo vas a presentar
-- como un kit, kit de reparación para motorreductor de tal máquina»*. Y hoy lo
-- hace a mano: cotiza los cinco ítems, mira el total, y **escribe otra
-- cotización** de un solo ítem con ese precio.
--
-- Luis, 17/09, con el diseño: *«un kit es poner varios productos como haciendo
-- una cotización, se le pone un código único, una descripción, stock, precio
-- general —o sea la suma de todos los productos—. Cuando van a hacer una
-- cotización llaman por código como siempre… es como los kits de cámaras de
-- seguridad: te viene el cable, las cámaras, el DVR, los accesorios, y te lo
-- venden como kit, no por separado»*.
--
-- ---------------------------------------------------------------------------
-- El kit ES un producto. Esa es toda la idea
-- ---------------------------------------------------------------------------
-- No una tabla aparte con su propio buscador, su propio cotizador y su propia
-- forma de facturarse. Un producto con una marca de «esto es un kit» y su
-- lista de componentes, y entonces **todo lo que ya funciona sigue
-- funcionando**: `buscar_productos` lo encuentra por código, el constructor lo
-- agrega como una línea, el documento lo imprime como un ítem, la factura lo
-- declara como una operación.
--
-- Hacerlo aparte habría obligado a reescribir cinco pantallas para que
-- supieran de una segunda clase de cosa vendible.
--
-- ---------------------------------------------------------------------------
-- El stock NO se guarda: se calcula
-- ---------------------------------------------------------------------------
-- Decisión de Luis, 17/09, con las dos opciones delante. Un kit no lleva un
-- número propio en `stock`; se responde **cuántos se pueden armar** con lo que
-- hay: el mínimo de `floor(stock_componente / cantidad_en_kit)`.
--
-- La alternativa era que Willy registrara «armé 5 kits» y que eso moviera el
-- kardex. Es más fiel a la bolsa del estante, pero depende de que alguien se
-- acuerde de registrarlo — y en este proyecto todo lo que hay que acordarse de
-- hacer acaba sin hacerse. Un stock que se calcula no puede mentir.
--
-- Consecuencia buena, y no es menor: al despachar salen los COMPONENTES, que
-- es lo que de verdad sale del almacén y lo que el almacén tiene que meter en
-- la caja.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1 · La marca en el producto
-- ---------------------------------------------------------------------------
alter table productos
  add column if not exists es_kit boolean not null default false;

comment on column productos.es_kit is
  'Este producto es un KIT: se vende como uno solo y su contenido está en kit_componentes. Su stock no se guarda, se calcula con stock_armable().';

create index if not exists ix_productos_kit on productos (es_kit) where es_kit;

-- ---------------------------------------------------------------------------
-- 2 · Qué lleva dentro
-- ---------------------------------------------------------------------------
create table if not exists kit_componentes (
  kit_id      uuid not null references productos(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete restrict,
  cantidad    numeric(14,2) not null,
  orden       smallint not null default 1,
  primary key (kit_id, producto_id),
  constraint kit_comp_cant_pos check (cantidad > 0),
  -- Un kit dentro de sí mismo es un bucle infinito al calcular el stock.
  constraint kit_comp_no_se_contiene check (kit_id <> producto_id)
);

comment on table kit_componentes is
  'Lo que lleva un kit. Willy, 16/09: «me lo vas a presentar como un kit; todo lo que he cotizado se debe traducir a una sola descripción».';

create index if not exists ix_kit_comp_producto on kit_componentes (producto_id);

alter table kit_componentes enable row level security;

drop policy if exists "lectura_autenticados" on public.kit_componentes;
create policy "lectura_autenticados" on public.kit_componentes
  for select to authenticated
  using ((select public.mi_rol()) is not null);

-- Escribe quien puede escribir el catálogo: armar un kit es definir un
-- producto, no una operación de almacén.
drop policy if exists "escritura_insert" on public.kit_componentes;
create policy "escritura_insert" on public.kit_componentes
  for insert to authenticated
  with check ((select public.puede_escribir('productos')));

drop policy if exists "escritura_update" on public.kit_componentes;
create policy "escritura_update" on public.kit_componentes
  for update to authenticated
  using ((select public.puede_escribir('productos')))
  with check ((select public.puede_escribir('productos')));

drop policy if exists "escritura_delete" on public.kit_componentes;
create policy "escritura_delete" on public.kit_componentes
  for delete to authenticated
  using ((select public.puede_escribir('productos')));

-- ---------------------------------------------------------------------------
-- 3 · Un kit no puede contener otro kit
-- ---------------------------------------------------------------------------
-- No por dogma: porque el stock de un kit se calcula desde sus componentes, y
-- un kit dentro de otro convierte ese cálculo en una recursión que hay que
-- limitar, detectar y explicar. Willy arma kits de piezas, no de kits.
create or replace function public.kit_solo_lleva_piezas()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from productos p where p.id = new.kit_id and p.es_kit) then
    raise exception 'Ese producto no es un kit.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from productos p where p.id = new.producto_id and p.es_kit) then
    raise exception 'Un kit no puede llevar otro kit dentro.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists tg_kit_solo_lleva_piezas on public.kit_componentes;
create trigger tg_kit_solo_lleva_piezas
  before insert or update on public.kit_componentes
  for each row execute function public.kit_solo_lleva_piezas();

-- ---------------------------------------------------------------------------
-- 4 · Cuántos se pueden armar
-- ---------------------------------------------------------------------------
create or replace function public.stock_armable(p_kit uuid)
returns numeric
language sql stable security definer set search_path = public, extensions
as $$
  -- El componente que menos alcanza manda: con 12 rodamientos y 3 retenes,
  -- un kit que lleva uno de cada uno da 3, no 12.
  --
  -- `floor`: medio kit no se vende. Y un kit SIN componentes da 0, no
  -- infinito — un kit vacío no se puede armar, y `coalesce(min(...), 0)` es
  -- lo que evita que un `min` sobre cero filas devuelva null y se lea como
  -- «hay de sobra».
  select coalesce(
    min(floor(coalesce(s.cantidad, 0) / kc.cantidad)),
    0
  )
  from kit_componentes kc
  left join stock s on s.producto_id = kc.producto_id
  where kc.kit_id = p_kit;
$$;

grant execute on function public.stock_armable(uuid) to authenticated;

comment on function public.stock_armable is
  'Cuántas unidades de este kit se pueden armar con el stock que hay. El componente que menos alcanza manda. Decisión de Luis, 17/09: el kit no guarda stock propio porque un stock que se calcula no puede mentir.';

-- ---------------------------------------------------------------------------
-- 5 · Y cuánto cuesta y cuánto vale, sumando
-- ---------------------------------------------------------------------------
-- Willy: *«hay que ingresar el precio de cada uno para que te calcule el
-- precio final, nada más, pero no se debe mostrar el precio individual de cada
-- parte»*. La suma se CALCULA, y lo que se guarda en `productos.precio_venta`
-- es lo que se decide cobrar — que puede ser la suma redondeada, o menos.
create or replace function public.kit_suma(p_kit uuid)
returns table (venta numeric, costo numeric)
language sql stable security definer set search_path = public, extensions
as $$
  select
    coalesce(sum(p.precio_venta * kc.cantidad), 0),
    -- El mismo criterio que en el cotizador: el costo del kardex manda y el
    -- de la ficha es el respaldo (083).
    coalesce(sum(coalesce(nullif(p.costo_promedio, 0), p.ultimo_costo) * kc.cantidad), 0)
  from kit_componentes kc
  join productos p on p.id = kc.producto_id
  where kc.kit_id = p_kit;
$$;

grant execute on function public.kit_suma(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · La familia donde viven
-- ---------------------------------------------------------------------------
-- `productos` exige marca, familia y sub-familia. Un kit no tiene marca —lleva
-- piezas de varias— así que usa «SIN MARCA», que ya existe para los 396
-- productos que entraron del Excel sin ella.
--
-- La familia sí hace falta crearla, y NO es un dato del cliente: es estructura,
-- como las unidades de medida o los motivos de traslado del seed. Sin ella un
-- kit no se puede ni insertar.
do $$
declare
  v_fam uuid;
begin
  select id into v_fam from familias where nombre_norm = public.normalizar_codigo('KITS');

  -- `codigo` es obligatorio y tiene formato propio (`^[A-Z0-9_-]{2,20}$`).
  if v_fam is null then
    insert into familias (codigo, nombre, orden)
    values ('KITS', 'KITS', 10)
    returning id into v_fam;
  end if;

  if not exists (
    select 1 from subfamilias
    where familia_id = v_fam and nombre_norm = public.normalizar_codigo('KITS')
  ) then
    insert into subfamilias (familia_id, codigo, nombre)
    values (v_fam, 'KITS', 'KITS');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7 · El buscador devuelve el stock ARMABLE de los kits
-- ---------------------------------------------------------------------------
-- Es lo que hace que el kit se pueda cotizar como cualquier producto sin tocar
-- ni una pantalla: se teclea el código, sale con su stock, se agrega.
--
-- `drop` + `create` otra vez, por lo de siempre: `create or replace function`
-- no puede cambiar el tipo de retorno, y es lo que dejó esta función tres
-- semanas sin reemplazarse (082).
drop function if exists public.buscar_productos(text, int, boolean);
drop function if exists public.buscar_productos(text, integer, boolean);

create function public.buscar_productos(
  p_q              text,
  p_limit          int default 30,
  p_solo_con_stock boolean default false
) returns table (
  id uuid, codigo text, codigo_fabricante text, descripcion text,
  marca text, familia text, subfamilia text, tipo text,
  unidad text, stock numeric,
  precio_venta numeric, precio_promedio numeric,
  precio_minimo numeric, precio_mercado numeric,
  costo_promedio numeric, ultimo_costo numeric,
  estado_stock text,
  es_kit boolean,
  relevancia real
)
language sql stable security definer set search_path = public, extensions
as $$
  with base as (
    select p.*,
           m.nombre as marca_nombre, f.nombre as familia_nombre,
           sf.nombre as subfamilia_nombre, t.nombre as tipo_nombre,
           -- Aquí está todo el truco del kit: su stock no se lee, se calcula.
           case when p.es_kit
                then public.stock_armable(p.id)
                else coalesce(s.cantidad, 0)
           end as stock_real,
           greatest(
             similarity(p.busqueda, public.normalizar_texto(p_q)),
             similarity(m.nombre_norm, public.normalizar_codigo(p_q))
           ) as rel
    from productos p
    join marcas m       on m.id = p.marca_id
    join familias f     on f.id = p.familia_id
    join subfamilias sf on sf.id = p.subfamilia_id
    left join tipos t   on t.id = p.tipo_id
    left join stock s   on s.producto_id = p.id
    where not p.archivado
      and (
        p_q is null or btrim(p_q) = ''
        or p.busqueda % public.normalizar_texto(p_q)
        or p.busqueda like '%' || public.normalizar_texto(p_q) || '%'
        or m.nombre_norm like '%' || public.normalizar_codigo(p_q) || '%'
      )
  )
  select b.id, b.codigo, b.codigo_fabricante, b.descripcion,
         b.marca_nombre, b.familia_nombre, b.subfamilia_nombre, b.tipo_nombre,
         b.unidad_codigo,
         b.stock_real,
         b.precio_venta, b.precio_promedio,
         b.precio_minimo, b.precio_mercado,
         b.costo_promedio, b.ultimo_costo,
         case
           when b.stock_real <= 0 then 'sin_stock'
           when b.stock_real <= b.stock_minimo then 'bajo'
           else 'ok'
         end,
         b.es_kit,
         b.rel
  from base b
  where (not p_solo_con_stock or b.stock_real > 0)
  order by
    (b.codigo_norm = public.normalizar_codigo(p_q)) desc,
    b.rel desc,
    b.codigo
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.buscar_productos(text, int, boolean) to authenticated;

-- ###########################################################################
-- Centinela
-- ###########################################################################
do $$
declare
  una_marca text;
  encontrados int;
begin
  -- Las columnas, ejecutando la función (la lección de la 082).
  perform b.precio_minimo, b.precio_mercado, b.costo_promedio, b.ultimo_costo,
          b.marca, b.es_kit
  from public.buscar_productos('a', 1, false) b;

  if exists (
    select 1 from public.buscar_productos('', 50, false)
    where estado_stock not in ('sin_stock', 'bajo', 'ok')
  ) then
    raise exception 'buscar_productos devuelve un estado_stock desconocido';
  end if;

  -- Y que buscar por MARCA siga encontrando: es lo que estuvo roto tres
  -- semanas y lo que este `drop + create` podría volver a romper.
  select m.nombre into una_marca
  from marcas m
  join productos p on p.marca_id = m.id and not p.archivado
  group by m.nombre order by count(*) desc limit 1;

  if una_marca is not null then
    select count(*) into encontrados
    from public.buscar_productos(una_marca, 50, false) b
    where b.marca = una_marca;
    if encontrados = 0 then
      raise exception 'buscar_productos(%) no devuelve productos de esa marca', una_marca;
    end if;
  end if;

  -- Un kit sin componentes da 0, no null ni infinito.
  if public.stock_armable(gen_random_uuid()) <> 0 then
    raise exception 'stock_armable de un kit vacío tiene que ser 0';
  end if;

  if not exists (select 1 from familias where nombre_norm = public.normalizar_codigo('KITS')) then
    raise exception 'No se creó la familia KITS';
  end if;
end $$;
