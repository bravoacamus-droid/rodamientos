-- ###########################################################################
-- 152 · FECHAS QUE NO PUEDEN SER Y COTIZACIONES VACÍAS (23/10)
-- ###########################################################################
--
-- El QA del 23/10, por la base:
--
--   · `registrar_pagos` aceptaba un cobro del 01/01/1900 y otro del
--     01/01/2100. La pantalla manda una fecha con forma de fecha y nada más.
--     Un cobro del futuro deja el saldo en cero hoy por un dinero que no
--     llegó, y uno de 1900 descuadra cualquier reporte por periodo.
--   · `crear_cotizacion` aceptaba una cotización SIN líneas y con fecha de
--     1900. Sin líneas gasta un correlativo para un papel en blanco; la
--     pantalla lo impide (`items.min(1)`), pero clonar una cotización cuyos
--     productos se dieron de baja llegaba aquí con la lista vacía.
--
-- Los topes: nada antes de 2020 (el histórico más viejo es de 09/2024), un
-- cobro no puede ser de mañana, y una cotización, como mucho, de dentro de un
-- mes.

do $$
declare
  v_def text;
  v_viejo text;
begin
  -- registrar_pagos
  v_def := replace(pg_get_functiondef('public.registrar_pagos(jsonb)'::regprocedure), E'\r\n', E'\n');
  v_viejo := $a$    raise exception 'Cada cobro tiene que ser por más de cero' using errcode = 'check_violation';
  end if;$a$;
  if position(v_viejo in v_def) = 0 then raise exception '152: no encontré el ancla en registrar_pagos'; end if;
  v_def := replace(v_def, v_viejo, v_viejo || $a$

  -- 152: ni de antes de 2020 ni del futuro.
  if exists (select 1 from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i
              where nullif(i ->> 'fecha','')::date < date '2020-01-01'
                 or nullif(i ->> 'fecha','')::date > current_date) then
    raise exception 'La fecha del cobro no puede ser futura ni anterior a 2020' using errcode = 'check_violation';
  end if;$a$);
  execute v_def;

  -- crear_cotizacion
  v_def := replace(pg_get_functiondef('public.crear_cotizacion(jsonb)'::regprocedure), E'\r\n', E'\n');
  v_viejo := $a$    raise exception 'Tu rol no puede emitir una cotización'
      using errcode = 'insufficient_privilege';
  end if;$a$;
  if position(v_viejo in v_def) = 0 then raise exception '152: no encontré el ancla en crear_cotizacion'; end if;
  v_def := replace(v_def, v_viejo, v_viejo || $a$

  -- 152: sin líneas no hay cotización, y la fecha tiene que ser creíble.
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'La cotización no tiene productos' using errcode = 'check_violation';
  end if;
  if nullif(p_datos ->> 'fecha','')::date < date '2020-01-01'
     or nullif(p_datos ->> 'fecha','')::date > current_date + 31 then
    raise exception 'La fecha de la cotización no es válida' using errcode = 'check_violation';
  end if;$a$);
  execute v_def;
end $$;

-- Centinela: las cuatro se rechazan, y por el motivo correcto.
do $$
declare
  v_usr uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_cli uuid := (select id from clientes order by creado_en limit 1);
  v_doc uuid := (select id from comprobantes where estado in ('emitido','parcial') and saldo > 1 limit 1);
  v_p   uuid := (select id from productos where not archivado limit 1);
  v_msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15, 'items', '[]'::jsonb));
    raise exception '152: se creó una cotización sin productos';
  exception when check_violation then null;
  end;

  begin
    perform public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15, 'fecha', '1900-01-01',
      'items', jsonb_build_array(jsonb_build_object('producto_id', v_p, 'orden', 1, 'codigo', 'C152',
        'descripcion', 'Centinela 152', 'cantidad', 1, 'unidad_codigo', 'NIU', 'valor_unitario', 1))));
    raise exception '152: se creó una cotización de 1900';
  exception when check_violation then null;
  end;

  if v_doc is not null then
    foreach v_msg in array array['1900-01-01', (current_date + 30)::text] loop
      begin
        perform public.registrar_pagos(jsonb_build_array(jsonb_build_object(
          'comprobante_id', v_doc, 'fecha', v_msg, 'monto', 1, 'medio', 'transferencia')));
        raise exception '152: se registró un cobro del %', v_msg;
      exception when check_violation then
        get stacked diagnostics v_msg = message_text;
        if v_msg not ilike '%fecha del cobro%' then
          raise exception '152: el cobro se rechazó por otra cosa: %', v_msg;
        end if;
      end;
    end loop;
  end if;

  perform set_config('role', 'postgres', true);
  raise notice '152: fechas imposibles y cotizaciones vacías, rechazadas.';
end $$;
