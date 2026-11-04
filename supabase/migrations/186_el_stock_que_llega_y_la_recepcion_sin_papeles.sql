-- ###########################################################################
-- 186 · EL STOCK QUE LLEGA DESPUÉS DEL ANÁLISIS, Y RECIBIR SIN SUBIR PAPELES
-- ###########################################################################
--
-- Reunión con Willy del 04/11 (Moisés en vivo). Tres problemas encadenados:
--
-- 1. **Recibir pedía el PDF de la factura** (182). Willy: *«muchas veces no
--    nos envían el PDF, solo nos envían en físico… si para registrar una
--    factura vamos a tener que escanearla, guardar un archivo y luego
--    subirlo… recibimos varias facturas al día»*. Y: *«con los datos de la
--    factura bien puestos —la serie, el número, la razón social, el monto—
--    ya debería ser suficiente»*. La guía: *«a veces nos dan solo factura»*.
--    Queda así: **el número de la factura sí es obligatorio, la guía y el
--    archivo no**. El archivo se puede subir después desde la ficha.
--
-- 2. **El análisis no se enteraba del stock que llegó después.** El 04/11 el
--    pedido PED-26-00002 pedía comprar 24 fajas que ya estaban compradas y
--    recibidas por fuera (OC02-00005). Al cotizar no había stock, se analizó
--    la compra y se aprobó; luego entró la mercadería, y la orden seguía
--    proponiendo comprar. Luis, 04/11: *«si la cotización no está aprobada y
--    ya hizo la orden de compra y recepción, que automáticamente se actualice
--    y tome el stock»*.
--
--    La pantalla no puede distinguir, solo con el stock, un análisis que
--    quedó viejo de un «Comprar igual» deliberado (Willy, 04/11: *«tengo 10
--    y me piden 10, pero tengo que comprar para seguir teniendo algo en
--    stock»*). Por eso cada línea guarda **`comprar_igual`**: verdadero solo
--    si quien cotiza pidió comprar aunque el almacén alcanzara. Sin la marca,
--    con stock suficiente la línea sale del almacén y su análisis queda de
--    referencia: no se propone ninguna orden.
--
-- 3. **Con la orden ya hecha no había vuelta atrás.** Luis: *«que tenga un
--    botón que si tiene stock, utilice el stock, y salga una validación:
--    ¿seguro que quieres utilizar el stock? Se borrará la orden de compra»*.
--    `usar_stock_en_vez_de_comprar(item)` quita ese producto de las órdenes
--    del pedido que todavía no se compraron (sin factura del proveedor y sin
--    recepción); la orden que se queda vacía se anula con su motivo. Lo ya
--    comprado no se toca: esa mercadería existe y entra al stock.
-- ###########################################################################

-- ----------------------------------------------------- 1 · Recibir sin papeles
create or replace function public.recepcion_exige_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero  text;
  v_factura text;
begin
  if new.compra_id is null then
    return new;
  end if;
  select numero, nullif(btrim(documento_proveedor), '')
    into v_numero, v_factura
    from compras where id = new.compra_id;

  -- El número de la factura, de la recepción o de la compra. El archivo ya
  -- no se exige (04/11): se sube cuando llegue.
  if nullif(btrim(new.factura_proveedor), '') is null then
    new.factura_proveedor := v_factura;
  end if;
  if nullif(btrim(new.factura_proveedor), '') is null then
    raise exception 'Para recibir la mercadería de %, pon el número de la factura del proveedor. La guía y el PDF no son obligatorios.',
      coalesce(v_numero, 'esta compra')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

comment on function public.recepcion_exige_factura() is
  'Una recepción de una compra exige el NÚMERO de la factura del proveedor (186; hasta la 182 pedía el archivo). Si no lo trae, copia el de la compra.';

-- ------------------------------------------------ 2 · «Comprar igual», marcado
alter table public.cotizacion_items
  add column if not exists comprar_igual boolean not null default false;

