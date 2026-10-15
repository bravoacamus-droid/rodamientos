-- ###########################################################################
-- 139 · ÍNDICES QUE FALTABAN
-- ###########################################################################
--
-- Revisión del flujo antes de producción (15/10). Hoy los volúmenes son
-- chicos y todo responde en milisegundos, pero cuatro columnas que se
-- filtran a menudo no tenían índice, y con dos años de pedidos serían el
-- primer cuello de botella:
--
--   · guia_items.cotizacion_item_id — `despacho_por_item`, en cada guía y
--     cada ficha de cotización.
--   · pedido_items.cotizacion_item_id — la subconsulta de `v_pedido_lineas`,
--     que leen la lista de pedidos, los reportes y las fichas.
--   · pedidos.cliente_id — la ficha del cliente y sus pedidos.
--   · gestiones_cobranza.comprobante_id — la ficha de cada factura.
-- ###########################################################################

create index if not exists ix_guia_items_cotizacion_item on guia_items (cotizacion_item_id)
  where cotizacion_item_id is not null;
create index if not exists ix_pedido_items_cotizacion_item on pedido_items (cotizacion_item_id);
create index if not exists ix_pedidos_cliente on pedidos (cliente_id, fecha desc);
create index if not exists ix_gestiones_cobranza_comprobante on gestiones_cobranza (comprobante_id);

do $$
begin
  if (select count(*) from pg_indexes where indexname in (
        'ix_guia_items_cotizacion_item', 'ix_pedido_items_cotizacion_item',
        'ix_pedidos_cliente', 'ix_gestiones_cobranza_comprobante')) <> 4 then
    raise exception '139: falta algún índice';
  end if;
  raise notice '139: los cuatro índices están.';
end $$;
