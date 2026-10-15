-- ###########################################################################
-- 128 · LA ORDEN DEL PEDIDO SE COMPLETA CON SU FACTURA
-- ###########################################################################
--
-- Luis, 15/10, con «Registrar compra» delante: *«yo registro esta orden o
-- órdenes… lo que quiero es englobar cotización y cliente, porque puede tener
-- varios proveedores… cada orden es diferente… no se sabe si el producto es
-- compra local, aérea o marítima, tiene que subir número de factura, su
-- factura, todo eso, para que guarde una compra»*.
--
-- El problema: `generar_ordenes_de_compra` (111/122) crea cada orden YA como
-- compra «registrada», con el costo del análisis, sin factura del proveedor,
-- sin «cómo llegó» y sin gastos. Y la compra es un documento que no se edita
-- (su ficha lo dice). O sea que la orden nacía a medias y no había dónde
-- terminarla: la única pantalla con esos campos crea una compra NUEVA.
--
-- La solución:
--
--   · `compras.falta_factura`: la orden que sale de una cotización nace con
--     la marca puesta (por trigger, para no tocar la RPC que la crea).
--   · `completar_compra(id, datos)`: le pone la factura y todo lo que pide
--     el formulario —cómo llegó, fecha, n.° y moneda de la factura, IGV,
--     gastos, el costo de la factura en cada línea— y recalcula los totales
--     con la MISMA cuenta que `crear_compra`. Solo una vez, solo con la marca
--     y solo antes de recibir: después de recibir el costo ya está en el
--     kardex, y la regla de siempre es que eso se corrige con un ajuste.
--   · Las cantidades NO se tocan: son las del pedido del cliente.
-- ###########################################################################

set local search_path = public, extensions;

alter table compras add column if not exists falta_factura boolean not null default false;

comment on column compras.falta_factura is
  'La orden salió de una cotización y todavía no tiene la factura del proveedor (128). La quita completar_compra.';

-- La orden que sale de un pedido nace sin factura.
create or replace function public.tg_orden_sin_factura()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.cotizacion_id is not null and nullif(trim(new.documento_proveedor), '') is null then
    new.falta_factura := true;
  end if;
  return new;
end $$;

drop trigger if exists tg_compras_orden_sin_factura on compras;
create trigger tg_compras_orden_sin_factura
  before insert on compras
  for each row execute function public.tg_orden_sin_factura();

-- Las que ya existen.
update compras
   set falta_factura = true
 where cotizacion_id is not null
   and nullif(trim(documento_proveedor), '') is null
   and estado = 'registrada';

create index if not exists ix_compras_falta_factura on compras (cotizacion_id) where falta_factura;