comment on column public.cotizacion_items.comprar_igual is
  'Se compra aunque el almacén alcance (Willy, 04/11: «tengo 10 y me piden 10, pero tengo que comprar»). Sin esto, con stock suficiente la línea sale del almacén y su análisis de compra queda de referencia (186).';

create or replace function public.guardar_proveedores_de_lineas(p_cotizacion uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_igv numeric := coalesce((select igv_porcentaje from empresa where id = 1), 18.00);
  v_malo text;
begin
  -- Una línea escrita a mano no tiene producto: no hay a quién comprárselo.
  select i.value ->> 'codigo' into v_malo
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where nullif(i.value ->> 'producto_id','') is null
     and jsonb_array_length(coalesce(i.value -> 'proveedores', '[]'::jsonb)) > 0
   limit 1;
  if v_malo is not null then
    raise exception '% no está en el catálogo: no se le puede analizar la compra', v_malo
      using errcode = 'check_violation';
  end if;

  -- El mismo proveedor dos veces en una línea es un error de pantalla, y el
  -- unique daría un mensaje que no entiende nadie.
  select i.value ->> 'codigo' into v_malo
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where (select count(*) from jsonb_array_elements(coalesce(i.value -> 'proveedores', '[]'::jsonb)))
      <> (select count(distinct p ->> 'proveedor_id') from jsonb_array_elements(coalesce(i.value -> 'proveedores', '[]'::jsonb)) p)
   limit 1;
  if v_malo is not null then
    raise exception 'En % hay un proveedor repetido', v_malo using errcode = 'check_violation';
  end if;

  insert into cotizacion_item_proveedores (
    cotizacion_item_id, proveedor_id, orden, cantidad, costo_unitario,
    moneda, incluye_igv, tipo_cambio, costo_usd, fecha
  )
  select ci.id,
         (p.value ->> 'proveedor_id')::uuid,
         p.ord::smallint,
         coalesce(nullif(p.value ->> 'cantidad','')::numeric, 0),
         (p.value ->> 'costo_unitario')::numeric,
         coalesce(nullif(p.value ->> 'moneda',''), 'USD'),
         coalesce((p.value ->> 'incluye_igv')::boolean, false),
         case when coalesce(nullif(p.value ->> 'moneda',''), 'USD') = 'PEN'
              then nullif(p.value ->> 'tipo_cambio','')::numeric end,
         round(
           (p.value ->> 'costo_unitario')::numeric
           / case when coalesce(nullif(p.value ->> 'moneda',''), 'USD') = 'PEN'
                  then nullif(nullif(p.value ->> 'tipo_cambio','')::numeric, 0) else 1 end
           / case when coalesce((p.value ->> 'incluye_igv')::boolean, false)
                  then 1 + v_igv / 100.0 else 1 end,
           4),
         coalesce(nullif(p.value ->> 'fecha','')::date, current_date)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as i(value, ord)
    join cotizacion_items ci
      on ci.cotizacion_id = p_cotizacion
     and ci.orden = coalesce(nullif(i.value ->> 'orden','')::int, i.ord)
   cross join lateral jsonb_array_elements(coalesce(i.value -> 'proveedores', '[]'::jsonb))
         with ordinality as p(value, ord);

  -- 186: la marca de «Comprar igual». Las líneas se acaban de reinsertar con
  -- el valor por defecto (falso), así que solo hay que poner las verdaderas.
  update cotizacion_items ci
     set comprar_igual = true
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as i(value, ord)
   where ci.cotizacion_id = p_cotizacion
     and ci.orden = coalesce(nullif(i.value ->> 'orden','')::int, i.ord)
     and coalesce((i.value ->> 'comprar_igual')::boolean, false);

  -- El costo de la línea: (PC2 × 7 + PC3 × 3) / 10. Las de cantidad 0 son
  -- precios apuntados y no pesan.
  update cotizacion_items ci
     set costo_unitario = round(s.costo, 4)
    from (
      select cip.cotizacion_item_id,
             sum(cip.cantidad * cip.costo_usd) / sum(cip.cantidad) as costo
        from cotizacion_item_proveedores cip
        join cotizacion_items x on x.id = cip.cotizacion_item_id
       where x.cotizacion_id = p_cotizacion and cip.cantidad > 0
       group by cip.cotizacion_item_id
    ) s
   where ci.id = s.cotizacion_item_id;
end $function$;

-- --------------------------------------------- 3 · «Usar el stock» del pedido
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
     and (nullif(btrim(c.documento_proveedor), '') is not null
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

comment on function public.usar_stock_en_vez_de_comprar(uuid) is
  'Una línea de un pedido aprobado sale del almacén en vez de comprarse (186): quita su producto de las órdenes del pedido sin factura ni recepción y anula las que quedan vacías.';

revoke all on function public.usar_stock_en_vez_de_comprar(uuid) from public, anon;
grant execute on function public.usar_stock_en_vez_de_comprar(uuid) to authenticated;

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA y se deshace:
--   a) recibir una compra sin número de factura falla; con el número en la
--      compra, pasa sin archivo y la recepción lo copia;
--   b) guardar_proveedores_de_lineas pone `comprar_igual` solo donde viene;
--   c) usar_stock_en_vez_de_comprar quita el producto de una orden de dos
--      productos (y recalcula), anula la de uno solo, y se niega si no
--      alcanza el stock o si la orden ya se compró.
do $$
declare
  v_ger   uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
  v_prov  uuid := (select id from proveedores limit 1);
  v_cli   uuid := (select id from clientes limit 1);
  v_prods uuid[] := array(select id from productos where not archivado and not es_kit limit 2);
  v_c uuid; v_c2 uuid; v_cot uuid; v_it uuid; v_r jsonb; v_msg text; v_rec uuid;
  v_s1 numeric; v_s2 numeric;
