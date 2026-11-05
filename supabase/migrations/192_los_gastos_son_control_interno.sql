-- ###########################################################################
-- 192 · LOS GASTOS DE UNA COMPRA SON CONTROL INTERNO, NO COSTO
-- ###########################################################################
--
-- Reunión del 05/11 y Luis, el mismo día: *«los gastos nada que ver… sacamos
-- eso de compra local… los gastos del tipo de cómo llegó la compra, aérea,
-- marítima… no tienen que ver con las facturas, es como unos gastos internos
-- que él quiere saber, cuánto gastó traer esa mercadería… no se suma los
-- gastos nada, solo algo de control interno, si le sirvió bien traer eso»*.
--
-- Desde la 022 (y la 097, por kilo), `recepcionar_mercaderia` repartía los
-- gastos de la compra en el costo de cada producto al ingresarlo: el flete
-- subía el costo del stock y, con él, el margen que se calcula al cotizar.
-- Willy no lo quiere así: el costo es el de la factura (el del análisis), y
-- los gastos se apuntan aparte para saber si convino traerla.
--
-- La función es la misma de la 157/146; solo cambia que, antes de pasar al
-- kardex, el factor de gastos vuelve a 1 y lo de por kilo a 0. Lo guardado
-- no cambia: hoy ninguna de las 791 compras tiene gastos.
-- ###########################################################################

