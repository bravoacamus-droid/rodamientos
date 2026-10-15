-- ###########################################################################
-- 135 · ELIMINAR UN PEDIDO
-- ###########################################################################
--
-- Luis, 15/10, pidiendo el menú de acciones del pedido: *«más opciones,
-- eliminar pedido también»*. Un pedido se aprueba por error, o el cliente se
-- arrepiente antes de que se mueva nada, y no había forma de deshacerlo:
-- los pedidos solo se escriben desde funciones (130).
--
-- La regla es la de siempre (§6 de CLAUDE.md): se deshace hasta donde el
-- documento todavía no es un compromiso de nadie.
--
--   · Solo si NO cuelga nada vivo de él: ni órdenes de compra, ni guía, ni
--     comprobante (anulados no cuentan; quedan sin pedido, `on delete set
--     null`).
--   · Solo el ÚLTIMO de su cotización. Lo nuevo —guías, órdenes, facturas—
--     cuelga del vigente (130); quitar uno de en medio movería en silencio
--     a qué pedido pertenece lo que venga después.
--   · Si es el ÚNICO —el que nació al aprobar—, eliminarlo es deshacer la
--     aprobación: la cotización vuelve a «enviada» y sin cantidades
--     confirmadas, como antes de aprobarla. Se puede volver a aprobar.
--   · Si es uno repetido (121), se le restan sus cantidades a lo confirmado
--     y la cotización vuelve a «atendida» si lo anterior ya estaba atendido
--     entero; si no, sigue «aprobada».
-- ###########################################################################

create or replace function public.eliminar_pedido(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ped   record;
  v_ult   int;
  v_n     int;
  v_estado estado_cotizacion;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede eliminar pedidos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_ped from pedidos where id = p_id;
  if v_ped.id is null then
    raise exception 'El pedido no existe' using errcode = 'no_data_found';
  end if;
  -- La cotización bloqueada mientras se toca: nada se le cuelga a la vez.
  perform 1 from cotizaciones where id = v_ped.cotizacion_id for update;

  select max(secuencia), count(*) into v_ult, v_n from pedidos where cotizacion_id = v_ped.cotizacion_id;
  if v_ped.secuencia <> v_ult then
    raise exception 'Solo se puede eliminar el último pedido de la cotización'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from compras where pedido_id = p_id and estado <> 'anulada') then
    raise exception 'El pedido % ya tiene órdenes de compra: anúlalas antes de eliminarlo', v_ped.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from guias_remision where pedido_id = p_id and estado <> 'anulada') then
    raise exception 'El pedido % ya tiene guía: anúlala antes de eliminarlo', v_ped.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comprobantes where pedido_id = p_id and estado <> 'anulado') then
    raise exception 'El pedido % ya está facturado: no se puede eliminar', v_ped.numero
      using errcode = 'check_violation';
  end if;

  if v_n = 1 then
    -- El que nació al aprobar: se deshace la aprobación.
    update cotizacion_items set cantidad_aprobada = null where cotizacion_id = v_ped.cotizacion_id;
    delete from pedidos where id = p_id;
    update cotizaciones
       set estado = 'enviada', aprobada_en = null, aprobada_por = null
     where id = v_ped.cotizacion_id;
    v_estado := 'enviada';
  else
    -- Uno repetido: lo suyo sale de lo confirmado.
    update cotizacion_items ci
       set cantidad_aprobada = greatest(coalesce(ci.cantidad_aprobada, ci.cantidad) - pi.cantidad, 0)
      from pedido_items pi
     where pi.pedido_id = p_id and pi.cotizacion_item_id = ci.id;
    delete from pedidos where id = p_id;
    update cotizaciones q
       set estado = case
             when not exists (
               select 1 from cotizacion_items ci
                where ci.cotizacion_id = q.id
                  and ci.cantidad_atendida < coalesce(ci.cantidad_aprobada, ci.cantidad))
             then 'atendida'::estado_cotizacion
             else 'aprobada'::estado_cotizacion
           end
     where q.id = v_ped.cotizacion_id
    returning estado into v_estado;
  end if;

  return jsonb_build_object('cotizacion_id', v_ped.cotizacion_id, 'numero', v_ped.numero, 'estado', v_estado);
end $$;

revoke all on function public.eliminar_pedido(uuid) from public, anon;
grant execute on function public.eliminar_pedido(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Centinela: lo EJECUTA y lo deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  v_usuario uuid;
  v_cliente uuid;
  p1        uuid;
  v_cot     uuid;
  i1        uuid;
  r         jsonb;
  x         record;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '135: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 20, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;

    -- Uno repetido sobre una atendida: vuelve a atendida y resta lo suyo.
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    update cotizacion_items set cantidad_atendida = 20 where id = i1;
    update cotizaciones set estado = 'atendida' where id = v_cot;
    perform public.repetir_pedido(v_cot, jsonb_build_array(jsonb_build_object('item_id', i1, 'cantidad', 7)), null);

    -- El primero no se elimina mientras haya otro detrás.
    begin
      perform public.eliminar_pedido((select id from pedidos where cotizacion_id = v_cot and secuencia = 1));
      raise exception '135: dejó eliminar un pedido que no es el último';
    exception when check_violation then null;
    end;

    r := public.eliminar_pedido((select id from pedidos where cotizacion_id = v_cot and secuencia = 2));
    select (select estado from cotizaciones where id = v_cot) estado,
           (select cantidad_aprobada from cotizacion_items where id = i1) aprobada,
           (select count(*) from pedidos where cotizacion_id = v_cot) pedidos
      into x;
    if x.estado <> 'atendida' or x.aprobada <> 20 or x.pedidos <> 1 then
      raise exception '135: el repetido no se deshizo bien: %', row_to_json(x);
    end if;

    -- El único, con la cotización sin atender: deshace la aprobación.
    update cotizacion_items set cantidad_atendida = 0 where id = i1;
    update cotizaciones set estado = 'aprobada' where id = v_cot;
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.eliminar_pedido((select id from pedidos where cotizacion_id = v_cot));
    select (select estado from cotizaciones where id = v_cot) estado,
           (select cantidad_aprobada from cotizacion_items where id = i1) aprobada,
           (select count(*) from pedidos where cotizacion_id = v_cot) pedidos
      into x;
    if x.estado <> 'enviada' or x.aprobada is not null or x.pedidos <> 0 then
      raise exception '135: el único no deshizo la aprobación: %', row_to_json(x);
    end if;

    -- Y se puede volver a aprobar: nace otro pedido.
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    if (select count(*) from pedidos where cotizacion_id = v_cot) <> 1 then
      raise exception '135: al reaprobar no nació el pedido';
    end if;
    raise exception '__135_DESHACER__';
  exception when others then
    if sqlerrm <> '__135_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '135: eliminar el último pedido (repetido o el de la aprobación) y reaprobar; deshecho limpio.';
end $$;
