-- ###########################################################################
-- 104 · TABLERO EJECUTIVO: clientes, cotizaciones y facturación, por rango
-- ###########################################################################
--
-- Luis, 06/10, con lo que pide Willy: *«quiere reporte de clientes, gestión
-- total de cómo van, qué compran más, con gráficos; comparación de sus meses
-- pasados […] reporte también de cotizaciones, cómo van, cuántos están en
-- proceso, cuáles no […] otro módulo de facturación»*.
--
-- Informes (027) ya agrupa ventas y compras por rango, pero solo mira «cuánto
-- se vendió». Lo que se pide son tres preguntas más:
--
--   · CLIENTES — quién compra, quién compra más que antes, quién dejó de
--     venir y quién es nuevo. Para eso hay que mirar dos rangos a la vez (el
--     elegido y el de comparación) y la primera compra de toda la historia.
--   · COTIZACIONES — cuántas siguen en juego, cuántas se ganan y en cuánto
--     tiempo, y cuáles se están venciendo sin respuesta.
--   · FACTURACIÓN — lo emitido, lo anulado, las notas de crédito, contado
--     contra crédito, lo que falta cobrar y cómo está con SUNAT.
--
-- Cada pestaña hace UNA llamada por rango y recibe un jsonb. Es la regla del
-- módulo de informes: Postgres agrega, Next no. Con 1.262 líneas de factura
-- hoy daría igual; con cinco años de histórico, no.
--
-- QUÉ ES «VENTA» aquí, igual que en `serie_ventas` para que las dos pantallas
-- cuadren al céntimo: facturas y boletas NO anuladas, `op_gravada` (sin IGV).
-- Las notas de crédito van aparte y se restan solo en «neto»: mezclarlas en la
-- venta haría que el gráfico de Informes y el de aquí dijeran cosas distintas.
--
-- SECURITY INVOKER, no definer como `serie_ventas`: las cinco tablas que se
-- leen ya dejan leer a cualquier usuario con rol (`lectura_autenticados`), así
-- que no hace falta saltarse RLS — y si un día se restringe, esto se restringe
-- con ellas sin tocarlo. `anon` no tiene rol y no ve nada.
-- ###########################################################################