-- ---------------------------------------------------------------------------
create or replace function public.completar_compra(p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c          record;
  v_tipo     tipo_compra := coalesce(nullif(p_datos ->> 'tipo','')::tipo_compra, 'local');
  v_afecto   boolean := coalesce((p_datos ->> 'afecto_igv')::boolean, true);
  v_moneda   char(3) := coalesce(nullif(p_datos ->> 'moneda','')::char(3), 'USD');
  v_tc       numeric(9,4) := nullif(p_datos ->> 'tipo_cambio','')::numeric;
  v_doc      text := nullif(trim(p_datos ->> 'documento_proveedor'), '');
  v_items    jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_fila     jsonb;
  v_igv_pct  numeric(5,2);
  v_sub      numeric(14,2);
  v_igv      numeric(14,2) := 0;
begin
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede registrar compras' using errcode = 'insufficient_privilege';
  end if;

  select id, estado, falta_factura, proveedor_id, numero into c from compras where id = p_id for update;
  if c.id is null then
    raise exception 'La compra % no existe', p_id using errcode = 'no_data_found';
  end if;
  if not c.falta_factura then
    raise exception 'La compra % ya tiene su factura registrada', c.numero using errcode = 'check_violation';
  end if;
  if c.estado <> 'registrada' then
    raise exception 'La compra % ya no está «registrada» (está %): lo recibido ya entró al kardex y se corrige con un ajuste', c.numero, c.estado
      using errcode = 'check_violation';
  end if;
  if v_doc is null then
    raise exception 'Falta el número de la factura del proveedor' using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda not in ('USD','PEN') then
    raise exception 'Moneda % no admitida: la compra es en USD o en PEN', v_moneda using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda <> 'USD' and (v_tc is null or v_tc <= 0) then
    raise exception 'Una compra en % necesita el tipo de cambio del día', v_moneda using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda = 'USD' then v_tc := null; end if;

  -- El costo y el peso de la factura, línea por línea. Las cantidades no.
  for v_fila in select * from jsonb_array_elements(v_items) loop
    update compra_items
       set costo_unitario = greatest(coalesce(nullif(v_fila ->> 'costo_unitario','')::numeric, costo_unitario), 0),
           peso_kg = greatest(coalesce(nullif(v_fila ->> 'peso_kg','')::numeric, peso_kg), 0)
     where compra_id = p_id and producto_id = nullif(v_fila ->> 'producto_id','')::uuid;
    if not found then
      raise exception 'Un producto no es de esta orden' using errcode = 'foreign_key_violation';
    end if;
  end loop;

  -- El peso que se escribe se apunta en el producto, como al registrar (097).
  update productos p
     set peso_kg = round(ci.peso_kg, 3)
    from compra_items ci
   where ci.compra_id = p_id and ci.producto_id = p.id
     and ci.peso_kg > 0 and p.peso_kg is distinct from round(ci.peso_kg, 3);

  update compras
     set tipo                = v_tipo,
         via_importacion     = case when v_tipo = 'importacion' then nullif(p_datos ->> 'via_importacion','') end,
         fecha               = coalesce(nullif(p_datos ->> 'fecha','')::date, fecha),
         fecha_estimada      = nullif(p_datos ->> 'fecha_estimada','')::date,
         documento_proveedor = v_doc,
         guia_proveedor      = nullif(p_datos ->> 'guia_proveedor',''),
         tracking            = case when v_tipo = 'importacion' then nullif(p_datos ->> 'tracking','') end,
         courier             = case when v_tipo = 'importacion' then nullif(p_datos ->> 'courier','') end,
         observaciones       = coalesce(nullif(p_datos ->> 'observaciones',''), observaciones),
         moneda              = v_moneda,
         tipo_cambio         = v_tc,
         falta_factura       = false
   where id = p_id;

  -- Los gastos se reemplazan enteros; el trigger de la 022 deja la suma.
  delete from gastos_importacion where compra_id = p_id;
  insert into gastos_importacion (compra_id, concepto, monto, reparto)
  select p_id, trim(g ->> 'concepto'), (g ->> 'monto')::numeric,
         case when g ->> 'reparto' = 'peso' then 'peso' else 'valor' end
    from jsonb_array_elements(coalesce(p_datos -> 'gastos', '[]'::jsonb)) g
   where nullif(trim(g ->> 'concepto'), '') is not null
     and coalesce(nullif(g ->> 'monto','')::numeric, 0) > 0;

  -- El dinero, como en `crear_compra`: de los ítems, nunca de quien llama.
  select coalesce(sum(ci.importe), 0) into v_sub from compra_items ci where ci.compra_id = p_id;
  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;
  if v_afecto then v_igv := round(v_sub * v_igv_pct / 100.0, 2); end if;
  update compras set subtotal = v_sub, igv = v_igv, total = v_sub + v_igv where id = p_id;

  -- Lo que de verdad cobró el proveedor queda como su último precio (046).
  perform public.anotar_productos_de_proveedor(
    c.proveedor_id,
    (select jsonb_agg(jsonb_build_object('producto_id', ci.producto_id, 'costo_unitario', ci.costo_unitario))
       from compra_items ci where ci.compra_id = p_id),
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date), v_moneda, v_tc, true, null);

  return jsonb_build_object('id', p_id, 'numero', c.numero, 'subtotal', v_sub, 'igv', v_igv, 'total', v_sub + v_igv);
end $$;

revoke all on function public.completar_compra(uuid, jsonb) from public, anon;
grant execute on function public.completar_compra(uuid, jsonb) to authenticated, service_role;

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA: una compra de verdad, marcada, completada, y deshecha.
do $$
declare
  v_usuario uuid; v_prov uuid; p1 uuid; r jsonb; v_id uuid; x record;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_prov from proveedores order by creado_en limit 1;
  select id into p1 from productos order by codigo limit 1;
  if v_usuario is null or v_prov is null or p1 is null then
    raise notice '128: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_compra(jsonb_build_object('proveedor_id', v_prov, 'tipo', 'local', 'moneda', 'USD',
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 4, 'costo_unitario', 10, 'unidad_codigo', 'NIU'))));
    v_id := (r ->> 'id')::uuid;
    update compras set falta_factura = true where id = v_id;

    perform public.completar_compra(v_id, jsonb_build_object(
      'tipo', 'importacion', 'via_importacion', 'aerea', 'documento_proveedor', 'INV-PRUEBA',
      'afecto_igv', false, 'moneda', 'USD',
      'gastos', jsonb_build_array(jsonb_build_object('concepto', 'Courier', 'monto', 12, 'reparto', 'peso')),
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'costo_unitario', 12.5))));

    select falta_factura, total, igv, gastos_importacion, tipo, via_importacion, documento_proveedor into x from compras where id = v_id;
    if x.falta_factura or x.total <> 50 or x.igv <> 0 or x.gastos_importacion <> 12
       or x.tipo <> 'importacion' or x.via_importacion <> 'aerea' or x.documento_proveedor <> 'INV-PRUEBA' then
      raise exception '128: completar_compra no dejó la compra como debía: %', row_to_json(x);
    end if;
    -- Una segunda vez no se deja.
    begin
      perform public.completar_compra(v_id, jsonb_build_object('documento_proveedor', 'OTRA'));
      raise exception '128: completó dos veces la misma compra';
    exception when check_violation then null;
    end;
    raise exception '__128_DESHACER__';
  exception when others then
    if sqlerrm <> '__128_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '128: la orden se completa una vez, con totales de la base; deshecho limpio.';
end $$;
