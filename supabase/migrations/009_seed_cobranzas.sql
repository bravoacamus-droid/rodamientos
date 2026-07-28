-- ============================================================================
-- ERP RODATECH · Regularización de stock, cobranzas, notas de crédito y alertas
-- ============================================================================

-- 1) Regularizar los saldos negativos dejando solo unos pocos casos vivos
do $$
declare
  r      record;
  v_user uuid := (select id from profiles where email = 'almacen@rodatechperu.com');
  v_i    int := 0;
begin
  for r in
    select s.producto_id, s.almacen_id, s.cantidad, p.costo_promedio, p.stock_minimo
    from stock s join productos p on p.id = s.producto_id
    where s.cantidad < 0
    order by s.cantidad
  loop
    v_i := v_i + 1;
    continue when v_i <= 7;   -- se conservan 7 negativos como casos por regularizar
    perform registrar_movimiento(
      r.producto_id, r.almacen_id, 'regularizacion',
      abs(r.cantidad) + greatest(round((r.stock_minimo * (0.5 + random()))::numeric), 2),
      round((r.costo_promedio * (0.95 + random() * 0.10))::numeric, 4),
      'ajuste', null, 'REG-STOCK',
      'Reposición y regularización de stock negativo por atención de emergencia',
      v_user, now() - (random() * 20 || ' days')::interval);
  end loop;
end $$;

-- 2) Cobranzas
do $$
declare
  c         record;
  v_cobr    uuid := (select id from profiles where email = 'cobranzas@rodatechperu.com');
  v_rnd     numeric;
  v_dias    int;
  v_medio   text;
  v_parcial numeric;
begin
  for c in
    select * from comprobantes where estado <> 'anulado' order by fecha_emision
  loop
    v_rnd := random();
    v_dias := current_date - c.fecha_vencimiento;
    v_medio := (array['transferencia','deposito','transferencia','cheque','efectivo','letra'])
               [1 + floor(random() * 6)::int];

    if c.condicion_pago = 'contado' then
      insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
      values (c.id, c.fecha_emision, c.total, 'efectivo', null,
              'Cobro al contado en mostrador', v_cobr);

    elsif v_dias > 45 then
      if v_rnd < 0.95 then
        insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
        values (c.id, c.fecha_vencimiento + floor(random() * 12)::int, c.total, v_medio,
                (array['BCP','BBVA','Interbank','Scotiabank'])[1 + floor(random() * 4)::int],
                'OP-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'), v_cobr);
      end if;

    elsif v_dias > 8 then
      if v_rnd < 0.68 then
        insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
        values (c.id, c.fecha_vencimiento + floor(random() * 9)::int, c.total, v_medio,
                (array['BCP','BBVA','Interbank','Scotiabank'])[1 + floor(random() * 4)::int],
                'OP-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'), v_cobr);
      elsif v_rnd < 0.84 then
        v_parcial := round((c.total * (0.30 + random() * 0.40))::numeric, 2);
        insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
        values (c.id, c.fecha_vencimiento + floor(random() * 6)::int, v_parcial, v_medio,
                'BCP', 'Pago parcial a cuenta', v_cobr);
      end if;

    elsif v_dias > -12 then
      if v_rnd < 0.42 then
        insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
        values (c.id, least(c.fecha_vencimiento, current_date), c.total, v_medio, 'BCP',
                'OP-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'), v_cobr);
      elsif v_rnd < 0.55 then
        insert into pagos (comprobante_id, fecha, monto, medio, banco, referencia, registrado_por)
        values (c.id, current_date - floor(random() * 5)::int,
                round((c.total * 0.5)::numeric, 2), v_medio, 'BBVA', 'Adelanto 50%', v_cobr);
      end if;
    end if;
  end loop;
end $$;

-- 3) Gestiones de cobranza sobre la cartera vencida
insert into gestiones_cobranza (cliente_id, comprobante_id, fecha, canal, resultado,
                                compromiso_fecha, nota, usuario_id)
select c.cliente_id, c.id,
       (current_date - floor(random() * 12)::int)::timestamptz + interval '11 hours',
       (array['whatsapp','llamada','correo','visita'])[1 + floor(random() * 4)::int],
       (array['Compromiso de pago','Contactado sin compromiso','Solicita reprogramación',
              'Pendiente de conformidad del área contable',
              'Confirma pago para fin de semana'])[1 + floor(random() * 5)::int],
       current_date + (3 + floor(random() * 14)::int),
       'Seguimiento de documento vencido · gestión registrada desde el módulo de cobranzas',
       (select id from profiles where email = 'cobranzas@rodatechperu.com')
