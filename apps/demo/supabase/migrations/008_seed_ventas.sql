-- ============================================================================
-- ERP RODATECH · Cotizaciones, pedidos, comprobantes y salidas de almacén
-- ============================================================================

do $$
declare
  v_igv        numeric := 0.18;
  v_alm        uuid := (select id from almacenes where codigo = 'ALM-01');
  v_ventas     uuid := (select id from profiles where email = 'ventas@rodatechperu.com');
  v_gerencia   uuid := (select id from profiles where email = 'gerencia@rodatechperu.com');
  v_admin      uuid := (select id from profiles where email = 'admin@rodatechperu.com');

  d            date;
  n_cot        int;
  k            int;
  cli          record;
  it           record;
  v_cot        uuid;
  v_numcot     text;
  v_sub        numeric;
  v_costo      numeric;
  v_orden      smallint;
  v_cant       numeric;
  v_precio     numeric;
  v_desc       numeric;
  v_estado     estado_cotizacion;
  v_vendedor   uuid;
  v_lista      lista_precio;
  v_seqcot     int := 0;
  v_seqped     int := 0;
  v_rnd        numeric;

  v_ped        uuid;
  v_numped     text;
  v_emergencia boolean;
  v_comp       uuid;
  v_corr       int;
  v_tipo       tipo_comprobante;
  v_serie      text;
  v_femision   date;
  v_stock      numeric;
