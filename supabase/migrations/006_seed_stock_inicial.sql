-- ============================================================================
-- ERP RODATECH · Inventario inicial (30/09/2025) + asignación de vendedores
-- ============================================================================

-- Vendedor asignado a cada cliente
update clientes c
   set vendedor_id = (select id from profiles where email = 'ventas@rodatechperu.com')
 where c.vendedor_id is null;

update clientes c
   set vendedor_id = (select id from profiles where email = 'gerencia@rodatechperu.com')
 where c.codigo in ('CLI-001','CLI-002','CLI-007','CLI-012','CLI-020','CLI-022');

-- Inventario inicial valorizado en el Almacén Central
do $$
declare
  v_alm    uuid := (select id from almacenes where codigo = 'ALM-01');
  v_alm2   uuid := (select id from almacenes where codigo = 'ALM-02');
  v_user   uuid := (select id from profiles where email = 'almacen@rodatechperu.com');
  r        record;
  v_cant   numeric;
  v_i      int := 0;
begin
  for r in select id, costo_promedio, stock_minimo, categoria_id, sku from productos order by sku loop
    v_i := v_i + 1;
    -- ~7% de los ítems arrancan en cero (nunca comprados / agotados)
    if (v_i % 14) = 0 then
      continue;
    end if;

    v_cant := case
      when r.costo_promedio > 800 then greatest(round((r.stock_minimo * (0.4 + random() * 1.6))::numeric), 1)
      when r.costo_promedio > 200 then greatest(round((r.stock_minimo * (0.6 + random() * 2.4))::numeric), 2)
      else greatest(round((r.stock_minimo * (0.8 + random() * 4.0))::numeric), 3)
    end;

    perform registrar_movimiento(
      r.id, v_alm, 'ingreso', v_cant,
      round((r.costo_promedio * (0.94 + random() * 0.10))::numeric, 4),
      'ajuste', null, 'INV-INICIAL', 'Inventario inicial · toma física de apertura',
      v_user, timestamptz '2025-09-30 09:00:00-05');

    -- Una porción del catálogo también se exhibe en mostrador
    if (v_i % 9) = 0 then
      perform registrar_movimiento(
        r.id, v_alm2, 'ingreso', greatest(round((v_cant * 0.18)::numeric), 1),
        round(r.costo_promedio * 0.98, 4),
        'ajuste', null, 'INV-INICIAL', 'Inventario inicial mostrador',
        v_user, timestamptz '2025-09-30 09:30:00-05');
    end if;
  end loop;
end $$;

insert into actividad (usuario_id, usuario_nombre, accion, entidad, descripcion)
select id, nombre, 'inventario_inicial', 'movimientos_inventario',
       'Carga del inventario inicial valorizado al 30/09/2025'
from profiles where email = 'almacen@rodatechperu.com';
