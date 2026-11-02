-- 180 · La orden de compra se edita, y dice cómo se paga y cómo se entrega
--
-- El problema. Willy, 02/11 (por Moisés, en vivo): *«cada orden de compra es
-- como una cotización: que se pueda editar también los precios de costo que
-- se puso, y poner condición de pago —contado, previo pago, o crédito,
-- factura a 30 días o 60— … y dirección de entrega, si lo van a traer o él
-- va a ir a recoger. Esos datos faltan para enviarle al proveedor»*.
--
-- La orden nacía de la cotización (111) y no se podía tocar: corregir era
-- anularla y rehacerla. Y no guardaba ni el pago ni la entrega.
--
-- Dos momentos, que no se mezclan:
--   1. LA ORDEN, antes de comprar: se edita aquí —costos, cantidades, pago,
--      entrega, notas— y se le manda al proveedor en PDF.
--   2. LA COMPRA, cuando llega su factura: `completar_compra` (128), como
--      hasta hoy. Esta función no la toca.
--
-- Se edita solo mientras nadie la haya usado: registrada, sin factura del
-- proveedor y sin recepción. Lo mismo que la cotización con guía (070).
-- Columnas nuevas, todas opcionales: lo registrado antes (y las 781 de
-- SIMPLE) no cambia.

alter table public.compras
  add column if not exists condicion_pago text,
  add column if not exists dias_credito int,
  add column if not exists entrega text,
  add column if not exists direccion_entrega text;

do $$ begin
  alter table public.compras add constraint compras_condicion_pago_ok
    check (condicion_pago is null or condicion_pago in ('contado', 'credito'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.compras add constraint compras_dias_credito_ok
    check (dias_credito is null or (condicion_pago = 'credito' and dias_credito between 1 and 365));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.compras add constraint compras_entrega_ok
    check (entrega is null or entrega in ('almacen', 'recojo'));
exception when duplicate_object then null; end $$;

comment on column public.compras.condicion_pago is 'Cómo se le paga al proveedor (180): contado (previo pago) o crédito.';
comment on column public.compras.dias_credito is 'Con crédito: a cuántos días la factura del proveedor (30, 60…) (180).';
comment on column public.compras.entrega is 'almacen: el proveedor lo trae a direccion_entrega; recojo: se recoge en su local (180).';

create or replace function public.actualizar_orden_compra(p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c        compras%rowtype;
  v_cond     text := nullif(p_datos ->> 'condicion_pago', '');
  v_dias     int := nullif(p_datos ->> 'dias_credito', '')::int;
  v_entrega  text := nullif(p_datos ->> 'entrega', '');
  v_items    jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_igv_pct  numeric(5,2);
  v_sub      numeric(14,2);
  v_igv      numeric(14,2);
  v_ajenos   int;
begin
  -- Lo primero: es security definer y se salta la RLS.
  if not public.puede('compras', 'editar') then
    raise exception 'Tu rol no puede editar órdenes de compra' using errcode = 'insufficient_privilege';
  end if;

  select * into v_c from compras where id = p_id for update;
  if not found then
    raise exception 'La orden ya no existe' using errcode = 'no_data_found';
  end if;
  if v_c.estado <> 'registrada' then
    raise exception 'La orden % ya está %: no se edita', v_c.numero, v_c.estado using errcode = 'check_violation';
  end if;
  if v_c.documento_proveedor is not null then
    raise exception 'La orden % ya tiene la factura del proveedor (%): no se edita', v_c.numero, v_c.documento_proveedor
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from recepciones r where r.compra_id = p_id) then
    raise exception 'De la orden % ya se recibió mercadería: no se edita', v_c.numero using errcode = 'check_violation';
  end if;

  if v_cond is not null and v_cond not in ('contado', 'credito') then
    raise exception 'Condición de pago no válida' using errcode = 'check_violation';
  end if;
  if v_cond is distinct from 'credito' then v_dias := null; end if;
  if v_entrega is not null and v_entrega not in ('almacen', 'recojo') then
    raise exception 'Entrega no válida' using errcode = 'check_violation';
  end if;

  -- Las líneas: las que vienen se actualizan; las que no, se quitan.
  if jsonb_array_length(v_items) = 0 then
    raise exception 'La orden tiene que quedar con al menos un producto' using errcode = 'check_violation';
  end if;
  select count(*) into v_ajenos
    from jsonb_array_elements(v_items) i
   where not exists (select 1 from compra_items ci
                      where ci.id = (i ->> 'id')::uuid and ci.compra_id = p_id);
  if v_ajenos > 0 then
    raise exception 'Hay líneas que no son de esta orden' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) i
              where coalesce((i ->> 'cantidad')::numeric, 0) <= 0
                 or coalesce((i ->> 'costo_unitario')::numeric, -1) < 0) then
    raise exception 'Cada producto necesita una cantidad mayor que cero y un costo' using errcode = 'check_violation';
  end if;

  delete from compra_items ci
   where ci.compra_id = p_id
     and not exists (select 1 from jsonb_array_elements(v_items) i where (i ->> 'id')::uuid = ci.id);

  update compra_items ci
     set cantidad = (i ->> 'cantidad')::numeric,
         costo_unitario = (i ->> 'costo_unitario')::numeric
    from jsonb_array_elements(v_items) i
   where ci.id = (i ->> 'id')::uuid and ci.compra_id = p_id;

  -- Los totales, como `crear_compra` (044): el IGV sobre el subtotal, solo
  -- si la orden lo llevaba.
  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;
  select coalesce(sum(importe), 0) into v_sub from compra_items where compra_id = p_id;
  v_igv := case when v_c.igv > 0 or v_c.subtotal = 0 then round(v_sub * v_igv_pct / 100.0, 2) else 0 end;

  update compras
     set condicion_pago    = v_cond,
         dias_credito      = v_dias,
         entrega           = v_entrega,
         direccion_entrega = case when v_entrega = 'almacen' then nullif(btrim(p_datos ->> 'direccion_entrega'), '') end,
         fecha_estimada    = nullif(p_datos ->> 'fecha_estimada', '')::date,
         observaciones     = nullif(btrim(p_datos ->> 'observaciones'), ''),
         subtotal          = v_sub,
         igv               = v_igv,
         total             = v_sub + v_igv
   where id = p_id;

  return jsonb_build_object('id', p_id, 'numero', v_c.numero, 'subtotal', v_sub, 'igv', v_igv, 'total', v_sub + v_igv);
