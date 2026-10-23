-- ###########################################################################
-- 148 · LA FACTURA EN DÓLARES GUARDA EL CAMBIO DE SUNAT DE SU DÍA (23/10)
-- ###########################################################################
--
-- El consultor del 23/10: de 566 comprobantes, **549 en dólares no tienen
-- tipo de cambio**. La factura en dólares es válida así —SUNAT no lo pide en
-- el XML—, pero el contador sí: el Registro de Ventas va en SOLES, y cada
-- factura en dólares se lleva a soles con el tipo de cambio venta que
-- publica SUNAT para el día de emisión (Reglamento de la Ley del IGV, art.
-- 5 num. 2, y el anexo del Registro de Ventas). Sin él, el contador lo busca
-- a mano factura por factura, o el Excel para el contador no existe.
--
-- `tipo_cambio` ya estaba en `comprobantes` y desde la 116 solo se llenaba
-- en soles —el cambio CONGELADO de la cotización, el que convierte los
-- precios—. En dólares se queda null. Ahora:
--
--   · Factura o boleta en dólares: el venta de SUNAT de la fecha de emisión,
--     que la Server Action consulta y manda como `tipo_cambio_sunat`. Es una
--     AYUDA: si SUNAT no contesta, la factura sale igual sin él —no se
--     bloquea una venta por un dato contable— y se completa después.
--   · Nota en dólares: el de su comprobante. Las notas se registran con el
--     cambio de la fecha del documento que modifican, no del suyo.
--   · En soles, lo de siempre.
--
-- El papel ya lo sabía leer: desde la 116, una factura en dólares con
-- cambio imprime la retención también en soles (`papel.ts`).
--
-- Lo histórico (las 549) NO se rellena aquí: son datos del cliente y van
-- por SQL directo (CLAUDE.md §3), con el cambio de cada día.

do $$
declare
  v_def text := replace(pg_get_functiondef('public.emitir_comprobante(jsonb)'::regprocedure), E'\r\n', E'\n');
  v_nueva text := v_def;
  r record;
begin
  for r in
    select * from (values
      ($a$  v_moneda := coalesce(v_moneda, 'USD');$a$,
       $a$  v_moneda := coalesce(v_moneda, 'USD');
  -- 148: un cambio de SUNAT que no lo es se rechaza, no se guarda.
  if v_moneda = 'USD' and nullif(p_datos ->> 'tipo_cambio_sunat','') is not null
     and (p_datos ->> 'tipo_cambio_sunat')::numeric not between 2 and 8 then
    raise exception 'El tipo de cambio de SUNAT no es valido: %', p_datos ->> 'tipo_cambio_sunat'
      using errcode = 'check_violation';
  end if;$a$),
      ($a$    v_moneda,
    case when v_moneda = 'PEN' then v_tc end,$a$,
       $a$    v_moneda,
    -- 148: en soles, el de la cotización; una nota, el de su comprobante;
    -- en dólares, el venta de SUNAT del día de emisión.
    case when v_moneda = 'PEN' then v_tc
         when nullif(p_datos ->> 'referencia_id','') is not null then v_tc
         else round(nullif(p_datos ->> 'tipo_cambio_sunat','')::numeric, 3) end,$a$)
    ) t(viejo, nuevo)
  loop
    if position(r.viejo in v_nueva) = 0 then
      raise exception '148: no encontré en emitir_comprobante: %', left(r.viejo, 70);
    end if;
    v_nueva := replace(v_nueva, r.viejo, r.nuevo);
  end loop;
  execute v_nueva;
end $$;

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA la emisión y la deshace (CLAUDE.md §2)
-- ---------------------------------------------------------------------------
do $$
declare
  v_usr  uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_cli  uuid; p1 uuid; v_cot uuid; i1 uuid; v_g uuid; v_fac uuid;
  r      jsonb;
  v_ok   boolean;
  v_tc   numeric;
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
             'codigo', 'C148', 'descripcion', 'Centinela 148', 'cantidad', 2,
             'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 2))));
    v_cot := (r ->> 'id')::uuid;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C148',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 2, 'unidad_codigo', 'NIU'))));
    v_g := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g);

    -- Un cambio absurdo se rechaza.
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
        'tipo_cambio_sunat', 344.2,
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 2, 'valor_unitario', 10))));
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '148: se guardó un tipo de cambio de 344'; end if;

    -- El bueno se guarda, en dólares.
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
           'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
           'tipo_cambio_sunat', 3.4425,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 2, 'valor_unitario', 10))));
    v_fac := (r ->> 'id')::uuid;
    select tipo_cambio into v_tc from comprobantes where id = v_fac and moneda = 'USD';
    if v_tc is distinct from 3.443 then
      raise exception '148: la factura en dólares guardó % y no 3.443', v_tc;
    end if;

    perform set_config('role', 'postgres', true);
    raise exception '__148_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__148_DESHACER__' then raise; end if;
  end;
  raise notice '148: la factura en dólares guarda el cambio de SUNAT de su día.';
end $$;
