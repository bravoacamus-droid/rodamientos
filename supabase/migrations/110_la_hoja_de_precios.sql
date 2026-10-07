-- ###########################################################################
-- 110 · LA HOJA DE PRECIOS
-- ###########################################################################
--
-- Luis, 07/10, mirando «Pedir precios»:
--
--   *«tiene que ser sencillo, fácil de usar; recuerda que voy a pedir precio,
--   no voy a comprar nada todavía. Yo quiero seleccionar mis proveedores y los
--   productos a los que voy a pedir precio […] y registrar qué cantidad quiero
--   comprar y el precio de compra […] si no tiene, pues no pasa nada: algo
--   para poner "no tiene"»*.
--
-- La consulta ya guardaba todo eso desde la 055 (productos, proveedores,
-- respuestas, «no lo tiene» y, desde la 090, cuántas tiene). Lo que no era
-- sencillo era llegar: se armaba en una pantalla, los precios se apuntaban en
-- otra, proveedor por proveedor, y cada cambio era una acción distinta.
--
-- Ahora la pantalla es UNA hoja —productos en filas, proveedores en columnas,
-- el precio en la casilla— y se guarda entera con esta función, de una vez y
-- dentro de una transacción. Si algo falla, no queda media hoja guardada.
--
-- ---------------------------------------------------------------------------
-- Qué hace
-- ---------------------------------------------------------------------------
-- Recibe la hoja tal como está en la pantalla y deja la consulta igual:
--
--   · sin `consulta_id`, la crea (numerada por su trigger, 055);
--   · los productos y los proveedores que ya no están, se quitan; los nuevos,
--     se añaden; la cantidad, se pone la de la hoja;
--   · a todos se les pregunta todo: en la hoja cada casilla existe;
--   · cada casilla con precio o con «no tiene» es una respuesta; la vacía,
--     ninguna (se borra la que hubiera).
--
-- Lo que NO deja quitar, igual que `quitarDeLaRonda`: un proveedor o un
-- producto que ya acabó en una compra de esta consulta. Su precio es lo que
-- justifica esa compra.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.guardar_hoja_precios(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id     uuid := nullif(p_datos ->> 'consulta_id', '')::uuid;
  v_numero text;
  v_estado estado_consulta_precio;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_provs  jsonb := coalesce(p_datos -> 'proveedores', '[]'::jsonb);
  v_prov   jsonb;
  v_cp     uuid;
  v_hay    int;
  v_no     int;
begin
  -- Lo primero: es `security definer` y se salta RLS.
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede pedir precios'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'No hay ningún producto en la hoja'
      using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct i ->> 'producto_id') from jsonb_array_elements(v_items) i)
     <> jsonb_array_length(v_items) then
    raise exception 'Hay un producto repetido en la hoja'
      using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct p ->> 'proveedor_id') from jsonb_array_elements(v_provs) p)
     <> jsonb_array_length(v_provs) then
    raise exception 'Hay un proveedor repetido en la hoja'
      using errcode = 'invalid_parameter_value';
  end if;

  -- ------------------------------------------------------------ La consulta
  if v_id is null then
    insert into consultas_precio (fecha, nota, creado_por)
    values (current_date, nullif(p_datos ->> 'nota', ''), auth.uid())
    returning id, numero, estado into v_id, v_numero, v_estado;
  else
    select numero, estado into v_numero, v_estado
      from consultas_precio where id = v_id for update;
    if v_numero is null then
      raise exception 'Esa consulta ya no existe' using errcode = 'no_data_found';
    end if;
    if v_estado <> 'abierta' then
      raise exception 'La consulta % ya está cerrada: sus compras ya salieron', v_numero
        using errcode = 'invalid_parameter_value';
    end if;
    update consultas_precio
       set nota = nullif(p_datos ->> 'nota', ''), actualizado_en = now()
     where id = v_id;
  end if;

  -- ------------------------------------------------- Lo que no se deja quitar
  if exists (
    select 1 from consulta_precio_proveedores cp
     where cp.consulta_id = v_id
       and cp.proveedor_id not in (select (p ->> 'proveedor_id')::uuid from jsonb_array_elements(v_provs) p)
       and exists (select 1 from compras c
                    where c.consulta_precio_id = v_id and c.proveedor_id = cp.proveedor_id
                      and c.estado <> 'anulada')
  ) then
    raise exception 'No se puede quitar un proveedor al que ya se le compró en esta consulta'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from consulta_precio_items it
     where it.consulta_id = v_id
       and it.producto_id not in (select (i ->> 'producto_id')::uuid from jsonb_array_elements(v_items) i)
       and exists (select 1 from compras c join compra_items ci on ci.compra_id = c.id
                    where c.consulta_precio_id = v_id and ci.producto_id = it.producto_id
                      and c.estado <> 'anulada')
  ) then
    raise exception 'No se puede quitar un producto que ya se compró en esta consulta'
      using errcode = 'invalid_parameter_value';
  end if;

  -- -------------------------------------------------------------- Productos
  delete from consulta_precio_items it
   where it.consulta_id = v_id
     and it.producto_id not in (select (i ->> 'producto_id')::uuid from jsonb_array_elements(v_items) i);

  insert into consulta_precio_items (consulta_id, producto_id, orden, cantidad)
  select v_id, (i.valor ->> 'producto_id')::uuid, i.orden::smallint, (i.valor ->> 'cantidad')::numeric
    from jsonb_array_elements(v_items) with ordinality as i(valor, orden)
  on conflict (consulta_id, producto_id)
  do update set cantidad = excluded.cantidad, orden = excluded.orden;

  -- ------------------------------------------------------------ Proveedores
  delete from consulta_precio_proveedores cp
   where cp.consulta_id = v_id
     and cp.proveedor_id not in (select (p ->> 'proveedor_id')::uuid from jsonb_array_elements(v_provs) p);

  for v_prov in select * from jsonb_array_elements(v_provs) loop
    insert into consulta_precio_proveedores (consulta_id, proveedor_id, moneda, tipo_cambio, incluye_igv)
    values (v_id,
            (v_prov ->> 'proveedor_id')::uuid,
            coalesce(nullif(v_prov ->> 'moneda', ''), 'USD'),
            nullif(v_prov ->> 'tipo_cambio', '')::numeric,
            coalesce((v_prov ->> 'incluye_igv')::boolean, false))
    on conflict (consulta_id, proveedor_id)
    do update set moneda      = excluded.moneda,
                  tipo_cambio = excluded.tipo_cambio,
                  incluye_igv = excluded.incluye_igv
    returning id into v_cp;

    -- En la hoja a todos se les pregunta todo.
    insert into consulta_precio_asignaciones (consulta_proveedor_id, item_id)
    select v_cp, it.id from consulta_precio_items it where it.consulta_id = v_id
    on conflict do nothing;

    -- Las casillas: con precio o con «no tiene» son respuesta; vacías, no.
    delete from consulta_precio_respuestas r
     where r.consulta_proveedor_id = v_cp
       and r.item_id not in (
         select it.id
           from jsonb_array_elements(coalesce(v_prov -> 'precios', '[]'::jsonb)) c
           join consulta_precio_items it
             on it.consulta_id = v_id and it.producto_id = (c ->> 'producto_id')::uuid
          where (c ->> 'disponible')::boolean = false or nullif(c ->> 'costo_unitario', '') is not null
       );

    insert into consulta_precio_respuestas
      (consulta_proveedor_id, item_id, costo_unitario, disponible, cantidad_disponible)
    select v_cp, it.id,
           case when (c ->> 'disponible')::boolean then (c ->> 'costo_unitario')::numeric end,
           (c ->> 'disponible')::boolean,
           case when (c ->> 'disponible')::boolean then nullif(c ->> 'cantidad_disponible', '')::numeric end
      from jsonb_array_elements(coalesce(v_prov -> 'precios', '[]'::jsonb)) c
      join consulta_precio_items it
        on it.consulta_id = v_id and it.producto_id = (c ->> 'producto_id')::uuid
     where (c ->> 'disponible')::boolean = false or nullif(c ->> 'costo_unitario', '') is not null
    on conflict (consulta_proveedor_id, item_id)
    do update set costo_unitario      = excluded.costo_unitario,
                  disponible          = excluded.disponible,
                  cantidad_disponible = excluded.cantidad_disponible;

    -- Su estado sale de sus casillas: sin ninguna, esperando; todas «no
    -- tiene», no lo tiene; si no, contestó.
    select count(*), count(*) filter (where not disponible)
      into v_hay, v_no
      from consulta_precio_respuestas where consulta_proveedor_id = v_cp;
    update consulta_precio_proveedores
       set estado = (case when v_hay = 0 then 'esperando'
                          when v_no = v_hay then 'no_tiene'
                          else 'respondio' end)::estado_respuesta_precio,
           respondido_en = case when v_hay = 0 then null else coalesce(respondido_en, now()) end
     where id = v_cp;
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end $$;

