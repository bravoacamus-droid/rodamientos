-- ###########################################################################
-- 132 · LO VENDIDO: LOS PEDIDOS EN LOS REPORTES
-- ###########################################################################
--
-- Luis, 15/10: *«en reporte tenemos que ordenar ahora, porque sería que
-- agarre también desde pedido, porque ahí es cuando una venta ya se
-- concretó»*. Los reportes contaban desde las facturas (lo declarado) y
-- desde las cotizaciones (lo ofrecido). Faltaba lo VENDIDO: el sí del
-- cliente, que desde la 130 es el pedido.
--
-- `v_ventas_concretadas` junta dos cosas, y las dos hacen falta:
--
--   · Los PEDIDOS (130), con su importe y su costo analizado (131). Cada
--     «Atender otro pedido» es una venta más, que es lo que la cotización
--     sola no sabía contar.
--   · Las cotizaciones atendidas SIN pedido de aprobación: las 631 CT02 del
--     sistema viejo (09/2024 a 10/2026). Son ventas de verdad de Willy; si
--     «vendido» fuera solo pedidos, dos años de historia se quedarían en
--     cero. Su importe es el subtotal de la cotización; su costo, casi
--     siempre desconocido (una de 632 lo tiene), así que no entran en el
--     margen —un costo cero no es un 100 % de margen—.
--
-- Una cotización vieja que Willy repita tiene las dos cosas: su venta de
-- entonces (histórica) y el pedido nuevo (que no nace «de aprobación»).
--
-- `tablero_ventas` es lo que leen los reportes, con la misma forma que las
-- `tablero_*` de la 104.
-- ###########################################################################

set local search_path = public, extensions;

create or replace view v_ventas_concretadas
with (security_invoker = true) as
select p.id as pedido_id, p.numero, p.cotizacion_id, p.cliente_id, p.fecha,
       coalesce(l.venta, 0)::numeric(14,2) as venta,
       coalesce(l.costo, 0)::numeric(14,2) as costo,
       (p.secuencia > 1 or not p.desde_aprobacion) as es_repeticion,
       'pedido'::text as origen
  from pedidos p
  left join lateral (
    select sum(importe) as venta, sum(costo) as costo
      from v_pedido_lineas vl where vl.pedido_id = p.id
  ) l on true
union all
select null::uuid, c.numero, c.id, c.cliente_id,
       coalesce((c.aprobada_en at time zone 'America/Lima')::date, c.fecha),
       coalesce(c.subtotal, 0)::numeric(14,2),
       coalesce((select sum(round(coalesce(ci.cantidad_aprobada, ci.cantidad) * coalesce(ci.costo_unitario, 0), 2))
                   from cotizacion_items ci where ci.cotizacion_id = c.id), 0)::numeric(14,2),
       false,
       'historico'
  from cotizaciones c
 where c.estado in ('aprobada', 'atendida')
   and not exists (select 1 from pedidos p where p.cotizacion_id = c.id and p.desde_aprobacion);

grant select on v_ventas_concretadas to authenticated;

comment on view v_ventas_concretadas is
  'Lo vendido (132): los pedidos (130) más las cotizaciones atendidas sin pedido de aprobación (el histórico del sistema viejo).';

-- ---------------------------------------------------------------------------
create or replace function public.tablero_ventas(
  p_desde date, p_hasta date, p_grano text default 'mes', p_cliente uuid default null)
returns jsonb
language sql stable set search_path = public, extensions as $$
  with base as (
    select v.*
      from v_ventas_concretadas v
     where v.fecha between p_desde and p_hasta
       and (p_cliente is null or v.cliente_id = p_cliente)
  ),
  -- Lo facturado de esos pedidos (solo de los que son pedido: el histórico
  -- se facturó en el sistema viejo y su factura no cuelga de nada).
  fac as (
    select co.pedido_id, sum(co.op_gravada) as facturado, sum(co.saldo) as saldo
      from comprobantes co
     where co.pedido_id in (select pedido_id from base where pedido_id is not null)
       and co.tipo in ('factura', 'boleta') and co.estado <> 'anulado'
     group by co.pedido_id
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'ventas',       (select count(*) from base),
      'pedidos',      (select count(*) from base where origen = 'pedido'),
      'repetidos',    (select count(*) from base where es_repeticion),
      'vendido',      (select coalesce(round(sum(venta), 2), 0) from base),
      -- Margen sobre el costo (023), solo con las que tienen costo.
      'venta_con_costo', (select coalesce(round(sum(venta), 2), 0) from base where costo > 0),
      'costo',        (select coalesce(round(sum(costo), 2), 0) from base where costo > 0),
      'clientes',     (select count(distinct cliente_id) from base),
      'facturado',    (select coalesce(round(sum(facturado), 2), 0) from fac),
      'por_cobrar',   (select coalesce(round(sum(saldo), 2), 0) from fac),
      -- Pedidos sin factura todavía: vendido y no declarado.
      'sin_facturar', (select count(*) from base b where b.origen = 'pedido'
                         and not exists (select 1 from fac f where f.pedido_id = b.pedido_id)),
      'monto_sin_facturar', (select coalesce(round(sum(b.venta), 2), 0) from base b where b.origen = 'pedido'
                         and not exists (select 1 from fac f where f.pedido_id = b.pedido_id))
    ),
    'serie', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.periodo)
        from (
          select date_trunc(unidad_periodo(p_grano), b.fecha)::date as periodo,
                 count(*) as ventas,
                 coalesce(round(sum(b.venta), 2), 0) as vendido,
                 count(*) filter (where b.es_repeticion) as repetidos
            from base b
           group by 1
        ) s
    ), '[]'::jsonb),
    'por_cliente', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.vendido desc)
        from (
          select b.cliente_id as id, cl.razon_social as cliente,
                 count(*) as ventas,
                 count(*) filter (where b.es_repeticion) as repetidos,
                 coalesce(round(sum(b.venta), 2), 0) as vendido,
                 coalesce(round(sum(b.venta) filter (where b.costo > 0), 2), 0) as venta_con_costo,
                 coalesce(round(sum(b.costo) filter (where b.costo > 0), 2), 0) as costo
            from base b
            join clientes cl on cl.id = b.cliente_id
           group by b.cliente_id, cl.razon_social
        ) x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.tablero_ventas(date, date, text, uuid) to authenticated;

-- ------------------------------------------------------------------ Centinela
do $$
declare r jsonb; v_hist int; v_ped int;
begin
  select count(*) filter (where origen = 'historico'), count(*) filter (where origen = 'pedido')
    into v_hist, v_ped from v_ventas_concretadas;
  if v_ped <> (select count(*) from pedidos) then
    raise exception '132: la vista no trae todos los pedidos';
  end if;
  r := public.tablero_ventas('2000-01-01', '2100-01-01', 'mes', null);
  if (r -> 'resumen' ->> 'ventas')::int <> v_hist + v_ped then
    raise exception '132: tablero_ventas no cuenta lo que la vista';
  end if;
  raise notice '132: % ventas (% pedidos, % del histórico), vendido %.', v_hist + v_ped, v_ped, v_hist, r -> 'resumen' ->> 'vendido';
end $$;