-- ---------------------------------------------------------------------------
-- 1 · Facturación
-- ---------------------------------------------------------------------------
create or replace function public.tablero_facturacion(
  p_desde   date,
  p_hasta   date,
  p_grano   text default 'mes',
  p_cliente uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with base as (
    select c.*
      from comprobantes c
     where c.fecha_emision between p_desde and p_hasta
       and (p_cliente is null or c.cliente_id = p_cliente)
  ),
  ventas as (
    select * from base where tipo in ('factura', 'boleta') and estado <> 'anulado'
  ),
  notas as (
    select * from base where tipo = 'nota_credito' and estado <> 'anulado'
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'documentos',    (select count(*) from ventas),
      'facturas',      (select count(*) from ventas where tipo = 'factura'),
      'boletas',       (select count(*) from ventas where tipo = 'boleta'),
      'venta',         (select coalesce(round(sum(op_gravada), 2), 0) from ventas),
      'igv',           (select coalesce(round(sum(igv), 2), 0) from ventas),
      'total',         (select coalesce(round(sum(total), 2), 0) from ventas),
      'notas',         (select count(*) from notas),
      'notas_monto',   (select coalesce(round(sum(op_gravada), 2), 0) from notas),
      'anuladas',      (select count(*) from base
                         where tipo in ('factura', 'boleta') and estado = 'anulado'),
      'anulado_monto', (select coalesce(round(sum(op_gravada), 2), 0) from base
                         where tipo in ('factura', 'boleta') and estado = 'anulado'),
      'clientes',      (select count(distinct cliente_id) from ventas),
      'cobrado',       (select coalesce(round(sum(pagado), 2), 0) from ventas),
      'saldo',         (select coalesce(round(sum(saldo), 2), 0) from ventas),
      -- Lo vencido es de HOY, no del fin del rango: es dinero que ya se
      -- debería tener, y eso solo se sabe contra el reloj.
      'vencido',       (select coalesce(round(sum(saldo), 2), 0) from ventas
                         where saldo > 0 and fecha_vencimiento < current_date),
      'contado',       (select coalesce(round(sum(op_gravada), 2), 0) from ventas
                         where condicion_pago = 'contado'),
      'credito',       (select coalesce(round(sum(op_gravada), 2), 0) from ventas
                         where condicion_pago = 'credito'),
      'sunat_aceptado',  (select count(*) from base
                           where estado_sunat in ('aceptado', 'baja_aceptada')),
      'sunat_pendiente', (select count(*) from base
                           where estado_sunat in ('no_enviado', 'pendiente', 'enviado', 'baja_solicitada')),
      'sunat_problema',  (select count(*) from base
                           where estado_sunat in ('observado', 'rechazado'))
    ),

    'serie', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.periodo)
        from (
          select date_trunc(unidad_periodo(p_grano), b.fecha_emision)::date as periodo,
                 count(*) filter (where b.tipo in ('factura', 'boleta') and b.estado <> 'anulado')
                   as documentos,
                 coalesce(round(sum(b.op_gravada) filter (
                   where b.tipo in ('factura', 'boleta') and b.estado <> 'anulado'), 2), 0)
                   as venta,
                 coalesce(round(sum(b.op_gravada) filter (
                   where b.tipo = 'nota_credito' and b.estado <> 'anulado'), 2), 0)
                   as notas,
                 count(*) filter (where b.tipo in ('factura', 'boleta') and b.estado = 'anulado')
                   as anuladas,
                 count(distinct b.cliente_id) filter (
                   where b.tipo in ('factura', 'boleta') and b.estado <> 'anulado')
                   as clientes
            from base b
           group by 1
        ) s
    ), '[]'::jsonb),

    -- El estado de cobro como lo vive Willy: una factura a crédito cuyo plazo
    -- pasó está VENCIDA aunque en la tabla siga «emitido».
    'por_estado', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.monto desc)
        from (
          select case
                   when b.estado in ('emitido', 'parcial', 'vencido')
                    and b.saldo > 0 and b.fecha_vencimiento < current_date then 'vencido'
                   else b.estado::text
                 end as estado,
                 count(*) as documentos,
                 coalesce(round(sum(b.op_gravada), 2), 0) as monto
            from base b
           where b.tipo in ('factura', 'boleta')
           group by 1
        ) e
    ), '[]'::jsonb),

    'top_clientes', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.venta desc)
        from (
          select v.cliente_id as id,
                 cl.razon_social as cliente,
                 count(*) as documentos,
                 round(sum(v.op_gravada), 2) as venta
            from ventas v
            join clientes cl on cl.id = v.cliente_id
           group by v.cliente_id, cl.razon_social
           order by venta desc
           limit 10
        ) t
    ), '[]'::jsonb),

    -- Por código y no por producto_id: la mitad del histórico entró del Excel
    -- y no todas las líneas encontraron su producto en el catálogo.
    'top_productos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.venta desc)
        from (
          select ci.codigo,
                 max(ci.descripcion) as descripcion,
                 round(sum(ci.cantidad), 2) as unidades,
                 round(sum(ci.importe), 2) as venta,
                 count(distinct v.id) as documentos
            from comprobante_items ci
            join ventas v on v.id = ci.comprobante_id
           group by ci.codigo
           order by venta desc
           limit 10
        ) p
    ), '[]'::jsonb)
  );
$$;

comment on function public.tablero_facturacion(date, date, text, uuid) is
  'Tablero ejecutivo · facturación de un rango (104). Venta = facturas y boletas no anuladas, op_gravada, igual que serie_ventas.';


