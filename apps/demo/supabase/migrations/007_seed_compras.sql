-- ============================================================================
-- ERP RODATECH · Compras locales, importaciones (landed cost) y recepciones
-- ============================================================================

do $$
declare
  v_comprador uuid := (select id from profiles where email = 'compras@rodatechperu.com');
  v_almacen   uuid := (select id from almacenes where codigo = 'ALM-01');
  v_transito  uuid := (select id from almacenes where codigo = 'ALM-03');
  v_igv       numeric := 0.18;

  p           record;
  r           record;
  v_oc        uuid;
  v_num       text;
  v_fecha     date;
  v_sub       numeric;
  v_orden     smallint;
  v_cant      numeric;
  v_costo     numeric;
  v_estado    estado_oc;
  v_rec       uuid;
  i           int;
  j           int;
  v_seq       int := 0;
begin
  -- ------------------------------------------------------------------ LOCAL
  for i in 1..36 loop
    select * into p from proveedores where tipo = 'local' order by random() limit 1;
    v_fecha := date '2025-10-05' + ((i - 1) * 8) + floor(random() * 4)::int;
    exit when v_fecha > current_date;
    v_seq := v_seq + 1;
    v_num := 'OC-' || to_char(v_fecha, 'YY') || '-' || lpad(v_seq::text, 5, '0');

    v_estado := case
      when v_fecha < current_date - 12 then 'recibida'::estado_oc
      when v_fecha < current_date - 4  then 'confirmada'::estado_oc
      else 'enviada'::estado_oc end;

    insert into ordenes_compra (numero, proveedor_id, tipo, fecha, fecha_estimada, moneda,
                                tipo_cambio, subtotal, igv, total, estado, almacen_id,
                                comprador_id, observaciones)
    values (v_num, p.id, 'local', v_fecha, v_fecha + p.lead_time_dias, 'PEN', 3.7550,
            0, 0, 0, v_estado, v_almacen, v_comprador,
            'Reposición de stock según rotación y pedidos confirmados')
    returning id into v_oc;

    v_sub := 0; v_orden := 0;
    for r in
      select pr.id, pr.sku, pr.descripcion, pr.unidad, pr.costo_promedio, pr.peso_kg
      from productos pr
      join marcas m on m.id = pr.marca_id
      where m.nombre = any(p.marcas_provee)
      order by random() limit (4 + floor(random() * 8)::int)
    loop
      v_orden := v_orden + 1;
      v_cant  := greatest(round((2 + random() * 22)::numeric), 1);
      v_costo := round((r.costo_promedio * (0.90 + random() * 0.14))::numeric, 4);
      insert into oc_items (orden_compra_id, producto_id, orden, codigo, descripcion, cantidad,
                            cantidad_recibida, unidad, costo_unitario, subtotal, peso_kg, costo_landed)
      values (v_oc, r.id, v_orden, r.sku, r.descripcion, v_cant,
              case when v_estado = 'recibida' then v_cant else 0 end,
              r.unidad, v_costo, round(v_cant * v_costo, 2), r.peso_kg, v_costo);
      v_sub := v_sub + round(v_cant * v_costo, 2);
    end loop;

    update ordenes_compra
       set subtotal = v_sub, igv = round(v_sub * v_igv, 2), total = round(v_sub * (1 + v_igv), 2)
     where id = v_oc;

    -- Recepción e ingreso a almacén
    if v_estado = 'recibida' then
      insert into recepciones (numero, orden_compra_id, almacen_id, fecha, guia_proveedor,
                               factura_proveedor, recibido_por, observaciones)
      values ('REC-' || to_char(v_fecha, 'YY') || '-' || lpad(v_seq::text, 5, '0'), v_oc, v_almacen,
              v_fecha + p.lead_time_dias, 'G' || lpad((1000 + v_seq)::text, 6, '0'),
              'F' || lpad((500 + v_seq)::text, 3, '0') || '-' || lpad((2000 + v_seq)::text, 8, '0'),
              (select id from profiles where email = 'almacen@rodatechperu.com'),
              'Mercadería conforme según guía')
      returning id into v_rec;

      for r in select * from oc_items where orden_compra_id = v_oc loop
        insert into recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario)
        values (v_rec, r.producto_id, r.cantidad, r.costo_unitario);

        perform registrar_movimiento(
          r.producto_id, v_almacen, 'ingreso', r.cantidad, r.costo_unitario,
          'compra', v_oc, v_num, 'Compra local · ' || p.razon_social, v_comprador,
          (v_fecha + p.lead_time_dias)::timestamptz + interval '11 hours');
      end loop;
    end if;
  end loop;

  -- ----------------------------------------------------------- IMPORTACIONES
  for i in 1..6 loop
    select * into p from proveedores where tipo = 'importacion' order by random() limit 1;
    v_fecha := date '2025-11-10' + ((i - 1) * 45);
    v_seq := v_seq + 1;
    v_num := 'OC-' || to_char(v_fecha, 'YY') || '-' || lpad(v_seq::text, 5, '0');

    v_estado := case when i <= 4 then 'recibida'::estado_oc
                     when i = 5 then 'transito'::estado_oc
                     else 'confirmada'::estado_oc end;

    insert into ordenes_compra (numero, proveedor_id, tipo, fecha, fecha_estimada, moneda,
                                tipo_cambio, subtotal, igv, total, estado, almacen_id,
                                comprador_id, incoterm, observaciones)
    values (v_num, p.id, 'importacion', v_fecha, v_fecha + p.lead_time_dias, 'USD', 3.7550,
            0, 0, 0, v_estado, v_almacen, v_comprador, 'FOB',
            'Importación consolidada · línea económica de alta rotación')
    returning id into v_oc;

    v_sub := 0; v_orden := 0;
    for r in
      select pr.id, pr.sku, pr.descripcion, pr.unidad, pr.costo_promedio, pr.peso_kg
      from productos pr
      join marcas m on m.id = pr.marca_id
      where m.nombre = any(p.marcas_provee)
      order by random() limit (14 + floor(random() * 12)::int)
    loop
      v_orden := v_orden + 1;
      v_cant  := greatest(round((30 + random() * 170)::numeric), 10);
      -- costo FOB en USD: aprox. 48% del costo local en soles convertido
      v_costo := round((r.costo_promedio * 0.48 / 3.7550)::numeric, 4);
      insert into oc_items (orden_compra_id, producto_id, orden, codigo, descripcion, cantidad,
                            cantidad_recibida, unidad, costo_unitario, subtotal, peso_kg, costo_landed)
      values (v_oc, r.id, v_orden, r.sku, r.descripcion, v_cant,
              case when v_estado = 'recibida' then v_cant else 0 end,
              r.unidad, v_costo, round(v_cant * v_costo, 2), r.peso_kg, 0);
      v_sub := v_sub + round(v_cant * v_costo, 2);
    end loop;

    update ordenes_compra
       set subtotal = v_sub, igv = 0, total = v_sub
     where id = v_oc;

    -- Expediente de importación con prorrateo de gastos
    declare
      v_imp     uuid;
      v_fob_pen numeric := round(v_sub * 3.7550, 2);
      v_flete   numeric := round((v_fob_pen * (0.055 + random() * 0.03))::numeric, 2);
      v_seguro  numeric;
      v_cif     numeric;
      v_advalorem numeric;
      v_igvimp  numeric;
      v_ipm     numeric;
      v_percep  numeric;
      v_agente  numeric := round((950 + random() * 700)::numeric, 2);
      v_alma    numeric := round((680 + random() * 900)::numeric, 2);
      v_transp  numeric := round((420 + random() * 380)::numeric, 2);
      v_otros   numeric := round((180 + random() * 320)::numeric, 2);
      v_gastos  numeric;
      v_factor  numeric;
    begin
      v_seguro    := round(v_fob_pen * 0.008, 2);
      v_cif       := v_fob_pen + v_flete + v_seguro;
      v_advalorem := round(v_cif * 0.06, 2);
      v_igvimp    := round((v_cif + v_advalorem) * 0.16, 2);
      v_ipm       := round((v_cif + v_advalorem) * 0.02, 2);
      v_percep    := round((v_cif + v_advalorem + v_igvimp + v_ipm) * 0.035, 2);
      -- El IGV y la percepción son crédito fiscal: no forman parte del costo
      v_gastos    := v_flete + v_seguro + v_advalorem + v_ipm + v_agente + v_alma + v_transp + v_otros;
      v_factor    := round(((v_fob_pen + v_gastos) / nullif(v_fob_pen, 0))::numeric, 4);

      insert into importaciones (
        numero, orden_compra_id, proveedor_id, dua, puerto_origen, puerto_destino,
        fecha_embarque, fecha_llegada, fecha_nacionalizacion, moneda_origen, tipo_cambio,
        valor_fob, metodo_prorrateo, flete, seguro, ad_valorem, igv_importacion, ipm, percepcion,
        agente_aduana, almacen_portuario, transporte_interno, otros_gastos,
        total_gastos, costo_total_almacen, factor_landed, estado, observaciones)
      values (
        'IMP-' || to_char(v_fecha, 'YY') || '-' || lpad(i::text, 3, '0'), v_oc, p.id,
        '235-2026-10-' || lpad((100000 + i * 137)::text, 6, '0'),
        case when p.pais = 'China' then 'Ningbo' else 'Singapur' end, 'Callao',
        v_fecha + 12, v_fecha + p.lead_time_dias - 6, v_fecha + p.lead_time_dias - 2,
        'USD', 3.7550, v_fob_pen, 'valor',
        v_flete, v_seguro, v_advalorem, v_igvimp, v_ipm, v_percep,
        v_agente, v_alma, v_transp, v_otros,
        v_gastos, v_fob_pen + v_gastos, v_factor,
        case when i <= 4 then 'recibida'::estado_importacion
             when i = 5 then 'en_aduana'::estado_importacion
             else 'embarcada'::estado_importacion end,
        'Prorrateo por valor FOB. IGV de importación y percepción tratados como crédito fiscal.')
      returning id into v_imp;

      -- Costo landed por ítem
      update oc_items oi
         set costo_landed = round((oi.costo_unitario * 3.7550 * v_factor)::numeric, 4)
       where oi.orden_compra_id = v_oc;

      if v_estado = 'recibida' then
        insert into recepciones (numero, orden_compra_id, importacion_id, almacen_id, fecha,
                                 guia_proveedor, factura_proveedor, recibido_por, observaciones)
        values ('REC-IMP-' || lpad(i::text, 3, '0'), v_oc, v_imp, v_almacen,
                v_fecha + p.lead_time_dias, 'BL-' || lpad((70000 + i * 91)::text, 6, '0'),
                'INV-' || lpad((3000 + i)::text, 6, '0'),
                (select id from profiles where email = 'almacen@rodatechperu.com'),
                'Ingreso nacionalizado con costo puesto en almacén (landed cost)')
        returning id into v_rec;

        for r in select * from oc_items where orden_compra_id = v_oc loop
          insert into recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario)
          values (v_rec, r.producto_id, r.cantidad, r.costo_landed);

          perform registrar_movimiento(
            r.producto_id, v_almacen, 'ingreso', r.cantidad, r.costo_landed,
            'importacion', v_imp, 'IMP-' || to_char(v_fecha, 'YY') || '-' || lpad(i::text, 3, '0'),
            'Importación nacionalizada · factor landed ' || v_factor::text,
            v_comprador, (v_fecha + p.lead_time_dias)::timestamptz + interval '10 hours');
        end loop;
      elsif v_estado = 'transito' then
        for r in select * from oc_items where orden_compra_id = v_oc loop
          perform registrar_movimiento(
            r.producto_id, v_transito, 'ingreso', r.cantidad, r.costo_landed,
            'importacion', v_imp, 'IMP-' || to_char(v_fecha, 'YY') || '-' || lpad(i::text, 3, '0'),
            'Mercadería en tránsito / aduana', v_comprador,
            (v_fecha + 20)::timestamptz + interval '10 hours');
        end loop;
      end if;
    end;
  end loop;
end $$;

insert into actividad (usuario_id, usuario_nombre, accion, entidad, descripcion)
select p.id, p.nombre, 'carga_compras', 'ordenes_compra',
       'Registro histórico de órdenes de compra e importaciones'
from profiles p where p.email = 'compras@rodatechperu.com';
