-- ###########################################################################
-- 194 · UNA SOLA REGLA PARA APROBAR, LA MISMA EN TODAS LAS PANTALLAS
-- ###########################################################################
--
-- Luis, 05/11, viendo la lista de cotizaciones: la CT02-1320, sin stock y sin
-- análisis de compra, seguía ofreciendo «Aprobar cotización» en verde en el
-- menú de la fila. *«No debería… tenemos que, siempre, en todos los módulos
-- que corresponde, no dejar un hueco libre»*.
--
-- La ficha ya ponía el candado (05/11) y `aprobar` lo comprobaba, pero cada
-- una con su propia cuenta, y la lista no hacía ninguna. Esta migración deja
-- la regla en UN sitio, la base:
--
--   · `faltas_para_aprobar(ids)`: por cotización, qué líneas no están en el
--     catálogo y cuáles hay que comprar sin análisis. La lee la lista.
--   · El candado de la 193 la usa también: ahora la base rechaza aprobar sin
--     el análisis, no solo sin el producto.
--
-- La regla es la de `faltaAnalizarAlAprobar` (02/11): una línea confirmada,
-- de un producto que no es kit, sin ningún proveedor con cantidad en su
-- análisis y con menos en el almacén (cantidad − reservado) de lo que pide.
-- ###########################################################################

create or replace function public.faltas_para_aprobar(p_ids uuid[])
returns table (cotizacion_id uuid, sin_registrar text[], sin_analisis text[])
language sql
stable
security invoker
set search_path to 'public', 'extensions'
as $function$
  select ci.cotizacion_id,
         coalesce(array_agg(coalesce(nullif(btrim(ci.codigo), ''), left(ci.descripcion, 40)) order by ci.orden)
                    filter (where ci.producto_id is null), '{}'),
         coalesce(array_agg(coalesce(nullif(btrim(ci.codigo), ''), left(ci.descripcion, 40)) order by ci.orden)
                    filter (where ci.producto_id is not null
                              and not coalesce(p.es_kit, false)
                              and not exists (select 1 from cotizacion_item_proveedores a
                                               where a.cotizacion_item_id = ci.id and a.cantidad > 0)
                              and coalesce(s.cantidad, 0) - coalesce(s.reservado, 0)
                                  < coalesce(ci.cantidad_aprobada, ci.cantidad)), '{}')
    from cotizacion_items ci
    left join productos p on p.id = ci.producto_id
    left join stock s on s.producto_id = ci.producto_id
   where ci.cotizacion_id = any(p_ids)
     and coalesce(ci.cantidad_aprobada, ci.cantidad) > 0
   group by ci.cotizacion_id
$function$;

revoke all on function public.faltas_para_aprobar(uuid[]) from public, anon;
grant execute on function public.faltas_para_aprobar(uuid[]) to authenticated;

comment on function public.faltas_para_aprobar(uuid[]) is
  'Qué impide aprobar cada cotización: líneas sin producto y líneas por comprar sin análisis (194). La usan la lista y el candado al aprobar.';

-- -------------------------------------------- el candado, con las dos cosas
create or replace function public.tg_cotizacion_aprobar_pide_productos()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  v_reg text[];
  v_ana text[];
begin
  if new.estado = 'aprobada' and old.estado in ('borrador', 'enviada') then
    -- `aprobar_cotizacion` ya dejó `cantidad_aprobada` puesta: una línea que
    -- el cliente no lleva (en cero) no estorba.
    select f.sin_registrar, f.sin_analisis into v_reg, v_ana
      from public.faltas_para_aprobar(array[new.id]) f;
    if coalesce(cardinality(v_reg), 0) > 0 then
      raise exception 'Antes de aprobar, registra en el catálogo: %. Sin producto no se puede hacer el análisis de compra, ni la orden, la guía ni la factura.', array_to_string(v_reg, ', ')
        using errcode = 'check_violation';
    end if;
    if coalesce(cardinality(v_ana), 0) > 0 then
      raise exception 'Antes de aprobar, llena el análisis de compra de: %. Hay que comprarlos y todavía no dicen a quién ni a cuánto.', array_to_string(v_ana, ', ')
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $function$;

-- --------------------------------------------------------------- centinela
-- EJECUTA lo de verdad y lo deshace: suelta → no; registrada sin análisis y
-- sin stock → no; con su análisis → sí, y nace el pedido.
do $$
declare
  v_usr  uuid;
  v_cli  uuid;
  v_prov uuid;
  p_sin  uuid;
  r      jsonb;
  v_cot  uuid;
  v_item uuid;
  v_msg  text;
begin
  select id into v_usr from perfiles where rol = 'gerencia' and activo order by creado_en limit 1;
  select id into v_cli from clientes order by creado_en limit 1;
  select id into v_prov from proveedores order by creado_en limit 1;
  -- Un producto sin nada en el almacén: hay que comprarlo.
  select p.id into p_sin from productos p left join stock s on s.producto_id = p.id
   where not p.archivado and not p.es_kit and coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) <= 0
   order by p.codigo limit 1;
  if v_usr is null or v_cli is null or v_prov is null or p_sin is null then
    raise notice '194: faltan datos para probar; se aplica sin ejecutar.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', null, 'orden', 1,
             'codigo', 'C194', 'descripcion', 'Centinela 194', 'cantidad', 2, 'unidad_codigo', 'NIU',
             'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    select id into v_item from cotizacion_items where cotizacion_id = v_cot;

    -- La lista lo ve igual que el candado.
    if (select sin_registrar from public.faltas_para_aprobar(array[v_cot])) <> array['C194'] then
      raise exception '194: faltas_para_aprobar no ve la línea suelta';
    end if;

    -- 1 · Suelta: no.
    v_msg := null;
    begin
      perform public.aprobar_cotizacion(v_cot, null::jsonb);
    exception when check_violation then v_msg := sqlerrm;
    end;
    if v_msg is null or v_msg not like 'Antes de aprobar, registra%' then
      raise exception '194: con la línea suelta, aprobar dijo: %', coalesce(v_msg, 'nada (se aprobó)');
    end if;

    -- 2 · Registrada, sin stock y sin análisis: no.
    perform public.vincular_producto_linea(v_item, p_sin);
    v_msg := null;
    begin
      perform public.aprobar_cotizacion(v_cot, null::jsonb);
    exception when check_violation then v_msg := sqlerrm;
    end;
    if v_msg is null or v_msg not like 'Antes de aprobar, llena el análisis de compra de: C194%' then
      raise exception '194: sin análisis, aprobar dijo: %', coalesce(v_msg, 'nada (se aprobó)');
    end if;

    -- 3 · Con su análisis: sí, y nace el pedido.
    -- Como lo guarda la pantalla dentro de actualizar_cotizacion; aquí, directo.
    perform set_config('role', 'postgres', true);
    insert into cotizacion_item_proveedores (cotizacion_item_id, proveedor_id, cantidad, costo_unitario, costo_usd)
    values (v_item, v_prov, 2, 5, 5);
    perform set_config('role', 'authenticated', true);
    if cardinality((select sin_analisis from public.faltas_para_aprobar(array[v_cot]))) <> 0 then
      raise exception '194: con análisis, faltas_para_aprobar sigue pidiéndolo';
    end if;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    if not exists (select 1 from pedidos where cotizacion_id = v_cot) then
      raise exception '194: con todo en regla, aprobar no creó el pedido';
    end if;

    raise exception '__194_DESHACER__';
  exception when others then
    if sqlerrm <> '__194_DESHACER__' then raise; end if;
  end;
  raise notice '194: suelta no, sin análisis no, con análisis sí; deshecho.';
end $$;
