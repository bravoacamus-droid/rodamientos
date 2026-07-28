-- ============================================================================
-- ERP RODATECH · Motor de alertas v2 (reglas priorizadas y accionables)
-- ============================================================================

create or replace function public.generar_alertas()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer := 0;
begin
  delete from alertas where archivada = false;

  -- Rotación de los últimos 180 días (base para priorizar)
  create temp table _rot on commit drop as
  select m.producto_id,
         sum(case when m.fecha > now() - interval '90 days' then m.cantidad else 0 end)  as sal90,
         sum(m.cantidad)                                                                 as sal180,
         max(m.fecha)                                                                    as ultima_salida
  from movimientos_inventario m
  where m.tipo = 'salida' and m.fecha > now() - interval '180 days'
  group by m.producto_id;

  create temp table _stk on commit drop as
  select producto_id, sum(cantidad) as total from stock group by producto_id;

  -- 1. Stock por agotarse (solo ítems con rotación real: son los que urgen)
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'stock_bajo',
         (case when coalesce(s.total,0) <= 0 then 'critica'
               when coalesce(s.total,0) <= p.stock_minimo * 0.5 then 'alta'
               else 'media' end)::severidad_alerta,
         'Stock por agotarse · ' || p.sku,
         p.descripcion || ' — quedan ' || coalesce(s.total,0)::text || ' ' || p.unidad ||
         ' (mínimo ' || p.stock_minimo::text || '). Rotación de ' ||
         round(r.sal90)::text || ' und en los últimos 90 días.',
         'producto', p.id, p.sku, coalesce(s.total,0), '/productos/' || p.id
  from productos p
  join _rot r on r.producto_id = p.id and r.sal90 > 0
  left join _stk s on s.producto_id = p.id
  where p.activo and p.stock_minimo > 0 and coalesce(s.total,0) <= p.stock_minimo
  order by r.sal90 desc
  limit 70;

  -- 2. Créditos vencidos
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'credito_vencido',
         (case when current_date - c.fecha_vencimiento > 30 then 'critica' else 'alta' end)::severidad_alerta,
         'Documento vencido · ' || c.numero,
         cl.razon_social || ' — S/ ' || to_char(c.saldo,'FM999,999,990.00') ||
         ' vencido hace ' || (current_date - c.fecha_vencimiento)::text || ' días.',
         'comprobante', c.id, c.numero, c.saldo, '/cobranzas'
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.saldo > 0.01 and c.estado <> 'anulado' and c.fecha_vencimiento < current_date;

  -- 3. Créditos por vencer (10 días)
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'credito_vence', 'media'::severidad_alerta,
         'Por vencer · ' || c.numero,
         cl.razon_social || ' — S/ ' || to_char(c.saldo,'FM999,999,990.00') ||
         ' vence en ' || (c.fecha_vencimiento - current_date)::text || ' días.',
         'comprobante', c.id, c.numero, c.saldo, '/cobranzas'
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.saldo > 0.01 and c.estado <> 'anulado'
    and c.fecha_vencimiento between current_date and current_date + 10;

  -- 4. Línea de crédito excedida
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'linea_credito', 'alta'::severidad_alerta,
         'Línea de crédito excedida',
         cl.razon_social || ' — deuda S/ ' || to_char(d.deuda,'FM999,999,990.00') ||
         ' sobre una línea de S/ ' || to_char(cl.linea_credito,'FM999,999,990.00') || '.',
         'cliente', cl.id, cl.razon_social, d.deuda, '/clientes/' || cl.id
  from clientes cl
  join (select cliente_id, sum(saldo) deuda from comprobantes
        where saldo > 0 and estado <> 'anulado' group by cliente_id) d on d.cliente_id = cl.id
  where cl.linea_credito > 0 and d.deuda > cl.linea_credito;

  -- 5. Capital inmovilizado (sin rotación, priorizado por valorizado)
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'sin_rotacion', 'baja'::severidad_alerta,
         'Sin rotación · ' || p.sku,
         p.descripcion || ' — ' || s.total::text || ' und inmovilizadas por S/ ' ||
         to_char(s.total * p.costo_promedio, 'FM999,999,990.00') || ' sin salidas en 120 días.',
         'producto', p.id, p.sku, s.total * p.costo_promedio, '/productos/' || p.id
  from productos p
  join _stk s on s.producto_id = p.id
  where p.activo and s.total > 0 and s.total * p.costo_promedio > 400
    and not exists (select 1 from movimientos_inventario m
                    where m.producto_id = p.id and m.tipo = 'salida'
                      and m.fecha > now() - interval '120 days')
  order by s.total * p.costo_promedio desc
  limit 35;

  -- 6. Reposición sugerida (cobertura menor a 30 días)
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'reposicion', 'media'::severidad_alerta,
         'Reposición sugerida · ' || p.sku,
         'Rotación de ' || round(r.sal90)::text || ' und en 90 días con ' ||
         coalesce(s.total,0)::text || ' en stock: cobertura de ' ||
         round(coalesce(s.total,0) / (r.sal90/90.0))::text ||
         ' días. Sugerido comprar ' || ceil(r.sal90 / 90.0 * 45)::text || ' und.',
         'producto', p.id, p.sku, ceil(r.sal90 / 90.0 * 45), '/productos/' || p.id
  from productos p
  join _rot r on r.producto_id = p.id and r.sal90 > 0
  left join _stk s on s.producto_id = p.id
  where p.activo and coalesce(s.total,0) / (r.sal90/90.0) < 30
  order by r.sal90 desc
  limit 40;

  -- 7. Pedidos de emergencia pendientes de aprobación
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'emergencia', 'alta'::severidad_alerta,
         'Emergencia por aprobar · ' || pe.numero,
         cl.razon_social || ' — S/ ' || to_char(pe.total,'FM999,999,990.00') ||
         ' requiere aprobación administrativa para despachar con stock por reponer.',
         'pedido', pe.id, pe.numero, pe.total, '/pedidos/' || pe.id
  from pedidos pe join clientes cl on cl.id = pe.cliente_id
  where pe.es_emergencia and pe.requiere_aprobacion and pe.aprobado_en is null and pe.estado <> 'anulado';

  -- 8. Stock negativo pendiente de regularizar
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'stock_negativo', 'alta'::severidad_alerta,
         'Stock negativo · ' || p.sku,
         p.descripcion || ' — saldo ' || s.total::text ||
         ' por atención de emergencia. Pendiente de regularizar con el ingreso de mercadería.',
         'producto', p.id, p.sku, s.total, '/productos/' || p.id
  from productos p join _stk s on s.producto_id = p.id
  where s.total < 0;

  -- 9. Margen bajo en cotizaciones vigentes
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'margen_bajo', 'alta'::severidad_alerta,
         'Margen bajo · ' || c.numero,
         cl.razon_social || ' — margen de ' || round(c.margen_pct,1)::text ||
         '% por debajo del mínimo definido (15%).',
         'cotizacion', c.id, c.numero, c.margen_pct, '/cotizaciones/' || c.id
  from cotizaciones c join clientes cl on cl.id = c.cliente_id
  where c.estado in ('borrador','enviada') and c.margen_pct < 15 and c.total > 0;

  select count(*) into v_count from alertas where archivada = false;
  return v_count;
end $$;

-- Balancear la cartera: parte de lo vencido se cobra para dejar un aging realista
do $$
declare
  c      record;
  v_cobr uuid := (select id from profiles where email = 'cobranzas@rodatechperu.com');
begin
  for c in
    select * from comprobantes
    where saldo > 0.01 and estado <> 'anulado'
      and current_date - fecha_vencimiento between 1 and 40
    order by random()
    limit (select greatest(round(count(*) * 0.45), 1)::int from comprobantes
           where saldo > 0.01 and estado <> 'anulado'
             and current_date - fecha_vencimiento between 1 and 40)
  loop
    insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
    values (c.id, current_date - floor(random() * 6)::int, c.saldo,
            (array['transferencia','deposito','cheque'])[1 + floor(random() * 3)::int],
            (array['BCP','BBVA','Interbank'])[1 + floor(random() * 3)::int],
            'OP-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'), v_cobr);
  end loop;
end $$;

select generar_alertas();
