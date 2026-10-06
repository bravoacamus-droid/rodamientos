-- ###########################################################################
-- 105 · EL DETALLE DE LO VENDIDO Y LO COTIZADO, LÍNEA POR LÍNEA, PARA EXCEL
-- ###########################################################################
--
-- Willy, reunión del 06/10 (4:00): *«de todas las ventas por detalle o las
-- cotizaciones, para hacer un estudio, un análisis de consumo de productos y
-- ver una compra»*. Y (4:51): *«todos los clientes o un cliente en
-- particular. Filtro todo lo cotizado y hago un export […] tanto en
-- cotizaciones como en ventas»*.
--
-- El tablero (104) agrega; esto NO agrega: devuelve cada línea con su
-- documento, su cliente y la familia del producto, que es con lo que él arma
-- su análisis en Excel. Dos funciones gemelas con los mismos filtros que la
-- pantalla —rango y cliente—, así el Excel dice lo mismo que el tablero.
--
-- Qué entra en VENTAS: facturas y boletas no anuladas, igual que en todo el
-- tablero, y además las NOTAS DE CRÉDITO con cantidad e importe en NEGATIVO.
-- Para un análisis de consumo una devolución resta lo que se llevó; dejarla
-- fuera inflaría justo lo que se quiere medir. Va marcada en «tipo», y quien
-- no la quiera la filtra en Excel.
--
-- Y de paso, `tablero_cotizaciones` gana el filtro de cliente que ya tenía
-- `tablero_facturacion`: Willy lo pidió para las dos.
--
-- SECURITY INVOKER, como la 104: las tablas ya dejan leer a quien tiene rol.
-- ###########################################################################

create or replace function public.detalle_ventas(
  p_desde   date,
  p_hasta   date,
  p_cliente uuid default null
)
returns table (
  fecha date,
  tipo text,
  numero text,
  estado text,
  condicion text,
  orden_compra text,
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
  igv numeric
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.fecha_emision,
         case c.tipo when 'factura' then 'Factura' when 'boleta' then 'Boleta'
                     else 'Nota de crédito' end,
         c.numero,
         c.estado::text,
         c.condicion_pago::text,
         c.orden_compra_cliente,
         cl.razon_social,
         cl.numero_documento,
         pf.nombre,
         ci.codigo,
         ci.descripcion,
         coalesce(nullif(trim(ci.marca), ''), m.nombre),
         f.nombre,
         sf.nombre,
         ci.unidad_codigo,
         case when c.tipo = 'nota_credito' then -ci.cantidad else ci.cantidad end,
         ci.valor_unitario,
         ci.descuento_pct,
         case when c.tipo = 'nota_credito' then -ci.importe else ci.importe end,
         case when c.tipo = 'nota_credito' then -ci.igv_item else ci.igv_item end
    from comprobante_items ci
    join comprobantes c  on c.id = ci.comprobante_id
    join clientes cl     on cl.id = c.cliente_id
    left join perfiles pf    on pf.id = c.vendedor_id
    left join productos p    on p.id = ci.producto_id
    left join marcas m       on m.id = p.marca_id
    left join familias f     on f.id = p.familia_id
    left join subfamilias sf on sf.id = p.subfamilia_id
   where c.fecha_emision between p_desde and p_hasta
     and c.estado <> 'anulado'
     and c.tipo in ('factura', 'boleta', 'nota_credito')
     and (p_cliente is null or c.cliente_id = p_cliente)
   order by c.fecha_emision, c.numero, ci.orden;
$$;

comment on function public.detalle_ventas(date, date, uuid) is
  'Detalle línea a línea de lo vendido para exportar a Excel (105). Notas de crédito en negativo.';


create or replace function public.detalle_cotizaciones(
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
  entrega text
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
         ci.entrega
    from cotizacion_items ci
    join cotizaciones c  on c.id = ci.cotizacion_id
    join clientes cl     on cl.id = c.cliente_id
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
  'Detalle línea a línea de lo cotizado para exportar a Excel (105). Sin las anuladas.';


-- tablero_cotizaciones con cliente. Cambia la firma, así que se borra la de la
-- 104: dejar las dos haría ambigua cualquier llamada con tres argumentos.
drop function if exists public.tablero_cotizaciones(date, date, text);

create or replace function public.tablero_cotizaciones(
  p_desde date,
  p_hasta date,
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
    select c.*,
           case
             when c.estado = 'enviada' and c.fecha_vencimiento < current_date then 'vencida'
             when c.estado = 'atendida' then 'aprobada'
             else c.estado::text
           end as estado_real
      from cotizaciones c
     where c.fecha between p_desde and p_hasta
       and (p_cliente is null or c.cliente_id = p_cliente)
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
             and (p_cliente is null or c.cliente_id = p_cliente)
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

comment on function public.tablero_cotizaciones(date, date, text, uuid) is
  'Tablero ejecutivo · cotizaciones de un rango, de todos o de un cliente (104, 105).';

revoke all on function public.tablero_cotizaciones(date, date, text, uuid) from public, anon;
revoke all on function public.detalle_ventas(date, date, uuid) from public, anon;
revoke all on function public.detalle_cotizaciones(date, date, uuid) from public, anon;
grant execute on function public.tablero_cotizaciones(date, date, text, uuid) to authenticated;
grant execute on function public.detalle_ventas(date, date, uuid) to authenticated;
grant execute on function public.detalle_cotizaciones(date, date, uuid) to authenticated;


-- Centinela: se EJECUTAN. El detalle de ventas, sumado, tiene que dar la venta
-- del tablero menos las notas: si no cuadra, el Excel y la pantalla dirían
-- cifras distintas, que es lo primero que hace que nadie se fíe de ninguno.
do $$
declare
  v_detalle numeric;
  v_tablero jsonb;
  v_lineas  bigint;
  v_cot     jsonb;
begin
  select coalesce(sum(importe), 0), count(*) into v_detalle, v_lineas
    from public.detalle_ventas('2020-01-01', current_date);
  v_tablero := public.tablero_facturacion('2020-01-01', current_date, 'mes')->'resumen';

  if abs(v_detalle - ((v_tablero->>'venta')::numeric - (v_tablero->>'notas_monto')::numeric)) > 1 then
    raise exception '105: el detalle (%) no cuadra con el tablero (% - %)',
      v_detalle, v_tablero->>'venta', v_tablero->>'notas_monto';
  end if;

  perform * from public.detalle_cotizaciones('2020-01-01', current_date);
  v_cot := public.tablero_cotizaciones('2020-01-01', current_date, 'mes', null);
  if v_cot->'resumen'->>'cotizaciones' is null then
    raise exception '105: tablero_cotizaciones no devuelve lo esperado';
  end if;

  raise notice '105: % líneas de venta por $ %, cuadran con el tablero', v_lineas, v_detalle;
end $$;