begin
  d := date '2025-10-01';
  while d <= current_date loop
    -- solo días hábiles (lun-sáb)
    if extract(dow from d) = 0 then
      d := d + 1;
      continue;
    end if;

    n_cot := 1 + floor(random() * 3)::int;   -- 1 a 3 cotizaciones por día

    for k in 1..n_cot loop
      select c.*, coalesce(c.vendedor_id, v_ventas) as vend into cli
      from clientes c where c.activo and c.codigo <> 'CLI-026'
      order by random() limit 1;

      v_seqcot := v_seqcot + 1;
      v_numcot := 'COT-' || to_char(d, 'YY') || '-' || lpad(v_seqcot::text, 5, '0');
      v_vendedor := cli.vend;
      v_lista := cli.lista_precio;
      v_rnd := random();

      if d > current_date - 8 then
        v_estado := case when v_rnd < 0.35 then 'borrador'::estado_cotizacion
                         else 'enviada'::estado_cotizacion end;
      elsif d > current_date - 20 then
        v_estado := case when v_rnd < 0.38 then 'convertida'::estado_cotizacion
                         when v_rnd < 0.55 then 'aceptada'::estado_cotizacion
                         when v_rnd < 0.72 then 'enviada'::estado_cotizacion
                         else 'rechazada'::estado_cotizacion end;
      else
        v_estado := case when v_rnd < 0.44 then 'convertida'::estado_cotizacion
                         when v_rnd < 0.66 then 'rechazada'::estado_cotizacion
                         else 'vencida'::estado_cotizacion end;
      end if;

      insert into cotizaciones (numero, cliente_id, fecha, validez_dias, moneda, tipo_cambio,
                                lista_precio, estado, vendedor_id, contacto, condiciones,
                                tiempo_entrega, observaciones, enviada_en,
                                motivo_rechazo)
      values (v_numcot, cli.id, d, case when random() < 0.5 then 15 else 10 end, 'PEN', 3.7550,
              v_lista, v_estado, v_vendedor, cli.contacto,
              case when cli.dias_credito > 0
                   then 'Crédito ' || cli.dias_credito || ' días · Precios incluyen IGV'
                   else 'Contado · Precios incluyen IGV' end,
              (array['Stock inmediato','24 a 48 horas','3 a 5 días útiles','7 días útiles',
                     'Inmediato para stock · 15 días importación'])[1 + floor(random() * 5)::int],
              case when random() < 0.35
                   then 'Solicitud recibida por WhatsApp. Cliente compara con 2 proveedores.'
                   else null end,
              case when v_estado <> 'borrador' then d::timestamptz + interval '10 hours' else null end,
              case when v_estado = 'rechazada'
                   then (array['Precio por encima de la competencia',
                               'Cliente postergó la compra',
                               'Compró marca alternativa más económica',
                               'Plazo de entrega no compatible'])[1 + floor(random() * 4)::int]
                   else null end)
      returning id into v_cot;

      v_sub := 0; v_costo := 0; v_orden := 0;

      for it in
        select p.id, p.sku, p.descripcion, p.unidad, p.costo_promedio,
               p.precio_mayorista, p.precio_fabrica, p.precio_importacion,
               m.nombre as marca
        from productos p left join marcas m on m.id = p.marca_id
        where p.activo
        order by random() limit (2 + floor(random() * 5)::int)
      loop
        v_orden := v_orden + 1;
        v_cant := greatest(round((1 + random() * 11)::numeric), 1);
        v_precio := case v_lista
          when 'fabrica' then it.precio_fabrica
          when 'importacion' then it.precio_importacion
          else it.precio_mayorista end;
        v_precio := round((v_precio * (0.96 + random() * 0.10))::numeric, 4);
        v_desc := case when random() < 0.22 then round((2 + random() * 8)::numeric, 2) else 0 end;

        insert into cotizacion_items (cotizacion_id, producto_id, orden, codigo, descripcion,
                                      marca, cantidad, unidad, precio_unitario, descuento_pct,
                                      costo_unitario, subtotal, entrega)
        values (v_cot, it.id, v_orden, it.sku, it.descripcion, it.marca, v_cant, it.unidad,
                v_precio, v_desc, it.costo_promedio,
                round(v_cant * v_precio * (1 - v_desc / 100), 2),
                case when random() < 0.2 then '15 días' else 'Stock' end);

        v_sub := v_sub + round(v_cant * v_precio * (1 - v_desc / 100), 2);
        v_costo := v_costo + round(v_cant * it.costo_promedio, 2);
      end loop;

      update cotizaciones
         set subtotal = v_sub,
             igv = round(v_sub * v_igv, 2),
             total = round(v_sub * (1 + v_igv), 2),
             costo_total = v_costo,
             margen_pct = case when v_sub > 0 then round(((v_sub - v_costo) / v_sub) * 100, 2) else 0 end
       where id = v_cot;

      -- ------------------------------------------------- PEDIDO + COMPROBANTE
      if v_estado in ('convertida', 'aceptada') then
        v_seqped := v_seqped + 1;
        v_numped := 'PED-' || to_char(d, 'YY') || '-' || lpad(v_seqped::text, 5, '0');
        v_emergencia := random() < 0.14;

        insert into pedidos (numero, cliente_id, cotizacion_id, fecha, fecha_entrega, moneda,
                             tipo_cambio, subtotal, igv, total, costo_total, estado,
                             es_emergencia, requiere_aprobacion, aprobado_por, aprobado_en,
                             orden_compra_cliente, vendedor_id, almacen_id, observaciones)
        values (v_numped, cli.id, v_cot, d + 1,
                d + 1 + case when v_emergencia then 0 else floor(random() * 4)::int end,
                'PEN', 3.7550, v_sub, round(v_sub * v_igv, 2), round(v_sub * (1 + v_igv), 2),
                v_costo,
                case when v_estado = 'convertida' then 'facturado'::estado_pedido
                     when d > current_date - 4 then 'pendiente'::estado_pedido
                     else 'preparacion'::estado_pedido end,
                v_emergencia,
                v_emergencia,
                case when v_emergencia and d <= current_date - 3 then v_admin else null end,
                case when v_emergencia and d <= current_date - 3
                     then d::timestamptz + interval '14 hours' else null end,
                case when random() < 0.4 then 'OC-' || lpad(floor(random() * 90000 + 10000)::text, 5, '0') else null end,
                v_vendedor, v_alm,
                case when v_emergencia
                     then 'PEDIDO DE EMERGENCIA · parada de planta. Se atiende con stock por reponer.'
                     else null end)
        returning id into v_ped;

        for it in select * from cotizacion_items where cotizacion_id = v_cot order by orden loop
          select coalesce(sum(s.cantidad), 0) into v_stock
            from stock s where s.producto_id = it.producto_id;

          insert into pedido_items (pedido_id, producto_id, orden, codigo, descripcion, cantidad,
                                    cantidad_atendida, unidad, precio_unitario, descuento_pct,
                                    costo_unitario, subtotal, por_reponer)
          values (v_ped, it.producto_id, it.orden, it.codigo, it.descripcion, it.cantidad,
                  case when v_estado = 'convertida' then it.cantidad else 0 end,
                  it.unidad, it.precio_unitario, it.descuento_pct, it.costo_unitario,
                  it.subtotal, v_emergencia and v_stock < it.cantidad);
        end loop;

        -- Facturación
        if v_estado = 'convertida' then
          v_femision := d + 1;
          if cli.ruc is null or random() < 0.10 then
            v_tipo := 'boleta'; v_serie := 'B001';
          else
            v_tipo := 'factura'; v_serie := 'F001';
          end if;
          v_corr := siguiente_correlativo(v_tipo, v_serie);

          insert into comprobantes (
            tipo, serie, correlativo, cliente_id, pedido_id, fecha_emision, fecha_vencimiento,
            condicion_pago, dias_credito, moneda, tipo_cambio, op_gravada, igv, total,
            total_letras, costo_total, pagado, saldo, estado, vendedor_id, observaciones,
            guia_remision, orden_compra_cliente)
          values (
            v_tipo, v_serie, v_corr, cli.id, v_ped, v_femision,
            v_femision + coalesce(nullif(cli.dias_credito, 0), 0),
            case when cli.dias_credito > 0 then 'credito' else 'contado' end,
            cli.dias_credito, 'PEN', 3.7550,
            v_sub, round(v_sub * v_igv, 2), round(v_sub * (1 + v_igv), 2),
            numero_a_letras(round(v_sub * (1 + v_igv), 2), 'PEN'),
            v_costo, 0, round(v_sub * (1 + v_igv), 2), 'emitido', v_vendedor,
            case when v_emergencia then 'Atención de emergencia · pedido ' || v_numped else null end,
            'T001-' || lpad((10000 + v_seqped)::text, 8, '0'),
            (select orden_compra_cliente from pedidos where id = v_ped))
          returning id into v_comp;

          for it in select * from cotizacion_items where cotizacion_id = v_cot order by orden loop
            insert into comprobante_items (comprobante_id, producto_id, orden, codigo, descripcion,
                                           cantidad, unidad, precio_unitario, descuento_pct,
                                           costo_unitario, subtotal)
            values (v_comp, it.producto_id, it.orden, it.codigo, it.descripcion, it.cantidad,
                    it.unidad, it.precio_unitario, it.descuento_pct, it.costo_unitario, it.subtotal);

            perform registrar_movimiento(
              it.producto_id, v_alm, 'salida', it.cantidad, it.costo_unitario,
              'comprobante', v_comp, v_serie || '-' || lpad(v_corr::text, 8, '0'),
              'Venta a ' || cli.razon_social, v_vendedor,
              v_femision::timestamptz + interval '15 hours');
          end loop;
        end if;
      end if;
    end loop;

    d := d + 1;
  end loop;
end $$;

-- Regularización de los pedidos de emergencia atendidos con stock negativo
do $$
declare
  r      record;
  v_alm  uuid := (select id from almacenes where codigo = 'ALM-01');
  v_user uuid := (select id from profiles where email = 'almacen@rodatechperu.com');
begin
  for r in
    select distinct pi.producto_id, p.numero, p.fecha, sum(pi.cantidad) as cant
    from pedido_items pi
    join pedidos p on p.id = pi.pedido_id
    where pi.por_reponer and p.fecha < current_date - 6
    group by pi.producto_id, p.numero, p.fecha
    limit 60
  loop
    perform registrar_movimiento(
      r.producto_id, v_alm, 'regularizacion', r.cant,
      (select costo_promedio from productos where id = r.producto_id),
      'pedido', null, r.numero,
      'Regularización de stock negativo · reposición de pedido de emergencia', v_user,
      (r.fecha + 4)::timestamptz + interval '9 hours');
  end loop;
end $$;
