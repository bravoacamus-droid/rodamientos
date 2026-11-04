-- ###########################################################################
-- 187 · RECIBIR TAL CUAL SE COMPRÓ, Y LOS NÚMEROS DEL PROVEEDOR OPCIONALES
-- ###########################################################################
--
-- Luis, 04/11, después de la reunión con Willy:
--
--   · *«cuando registras una compra… el número de factura tiene que ser
--     opcional, porque como dijo en la reunión algunos no le dan»*. La compra
--     suelta ya lo era; la de una orden del pedido («Registrar compra»,
--     `completar_compra`) lo exigía. Ya no.
--   · *«al recepcionar, número de guía y factura del proveedor opcional
--     también; claro, si lo ponen de antes, que lo traiga, pero si no quiere,
--     que deje pasar nomás»*. La 186 todavía pedía el número de factura: ya
--     no se exige nada. Si la recepción no los trae, copia los de la compra.
--     Lo que sigue siendo un paso es **registrar la compra de una orden antes
--     de recibirla**: es lo que dice quién compró, a cuánto y cuándo.
--   · *«al recepcionar no debería dejar cambiar la cantidad ni el costo
--     unitario, ni quitar ni agregar otro producto… a menos que sea una
--     compra»*. Una recepción DE UNA COMPRA recibe lo que falta de cada
--     producto, entero y al costo de la compra. Si llegó distinto, se corrige
--     la compra. Lo que llega sin compra va en una recepción suelta, que
--     sigue igual. Al aplicarla no había ninguna compra recibida a medias.
--   · Y los números se pueden poner después en la ficha de la recepción
--     (ya existía); ahora, si la compra no tenía factura o guía, los recibe.
-- ###########################################################################

