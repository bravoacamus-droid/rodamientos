-- ###########################################################################
-- 146 · LO QUE ENCONTRÓ EL QA DE PUNTA A PUNTA (23/10)
-- ###########################################################################
--
-- El 23/10 un agente de QA recorrió el flujo entero por la base, dentro de
-- transacciones deshechas: cotizar → aprobar → comprar → recibir → guía →
-- facturar → cobrar. Tres cosas salieron rotas, y las tres son de la variante
-- cara de CLAUDE.md §2: escritas, conectadas y sin que nadie las ejecutara,
-- porque ejecutarlas gasta un correlativo o una compra de verdad.
--
-- 1 · **La factura no quedaba unida a su guía.** Desde la 084 el vínculo lo
--     escribe `vincular_guias_comprobante`, que la Server Action llama justo
--     DESPUÉS de emitir. La 137 le puso un candado —«si ya se mandó a SUNAT,
--     sus guías no se cambian»— que mira `estado_sunat <> 'no_enviado'`, y
--     `emitir_comprobante` crea el comprobante en `'pendiente'`. O sea que el
--     vínculo se rechazaba SIEMPRE, y la acción no miraba el error.
--     Consecuencias: la misma guía se podía facturar dos veces (la regla de
--     la 145 pregunta por un vínculo que no existía), una guía facturada se
--     podía anular y devolver al stock lo que ya se entregó, y el número de
--     guía no salía en la factura. F001-00000001 (14/10) sí lo tiene: es
--     anterior a la 137.
--     Arreglo: el vínculo se escribe DENTRO de `emitir_comprobante`, en la
--     misma transacción, y las guías declaradas se bloquean (`for update`)
--     antes de comprobar que no estén facturadas — si no, dos facturas a la
--     vez pasarían las dos la comprobación.
--
-- 2 · **Una compra en soles entraba al costo sin pasarla a dólares.** La 042
--     hizo que `recepcionar_mercaderia` convirtiera con `a_dolares`; la 097,
--     al añadir el reparto por peso, la reescribió desde una copia anterior y
--     la conversión se perdió, igual que el `moneda`/`tipo_cambio` de la
--     recepción. Una compra local a S/ 8 entraba al costo como $ 8, y el
--     margen, el capital del almacén y el precio mínimo salían 3,75 veces
--     mal. No hay daño en los datos: de 17 compras, ninguna es en soles.
--     La pantalla lo decía bien —«Entran al inventario en dólares, a {tc}»—;
--     la base no lo hacía.
--
-- 3 · **La guía no tenía tope en la base.** Solo la pantalla limitaba la
--     cantidad. Por PostgREST, o con dos personas abriendo la guía del mismo
--     pedido, salía 25 de un pedido de 10, o un producto que no estaba en la
--     cotización, y el kardex y la GRE lo decían. Ahora `emitir_guia` —que es
--     donde el stock se mueve— bloquea la cotización y comprueba que lo
--     emitido no pase de lo confirmado. Cuenta solo guías EMITIDAS más esta:
--     un borrador olvidado no frena a nadie.
--
-- Y de paso:
--
-- 4 · **La fecha era la de Greenwich.** La base corre en UTC, así que una
--     cotización hecha después de las 19:00 de Lima nacía con la fecha de
--     mañana, y el tablero cortaba el mes cinco horas antes. Se fija la zona
--     de la base en America/Lima: `current_date` y `now()::date` pasan a ser
--     el día de Willy en todas las funciones a la vez.
--
-- 5 · `emitir_comprobante` aceptaba un descuento global que dejaba la
--     factura en 0,00 y un vencimiento anterior a la emisión.
--
-- Lo que NO se toca, a propósito:
--   · Recibir de más. La pantalla lo avisa y lo deja («El stock sube igual
--     por el total»): el proveedor manda de más y se queda. Solo se bloquea
--     la compra para que dos recepciones a la vez no se pisen.
--   · Facturar más de lo confirmado. `registrar_atencion_de_cotizacion` lo
--     llama «una venta legítima» y lo deja fuera de la cotización.
-- ###########################################################################


-- ---------------------------------------------------------------------------
-- 1 y 5 · emitir_comprobante, sobre su definición viva
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.emitir_comprobante(jsonb)'::regprocedure);
  v_nueva text := v_def;
  r record;
