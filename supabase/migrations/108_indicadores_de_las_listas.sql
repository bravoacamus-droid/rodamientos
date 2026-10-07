-- ###########################################################################
-- 108 · LOS INDICADORES DE LAS LISTAS DE VENTAS
-- ###########################################################################
--
-- Luis, 07/10: *«podemos mejorar los módulos de ventas, desde cotización hasta
-- cobranza, ponerles KPIs, cards necesarias, buenos filtros de fechas, hacerlo
-- más profesional y necesario a lo que se necesita en cada módulo»*.
--
-- El tablero (104) responde «cómo va el negocio». Esto responde otra cosa,
-- más pequeña y más de cada día: **qué tengo pendiente en esta pantalla**.
-- Cuatro cifras arriba de cada lista, que siguen a su filtro de fechas y de
-- cliente. La búsqueda y el estado filtran la LISTA, no las cifras: si las
-- cifras cambiaran al pulsar «Enviadas», «cuántas se ganan» dejaría de tener
-- sentido justo cuando se mira.
--
-- Facturación no necesita función propia: usa `tablero_facturacion` (104)
-- con el rango y el cliente, que ya trae todo lo que pide su fila.
--
-- SECURITY INVOKER, como la 104: las tablas ya dejan leer a quien tiene rol.
-- Rango nulo = todo el histórico.
-- ###########################################################################


-- ---------------------------------------------------------------------------
-- Cotizaciones
-- ---------------------------------------------------------------------------
create or replace function public.indicadores_cotizaciones(
  p_desde   date default null,
  p_hasta   date default null,
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
           -- El mismo estado que el tablero (104): enviada con la validez
           -- pasada es vencida; atendida es una aprobada que ya salió.
           case
             when c.estado = 'enviada' and c.fecha_vencimiento < current_date then 'vencida'
             when c.estado = 'atendida' then 'aprobada'
             else c.estado::text
           end as estado_real
      from cotizaciones c
     where (p_desde is null or c.fecha >= p_desde)
       and (p_hasta is null or c.fecha <= p_hasta)
       and (p_cliente is null or c.cliente_id = p_cliente)
       and c.estado <> 'anulada'
  )
  select jsonb_build_object(
    'cotizaciones',  (select count(*) from base),
    'monto',         (select coalesce(round(sum(subtotal), 2), 0) from base),
    'clientes',      (select count(distinct cliente_id) from base),
    'en_juego',      (select count(*) from base where estado_real in ('borrador', 'enviada')),
    'monto_en_juego',(select coalesce(round(sum(subtotal), 2), 0) from base
                       where estado_real in ('borrador', 'enviada')),
    'aprobadas',     (select count(*) from base where estado_real = 'aprobada'),
    'decididas',     (select count(*) from base where estado_real in ('aprobada', 'rechazada', 'vencida')),
    'monto_aprobado',(select coalesce(round(sum(subtotal), 2), 0) from base where estado_real = 'aprobada'),
    -- Las que vencen en los próximos 7 días: las llamadas de esta semana.
    'vencen_semana', (select count(*) from base
                       where estado_real in ('borrador', 'enviada')
                         and fecha_vencimiento between current_date and current_date + 7)
  );
$$;