end
$$;

comment on function public.actualizar_orden_compra(uuid, jsonb) is
  'Edita una orden de compra registrada, sin factura del proveedor ni recepción (180): costos, cantidades, pago, entrega, notas. Recalcula los totales.';

grant execute on function public.actualizar_orden_compra(uuid, jsonb) to authenticated;

-- Centinela: se EJECUTA sobre una orden de prueba, como gerencia, y se
-- deshace. Cambia un costo y una cantidad, quita una línea, y comprueba los
-- totales y que una orden con factura no se deja tocar.
do $$
declare
  v_ger uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
  v_prov uuid := (select id from proveedores limit 1);
  v_prods uuid[] := array(select id from productos where not archivado limit 2);
  v_c uuid; v_i1 uuid; v_i2 uuid; v_r jsonb; v_msg text;
begin
  if v_ger is null or v_prov is null or array_length(v_prods, 1) < 2 then return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    insert into compras (numero, proveedor_id, tipo, fecha, subtotal, igv, total, estado, moneda)
    values ('ZZ180-1', v_prov, 'local', current_date, 30, 5.40, 35.40, 'registrada', 'USD') returning id into v_c;
    insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)
    values (v_c, v_prods[1], 1, 2, 'NIU', 10) returning id into v_i1;
    insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)
    values (v_c, v_prods[2], 2, 1, 'NIU', 10) returning id into v_i2;

    v_r := public.actualizar_orden_compra(v_c, jsonb_build_object(
      'condicion_pago', 'credito', 'dias_credito', 30, 'entrega', 'recojo',
      'items', jsonb_build_array(jsonb_build_object('id', v_i1, 'cantidad', 3, 'costo_unitario', 12.5))));
    if (v_r ->> 'subtotal')::numeric <> 37.50 or (v_r ->> 'total')::numeric <> 44.25 then
      raise exception '180: totales % y se esperaba 37.50 / 44.25', v_r;
    end if;
    if exists (select 1 from compra_items where id = v_i2) then
      raise exception '180: la línea quitada sigue ahí';
    end if;

    update compras set documento_proveedor = 'F001-1' where id = v_c;
    begin
      perform public.actualizar_orden_compra(v_c, jsonb_build_object(
        'items', jsonb_build_array(jsonb_build_object('id', v_i1, 'cantidad', 1, 'costo_unitario', 1))));
      raise exception '180: dejó editar una orden con factura';
    exception when check_violation then
      v_msg := sqlerrm;
    end;
    if v_msg not like '%ya tiene la factura%' then
      raise exception '180: con factura dijo % y no lo esperado', v_msg;
    end if;

    raise exception '__180_DESHACER__';
  exception when others then
    if sqlerrm <> '__180_DESHACER__' then raise; end if;
  end;
end $$;