begin
  for r in
    select * from (values
      -- 1: bloquear las guías declaradas ANTES de mirar si están facturadas.
      ($a$  -- 138: y que la declarada EXISTA, esté EMITIDA y sea del mismo cliente.$a$,
       $a$  -- 146: la guía se bloquea antes de preguntar si está facturada. Sin
  -- esto, dos facturas a la vez con la misma guía pasaban las dos.
  if v_tipo in ('factura','boleta') then
    perform 1 from guias_remision
     where id in (select g.id::uuid from jsonb_array_elements_text(p_datos -> 'guias') g(id))
     order by id
     for update;
  end if;

  -- 138: y que la declarada EXISTA, esté EMITIDA y sea del mismo cliente.$a$),
      -- 5: el descuento global no se come la factura.
      ($a$  v_gravada := greatest(v_gravada - v_desc_glob, 0);$a$,
       $a$  -- 146: un descuento que deja la factura en cero no es un descuento.
  if v_desc_glob < 0 or (v_desc_glob > 0 and v_desc_glob >= v_gravada) then
    raise exception 'El descuento global no puede ser negativo ni llegar al total'
      using errcode = 'check_violation';
  end if;
  v_gravada := greatest(v_gravada - v_desc_glob, 0);$a$),
      -- 5: el vencimiento no es anterior a la emisión.
      ($a$  if jsonb_array_length(v_items) = 0 then
    raise exception 'El comprobante no tiene ítems'$a$,
       $a$  -- 146: un crédito que vence antes de emitirse ya nace vencido.
  if nullif(p_datos ->> 'fecha_vencimiento','')::date
     < coalesce(nullif(p_datos ->> 'fecha_emision','')::date, current_date) then
    raise exception 'La fecha de vencimiento no puede ser anterior a la de emision'
      using errcode = 'check_violation';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'El comprobante no tiene ítems'$a$),
      -- 1: el vínculo, en la misma transacción que la factura.
      ($a$  -- 138: lo facturado se descuenta de lo confirmado$a$,
       $a$  -- 146: el vínculo con las guías se escribe AQUÍ. Lo escribía
  -- `vincular_guias_comprobante` después, y desde la 137 lo rechazaba siempre
  -- porque el comprobante nace 'pendiente'.
  if v_tipo in ('factura','boleta') then
    insert into comprobante_guias (comprobante_id, guia_id, orden)
    select v_id, g.txt::uuid, row_number() over (order by min(g.ord))::smallint
      from jsonb_array_elements_text(p_datos -> 'guias') with ordinality g(txt, ord)
     group by g.txt::uuid;

    update comprobantes
       set guia_id = (select cg.guia_id from comprobante_guias cg
                       where cg.comprobante_id = v_id order by cg.orden limit 1)
     where id = v_id;
  end if;

  -- 138: lo facturado se descuenta de lo confirmado$a$)
    ) t(viejo, nuevo)
  loop
    if position(r.viejo in v_nueva) = 0 then
      raise exception '146: no encontré en emitir_comprobante: %', left(r.viejo, 70);
    end if;
    v_nueva := replace(v_nueva, r.viejo, r.nuevo);
  end loop;
  execute v_nueva;
end $$;


-- ---------------------------------------------------------------------------
-- 2 · recepcionar_mercaderia vuelve a convertir a dólares (042)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.recepcionar_mercaderia(jsonb)'::regprocedure);
  v_nueva text := v_def;
  r record;
begin
  for r in
    select * from (values
      ($a$  v_por_peso    boolean := false;$a$,
       $a$  v_por_peso    boolean := false;
  -- 146: la moneda de los costos de esta recepción (042, perdida en la 097).
  v_moneda      char(3);
  v_tc          numeric;$a$),
      ($a$  v_numero := public.siguiente_numero_interno('recepcion');$a$,
       $a$  -- 146: lo que manden; si no, lo de la compra; si no hay compra, dólares.
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

  v_numero := public.siguiente_numero_interno('recepcion');$a$),
      ($a$recibido_por, observaciones)$a$,
       $a$recibido_por, observaciones, moneda, tipo_cambio)$a$),
      ($a$    nullif(p_datos ->> 'observaciones','')
  ) returning id into v_recepcion;$a$,
       $a$    nullif(p_datos ->> 'observaciones',''),
    v_moneda, v_tc
  ) returning id into v_recepcion;$a$),
      -- El costo entero —factura, gastos por valor y por kilo— está en la
      -- moneda de la compra, así que se convierte al final, de una vez.
      ($a$        'costo_unitario',    round($a$,
       $a$        'costo_unitario',    public.a_dolares(round($a$),
      ($a$                             4),
        'referencia_tipo',   'recepcion',$a$,
       $a$                             4), v_moneda, v_tc),
        'referencia_tipo',   'recepcion',$a$)
    ) t(viejo, nuevo)
  loop
    if position(r.viejo in v_nueva) = 0 then
      raise exception '146: no encontré en recepcionar_mercaderia: %', left(r.viejo, 70);
    end if;
    v_nueva := replace(v_nueva, r.viejo, r.nuevo);
  end loop;
  execute v_nueva;
