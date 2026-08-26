-- ###########################################################################
-- 027 · INFORMES POR RANGO DE FECHAS
-- ###########################################################################
--
-- Willy, 26/08. Es lo primero que echó en falta al ver el tablero (2:00):
--
--   «Faltaría aquí los filtros por día, por mes, por año, entre fechas. De tal
--    fecha a tal fecha cuánto he vendido.»
--
-- Y al llegar a informes (28:47) pidió cuatro cosas concretas:
--
--   · ventas históricas con esos filtros,
--   · el COSTO histórico con los mismos filtros, «que se va a jalar
--     directamente las órdenes de compra»,
--   · los productos más vendidos **asociados a cliente**, y
--   · los principales clientes: «cuánto le compran y en qué tiempo le compran».
--
-- Lo de «asociado a cliente» no es un adorno del ranking. Sale de esto (9:01):
--
--   «Si yo compro una mercadería, ¿para quién va dirigida? Puede que lo consuma
--    uno o puede que lo consuman dos clientes. Yo compro en función a lo que
--    demandan uno o dos.»
--
-- O sea que la pregunta no es «qué se vende más» sino «qué compra QUIÉN», para
-- poder reponer mirando a quién se lo va a colocar.
--
-- ---------------------------------------------------------------------------
-- Por qué funciones y no vistas
-- ---------------------------------------------------------------------------
-- Una vista no recibe parámetros. Con vistas habría que traer todo el histórico
-- y filtrarlo desde PostgREST, lo que impide agrupar por periodo en la base:
-- el `date_trunc` tiene que ocurrir ANTES del `group by`, y el cliente no puede
-- inyectarlo en una vista.
--
-- La granularidad se valida contra una lista cerrada, nunca se interpola: es
-- texto que llega del navegador y va a parar dentro de un `date_trunc`.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Ayudante: la granularidad, saneada
-- ---------------------------------------------------------------------------
create or replace function public.unidad_periodo(p_grano text)
returns text
language sql immutable
as $$
  select case lower(coalesce(p_grano, 'mes'))
           when 'dia'    then 'day'
           when 'día'    then 'day'
           when 'semana' then 'week'
           when 'mes'    then 'month'
           when 'anio'   then 'year'
           when 'año'    then 'year'
           else 'month'
         end
$$;

comment on function public.unidad_periodo(text) is
  'Traduce la granularidad que manda la pantalla a la de date_trunc, contra una lista cerrada. Nunca se interpola texto del navegador dentro de date_trunc.';