-- ----------------------------------------- 1 · Registrar la compra, sin número
CREATE OR REPLACE FUNCTION public.completar_compra(p_id uuid, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  -- 187: el número de la factura es opcional (Luis, 04/11: «algunos no le
  -- dan»). Registrar la compra es lo que la marca como comprada.
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
end $function$;

-- ---------------------------------------------- 2 · Recibir sin números
create or replace function public.recepcion_exige_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c compras%rowtype;
begin
  if new.compra_id is null then
    return new;
  end if;
  select * into v_c from compras where id = new.compra_id;

  -- Una orden del pedido se registra antes de recibirla: «Registrar compra».
  if v_c.falta_factura and v_c.estado = 'registrada' then
    raise exception 'Antes de recibir la mercadería de %, regístrala con «Registrar compra». El número de factura es opcional.',
      v_c.numero using errcode = 'check_violation';
  end if;

  -- Los números, opcionales (04/11): si no vienen, los de la compra.
  if nullif(btrim(new.factura_proveedor), '') is null then
    new.factura_proveedor := nullif(btrim(v_c.documento_proveedor), '');
  end if;
  if nullif(btrim(new.guia_proveedor), '') is null then
    new.guia_proveedor := nullif(btrim(v_c.guia_proveedor), '');
  end if;
  return new;
end
$$;

comment on function public.recepcion_exige_factura() is
  'Una recepción de una compra: la orden tiene que estar registrada; la guía y la factura son opcionales y, si faltan, se copian de la compra (187).';

-- Lo que se pone después en la ficha de la recepción llega a la compra que
-- no lo tenía.
create or replace function public.tg_recepcion_numeros_a_la_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.compra_id is null then
    return new;
  end if;
  update compras
     set documento_proveedor = coalesce(nullif(btrim(documento_proveedor), ''), nullif(btrim(new.factura_proveedor), '')),
         guia_proveedor      = coalesce(nullif(btrim(guia_proveedor), ''), nullif(btrim(new.guia_proveedor), ''))
   where id = new.compra_id
     and (   (nullif(btrim(documento_proveedor), '') is null and nullif(btrim(new.factura_proveedor), '') is not null)
          or (nullif(btrim(guia_proveedor), '') is null and nullif(btrim(new.guia_proveedor), '') is not null));
  return new;
end
$$;

drop trigger if exists tg_recepcion_numeros_a_la_compra on public.recepciones;
create trigger tg_recepcion_numeros_a_la_compra
  after insert or update of factura_proveedor, guia_proveedor on public.recepciones
  for each row execute function public.tg_recepcion_numeros_a_la_compra();

-- ---------------------------------------- 3 · Recibir tal cual se compró
-- Cada línea: el costo es el de la compra (se impone, no se discute) y la
-- cantidad, lo que faltaba recibir de ese producto.
create or replace function public.tg_recepcion_item_como_la_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra uuid;
  v_ci     compra_items%rowtype;
  v_cod    text;
begin
  select compra_id into v_compra from recepciones where id = new.recepcion_id;
  if v_compra is null then
    return new;
  end if;
  select * into v_ci from compra_items where compra_id = v_compra and producto_id = new.producto_id;
  if not found then
    -- `recepcionar_mercaderia` ya lo dice con su mensaje (157); esto cubre
    -- cualquier otro camino.
    raise exception 'Ese producto no está en la compra: recíbelo en una recepción sin compra'
      using errcode = 'check_violation';
  end if;
  if new.cantidad <> v_ci.cantidad - v_ci.cantidad_recibida then
    select codigo into v_cod from productos where id = new.producto_id;
    raise exception 'De % la compra espera %, y no se recibe otra cantidad. Si llegó distinto, corrige la compra.',
      v_cod, v_ci.cantidad - v_ci.cantidad_recibida using errcode = 'check_violation';
  end if;
  new.costo_unitario := v_ci.costo_unitario;
  return new;
end
$$;

drop trigger if exists tg_recepcion_item_como_la_compra on public.recepcion_items;
create trigger tg_recepcion_item_como_la_compra
  before insert on public.recepcion_items
  for each row execute function public.tg_recepcion_item_como_la_compra();

-- Y que no falte ninguno: al terminar el insert, cada producto que la compra
-- esperaba tiene su línea.
create or replace function public.tg_recepcion_completa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cod text;
  v_num text;
begin
  select p.codigo, c.numero into v_cod, v_num
    from (select distinct recepcion_id from nuevas) n
    join recepciones r on r.id = n.recepcion_id
    join compras c on c.id = r.compra_id
    join compra_items ci on ci.compra_id = c.id and ci.cantidad_recibida < ci.cantidad
    join productos p on p.id = ci.producto_id
   where not exists (select 1 from nuevas x where x.recepcion_id = r.id and x.producto_id = ci.producto_id)
   limit 1;
  if v_cod is not null then
    raise exception 'Falta % en la recepción: de la compra % se recibe todo lo que se compró. Si no llegó, corrige la compra.',
      v_cod, v_num using errcode = 'check_violation';
  end if;
  return null;
end
$$;

drop trigger if exists tg_recepcion_completa on public.recepcion_items;
create trigger tg_recepcion_completa
  after insert on public.recepcion_items
  referencing new table as nuevas
  for each statement execute function public.tg_recepcion_completa();

-- ------------------------- 4 · «Usar el stock»: comprada es registrada
create or replace function public.usar_stock_en_vez_de_comprar(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ci       cotizacion_items%rowtype;
  v_cot      cotizaciones%rowtype;
  v_pend     numeric;
  v_stock    numeric;
  v_comprada text;
  v_c        record;
  v_igv_pct  numeric(5,2);
  v_sub      numeric(14,2);
  v_igv      numeric(14,2);
  v_quitadas text[] := '{}';
  v_anuladas text[] := '{}';
begin
  -- Lo primero: es security definer y se salta la RLS.
  if not public.puede('compras', 'editar') then
    raise exception 'Tu rol no puede cambiar las órdenes de compra' using errcode = 'insufficient_privilege';
  end if;

  select * into v_ci from cotizacion_items where id = p_item for update;
  if not found then
    raise exception 'La línea ya no existe' using errcode = 'no_data_found';
  end if;
  if v_ci.producto_id is null then
    raise exception '% no está en el catálogo: no tiene stock', v_ci.codigo using errcode = 'check_violation';
  end if;
  select * into v_cot from cotizaciones where id = v_ci.cotizacion_id;
  if v_cot.estado <> 'aprobada' then
    raise exception 'La cotización % no está aprobada', v_cot.numero using errcode = 'check_violation';
  end if;

  -- Lo que todavía hay que entregar de la línea, contra lo que hay.
  v_pend := greatest(coalesce(v_ci.cantidad_aprobada, v_ci.cantidad) - coalesce(v_ci.cantidad_atendida, 0), 0);
  select coalesce(cantidad, 0) - coalesce(reservado, 0) into v_stock from stock where producto_id = v_ci.producto_id;
  v_stock := coalesce(v_stock, 0);
  if v_stock < v_pend then
    raise exception 'En el almacén hay % de % y el pedido necesita %: no alcanza', v_stock, v_ci.codigo, v_pend
      using errcode = 'check_violation';
  end if;

  -- Lo ya comprado no se deshace aquí: esa mercadería existe.
  select string_agg(distinct c.numero, ', ') into v_comprada
    from compras c join compra_items i on i.compra_id = c.id
   where c.cotizacion_id = v_ci.cotizacion_id
     and i.producto_id = v_ci.producto_id
     and c.estado <> 'anulada'
     -- 187: comprada es registrada, con o sin número de factura.
     and (not c.falta_factura
          or nullif(btrim(c.documento_proveedor), '') is not null
          or exists (select 1 from recepciones r where r.compra_id = c.id));
  if v_comprada is not null then
    raise exception '% ya se compró en %: esa orden no se borra. Lo que llegue entra al almacén.', v_ci.codigo, v_comprada
      using errcode = 'check_violation';
  end if;

  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;

  for v_c in
    select c.id, c.numero, c.igv, c.subtotal
      from compras c
     where c.cotizacion_id = v_ci.cotizacion_id
       and c.estado = 'registrada'
       and exists (select 1 from compra_items i where i.compra_id = c.id and i.producto_id = v_ci.producto_id)
     for update of c
  loop
    delete from compra_items where compra_id = v_c.id and producto_id = v_ci.producto_id;
    if not exists (select 1 from compra_items where compra_id = v_c.id) then
      update compras
         set estado = 'anulada',
             motivo_anulacion = format('Se usó el stock del almacén para %s (%s)', v_ci.codigo, v_cot.numero)
       where id = v_c.id;
      v_anuladas := v_anuladas || v_c.numero;
    else
      -- Los totales, como `actualizar_orden_compra` (180).
      select coalesce(sum(importe), 0) into v_sub from compra_items where compra_id = v_c.id;
      v_igv := case when v_c.igv > 0 or v_c.subtotal = 0 then round(v_sub * v_igv_pct / 100.0, 2) else 0 end;
      update compras set subtotal = v_sub, igv = v_igv, total = v_sub + v_igv where id = v_c.id;
      v_quitadas := v_quitadas || v_c.numero;
    end if;
  end loop;

  -- Que no se vuelva a proponer: sale del almacén.
  update cotizacion_items set comprar_igual = false where id = p_item;

  return jsonb_build_object(
    'codigo', v_ci.codigo,
    'anuladas', to_jsonb(v_anuladas),
    'quitadas', to_jsonb(v_quitadas)
  );
end
$$;

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA y se deshace:
--   a) una orden sin registrar no se recibe; registrada sin número, sí;
--   b) de una compra no se recibe otra cantidad, ni falta un producto, y el
--      costo es el de la compra aunque llegue otro;
--   c) el número puesto después en la recepción llega a la compra;
--   d) completar_compra acepta la compra sin número.
do $$
declare
  v_ger   uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
  v_prov  uuid := (select id from proveedores limit 1);
  v_cli   uuid := (select id from clientes limit 1);
  v_prods uuid[] := array(select id from productos where not archivado and not es_kit limit 2);
  v_cot uuid; v_c uuid; v_r jsonb; v_msg text; v_rec uuid;