comment on function public.guardar_hoja_precios(jsonb) is
  'Guarda la hoja de precios entera (110): crea la consulta si no existe y la deja con los productos, proveedores y casillas de la pantalla. No deja quitar lo que ya se compró.';

-- ---------------------------------------------------------------------------
-- Centinela: la EJECUTA (CLAUDE.md §2) y lo deshace
-- ---------------------------------------------------------------------------
-- Crea una hoja con dos productos y dos proveedores (uno con precio en los
-- dos, otro con precio en uno y «no tiene» en el otro), la vuelve a guardar
-- quitando un producto y un proveedor, comprueba lo que quedó y sale por
-- excepción, que lo borra todo y devuelve el número.
do $$
declare
  v_usuario uuid;
  p1 uuid; p2 uuid; v1 uuid; v2 uuid;
  r jsonb;
  v_id uuid;
  n int;
  v_seq bigint;
  v_llamada boolean;
begin
  -- La secuencia del número no vuelve atrás con el rollback: se guarda y se
  -- repone, para que el centinela no se coma un CPR.
  select last_value, is_called into v_seq, v_llamada from seq_consulta_precio;
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into p1 from productos order by codigo limit 1;
  select id into p2 from productos order by codigo offset 1 limit 1;
  select id into v1 from proveedores order by razon_social limit 1;
  select id into v2 from proveedores order by razon_social offset 1 limit 1;
  if v_usuario is null or p2 is null or v2 is null then
    raise notice '110: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    r := public.guardar_hoja_precios(jsonb_build_object(
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', p1, 'cantidad', 5),
        jsonb_build_object('producto_id', p2, 'cantidad', 3)),
      'proveedores', jsonb_build_array(
        jsonb_build_object('proveedor_id', v1, 'moneda', 'USD', 'precios', jsonb_build_array(
          jsonb_build_object('producto_id', p1, 'costo_unitario', 10, 'disponible', true),
          jsonb_build_object('producto_id', p2, 'costo_unitario', 20, 'disponible', true))),
        jsonb_build_object('proveedor_id', v2, 'moneda', 'PEN', 'tipo_cambio', 3.5, 'precios', jsonb_build_array(
          jsonb_build_object('producto_id', p1, 'costo_unitario', 30, 'disponible', true),
          jsonb_build_object('producto_id', p2, 'disponible', false))))));
    v_id := (r ->> 'id')::uuid;

    select count(*) into n from consulta_precio_respuestas rr
      join consulta_precio_proveedores cp on cp.id = rr.consulta_proveedor_id where cp.consulta_id = v_id;
    if n <> 4 then raise exception '110: esperaba 4 casillas guardadas y hay %', n; end if;
    if (select count(*) from consulta_precio_asignaciones a
          join consulta_precio_proveedores cp on cp.id = a.consulta_proveedor_id where cp.consulta_id = v_id) <> 4 then
      raise exception '110: a todos se les tenía que preguntar todo';
    end if;

    -- Segunda vez: fuera p2 y v2; v1 cambia el precio y vacía nada más.
    perform public.guardar_hoja_precios(jsonb_build_object(
      'consulta_id', v_id,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 7)),
      'proveedores', jsonb_build_array(
        jsonb_build_object('proveedor_id', v1, 'moneda', 'USD', 'precios', jsonb_build_array(
          jsonb_build_object('producto_id', p1, 'costo_unitario', 9.5, 'disponible', true))))));

    if (select count(*) from consulta_precio_items where consulta_id = v_id) <> 1
       or (select cantidad from consulta_precio_items where consulta_id = v_id) <> 7 then
      raise exception '110: los productos no quedaron como la hoja';
    end if;
    if (select count(*) from consulta_precio_proveedores where consulta_id = v_id) <> 1 then
      raise exception '110: los proveedores no quedaron como la hoja';
    end if;
    if (select rr.costo_unitario from consulta_precio_respuestas rr
          join consulta_precio_proveedores cp on cp.id = rr.consulta_proveedor_id
         where cp.consulta_id = v_id) <> 9.5 then
      raise exception '110: el precio no se actualizó';
    end if;

    raise exception '__110_DESHACER__';
  exception when others then
    if sqlerrm <> '__110_DESHACER__' then raise; end if;
  end;

  perform setval('seq_consulta_precio', v_seq, v_llamada);
  perform set_config('request.jwt.claims', '', true);
  raise notice '110: guardar_hoja_precios crea, edita, quita y lo deshace limpio.';
end $$;