-- ---------------------------------------------------------------------------
-- 1 · Ventas por periodo
-- ---------------------------------------------------------------------------
create or replace function public.serie_ventas(
  p_desde date,
  p_hasta date,
  p_grano text default 'mes'
) returns table (
  periodo date,
  documentos bigint,
  venta numeric,
  costo numeric,
  margen numeric,
  margen_pct numeric,
  unidades numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  select
    date_trunc(public.unidad_periodo(p_grano), c.fecha_emision)::date as periodo,
    count(distinct c.id)                       as documentos,
    round(sum(c.op_gravada), 2)                as venta,
    round(sum(c.costo_total), 2)               as costo,
    round(sum(c.op_gravada) - sum(c.costo_total), 2) as margen,
    -- Sobre el COSTO (023).
    case when sum(c.costo_total) > 0
         then round((sum(c.op_gravada) - sum(c.costo_total)) / sum(c.costo_total) * 100, 2)
         else 0 end                            as margen_pct,
    coalesce((
      select round(sum(ci.cantidad), 2) from comprobante_items ci
       where ci.comprobante_id = any(array_agg(c.id))
    ), 0)                                      as unidades
  from comprobantes c
  where c.estado <> 'anulado'
    and c.tipo in ('factura','boleta')
    and c.fecha_emision between p_desde and p_hasta
  group by 1
  order by 1;
$$;

comment on function public.serie_ventas(date, date, text) is
  'Ventas agrupadas por día, semana, mes o año dentro de un rango. Solo facturas y boletas: las notas corrigen un documento anterior y sumarlas contaría la venta dos veces.';

-- ---------------------------------------------------------------------------
-- 2 · Costo por periodo · de las ÓRDENES DE COMPRA
-- ---------------------------------------------------------------------------
-- Willy pidió expresamente que salga «directamente de las órdenes de compra».
--
-- Conviene tener presente qué mide y qué no: esto es lo que se PIDIÓ y cuándo
-- se pidió, no lo que entró al almacén. Una compra de agosto que llega en
-- septiembre cuenta en agosto. Para el costo de lo que se vendió está
-- `serie_ventas.costo`, que sale del kardex; para lo que entró, el kardex
-- mismo. Son tres preguntas distintas y mezclarlas es lo que hace que un
-- informe no cuadre con otro.
create or replace function public.serie_compras(
  p_desde date,
  p_hasta date,
  p_grano text default 'mes'
) returns table (
  periodo date,
  ordenes bigint,
  proveedores bigint,
  subtotal numeric,
  gastos numeric,
  costo_total numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  select
    date_trunc(public.unidad_periodo(p_grano), c.fecha)::date as periodo,
    count(*)                                as ordenes,
    count(distinct c.proveedor_id)          as proveedores,
    round(sum(c.subtotal), 2)               as subtotal,
    round(sum(c.gastos_importacion), 2)     as gastos,
    -- Sin IGV: es crédito fiscal recuperable, no costo. Con gastos de
    -- importación, que sí lo son.
    round(sum(c.subtotal + c.gastos_importacion), 2) as costo_total
  from compras c
  where c.estado <> 'anulada'
    and c.fecha between p_desde and p_hasta
  group by 1
  order by 1;
$$;

comment on function public.serie_compras(date, date, text) is
  'Costo de las órdenes de compra por periodo (Willy 26/08, 28:47). Mide lo que se PIDIÓ y cuándo, no lo que entró al almacén; sin IGV, que es crédito fiscal, y con gastos de importación, que sí son costo.';

-- ---------------------------------------------------------------------------
-- 3 · Lo más vendido, y A QUIÉN
-- ---------------------------------------------------------------------------
create or replace function public.top_productos_rango(
  p_desde date,
  p_hasta date,
  p_limit int default 20
) returns table (
  producto_id uuid,
  codigo text,
  descripcion text,
  marca text,
  unidades numeric,
  venta numeric,
  costo numeric,
  margen numeric,
  margen_pct numeric,
  clientes bigint,
  documentos bigint,
  cliente_principal text,
  cliente_principal_id uuid,
  cliente_principal_pct numeric,
  ultima_venta date
)
language sql stable security definer set search_path = public, extensions
as $$
  with lineas as (
    select ci.producto_id, c.cliente_id, c.id as comprobante_id,
           ci.cantidad, ci.importe,
           round(ci.cantidad * ci.costo_unitario, 2) as costo,
           c.fecha_emision
    from comprobante_items ci
    join comprobantes c on c.id = ci.comprobante_id
    where c.estado <> 'anulado'
      and c.tipo in ('factura','boleta')
      and c.fecha_emision between p_desde and p_hasta
      and ci.producto_id is not null
  ),
  por_producto as (
    select l.producto_id,
           sum(l.cantidad)                as unidades,
           round(sum(l.importe), 2)       as venta,
           round(sum(l.costo), 2)         as costo,
           count(distinct l.cliente_id)   as clientes,
           count(distinct l.comprobante_id) as documentos,
           max(l.fecha_emision)           as ultima_venta
    from lineas l group by l.producto_id
  ),
  -- El cliente que más se llevó de cada código, con su peso sobre el total.
  -- Es la respuesta a «¿para quién compro esta mercadería?» (9:01): si uno
  -- solo se lleva el 90 %, reponer es una conversación con él, no una apuesta.
  principal as (
    select distinct on (l.producto_id)
           l.producto_id, l.cliente_id, sum(l.importe) as venta_cliente
    from lineas l
    group by l.producto_id, l.cliente_id
    order by l.producto_id, sum(l.importe) desc
  )
  select
    p.producto_id,
    pr.codigo,
    pr.descripcion,
    m.nombre                       as marca,
    p.unidades,
    p.venta,
    p.costo,
    round(p.venta - p.costo, 2)    as margen,
    case when p.costo > 0
         then round((p.venta - p.costo) / p.costo * 100, 2)
         else 0 end                as margen_pct,
    p.clientes,
    p.documentos,
    cl.razon_social                as cliente_principal,
    cl.id                          as cliente_principal_id,
    case when p.venta > 0
         then round(pp.venta_cliente / p.venta * 100, 1)
         else 0 end                as cliente_principal_pct,
    p.ultima_venta
  from por_producto p
  join productos pr on pr.id = p.producto_id
  join marcas m     on m.id = pr.marca_id
  left join principal pp on pp.producto_id = p.producto_id
  left join clientes cl  on cl.id = pp.cliente_id
  order by p.venta desc
  limit greatest(p_limit, 1);
$$;

comment on function public.top_productos_rango(date, date, int) is
  'Ranking de lo más vendido en un rango, con el cliente que más se lleva de cada código y su peso. Willy 26/08 (9:01): «yo compro en función a lo que demandan uno o dos».';

-- ---------------------------------------------------------------------------
-- 4 · Los que más compran, y CADA CUÁNTO
-- ---------------------------------------------------------------------------
create or replace function public.top_clientes_rango(
  p_desde date,
  p_hasta date,
  p_limit int default 20
) returns table (
  cliente_id uuid,
  cliente text,
  documento text,
  documentos bigint,
  venta numeric,
  costo numeric,
  margen numeric,
  margen_pct numeric,
  primera_compra date,
  ultima_compra date,
  dias_entre_compras numeric,
  dias_sin_comprar int
)
language sql stable security definer set search_path = public, extensions
as $$
  with ventas as (
    select c.cliente_id, c.id, c.fecha_emision, c.op_gravada, c.costo_total
    from comprobantes c
    where c.estado <> 'anulado'
      and c.tipo in ('factura','boleta')
      and c.fecha_emision between p_desde and p_hasta
  ),
  agrupado as (
    select v.cliente_id,
           count(*)                     as documentos,
           round(sum(v.op_gravada), 2)  as venta,
           round(sum(v.costo_total), 2) as costo,
           min(v.fecha_emision)         as primera,
           max(v.fecha_emision)         as ultima
    from ventas v group by v.cliente_id
  )
  select
    a.cliente_id,
    cl.razon_social,
    cl.numero_documento,
    a.documentos,
    a.venta,
    a.costo,
    round(a.venta - a.costo, 2) as margen,
    case when a.costo > 0
         then round((a.venta - a.costo) / a.costo * 100, 2)
         else 0 end             as margen_pct,
    a.primera,
    a.ultima,
    -- «En qué tiempo le compran» (28:47). Con UN solo documento no hay
    -- intervalo que medir y se devuelve null, no cero: cero diría «compra
    -- todos los días», que es lo contrario de la verdad.
    case when a.documentos > 1
         then round((a.ultima - a.primera)::numeric / (a.documentos - 1), 1)
         else null end          as dias_entre_compras,
    -- Contra HOY, no contra el fin del rango.
    --
    -- Con `p_hasta` a secas, mirar «todo 2026» un 26 de agosto decía que el
    -- cliente llevaba 127 días sin comprar: los días que van de su última
    -- compra al 31 de diciembre, que todavía no han pasado. Un número que
    -- cuenta el futuro es peor que no tenerlo, porque nadie lo mira dos veces.
    --
    -- Se toma el menor de los dos: si el rango termina en el pasado —un
    -- informe de 2025— la referencia es el fin del rango, que es hasta donde
    -- se está mirando.
    (least(p_hasta, current_date) - a.ultima)::int as dias_sin_comprar
  from agrupado a
  join clientes cl on cl.id = a.cliente_id
  order by a.venta desc
  limit greatest(p_limit, 1);
$$;

comment on function public.top_clientes_rango(date, date, int) is
  'Los que más compran en un rango, con cada cuánto lo hacen y cuánto llevan sin aparecer. Willy 26/08 (28:47): «cuánto le compran y en qué tiempo le compran».';

-- ---------------------------------------------------------------------------
-- 5 · El cruce producto × cliente
-- ---------------------------------------------------------------------------
-- La lista completa de quién compró un código, para abrirla desde el ranking.
create or replace function public.clientes_de_producto(
  p_producto uuid,
  p_desde date,
  p_hasta date
) returns table (
  cliente_id uuid,
  cliente text,
  unidades numeric,
  venta numeric,
  documentos bigint,
  ultimo_precio numeric,
  ultima_compra date
)
language sql stable security definer set search_path = public, extensions
as $$
  with lineas as (
    select c.cliente_id, c.id as comprobante_id, c.fecha_emision,
           ci.cantidad, ci.importe, ci.valor_unitario
    from comprobante_items ci
    join comprobantes c on c.id = ci.comprobante_id
    where ci.producto_id = p_producto
      and c.estado <> 'anulado'
      and c.tipo in ('factura','boleta')
      and c.fecha_emision between p_desde and p_hasta
  )
  select
    l.cliente_id,
    cl.razon_social,
    sum(l.cantidad)                  as unidades,
    round(sum(l.importe), 2)         as venta,
    count(distinct l.comprobante_id) as documentos,
    -- El precio de la ÚLTIMA vez, que es el que hay que sostener si vuelve a
    -- llamar. El promedio no sirve para eso: nadie negocia contra un promedio.
    (array_agg(l.valor_unitario order by l.fecha_emision desc))[1] as ultimo_precio,
    max(l.fecha_emision)             as ultima_compra
  from lineas l
  join clientes cl on cl.id = l.cliente_id
  group by l.cliente_id, cl.razon_social
  order by sum(l.importe) desc;
$$;

comment on function public.clientes_de_producto(uuid, date, date) is
  'Quién compró un código y a qué precio la última vez. Se abre desde el ranking de productos.';

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- Son de solo lectura (`stable`) y no escriben nada, así que no las alcanza el
-- centinela de la 013, que vigila las volátiles. Se abren a `authenticated`
-- igual que el resto de la analítica: RLS ya deja leer todo a cualquier perfil
-- activo, así que no exponen nada que no se pudiera consultar tabla a tabla.
do $$
declare f text;
begin
  foreach f in array array[
    'public.unidad_periodo(text)',
    'public.serie_ventas(date, date, text)',
    'public.serie_compras(date, date, text)',
    'public.top_productos_rango(date, date, int)',
    'public.top_clientes_rango(date, date, int)',
    'public.clientes_de_producto(uuid, date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_n int;
  v_grano text;
begin
  -- La granularidad se sanea: cualquier cosa rara cae a mes, y nada de lo que
  -- llegue del navegador acaba dentro de `date_trunc`.
  if public.unidad_periodo('dia') <> 'day' then raise exception 'unidad_periodo no traduce «dia»'; end if;
  if public.unidad_periodo('año') <> 'year' then raise exception 'unidad_periodo no traduce «año»'; end if;
  if public.unidad_periodo(null) <> 'month' then raise exception 'unidad_periodo no aguanta null'; end if;

  v_grano := public.unidad_periodo('day''); drop table productos; --');
  if v_grano <> 'month' then
    raise exception 'unidad_periodo dejó pasar texto que no es una granularidad: %', v_grano;
  end if;

  -- Las cinco responden con un rango vacío sin reventar. Un informe de un
  -- periodo sin ventas es una respuesta legítima, y es el caso en que más
  -- fácil se cuela una división por cero.
  select count(*) into v_n from public.serie_ventas('1900-01-01', '1900-01-02', 'dia');
  select count(*) into v_n from public.serie_compras('1900-01-01', '1900-01-02', 'mes');
  select count(*) into v_n from public.top_productos_rango('1900-01-01', '1900-01-02', 5);
  select count(*) into v_n from public.top_clientes_rango('1900-01-01', '1900-01-02', 5);
  select count(*) into v_n from public.clientes_de_producto(
    '00000000-0000-0000-0000-000000000000'::uuid, '1900-01-01', '1900-01-02');

  -- «Días sin comprar» no puede contar días que no han pasado. Un rango que
  -- termina el año que viene tiene que medir contra hoy.
  if exists (
    select 1 from public.top_clientes_rango('2000-01-01', current_date + 365, 50)
     where dias_sin_comprar > (current_date - '2000-01-01'::date)
  ) then
    raise exception 'dias_sin_comprar está contando días futuros';
  end if;

  raise notice 'Informes por rango: cinco consultas con filtro de fecha y granularidad.';
end $$;