begin
  if v_ger is null or v_prov is null or v_cli is null or array_length(v_prods, 1) < 2 then
    raise notice '187: faltan datos; el centinela no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);

    -- Una orden del pedido, sin registrar.
    insert into cotizaciones (serie, correlativo, cliente_id, estado, fecha, aprobada_en)
    values ('ZZ187', 999999, v_cli, 'aprobada', current_date, now()) returning id into v_cot;
    insert into compras (numero, proveedor_id, tipo, fecha, subtotal, igv, total, estado, moneda, cotizacion_id)
    values ('ZZ187-1', v_prov, 'local', current_date, 0, 0, 0, 'registrada', 'USD', v_cot) returning id into v_c;
    insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)
    values (v_c, v_prods[1], 1, 3, 'NIU', 5), (v_c, v_prods[2], 2, 2, 'NIU', 7);
    if not (select falta_factura from compras where id = v_c) then
      raise exception '187: la orden de prueba no nació sin registrar';
    end if;

    -- a) Sin registrar no se recibe.
    v_msg := null;
    begin
      perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_c, 'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_prods[1], 'cantidad', 3, 'costo_unitario', 5),
        jsonb_build_object('producto_id', v_prods[2], 'cantidad', 2, 'costo_unitario', 7))));
      raise exception '187: dejó recibir una orden sin registrar';
    exception when check_violation then v_msg := sqlerrm;
    end;
    if v_msg not like '%Registrar compra%' then raise exception '187: sin registrar dijo «%»', v_msg; end if;

    -- d) Registrar sin número.
    perform public.completar_compra(v_c, jsonb_build_object('moneda', 'USD', 'items', '[]'::jsonb));
    if (select falta_factura from compras where id = v_c) then
      raise exception '187: completar_compra sin número no la registró';
    end if;

    -- b) Otra cantidad, no.
    v_msg := null;
    begin
      perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_c, 'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_prods[1], 'cantidad', 2, 'costo_unitario', 5),
        jsonb_build_object('producto_id', v_prods[2], 'cantidad', 2, 'costo_unitario', 7))));
      raise exception '187: dejó recibir otra cantidad';
    exception when check_violation then v_msg := sqlerrm;
    end;
    if v_msg not like '%la compra espera%' then raise exception '187: otra cantidad dijo «%»', v_msg; end if;

    -- b) Que falte un producto, no.
    v_msg := null;
    begin
      perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_c, 'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_prods[1], 'cantidad', 3, 'costo_unitario', 5))));
      raise exception '187: dejó recibir sin un producto';
    exception when check_violation then v_msg := sqlerrm;
    end;
    if v_msg not like '%se recibe todo lo que se compró%' then raise exception '187: sin un producto dijo «%»', v_msg; end if;

    -- b) Entero, con otro costo: entra al de la compra; sin números, pasa.
    v_r := public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_c, 'items', jsonb_build_array(
      jsonb_build_object('producto_id', v_prods[1], 'cantidad', 3, 'costo_unitario', 99),
      jsonb_build_object('producto_id', v_prods[2], 'cantidad', 2, 'costo_unitario', 7))));
    v_rec := (v_r ->> 'id')::uuid;
    if (select costo_unitario from recepcion_items where recepcion_id = v_rec and producto_id = v_prods[1]) <> 5 then
      raise exception '187: el costo no se impuso desde la compra';
    end if;
    if (select estado from compras where id = v_c) <> 'recibida' then
      raise exception '187: la compra no quedó recibida';
    end if;

    -- c) El número puesto después llega a la compra.
    update recepciones set factura_proveedor = 'F187-1', guia_proveedor = 'T187-1' where id = v_rec;
    if (select documento_proveedor from compras where id = v_c) is distinct from 'F187-1'
       or (select guia_proveedor from compras where id = v_c) is distinct from 'T187-1' then
      raise exception '187: los números de la recepción no llegaron a la compra';
    end if;

    raise exception '__187_DESHACER__';
  exception when others then
    if sqlerrm <> '__187_DESHACER__' then raise; end if;
  end;
  raise notice '187: recibir tal cual, números opcionales y registrar sin número; deshecho limpio.';
end $$;