end $$;


-- ---------------------------------------------------------------------------
-- 3 · emitir_guia: no sale más de lo confirmado, ni lo que no se vendió
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.emitir_guia(uuid)'::regprocedure);
  -- La 004 la guardó con fin de línea de Windows: se compara sin él.
  v_nueva text := replace(v_def, E'\r\n', E'\n');
  v_viejo text := $a$  update guias_remision
     set estado = 'emitida', estado_sunat = 'pendiente'
   where id = p_id;$a$;
begin
  if position(v_viejo in v_nueva) = 0 then
    raise exception '146: no encontré en emitir_guia el paso a emitida';
  end if;
  v_nueva := replace(v_nueva, v_viejo, $a$  -- 146: el tope que solo ponía la pantalla. Se bloquea la cotización para
  -- que dos guías del mismo pedido emitidas a la vez se cuenten una a otra.
  perform 1 from cotizaciones
   where id = (select cotizacion_id from guias_remision where id = p_id)
     for update;

  -- Cada línea cuelga de una línea de SU cotización, con su producto o con
  -- una pieza de su kit (086).
  if exists (
    select 1
      from guia_items gi
      join guias_remision g on g.id = gi.guia_id
      left join cotizacion_items ci
        on ci.id = gi.cotizacion_item_id and ci.cotizacion_id = g.cotizacion_id
     where gi.guia_id = p_id
       and (ci.id is null
            or (gi.producto_id is distinct from ci.producto_id
                and not exists (select 1 from kit_componentes kc
                                 where kc.kit_id = ci.producto_id
                                   and kc.producto_id = gi.producto_id)))
  ) then
    raise exception 'La guia lleva un producto que no esta en su cotizacion'
      using errcode = 'check_violation';
  end if;

  -- Y entre las guías EMITIDAS y esta no pasan de lo confirmado. Se cuenta
  -- como `despacho_por_item` (115): una pieza de kit vale «cantidad / lo que
  -- lleva el kit». Los borradores no cuentan: uno olvidado no frena a nadie.
  if exists (
    with filas as (
      select g.id as guia_id, gi.cotizacion_item_id,
             case when coalesce(p.es_kit, false)
                  then gi.cantidad / nullif(kc.cantidad, 0)
                  else gi.cantidad end as unidades,
             coalesce(p.es_kit, false) as es_kit
        from guias_remision g
        join guia_items gi on gi.guia_id = g.id
        join cotizacion_items ci on ci.id = gi.cotizacion_item_id
        left join productos p on p.id = ci.producto_id
        left join kit_componentes kc on kc.kit_id = ci.producto_id and kc.producto_id = gi.producto_id
       where g.cotizacion_id = (select cotizacion_id from guias_remision where id = p_id)
         and (g.estado = 'emitida' or g.id = p_id)
    ), por_guia as (
      select guia_id, cotizacion_item_id,
             case when bool_or(es_kit) then max(unidades) else sum(unidades) end as unidades
        from filas group by guia_id, cotizacion_item_id
    )
    select 1
      from por_guia d
      join cotizacion_items ci on ci.id = d.cotizacion_item_id
     group by ci.id, ci.cantidad, ci.cantidad_aprobada
    having sum(d.unidades) > coalesce(ci.cantidad_aprobada, ci.cantidad) + 0.005
  ) then
    raise exception 'La guia despacha mas de lo confirmado en la cotizacion'
      using errcode = 'check_violation';
  end if;

  update guias_remision
     set estado = 'emitida', estado_sunat = 'pendiente'
   where id = p_id;$a$);
  execute v_nueva;
end $$;


-- ---------------------------------------------------------------------------
-- 4 · La base vive en Lima
-- ---------------------------------------------------------------------------
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Lima');
end $$;


