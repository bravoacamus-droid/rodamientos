-- ###########################################################################
-- 129 · LA ORDEN SE MARCA CUANDO SE ENLAZA AL PEDIDO
-- ###########################################################################
--
-- La 128 marcaba `falta_factura` al INSERTAR una compra con `cotizacion_id`.
-- Pero `generar_ordenes_de_compra` no la inserta así: llama a
-- `crear_compra` —que no sabe de cotizaciones— y DESPUÉS hace
-- `update compras set cotizacion_id = …`. El trigger nunca veía la
-- cotización, y las órdenes nacían como compras ya registradas.
--
-- Lo vio Luis el mismo 15/10, con COT1-000014: sus dos órdenes salían
-- «Todas con su factura», con «Factura —», sin que se hubiera comprado nada.
--
-- Arreglo: el trigger mira también el UPDATE que pone la cotización. Y se
-- corrigen las que ya nacieron mal.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.tg_orden_sin_factura()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  -- Al nacer con cotización, o al enlazarla después (lo que hace
  -- `generar_ordenes_de_compra`). Nunca al revés: quitar la marca es cosa
  -- de `completar_compra`.
  if new.cotizacion_id is not null
     and (tg_op = 'INSERT' or old.cotizacion_id is null)
     and nullif(trim(new.documento_proveedor), '') is null
     and new.estado = 'registrada' then
    new.falta_factura := true;
  end if;
  return new;
end $$;

drop trigger if exists tg_compras_orden_sin_factura on compras;
create trigger tg_compras_orden_sin_factura
  before insert or update of cotizacion_id on compras
  for each row execute function public.tg_orden_sin_factura();

-- Las que nacieron sin la marca.
update compras
   set falta_factura = true
 where cotizacion_id is not null
   and nullif(trim(documento_proveedor), '') is null
   and estado = 'registrada'
   and not falta_factura;

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA el camino de verdad: crear la compra y enlazarla después.
do $$
declare
  v_usuario uuid; v_prov uuid; p1 uuid; v_cot uuid; r jsonb; v_id uuid;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_prov from proveedores order by creado_en limit 1;
  select id into p1 from productos order by codigo limit 1;
  select id into v_cot from cotizaciones order by creado_en limit 1;
  if v_usuario is null or v_prov is null or p1 is null or v_cot is null then
    raise notice '129: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_compra(jsonb_build_object('proveedor_id', v_prov, 'tipo', 'local', 'moneda', 'USD',
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1, 'costo_unitario', 1, 'unidad_codigo', 'NIU'))));
    v_id := (r ->> 'id')::uuid;
    if (select falta_factura from compras where id = v_id) then
      raise exception '129: una compra suelta nació marcada';
    end if;
    update compras set cotizacion_id = v_cot where id = v_id;
    if not (select falta_factura from compras where id = v_id) then
      raise exception '129: la orden enlazada a la cotización no quedó marcada';
    end if;
    raise exception '__129_DESHACER__';
  exception when others then
    if sqlerrm <> '__129_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '129: la orden se marca al enlazarla; deshecho limpio.';
end $$;