create or replace function public.recepcionar_mercaderia(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_recepcion   uuid;
  v_numero      text;
  v_compra      uuid := nullif(p_datos ->> 'compra_id','')::uuid;
  v_items       jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_gastos      numeric(14,2) := 0;
  v_base        numeric(14,2) := 0;
  v_factor      numeric(12,6) := 1;
  -- 097: la bolsa que va por kilo, sus kilos, y lo que toca a cada kilo.
  v_gasto_peso  numeric(14,2) := 0;
  v_kilos       numeric(16,4) := 0;
  v_falta_peso  boolean := false;
  v_por_kg      numeric(16,6) := 0;
  v_por_peso    boolean := false;
  -- 146: la moneda de los costos de esta recepción (042, perdida en la 097).
  v_moneda      char(3);
  v_tc          numeric;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y recepcionar mercadería
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('recepciones') then
    raise exception 'Tu rol no puede recepcionar mercadería'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La recepción no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  -- 146: lo que manden; si no, lo de la compra; si no hay compra, dólares.
  v_moneda := coalesce(
    nullif(p_datos ->> 'moneda','')::char(3),
    (select c.moneda from compras c where c.id = v_compra),
    'USD');
  v_tc := coalesce(
    nullif(p_datos ->> 'tipo_cambio','')::numeric,
    (select c.tipo_cambio from compras c where c.id = v_compra));
  if v_moneda <> 'USD' and (v_tc is null or v_tc <= 0) then
    raise exception 'Una recepción en % necesita su tipo de cambio', v_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda = 'USD' then
    v_tc := null;
  end if;

  -- 146: dos recepciones de la misma compra a la vez, una detrás de otra.
  if v_compra is not null then
    perform 1 from compras where id = v_compra for update;
  end if;

  -- 157: una orden anulada no recibe nada, y lo que se recibe contra una
  -- orden tiene que estar en ella. Lo demás va en una recepción sin orden.
  if v_compra is not null then
    if exists (select 1 from compras where id = v_compra and estado = 'anulada') then
      raise exception 'La orden % está anulada: no se le puede recibir',
        (select numero from compras where id = v_compra) using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) i
       where not exists (select 1 from compra_items ci
                          where ci.compra_id = v_compra
                            and ci.producto_id = (i ->> 'producto_id')::uuid)) then
      raise exception 'El producto % no está en la orden %: recíbelo en una recepción sin orden',
        (select p.codigo from jsonb_array_elements(v_items) i
           join productos p on p.id = (i ->> 'producto_id')::uuid
          where not exists (select 1 from compra_items ci
                             where ci.compra_id = v_compra and ci.producto_id = p.id)
          limit 1),
        (select numero from compras where id = v_compra)
        using errcode = 'check_violation';
    end if;
  end if;

  v_numero := public.siguiente_numero_interno('recepcion');

  insert into recepciones (numero, compra_id, proveedor_id, fecha, guia_proveedor, factura_proveedor, recibido_por, observaciones, moneda, tipo_cambio)
  values (
    v_numero, v_compra,
    coalesce(nullif(p_datos ->> 'proveedor_id','')::uuid, (select c.proveedor_id from compras c where c.id = v_compra)),
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    nullif(p_datos ->> 'guia_proveedor',''),
    nullif(p_datos ->> 'factura_proveedor',''),
    auth.uid(),
    nullif(p_datos ->> 'observaciones',''),
    v_moneda, v_tc
  ) returning id into v_recepcion;

  insert into recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario)
  select v_recepcion,
         (i ->> 'producto_id')::uuid,
         (i ->> 'cantidad')::numeric,
         coalesce(nullif(i ->> 'costo_unitario','')::numeric, 0)
  from jsonb_array_elements(v_items) i;

  if v_compra is not null then
    -- El total de gastos sigue saliendo de la compra (022 lo mantiene igual a
    -- la suma del detalle). Así una compra vieja, con un solo número y sin
    -- detalle, se reparte por valor como siempre.
    select coalesce(c.gastos_importacion, 0) into v_gastos from compras c where c.id = v_compra;

    -- 097: lo que va por kilo.
    select coalesce(sum(g.monto), 0) into v_gasto_peso
      from gastos_importacion g
     where g.compra_id = v_compra and g.reparto = 'peso';

    if v_gasto_peso > 0 then
      -- Los kilos de la COMPRA ENTERA, con el peso con que se compró y, si
      -- no se escribió, el del producto.
      select coalesce(sum(ci.cantidad * coalesce(nullif(ci.peso_kg, 0), p.peso_kg, 0)), 0),
             coalesce(bool_or(coalesce(nullif(ci.peso_kg, 0), p.peso_kg, 0) = 0), false)
        into v_kilos, v_falta_peso
        from compra_items ci
        join productos p on p.id = ci.producto_id
       where ci.compra_id = v_compra;

      -- Una pieza sin peso: todo por valor, como hasta la 097. Repartir por
      -- kilo le regalaría el flete a esa pieza.
      if v_falta_peso or v_kilos <= 0 then
        v_gasto_peso := 0;
      else
        v_por_kg   := v_gasto_peso / v_kilos;
        v_por_peso := true;
      end if;
    end if;

    -- Lo demás va por valor. EL DENOMINADOR ES LA COMPRA ENTERA, no esta
    -- entrega (022, perdido en la 042, repuesto en la 094). Con el valor de
    -- la entrega, dos recepciones parciales cobraban los gastos dos veces.
    select coalesce(sum(ci.cantidad * ci.costo_unitario), 0) into v_base
      from compra_items ci where ci.compra_id = v_compra;

    -- Compra sin importe: se cae al valor de la entrega, que es lo único que
    -- hay.
    if v_base = 0 then
      select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
        from recepcion_items ri where ri.recepcion_id = v_recepcion;
    end if;
    if (v_gastos - v_gasto_peso) > 0 and v_base > 0 then
      v_factor := 1 + ((v_gastos - v_gasto_peso) / v_base);
    end if;
  end if;

  -- 192 (05/11): los gastos de traer la mercadería son CONTROL INTERNO y no
  -- entran al costo del stock. Luis: «los gastos no tienen que ver con las
  -- facturas… es como unos gastos internos que él quiere saber, cuánto gastó
  -- traer esa mercadería… no se suma los gastos, nada». Lo de arriba se sigue
  -- calculando, pero el kardex recibe el costo de la factura tal cual.
  v_factor := 1;
  v_por_kg := 0;
  v_por_peso := false;

  -- UN solo llamado al kardex para toda la recepción.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
        'producto_id',       ri.producto_id,
        'tipo',              'ingreso',
        'cantidad',          ri.cantidad,
        -- 097: lo de valor como factor, lo de peso como kilos × $/kg.
        'costo_unitario',    public.a_dolares(round(
                               ri.costo_unitario * v_factor
                               + v_por_kg * coalesce(
                                   nullif((select ci.peso_kg from compra_items ci
                                            where ci.compra_id = v_compra
                                              and ci.producto_id = ri.producto_id
                                            limit 1), 0),
                                   p.peso_kg, 0),
                             4), v_moneda, v_tc),
        'referencia_tipo',   'recepcion',
        'referencia_id',     v_recepcion,
        'referencia_numero', v_numero,
        'motivo',            'Recepción de mercadería'
      ) order by ri.producto_id)
     from recepcion_items ri
     join productos p on p.id = ri.producto_id
     where ri.recepcion_id = v_recepcion)
  );

  -- Avance de la compra.
  if v_compra is not null then
    update compra_items ci
       set cantidad_recibida = least(ci.cantidad, ci.cantidad_recibida + ri.cantidad)
      from recepcion_items ri
     where ri.recepcion_id = v_recepcion
       and ci.compra_id = v_compra
       and ci.producto_id = ri.producto_id;

    update compras c
       set estado = case
             when not exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida < x.cantidad)
               then 'recibida'::estado_compra
             when exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida > 0)
               then 'recibida_parcial'::estado_compra
             else c.estado end
     where c.id = v_compra;
  end if;

  return jsonb_build_object('id', v_recepcion, 'numero', v_numero,
                            'items', jsonb_array_length(v_items), 'factor_gastos', v_factor,
                            -- 097: para que la pantalla diga cómo se repartió.
                            'por_kg', v_por_kg, 'reparto_por_peso', v_por_peso,
                            'falta_peso', v_falta_peso);
