-- ###########################################################################
-- 153 · LA DEVOLUCIÓN VUELVE AL ALMACÉN (23/10)
-- ###########################################################################
--
-- El consultor del 23/10: «la nota de crédito no reingresa stock». Desde el
-- 17/09 el stock sale con la GUÍA y nunca con la factura (CLAUDE.md §6), así
-- que una nota de crédito tampoco mueve nada. Para un descuento está bien;
-- para una DEVOLUCIÓN no: el cliente devuelve 3 rodamientos, se le acredita,
-- y el almacén sigue diciendo que no están. El kardex miente hasta que alguien
-- haga un ajuste a mano, que es justo lo que nadie se acuerda de hacer.
--
-- Ahora, una nota de crédito por DEVOLUCIÓN —motivo 06 total o 07 por ítem—
-- que llega con `reingresar_stock: true` mete en el almacén lo que devuelve:
--
--   · Al costo promedio vigente (no se declara costo), para no mover el
--     promedio por una devolución. Y sin tocar `ultimo_costo`, que es el de
--     la última COMPRA: una devolución no es una compra.
--   · Un kit vuelve como sus piezas, igual que salió con la guía.
--   · Es una casilla, no automático: la mercadería devuelta puede venir rota
--     y no volver a la venta. La pantalla la trae marcada.
--
-- Y dos topes que valen para toda nota de crédito por producto:
--
--   · No se devuelve más de lo facturado: por producto, lo de todas las
--     notas vigentes sobre la misma factura no pasa de lo que ella tenía.
--   · Anular la nota deshace el reingreso (`anular_comprobante` solo
--     reponía SALIDAS; ahora devuelve también las ENTRADAS).

do $$
declare
  v_def text;
  v_viejo text;
begin
  -- 1 · emitir_comprobante
  v_def := replace(pg_get_functiondef('public.emitir_comprobante(jsonb)'::regprocedure), E'\r\n', E'\n');
  v_viejo := $a$  -- Descarga de stock. Por defecto NO: el stock ya salió con la guía de$a$;
  if position(v_viejo in v_def) = 0 then raise exception '153: no encontré el ancla en emitir_comprobante'; end if;
  v_def := replace(v_def, v_viejo, $a$  -- 153: una nota de crédito no acredita más unidades de un producto de las
  -- que tenía la factura, contando las otras notas vigentes sobre ella.
  if v_tipo = 'nota_credito' and exists (
       select 1
         from comprobante_items ni
         join comprobantes n on n.id = ni.comprobante_id
        where n.referencia_id = (p_datos ->> 'referencia_id')::uuid
          and n.tipo = 'nota_credito' and n.estado <> 'anulado'
          and n.motivo_nota_codigo in ('06', '07')
          and ni.producto_id is not null
          and ni.producto_id in (select producto_id from comprobante_items where comprobante_id = v_id)
        group by ni.producto_id
       having sum(ni.cantidad) > (select coalesce(sum(fi.cantidad), 0) from comprobante_items fi
                                   where fi.comprobante_id = (p_datos ->> 'referencia_id')::uuid
                                     and fi.producto_id = ni.producto_id) + 0.005)
  then
    raise exception 'Se devuelven más unidades de las que tenía la factura'
      using errcode = 'check_violation';
  end if;

  -- 153: la devolución vuelve al almacén, si así se pidió.
  if v_tipo = 'nota_credito'
     and nullif(p_datos ->> 'motivo_nota_codigo','') in ('06', '07')
     and coalesce((p_datos ->> 'reingresar_stock')::boolean, false) then
    select jsonb_agg(jsonb_build_object(
             'producto_id', x.producto_id, 'tipo', 'ingreso', 'cantidad', x.cantidad,
             'referencia_tipo', 'comprobante', 'referencia_id', v_id,
             'referencia_numero', (select numero from comprobantes where id = v_id),
             'motivo', 'Devolución del cliente') order by x.producto_id)
      into v_movs
      from (
        select coalesce(kc.producto_id, ci.producto_id) as producto_id,
               sum(ci.cantidad * coalesce(kc.cantidad, 1)) as cantidad
          from comprobante_items ci
          join productos p on p.id = ci.producto_id
          left join kit_componentes kc on p.es_kit and kc.kit_id = ci.producto_id
         where ci.comprobante_id = v_id and ci.producto_id is not null
         group by 1
      ) x
     where x.cantidad > 0;

    if v_movs is not null then
      -- `registrar_movimientos` apunta toda entrada como último costo; una
      -- devolución no es una compra, así que se deja como estaba.
      create temp table if not exists _ultimo_costo_153 (id uuid primary key, ultimo numeric) on commit drop;
      insert into _ultimo_costo_153
        select p.id, p.ultimo_costo from productos p
         where p.id in (select (m ->> 'producto_id')::uuid from jsonb_array_elements(v_movs) m)
        on conflict (id) do nothing;
      perform public.registrar_movimientos(v_movs);
      update productos p set ultimo_costo = u.ultimo from _ultimo_costo_153 u where u.id = p.id;
      delete from _ultimo_costo_153;
      v_movs := null;
    end if;
  end if;

$a$ || v_viejo);
  execute v_def;

  -- 2 · anular_comprobante: también deshace las ENTRADAS (la devolución).
  v_def := replace(pg_get_functiondef('public.anular_comprobante(uuid,text)'::regprocedure), E'\r\n', E'\n');
  v_viejo := $a$  if v_movs is not null then perform public.registrar_movimientos(v_movs); end if;

  update comprobantes$a$;
  if position(v_viejo in v_def) = 0 then raise exception '153: no encontré el ancla en anular_comprobante'; end if;
  v_def := replace(v_def, v_viejo, $a$  if v_movs is not null then perform public.registrar_movimientos(v_movs); end if;

  -- 153: lo que entró con una devolución, sale al anular la nota.
  select jsonb_agg(jsonb_build_object(
           'producto_id', m.producto_id, 'tipo', 'salida', 'cantidad', m.cantidad,
           'referencia_tipo', 'comprobante', 'referencia_id', p_id,
           'motivo', 'Anulación de la devolución') order by m.producto_id)
    into v_movs
    from movimientos_inventario m
   where m.referencia_tipo = 'comprobante' and m.referencia_id = p_id and m.tipo = 'ingreso'
     and m.motivo = 'Devolución del cliente';
  if v_movs is not null then perform public.registrar_movimientos(v_movs); end if;

  update comprobantes$a$);
  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA el flujo y lo deshace (CLAUDE.md §2)