from comprobantes c
where c.saldo > 0.01 and c.estado <> 'anulado' and c.fecha_vencimiento < current_date
order by random()
limit 45;

-- 4) Notas de crédito (devoluciones / anulaciones parciales)
do $$
declare
  c       record;
  v_corr  int;
  v_nc    uuid;
  v_alm   uuid := (select id from almacenes where codigo = 'ALM-01');
  it      record;
  v_sub   numeric;
begin
  for c in
    select * from comprobantes
    where tipo = 'factura' and estado in ('pagado','parcial') and fecha_emision < current_date - 25
    order by random() limit 6
  loop
    v_corr := siguiente_correlativo('nota_credito', 'FC01');

    select sum(ci.subtotal) into v_sub
    from comprobante_items ci where ci.comprobante_id = c.id and ci.orden = 1;

    insert into comprobantes (
      tipo, serie, correlativo, cliente_id, referencia_id, motivo_nota, fecha_emision,
      fecha_vencimiento, condicion_pago, dias_credito, moneda, tipo_cambio,
      op_gravada, igv, total, total_letras, costo_total, pagado, saldo, estado,
      vendedor_id, observaciones)
    values (
      'nota_credito', 'FC01', v_corr, c.cliente_id, c.id,
      (array['Devolución de mercadería','Anulación parcial por error en el ítem',
             'Descuento comercial posterior'])[1 + floor(random() * 3)::int],
      c.fecha_emision + 12, c.fecha_emision + 12, 'contado', 0, 'PEN', 3.7550,
      v_sub, round((v_sub * 0.18)::numeric, 2), round((v_sub * 1.18)::numeric, 2),
      numero_a_letras(round((v_sub * 1.18)::numeric, 2), 'PEN'),
      0, round((v_sub * 1.18)::numeric, 2), 0, 'pagado',
      c.vendedor_id, 'Nota de crédito que afecta al comprobante ' || c.numero)
    returning id into v_nc;

    for it in select * from comprobante_items where comprobante_id = c.id and orden = 1 loop
      insert into comprobante_items (comprobante_id, producto_id, orden, codigo, descripcion,
                                     cantidad, unidad, precio_unitario, descuento_pct,
                                     costo_unitario, subtotal)
      values (v_nc, it.producto_id, 1, it.codigo, it.descripcion, it.cantidad, it.unidad,
              it.precio_unitario, it.descuento_pct, it.costo_unitario, it.subtotal);

      perform registrar_movimiento(
        it.producto_id, v_alm, 'ingreso', it.cantidad, it.costo_unitario,
        'nota_credito', v_nc, 'FC01-' || lpad(v_corr::text, 8, '0'),
        'Devolución por nota de crédito', c.vendedor_id,
        (c.fecha_emision + 12)::timestamptz + interval '12 hours');
    end loop;
  end loop;
end $$;

-- 5) Bitácora de actividad reciente
insert into actividad (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, creado_en)
select p.vendedor_id, pr.nombre, 'emitir_comprobante', 'comprobantes', p.id,
       'Emisión de ' || p.numero || ' por S/ ' || to_char(p.total, 'FM999,999,990.00'),
       p.fecha_emision::timestamptz + interval '15 hours'
from comprobantes p
join profiles pr on pr.id = p.vendedor_id
order by p.fecha_emision desc limit 40;

insert into actividad (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, creado_en)
select c.vendedor_id, pr.nombre, 'crear_cotizacion', 'cotizaciones', c.id,
       'Cotización ' || c.numero || ' enviada por S/ ' || to_char(c.total, 'FM999,999,990.00'),
       c.fecha::timestamptz + interval '10 hours'
from cotizaciones c
join profiles pr on pr.id = c.vendedor_id
order by c.fecha desc limit 40;

insert into actividad (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, creado_en)
select g.usuario_id, pr.nombre, 'gestion_cobranza', 'gestiones_cobranza', g.id,
       'Gestión de cobranza por ' || g.canal || ' · ' || g.resultado, g.fecha
from gestiones_cobranza g
join profiles pr on pr.id = g.usuario_id
limit 25;

-- 6) Generar el tablero de alertas
select generar_alertas();