-- ---------------------------------------------------------------------------
-- 2 · Clientes
-- ---------------------------------------------------------------------------
-- Recibe DOS rangos porque las preguntas son de comparación: quién compra más
-- que antes, quién dejó de venir. Qué rango es «antes» (el periodo anterior o
-- el mismo del año pasado) lo decide la pantalla.
create or replace function public.tablero_clientes(
  p_desde      date,
  p_hasta      date,
  p_prev_desde date,
  p_prev_hasta date,
  p_grano      text default 'mes'
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with v as (
    select c.id, c.cliente_id, c.fecha_emision, c.op_gravada
      from comprobantes c
     where c.tipo in ('factura', 'boleta') and c.estado <> 'anulado'
  ),
  -- La historia ENTERA de cada cliente, no solo la del rango: «nuevo» es que
  -- su primera compra de siempre cae dentro, no que no comprara el mes pasado.
  hist as (
    select cliente_id,
           min(fecha_emision) as primera,
           max(fecha_emision) as ultima,
           count(*) as documentos_hist
      from v
     group by cliente_id
  ),
  act as (
    select cliente_id, count(*) as documentos, round(sum(op_gravada), 2) as venta,
           max(fecha_emision) as ultima_en_rango
      from v
     where fecha_emision between p_desde and p_hasta
     group by cliente_id
  ),
  prev as (
    select cliente_id, count(*) as documentos, round(sum(op_gravada), 2) as venta
      from v
     where fecha_emision between p_prev_desde and p_prev_hasta
     group by cliente_id
  ),
  filas as (
    select cl.id,
           cl.razon_social as cliente,
           cl.numero_documento as documento,
           coalesce(a.venta, 0) as venta,
           coalesce(a.documentos, 0) as documentos,
           coalesce(p.venta, 0) as venta_prev,
           coalesce(p.documentos, 0) as documentos_prev,
           h.primera,
           h.ultima,
           h.documentos_hist,
           (current_date - h.ultima) as dias_sin_comprar
      from hist h
      join clientes cl on cl.id = h.cliente_id
      left join act a on a.cliente_id = h.cliente_id
      left join prev p on p.cliente_id = h.cliente_id
     where a.cliente_id is not null or p.cliente_id is not null
  )
  select jsonb_build_object(
    'clientes', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.venta desc, f.venta_prev desc) from filas f
    ), '[]'::jsonb),
    'catalogo', (select count(*) from clientes where activo),
    'nunca',    (select count(*) from clientes cl
                  where cl.activo and not exists (select 1 from hist h where h.cliente_id = cl.id)),
    'serie', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.periodo)
        from (
          select date_trunc(unidad_periodo(p_grano), v.fecha_emision)::date as periodo,
                 count(distinct v.cliente_id) as activos,
                 count(distinct v.cliente_id) filter (
                   where date_trunc(unidad_periodo(p_grano), h.primera)
                       = date_trunc(unidad_periodo(p_grano), v.fecha_emision)
                 ) as nuevos,
                 round(sum(v.op_gravada), 2) as venta
            from v
            join hist h on h.cliente_id = v.cliente_id
           where v.fecha_emision between p_desde and p_hasta
           group by 1
        ) s
    ), '[]'::jsonb)
  );
$$;

comment on function public.tablero_clientes(date, date, date, date, text) is
  'Tablero ejecutivo · clientes de un rango contra otro (104). Nuevo = primera compra de toda la historia dentro del rango.';


