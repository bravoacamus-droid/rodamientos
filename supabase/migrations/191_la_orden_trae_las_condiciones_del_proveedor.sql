-- ###########################################################################
-- 191 · LA ORDEN DE COMPRA TRAE LAS CONDICIONES DEL PROVEEDOR
-- ###########################################################################
--
-- Reunión del 04/11 (38:55–49:17). Willy generó dos órdenes desde el pedido
-- y tuvo que editar cada una para poner lo mismo: «contado, previo pago»,
-- «recojo en el local del proveedor», «disponible hoy». Y propuso: *«a la
-- hora que se hace el análisis de costo… con ese proveedor qué tipo de forma
-- de pago se maneja… cosa que ya saldría en esta orden»*.
--
-- La condición es del PROVEEDOR, no de cada orden: se repite. Así que la
-- orden nueva (`falta_factura`, la que se manda al proveedor) llega con:
--
--   1. lo de la ÚLTIMA orden a ese proveedor que tenga condición puesta
--      (condición de pago, días de crédito, entrega y dirección); o
--   2. si nunca se le puso, lo que Willy dijo que es lo habitual (41:00):
--      *«contado, previo pago… recojo en el local del proveedor… la entrega
--      es inmediata, una vez que pagas»*.
--
--   Y con «recojo» y sin fecha, disponible el mismo día, como las dos de la
--   reunión.
--
-- Solo rellena lo que llega vacío, así que lo que mande quien crea la orden
-- manda, y todo se cambia después en «Editar orden» (180). La compra suelta
-- (con su factura) no se toca: no se manda a nadie.
-- ###########################################################################

create or replace function public.tg_compra_condiciones_del_proveedor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
begin
  if not coalesce(new.falta_factura, false) or new.proveedor_id is null then
    return new;
  end if;
  if new.condicion_pago is not null or new.entrega is not null then
    return new;  -- Ya trae condiciones: mandan.
  end if;

  select c.condicion_pago, c.dias_credito, c.entrega, c.direccion_entrega
    into v
    from compras c
   where c.proveedor_id = new.proveedor_id
     and c.condicion_pago is not null
     and c.estado <> 'anulada'
   order by c.creado_en desc
   limit 1;

  if found then
    new.condicion_pago := v.condicion_pago;
    new.dias_credito := v.dias_credito;
    new.entrega := v.entrega;
    new.direccion_entrega := v.direccion_entrega;
  else
    new.condicion_pago := 'contado';
    new.entrega := 'recojo';
  end if;

  if new.entrega = 'recojo' and new.fecha_estimada is null then
    new.fecha_estimada := (now() at time zone 'America/Lima')::date;
  end if;
  return new;
end $function$;

drop trigger if exists tg_compras_condiciones_del_proveedor on compras;
create trigger tg_compras_condiciones_del_proveedor
  before insert on compras
  for each row execute function public.tg_compra_condiciones_del_proveedor();

-- --------------------------------------------------------------- centinela
-- Inserta órdenes de prueba con número propio (no gasta correlativo OC02)
-- con un proveedor que ya tiene condición y con uno que no, y las deshace.
do $$
declare
  r compras;
  v_con uuid;
  v_sin uuid;
begin
  select proveedor_id into v_con from compras
   where condicion_pago is not null and estado <> 'anulada' order by creado_en desc limit 1;
  select p.id into v_sin from proveedores p
   where not exists (select 1 from compras c where c.proveedor_id = p.id and c.condicion_pago is not null)
   limit 1;

  begin
    if v_sin is not null then
      insert into compras (numero, proveedor_id, falta_factura)
      values ('ZZ-PRUEBA-191-1', v_sin, true)
      returning * into r;
      if r.condicion_pago <> 'contado' or r.entrega <> 'recojo' or r.fecha_estimada is null then
        raise exception '191: sin historia no puso contado/recojo/hoy (%, %, %)', r.condicion_pago, r.entrega, r.fecha_estimada;
      end if;
    end if;
    if v_con is not null then
      insert into compras (numero, proveedor_id, falta_factura)
      values ('ZZ-PRUEBA-191-2', v_con, true)
      returning * into r;
      if r.condicion_pago is null then
        raise exception '191: no copió la condición del proveedor';
      end if;
      -- Lo que se manda, manda.
      insert into compras (numero, proveedor_id, falta_factura, condicion_pago, dias_credito)
      values ('ZZ-PRUEBA-191-3', v_con, true, 'credito', 30)
      returning * into r;
      if r.condicion_pago <> 'credito' or r.dias_credito <> 30 then
        raise exception '191: pisó la condición que venía';
      end if;
    end if;
    raise exception '__191_DESHACER__';
  exception when others then
    if sqlerrm <> '__191_DESHACER__' then raise; end if;
  end;
  raise notice '191: condiciones del proveedor, probadas y deshechas.';
end $$;
