-- ###########################################################################
-- 154 · LO FACTURADO, POR MARCA (23/10)
-- ###########################################################################
--
-- El consultor del 23/10, entre las victorias rápidas: Rodatech vende marcas
-- —SKF, NTN, FAG, INA, TIMKEN…— y negocia con los distribuidores de cada
-- una, pero ningún reporte decía cuánto se vende de cada marca. Estaba el
-- detalle en el Excel; la respuesta, no.
--
-- `tablero_facturacion` gana `por_marca`: lo facturado sin IGV por marca en
-- el periodo, con cuántos comprobantes y clientes. La marca sale de la línea
-- (así entró el histórico del Excel) y, si no la trae, del producto. «Sin
-- marca» y una marca vacía son lo mismo (056).
--
-- Las notas de crédito no restan aquí, igual que en `top_productos` al lado:
-- es «qué se vende», no el neto contable (eso es el Excel para el contador).

do $$
declare
  v_def text := replace(pg_get_functiondef('public.tablero_facturacion(date,date,text,uuid)'::regprocedure), E'\r\n', E'\n');
  v_viejo text := $a$           limit 10
        ) p
    ), '[]'::jsonb)
  );$a$;
begin
  if position(v_viejo in v_def) = 0 then
    raise exception '154: no encontré el final de tablero_facturacion';
  end if;
  v_def := replace(v_def, v_viejo, $a$           limit 10
        ) p
    ), '[]'::jsonb),

    -- 154: por marca.
    'por_marca', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.venta desc)
        from (
          select coalesce(nullif(upper(btrim(ci.marca)), ''), upper(m.nombre), 'SIN MARCA') as marca,
                 round(sum(ci.importe), 2) as venta,
                 count(distinct v.id) as documentos,
                 count(distinct v.cliente_id) as clientes
            from comprobante_items ci
            join ventas v on v.id = ci.comprobante_id
            left join productos p on p.id = ci.producto_id
            left join marcas m on m.id = p.marca_id
           group by 1
           order by venta desc
           limit 12
        ) x
    ), '[]'::jsonb)
  );$a$);
  execute v_def;
end $$;

-- Centinela: la suma por marca es la misma venta que la de las líneas.
do $$
declare v jsonb; v_marcas numeric; v_lineas numeric;
begin
  v := public.tablero_facturacion('2020-01-01', current_date, 'anio');
  select coalesce(sum((x ->> 'venta')::numeric), 0) into v_marcas from jsonb_array_elements(v -> 'por_marca') x;
  select round(coalesce(sum(m.venta), 0), 2) into v_lineas from (
    select sum(ci.importe) as venta
      from comprobante_items ci join comprobantes c on c.id = ci.comprobante_id
      left join productos p on p.id = ci.producto_id left join marcas mm on mm.id = p.marca_id
     where c.tipo in ('factura','boleta') and c.estado <> 'anulado'
       and c.fecha_emision between '2020-01-01' and current_date
     group by coalesce(nullif(upper(btrim(ci.marca)), ''), upper(mm.nombre), 'SIN MARCA')
     order by 1 desc limit 12) m;
  if abs(v_marcas - v_lineas) > 0.05 then
    raise exception '154: por marca suma % y las líneas %', v_marcas, v_lineas;
  end if;
  raise notice '154: por marca, % en las 12 primeras.', v_marcas;
end $$;