-- ---------------------------------------------------------------------------
-- 3 · Cotizaciones
-- ---------------------------------------------------------------------------
-- El estado de la tabla no basta: una cotización ENVIADA cuya validez pasó
-- sigue «enviada» hasta que alguien la toca, y contarla como «en proceso»
-- inflaría justo la cifra que Willy quiere vigilar. Aquí se cuenta como
-- vencida. La tabla no se toca: es una lectura.
create or replace function public.tablero_cotizaciones(
  p_desde date,
  p_hasta date,
  p_grano text default 'mes'
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with base as (
    select c.*,
           case
             when c.estado = 'enviada' and c.fecha_vencimiento < current_date then 'vencida'
             when c.estado = 'atendida' then 'aprobada'
             else c.estado::text
           end as estado_real
      from cotizaciones c
     where c.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'cotizaciones',  (select count(*) from base where estado_real <> 'anulada'),
      'monto',         (select coalesce(round(sum(subtotal), 2), 0) from base where estado_real <> 'anulada'),
      'borrador',      (select count(*) from base where estado_real = 'borrador'),
      'enviada',       (select count(*) from base where estado_real = 'enviada'),
      'aprobada',      (select count(*) from base where estado_real = 'aprobada'),
      'rechazada',     (select count(*) from base where estado_real = 'rechazada'),
      'vencida',       (select count(*) from base where estado_real = 'vencida'),
      'anulada',       (select count(*) from base where estado_real = 'anulada'),
      'monto_proceso', (select coalesce(round(sum(subtotal), 2), 0) from base
                         where estado_real in ('borrador', 'enviada')),
      'monto_aprobado',(select coalesce(round(sum(subtotal), 2), 0) from base
                         where estado_real = 'aprobada'),
      'monto_perdido', (select coalesce(round(sum(subtotal), 2), 0) from base
                         where estado_real in ('rechazada', 'vencida')),
      -- Días de la fecha de la cotización a su aprobación. Null sin ninguna.
      'dias_aprobacion', (select round(avg(aprobada_en::date - fecha), 1) from base
                           where estado_real = 'aprobada' and aprobada_en is not null),
      'facturado',     (select coalesce(round(sum(co.op_gravada), 2), 0)
                          from comprobantes co
                          join base b on b.id = co.cotizacion_id
                         where co.tipo in ('factura', 'boleta') and co.estado <> 'anulado'),
      'clientes',      (select count(distinct cliente_id) from base where estado_real <> 'anulada')
    ),

    'por_estado', coalesce((
      select jsonb_agg(to_jsonb(e))
        from (
          select estado_real as estado, count(*) as cotizaciones,
                 coalesce(round(sum(subtotal), 2), 0) as monto
            from base
           group by 1
        ) e
    ), '[]'::jsonb),

    'serie', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.periodo)
        from (
          select date_trunc(unidad_periodo(p_grano), b.fecha)::date as periodo,
                 count(*) filter (where b.estado_real <> 'anulada') as cotizaciones,
                 coalesce(round(sum(b.subtotal) filter (where b.estado_real <> 'anulada'), 2), 0) as monto,
                 count(*) filter (where b.estado_real = 'aprobada') as aprobadas,
                 coalesce(round(sum(b.subtotal) filter (where b.estado_real = 'aprobada'), 2), 0) as monto_aprobado
            from base b
           group by 1
        ) s
    ), '[]'::jsonb),

    'por_vendedor', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monto desc)
        from (
          select coalesce(pf.nombre, 'Sin vendedor') as vendedor,
                 count(*) as cotizaciones,
                 count(*) filter (where b.estado_real = 'aprobada') as aprobadas,
                 coalesce(round(sum(b.subtotal), 2), 0) as monto
            from base b
            left join perfiles pf on pf.id = b.vendedor_id
           where b.estado_real <> 'anulada'
           group by 1
        ) x
    ), '[]'::jsonb),

    'top_clientes', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.monto desc)
        from (
          select b.cliente_id as id, cl.razon_social as cliente,
                 count(*) as cotizaciones,
                 count(*) filter (where b.estado_real = 'aprobada') as aprobadas,
                 coalesce(round(sum(b.subtotal), 2), 0) as monto
            from base b
            join clientes cl on cl.id = b.cliente_id
           where b.estado_real <> 'anulada'
           group by b.cliente_id, cl.razon_social
           order by monto desc
           limit 10
        ) t
    ), '[]'::jsonb),

    'top_productos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.veces desc, p.monto desc)
        from (
          select ci.codigo, max(ci.descripcion) as descripcion,
                 count(distinct b.id) as veces,
                 round(sum(ci.cantidad), 2) as cantidad,
                 round(sum(ci.importe), 2) as monto
            from cotizacion_items ci
            join base b on b.id = ci.cotizacion_id
           where b.estado_real <> 'anulada'
           group by ci.codigo
           order by veces desc, monto desc
           limit 10
        ) p
    ), '[]'::jsonb),

    -- Las que siguen en juego, las más urgentes primero. NO dependen del
    -- rango: una cotización de hace dos meses que vence el viernes es justo
    -- la que hay que llamar, aunque el filtro diga «este mes».
    'por_vencer', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.fecha_vencimiento)
        from (
          select c.id, c.numero, cl.razon_social as cliente, c.subtotal as monto,
                 c.fecha, c.fecha_vencimiento, c.estado::text as estado,
                 (c.fecha_vencimiento - current_date) as dias
            from cotizaciones c
            join clientes cl on cl.id = c.cliente_id
           where c.estado in ('borrador', 'enviada')
             and c.fecha_vencimiento >= current_date
           order by c.fecha_vencimiento
           limit 10
        ) u
    ), '[]'::jsonb),

    'motivos_rechazo', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.veces desc)
        from (
          select coalesce(nullif(trim(motivo_rechazo), ''), 'Sin motivo apuntado') as motivo,
                 count(*) as veces
            from base
           where estado_real = 'rechazada'
           group by 1
           order by veces desc
           limit 8
        ) m
    ), '[]'::jsonb)
  );