-- ---------------------------------------------------------------------------
do $$
declare
  v_usr  uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_cli  uuid; p1 uuid; v_cot uuid; i1 uuid; v_g uuid; v_fac uuid; v_nc uuid; v_nc2 uuid;
  r      jsonb;
  v_ok   boolean;
  v_s0 numeric; v_s1 numeric; v_ult0 numeric; v_ult1 numeric;
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    select id into v_cli from clientes
     where tipo_documento = 'RUC' and not coalesce(agente_retencion, false)
     order by creado_en limit 1;
    select p.id into p1 from productos p
     where not p.archivado and not p.es_kit and p.unidad_codigo = 'NIU'
     order by p.codigo limit 1;

    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1,
             'codigo', 'C153', 'descripcion', 'Centinela 153', 'cantidad', 10,
             'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 2))));
    v_cot := (r ->> 'id')::uuid;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C153',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 10, 'unidad_codigo', 'NIU'))));
    v_g := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g);
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
           'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 10, 'valor_unitario', 10))));
    v_fac := (r ->> 'id')::uuid;

    select cantidad into v_s0 from stock where producto_id = p1;
    select ultimo_costo into v_ult0 from productos where id = p1;

    -- Devuelve 3, con reingreso: el stock sube 3 y el último costo no cambia.
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'nota_credito', 'serie', 'FC01',
           'cliente_id', v_cli, 'referencia_id', v_fac, 'motivo_nota_codigo', '07',
           'condicion_pago', 'contado', 'reingresar_stock', true,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 3, 'valor_unitario', 10))));
    v_nc := (r ->> 'id')::uuid;
    select cantidad into v_s1 from stock where producto_id = p1;
    select ultimo_costo into v_ult1 from productos where id = p1;
    if v_s1 - v_s0 <> 3 then raise exception '153: la devolución de 3 movió el stock en %', v_s1 - v_s0; end if;
    if v_ult1 is distinct from v_ult0 then raise exception '153: la devolución cambió el último costo'; end if;

    -- Devolver 8 más (3 + 8 > 10) se rechaza.
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'nota_credito', 'serie', 'FC01',
        'cliente_id', v_cli, 'referencia_id', v_fac, 'motivo_nota_codigo', '07',
        'condicion_pago', 'contado', 'reingresar_stock', true,
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 8, 'valor_unitario', 1))));
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '153: se devolvieron 11 de una factura de 10'; end if;

    -- Sin la casilla, una devolución de 2 no toca el stock.
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'nota_credito', 'serie', 'FC01',
           'cliente_id', v_cli, 'referencia_id', v_fac, 'motivo_nota_codigo', '07',
           'condicion_pago', 'contado',
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 2, 'valor_unitario', 10))));
    v_nc2 := (r ->> 'id')::uuid;
    if (select cantidad from stock where producto_id = p1) <> v_s1 then
      raise exception '153: una devolución sin la casilla movió el stock';
    end if;

    -- Anular la primera nota saca lo que entró.
    perform public.anular_comprobante(v_nc, 'Centinela 153');
    if (select cantidad from stock where producto_id = p1) <> v_s0 then
      raise exception '153: anular la nota no deshizo el reingreso';
    end if;

    perform set_config('role', 'postgres', true);
    raise exception '__153_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__153_DESHACER__' then raise; end if;
  end;
  raise notice '153: la devolución vuelve al almacén, con tope y con anulación.';
end $$;