end $function$;


-- --------------------------------------------------------------- centinela
-- EJECUTA una recepción de verdad, con un gasto de 100 en la compra, y mira
-- que el kardex reciba el costo de la factura y no uno inflado. Se deshace.
do $$
declare
  v_compra  uuid;
  v_prod    uuid;
  v_cant    numeric;
  v_costo   numeric;
  v_gerente uuid;
  v_r       jsonb;
  v_mov     numeric;
begin
  select c.id, ci.producto_id, ci.cantidad - ci.cantidad_recibida, ci.costo_unitario
    into v_compra, v_prod, v_cant, v_costo
    from compras c join compra_items ci on ci.compra_id = c.id
   where c.estado = 'registrada' and not c.falta_factura and c.moneda = 'USD'
     and ci.cantidad > ci.cantidad_recibida and ci.costo_unitario > 0
     and (select count(*) from compra_items x where x.compra_id = c.id) = 1
   order by c.creado_en desc limit 1;
  select id into v_gerente from perfiles where rol = 'gerencia' and activo order by creado_en limit 1;
  if v_compra is null or v_gerente is null then
    raise notice '192: no hay compra por recibir para probar; se aplica sin ejecutar.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
    insert into gastos_importacion (compra_id, concepto, monto) values (v_compra, 'Prueba 192', 100);
    v_r := public.recepcionar_mercaderia(jsonb_build_object(
      'compra_id', v_compra,
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cantidad', v_cant, 'costo_unitario', v_costo))));
    select m.costo_unitario into v_mov from movimientos_inventario m
     where m.referencia_tipo = 'recepcion' and m.referencia_id = (v_r ->> 'id')::uuid limit 1;
    if v_mov is null then
      raise exception '192: la recepción no dejó movimiento en el kardex';
    end if;
    if round(v_mov, 4) <> round(v_costo, 4) then
      raise exception '192: el kardex recibió % y la factura dice %: los gastos se sumaron', v_mov, v_costo;
    end if;
    raise exception '__192_DESHACER__';
  exception when others then
    if sqlerrm <> '__192_DESHACER__' then raise; end if;
  end;
  raise notice '192: recepción con gastos y el costo intacto; deshecho.';
end $$;