$$;

comment on function public.tablero_cotizaciones(date, date, text) is
  'Tablero ejecutivo · cotizaciones de un rango (104). Enviada con la validez pasada cuenta como vencida; atendida, como aprobada.';


revoke all on function public.tablero_facturacion(date, date, text, uuid) from public, anon;
revoke all on function public.tablero_clientes(date, date, date, date, text) from public, anon;
revoke all on function public.tablero_cotizaciones(date, date, text) from public, anon;
grant execute on function public.tablero_facturacion(date, date, text, uuid) to authenticated;
grant execute on function public.tablero_clientes(date, date, date, date, text) to authenticated;
grant execute on function public.tablero_cotizaciones(date, date, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Centinela: se EJECUTAN las tres (CLAUDE.md §2), y la venta de facturación
-- tiene que cuadrar al céntimo con la de `serie_ventas`, que es la de Informes.
-- Si un día dejan de cuadrar, las dos pantallas dirían cifras distintas del
-- mismo año, y eso es lo primero que hace que nadie se fíe de un tablero.
-- ---------------------------------------------------------------------------
do $$
declare
  f jsonb;
  cl jsonb;
  co jsonb;
  v_informes numeric;
  v_serie numeric;
begin
  f  := public.tablero_facturacion('2020-01-01', current_date, 'mes');
  cl := public.tablero_clientes('2026-01-01', current_date, '2025-01-01', '2025-12-31', 'mes');
  co := public.tablero_cotizaciones('2020-01-01', current_date, 'mes');

  if f->'resumen'->>'venta' is null or jsonb_typeof(f->'serie') <> 'array'
     or jsonb_typeof(f->'top_productos') <> 'array' then
    raise exception '104: tablero_facturacion no devuelve lo esperado: %', left(f::text, 300);
  end if;
  if jsonb_typeof(cl->'clientes') <> 'array' or cl->>'catalogo' is null then
    raise exception '104: tablero_clientes no devuelve lo esperado: %', left(cl::text, 300);
  end if;
  if co->'resumen'->>'cotizaciones' is null or jsonb_typeof(co->'por_vencer') <> 'array' then
    raise exception '104: tablero_cotizaciones no devuelve lo esperado: %', left(co::text, 300);
  end if;

  select coalesce(sum(venta), 0) into v_informes
    from public.serie_ventas('2020-01-01', current_date, 'mes');
  if (f->'resumen'->>'venta')::numeric <> v_informes then
    raise exception '104: la venta no cuadra con Informes: % contra %',
      f->'resumen'->>'venta', v_informes;
  end if;

  select coalesce(sum((x->>'venta')::numeric), 0) into v_serie
    from jsonb_array_elements(f->'serie') x;
  if v_serie <> (f->'resumen'->>'venta')::numeric then
    raise exception '104: la serie (%) no suma el resumen (%)', v_serie, f->'resumen'->>'venta';
  end if;

  raise notice '104: tablero ejecutivo listo · venta histórica % · % clientes en 2026 · % cotizaciones',
    f->'resumen'->>'venta', jsonb_array_length(cl->'clientes'), co->'resumen'->>'cotizaciones';
end $$;