-- ---------------------------------------------------------------------------
-- Guías
-- ---------------------------------------------------------------------------
-- «Sin facturar» es la cifra que manda aquí: desde el 17/09 no se factura sin
-- guía emitida (089), así que una guía emitida que ningún comprobante vivo
-- ampara es mercadería que salió y no se ha cobrado ni facturado.
create or replace function public.indicadores_guias(
  p_desde   date default null,
  p_hasta   date default null,
  p_cliente uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with base as (
    select g.*,
           exists (
             select 1 from comprobante_guias cg
               join comprobantes c on c.id = cg.comprobante_id
              where cg.guia_id = g.id and c.estado <> 'anulado'
           ) or exists (
             select 1 from comprobantes c
              where c.guia_id = g.id and c.estado <> 'anulado'
           ) as facturada
      from guias_remision g
     where (p_desde is null or g.fecha_emision >= p_desde)
       and (p_hasta is null or g.fecha_emision <= p_hasta)
       and (p_cliente is null or g.cliente_id = p_cliente)
  )
  select jsonb_build_object(
    'emitidas',     (select count(*) from base where estado = 'emitida'),
    'borradores',   (select count(*) from base where estado = 'borrador'),
    'sin_facturar', (select count(*) from base where estado = 'emitida' and not facturada),
    -- La más antigua sin facturar, en días: cuánto lleva esa mercadería fuera
    -- sin factura.
    'dias_sin_facturar', (select max(current_date - fecha_emision) from base
                           where estado = 'emitida' and not facturada),
    'anuladas',     (select count(*) from base where estado = 'anulada'),
    'sin_sunat',    (select count(*) from base
                      where estado = 'emitida'
                        and coalesce(estado_sunat::text, 'no_enviado') not in ('aceptado'))
  );
$$;


-- ---------------------------------------------------------------------------
-- Cobranzas
-- ---------------------------------------------------------------------------
-- Lo que se debe es de HOY, no de un rango: la cartera no lleva filtro de
-- fechas. El rango solo cuenta lo COBRADO, que es el arqueo semanal de Willy
-- (06/10, 10:20): «cada semana hago el cuadre, cuánto me ingresa, cuánto me
-- depositan».
create or replace function public.indicadores_cobranzas(
  p_desde date default null,
  p_hasta date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'por_cobrar',     (select coalesce(round(sum(saldo), 2), 0) from v_cartera),
    'documentos',     (select count(*) from v_cartera),
    'clientes',       (select count(distinct cliente_id) from v_cartera),
    'vencido',        (select coalesce(round(sum(saldo), 2), 0) from v_cartera where dias_vencido > 0),
    'docs_vencidos',  (select count(*) from v_cartera where dias_vencido > 0),
    'vence_semana',   (select coalesce(round(sum(saldo), 2), 0) from v_cartera
                        where fecha_vencimiento between current_date and current_date + 7),
    'docs_semana',    (select count(*) from v_cartera
                        where fecha_vencimiento between current_date and current_date + 7),
    'cobrado',        (select coalesce(round(sum(monto), 2), 0) from pagos
                        where (p_desde is null or fecha >= p_desde)
                          and (p_hasta is null or fecha <= p_hasta)),
    'pagos',          (select count(*) from pagos
                        where (p_desde is null or fecha >= p_desde)
                          and (p_hasta is null or fecha <= p_hasta))
  );
$$;


revoke all on function public.indicadores_cotizaciones(date, date, uuid) from public, anon;
revoke all on function public.indicadores_guias(date, date, uuid) from public, anon;
revoke all on function public.indicadores_cobranzas(date, date) from public, anon;
grant execute on function public.indicadores_cotizaciones(date, date, uuid) to authenticated;
grant execute on function public.indicadores_guias(date, date, uuid) to authenticated;
grant execute on function public.indicadores_cobranzas(date, date) to authenticated;


-- Centinela: se EJECUTAN las tres, y las de cotizaciones tienen que cuadrar con
-- el tablero (104), que cuenta lo mismo por otro camino.
do $$
declare
  c jsonb;
  g jsonb;
  b jsonb;
  t jsonb;
begin
  c := public.indicadores_cotizaciones(null, null, null);
  g := public.indicadores_guias(null, null, null);
  b := public.indicadores_cobranzas(null, null);
  t := public.tablero_cotizaciones('2000-01-01', current_date + 3650, 'mes', null)->'resumen';

  if (c->>'cotizaciones')::int <> (t->>'cotizaciones')::int
     or (c->>'monto')::numeric <> (t->>'monto')::numeric then
    raise exception '108: las cotizaciones no cuadran con el tablero: % / % contra % / %',
      c->>'cotizaciones', c->>'monto', t->>'cotizaciones', t->>'monto';
  end if;
  if g->>'emitidas' is null or b->>'por_cobrar' is null then
    raise exception '108: guías o cobranzas no devuelven lo esperado: % %', g, b;
  end if;
  if (b->>'por_cobrar')::numeric <> (select coalesce(round(sum(saldo), 2), 0) from v_cartera) then
    raise exception '108: lo por cobrar no cuadra con la cartera';
  end if;

  raise notice '108: % cotizaciones por $ %, % por cobrar', c->>'cotizaciones', c->>'monto', b->>'por_cobrar';
end $$;