-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA el flujo y lo deshace (CLAUDE.md §2)
-- ---------------------------------------------------------------------------
do $$
declare
  v_usr  uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_cli  uuid; v_prov uuid; p1 uuid; p2 uuid;
  v_cot  uuid; i1 uuid; v_g1 uuid; v_g2 uuid; v_g3 uuid; v_fac uuid; v_comp uuid;
  r      jsonb;
  v_cpp  numeric;
  v_ok   boolean;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

    select id into v_cli from clientes
     where tipo_documento = 'RUC' and not coalesce(agente_retencion, false)
     order by creado_en limit 1;
    select id into v_prov from proveedores order by creado_en limit 1;
    select p.id into p1 from productos p left join stock s on s.producto_id = p.id
     where not p.archivado and not p.es_kit and p.unidad_codigo = 'NIU'
       and coalesce(s.cantidad, 0) = 0
     order by p.codigo limit 1;
    select p.id into p2 from productos p
     where not p.archivado and not p.es_kit and p.id <> p1
     order by p.codigo limit 1;

    -- 2 · Compra en soles a S/ 8 y S/ 11, TC 3,75 → promedio $ 2,4533.
    r := public.crear_compra(jsonb_build_object('proveedor_id', v_prov, 'tipo', 'local',
           'moneda', 'PEN', 'tipo_cambio', 3.75, 'fecha', current_date,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 10,
             'costo_unitario', 8, 'unidad_codigo', 'NIU'))));
    v_comp := (r ->> 'id')::uuid;
    perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_comp,
           'proveedor_id', v_prov, 'fecha', current_date,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 6, 'costo_unitario', 8))));
    perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_comp,
           'proveedor_id', v_prov, 'fecha', current_date,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 4, 'costo_unitario', 11))));
    select costo_promedio into v_cpp from stock where producto_id = p1;
    if abs(v_cpp - 2.4533) > 0.001 then
      raise exception '146: la compra en soles entra a % y no a 2.4533 dólares', v_cpp;
    end if;
    if not exists (select 1 from recepciones where compra_id = v_comp
                    and moneda = 'PEN' and tipo_cambio = 3.75) then
      raise exception '146: la recepción no guarda su moneda y su cambio';
    end if;

    -- 3 · Cotización de 10.
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1,
             'codigo', 'C146', 'descripcion', 'Centinela 146', 'cantidad', 10,
             'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 2))));
    v_cot := (r ->> 'id')::uuid;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);

    -- Una guía de 25 se queda en borrador…
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C146',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 25, 'unidad_codigo', 'NIU'))));
    v_g1 := (r ->> 'id')::uuid;
    v_ok := false;
    begin
      perform public.emitir_guia(v_g1);
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '146: se emitió una guía de 25 sobre un pedido de 10'; end if;

    -- …y una con un producto que no se vendió, también.
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C146',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p2, 'cantidad', 1, 'unidad_codigo', 'NIU'))));
    v_g2 := (r ->> 'id')::uuid;
    v_ok := false;
    begin
      perform public.emitir_guia(v_g2);
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '146: se emitió una guía con un producto ajeno a la cotización'; end if;

    -- La de 10 sí sale, aunque haya borradores por medio.
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C146',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 10, 'unidad_codigo', 'NIU'))));
    v_g3 := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g3);

    -- 5 · Descuento que se come la factura y vencimiento al revés.
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g3),
        'descuento_global', 1000,
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 10, 'valor_unitario', 10))));
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '146: una factura con descuento por encima del total salió'; end if;
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'credito', 'guias', jsonb_build_array(v_g3),
        'fecha_vencimiento', '1999-01-01',
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 10, 'valor_unitario', 10))));
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '146: una factura que vence en 1999 salió'; end if;

    -- 1 · La factura queda unida a su guía…
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
           'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g3),
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 10, 'valor_unitario', 10))));
    v_fac := (r ->> 'id')::uuid;
    if not exists (select 1 from comprobante_guias where comprobante_id = v_fac and guia_id = v_g3)
       or (select guia_id from comprobantes where id = v_fac) is distinct from v_g3 then
      raise exception '146: la factura no quedó unida a su guía';
    end if;

    -- …no se puede facturar otra vez con ella…
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g3),
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1, 'valor_unitario', 10))));
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '146: la misma guía se facturó dos veces'; end if;

    -- …ni anularla. Por el motivo correcto: que falle por otra cosa (un
    -- permiso, una firma) no prueba nada.
    v_ok := false;
    begin
      perform public.anular_guia(v_g3, 'Centinela 146');
    exception when others then
      v_ok := sqlerrm ilike '%factur%' or sqlerrm ilike '%comprobante vigente%';
      if not v_ok then raise exception '146: anular la guía falló por otra cosa: %', sqlerrm; end if;
    end;
    if not v_ok then raise exception '146: se anuló una guía ya facturada'; end if;

    raise exception '__146_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__146_DESHACER__' then raise; end if;
  end;
  raise notice '146: guía unida a su factura, compra en soles a dólares, tope de la guía y hora de Lima.';
end $$;