begin
  if v_ger is null or v_prov is null or v_cli is null or array_length(v_prods, 1) < 2 then
    raise notice '186: faltan datos; el centinela no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);

    -- a) Recibir sin factura no; con el número, sí, sin archivo.
    insert into compras (numero, proveedor_id, tipo, fecha, subtotal, igv, total, estado, moneda)
    values ('ZZ186-1', v_prov, 'local', current_date, 0, 0, 0, 'registrada', 'USD') returning id into v_c;
    v_msg := null;
    begin
      insert into recepciones (numero, compra_id) values ('ZZ186-R1', v_c);
      raise exception '186: dejó recibir sin el número de factura';
    exception when check_violation then
      v_msg := sqlerrm;
    end;
    if v_msg not like '%pon el número de la factura%' then
      raise exception '186: sin factura dijo «%»', v_msg;
    end if;
    update compras set documento_proveedor = 'F186-1' where id = v_c;
    insert into recepciones (numero, compra_id) values ('ZZ186-R2', v_c) returning id into v_rec;
    if (select factura_proveedor from recepciones where id = v_rec) is distinct from 'F186-1' then
      raise exception '186: la recepción no copió la factura de la compra';
    end if;

    -- b) La marca de «Comprar igual».
    insert into cotizaciones (serie, correlativo, cliente_id, estado, fecha, aprobada_en)
    values ('ZZ186', 999999, v_cli, 'aprobada', current_date, now()) returning id into v_cot;
    insert into cotizacion_items (cotizacion_id, producto_id, orden, codigo, descripcion, cantidad, unidad_codigo, valor_unitario, cantidad_aprobada)
    values (v_cot, v_prods[1], 1, 'ZZ1', 'x', 2, 'NIU', 10, 2) returning id into v_it;
    insert into cotizacion_items (cotizacion_id, producto_id, orden, codigo, descripcion, cantidad, unidad_codigo, valor_unitario, cantidad_aprobada)
    values (v_cot, v_prods[2], 2, 'ZZ2', 'x', 1, 'NIU', 10, 1);
    perform public.guardar_proveedores_de_lineas(v_cot, jsonb_build_array(
      jsonb_build_object('orden', 1, 'producto_id', v_prods[1], 'codigo', 'ZZ1', 'comprar_igual', true,
        'proveedores', jsonb_build_array(jsonb_build_object('proveedor_id', v_prov, 'cantidad', 2, 'costo_unitario', 5))),
      jsonb_build_object('orden', 2, 'producto_id', v_prods[2], 'codigo', 'ZZ2')));
    if not (select comprar_igual from cotizacion_items where id = v_it)
       or (select comprar_igual from cotizacion_items where cotizacion_id = v_cot and orden = 2) then
      raise exception '186: comprar_igual no quedó donde venía';
    end if;

    -- c) Usar el stock: con dos productos en la orden, se quita uno.
    select coalesce((select cantidad - reservado from stock where producto_id = v_prods[1]), 0) into v_s1;
    insert into compras (numero, proveedor_id, tipo, fecha, subtotal, igv, total, estado, moneda, cotizacion_id)
    values ('ZZ186-2', v_prov, 'local', current_date, 0, 0, 0, 'registrada', 'USD', v_cot) returning id into v_c2;
    insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)
    values (v_c2, v_prods[1], 1, 2, 'NIU', 5), (v_c2, v_prods[2], 2, 1, 'NIU', 10);

    if v_s1 < 2 then
      -- Sin stock suficiente se niega...
      v_msg := null;
      begin
        perform public.usar_stock_en_vez_de_comprar(v_it);
        raise exception '186: dejó usar un stock que no alcanza';
      exception when check_violation then
        v_msg := sqlerrm;
      end;
      if v_msg not like '%no alcanza%' then
        raise exception '186: sin stock dijo «%»', v_msg;
      end if;
      -- ...y se le da el que falta, para probar el resto.
      insert into stock (producto_id, cantidad) values (v_prods[1], 2)
      on conflict (producto_id) do update set cantidad = stock.cantidad + 2;
    end if;

    v_r := public.usar_stock_en_vez_de_comprar(v_it);
    if exists (select 1 from compra_items where compra_id = v_c2 and producto_id = v_prods[1])
       or (select estado from compras where id = v_c2) <> 'registrada'
       or (select subtotal from compras where id = v_c2) <> 10 then
      raise exception '186: no quitó bien el producto de la orden de dos: %', v_r;
    end if;
    if (select comprar_igual from cotizacion_items where id = v_it) then
      raise exception '186: la línea siguió con comprar_igual';
    end if;

    -- La orden de un solo producto se anula.
    select coalesce((select cantidad - reservado from stock where producto_id = v_prods[2]), 0) into v_s2;
    if v_s2 < 1 then
      insert into stock (producto_id, cantidad) values (v_prods[2], 1)
      on conflict (producto_id) do update set cantidad = stock.cantidad + 1;
    end if;
    v_r := public.usar_stock_en_vez_de_comprar((select id from cotizacion_items where cotizacion_id = v_cot and orden = 2));
    if (select estado from compras where id = v_c2) <> 'anulada' then
      raise exception '186: la orden vacía no se anuló: %', v_r;
    end if;

    -- Lo comprado no se toca.
    update compras set estado = 'registrada', documento_proveedor = 'F186-2' where id = v_c2;
    insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)
    values (v_c2, v_prods[1], 1, 2, 'NIU', 5);
    v_msg := null;
    begin
      perform public.usar_stock_en_vez_de_comprar(v_it);
      raise exception '186: dejó borrar una orden ya comprada';
    exception when check_violation then
      v_msg := sqlerrm;
    end;
    if v_msg not like '%ya se compró%' then
      raise exception '186: con la orden comprada dijo «%»', v_msg;
    end if;

    raise exception '__186_DESHACER__';
  exception when others then
    if sqlerrm <> '__186_DESHACER__' then raise; end if;
  end;
  raise notice '186: recibir con el número y sin archivo, comprar_igual y usar el stock; deshecho limpio.';
end $$;
