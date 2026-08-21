-- ============================================================================
-- ERP RODATECH · Datos de demostración para negociación y cargos adicionales
-- ============================================================================

-- 1) Parte del pipeline enviado pasa a negociación activa
update cotizaciones
   set estado = 'en_negociacion',
       actualizado_en = now()
 where id in (
   select id from cotizaciones
   where estado = 'enviada' and fecha >= current_date - 45
   order by random()
   limit 22
 );

-- 2) Cargos logísticos en cotizaciones con entrega fuera de Lima o alto valor
do $$
declare
  c        record;
  v_orden  smallint;
  v_flete  numeric;
  v_costo  numeric;
begin
  for c in
    select q.id, q.subtotal, cl.provincia, cl.distrito, cl.razon_social
    from cotizaciones q
    join clientes cl on cl.id = q.cliente_id
    where q.subtotal > 1500
    order by random()
    limit 60
  loop
    v_orden := 1;

    -- Flete: más caro fuera de Lima
    v_flete := case when coalesce(c.provincia, 'Lima') <> 'Lima'
                    then round((180 + random() * 420)::numeric, 2)
                    else round((45 + random() * 120)::numeric, 2) end;
    v_costo := round((v_flete * (0.62 + random() * 0.28))::numeric, 2);

    insert into cotizacion_cargos (cotizacion_id, orden, concepto, detalle, monto, costo)
    values (c.id, v_orden, 'Flete / envío',
            case when coalesce(c.provincia,'Lima') <> 'Lima'
                 then 'Envío a ' || c.provincia || ' por transporte terrestre'
                 else 'Reparto en ' || coalesce(c.distrito, 'Lima Metropolitana') end,
            v_flete, v_costo);
    v_orden := v_orden + 1;

    -- Embalaje reforzado en una parte de los casos
    if random() < 0.35 then
      insert into cotizacion_cargos (cotizacion_id, orden, concepto, detalle, monto, costo)
      values (c.id, v_orden, 'Embalaje',
              'Embalaje reforzado en caja de madera para rodamientos de gran diámetro',
              round((60 + random() * 110)::numeric, 2),
              round((40 + random() * 60)::numeric, 2));
      v_orden := v_orden + 1;
    end if;

    -- Seguro de transporte en envíos de alto valor
    if c.subtotal > 8000 and random() < 0.5 then
      insert into cotizacion_cargos (cotizacion_id, orden, concepto, detalle, monto, costo)
      values (c.id, v_orden, 'Seguro de transporte',
              'Cobertura sobre el valor declarado de la mercadería',
              round((c.subtotal * 0.008)::numeric, 2),
              round((c.subtotal * 0.005)::numeric, 2));
    end if;

    perform recalcular_cotizacion(c.id);
  end loop;
end $$;

-- 3) Opciones de presentación variadas para mostrar ambos formatos
update cotizaciones
   set mostrar_igv = false
 where id in (select id from cotizaciones order by random() limit 40);

-- 4) Bitácora
insert into actividad (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, creado_en)
select q.vendedor_id, p.nombre, 'cotizacion_en_negociacion', 'cotizaciones', q.id,
       'Cotización ' || q.numero || ' pasó a negociación con el cliente',
       now() - (random() * 10 || ' days')::interval
from cotizaciones q
join profiles p on p.id = q.vendedor_id
where q.estado = 'en_negociacion'
limit 20;

select
  (select count(*) from cotizaciones where estado = 'en_negociacion') as en_negociacion,
  (select count(*) from cotizacion_cargos)                            as cargos,
  (select round(sum(monto)) from cotizacion_cargos)                   as monto_cargos,
  (select count(*) from cotizaciones where mostrar_igv = false)       as sin_desglose_igv;
