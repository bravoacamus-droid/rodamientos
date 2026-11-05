-- ###########################################################################
-- 193 · APROBAR PIDE LOS PRODUCTOS REGISTRADOS, Y EL CLON SABE DE DÓNDE VIENE
-- ###########################################################################
--
-- 05/11, 12:56. Willy clonó la CT02-1303 —cargada de SIMPLE el 01/11, con dos
-- productos que el ERP no tenía: NJ207-E-XL-M1.C3 y OV-5.3X325— en la
-- CT02-1320, pulsó «Aprobar» sin querer a los 44 segundos y nació el
-- PED-26-00005: un pedido con dos líneas sin producto y sin análisis de
-- compra. Luis: *«no debería dejarlo aprobar si los productos no están
-- registrados… porque tiene que hacer su análisis de costo, no hizo nada»*.
--
-- El hueco: el análisis obligatorio al aprobar (02/11) se saltaba las líneas
-- sin producto («no se compran por aquí»). Pero sin producto no hay análisis,
-- ni orden de compra, ni guía (`guia_items.producto_id` es NOT NULL), ni
-- factura: el pedido nacía atascado.
--
-- Tres cosas:
--
--   1. Aprobar con una línea confirmada sin producto se RECHAZA, aquí y no
--      solo en la pantalla.
--   2. `vincular_producto_linea`: la línea suelta se enlaza al producto que se
--      acaba de registrar, sin tocar lo cotizado.
--   3. `cotizaciones.clonada_de`, para decir de qué cotización sale un clon.
--      Luis: *«debería decirme de qué cotización viene clonada, cuál es su
--      origen, para ir a la cotización original»*. Hasta hoy el clon copiaba
--      la observación «Cargada el 01/11 del sistema anterior (CT02-1303)…»,
--      que en la copia es falsa.
-- ###########################################################################

-- ------------------------------------------------------------ 3 · el origen
alter table public.cotizaciones
  add column if not exists clonada_de uuid references public.cotizaciones(id) on delete set null;

comment on column public.cotizaciones.clonada_de is
  'La cotización de la que se clonó esta (193, 05/11). Null si se hizo desde cero.';

create or replace function public.anotar_clon(p_id uuid, p_origen uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede crear cotizaciones' using errcode = 'insufficient_privilege';
  end if;
  if p_id = p_origen or not exists (select 1 from cotizaciones where id = p_origen) then
    raise exception 'La cotización de origen no es válida' using errcode = 'check_violation';
  end if;
  -- Solo una recién nacida: un borrador sin origen todavía.
  update cotizaciones set clonada_de = p_origen
   where id = p_id and clonada_de is null and estado = 'borrador';
end $function$;

revoke all on function public.anotar_clon(uuid, uuid) from public, anon;
grant execute on function public.anotar_clon(uuid, uuid) to authenticated;

-- ---------------------------------------------- 1 · aprobar pide productos
create or replace function public.tg_cotizacion_aprobar_pide_productos()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  v_codigos text;
begin
  if new.estado = 'aprobada' and old.estado in ('borrador', 'enviada') then
    -- `aprobar_cotizacion` ya dejó `cantidad_aprobada` puesta: una línea que
    -- el cliente no lleva (en cero) no estorba.
    select string_agg(coalesce(nullif(btrim(codigo), ''), left(descripcion, 40)), ', ' order by orden)
      into v_codigos
      from cotizacion_items
     where cotizacion_id = new.id
       and producto_id is null
       and coalesce(cantidad_aprobada, cantidad) > 0;
    if v_codigos is not null then
      raise exception 'Antes de aprobar, registra en el catálogo: %. Sin producto no se puede hacer el análisis de compra, ni la orden, la guía ni la factura.', v_codigos
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists tg_cotizacion_aprobar_pide_productos on public.cotizaciones;
create trigger tg_cotizacion_aprobar_pide_productos
  before update of estado on public.cotizaciones
  for each row execute function public.tg_cotizacion_aprobar_pide_productos();

-- --------------------------------------------- 2 · enlazar la línea suelta
create or replace function public.vincular_producto_linea(p_item uuid, p_producto uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_estado estado_cotizacion;
  v_cot    uuid;
  v_actual uuid;
  v_codigo text;
  v_marca  text;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede cambiar una cotización' using errcode = 'insufficient_privilege';
  end if;

  select q.estado, q.id, i.producto_id into v_estado, v_cot, v_actual
    from cotizacion_items i join cotizaciones q on q.id = i.cotizacion_id
   where i.id = p_item
   for update of q;
  if v_cot is null then
    raise exception 'La línea no existe' using errcode = 'no_data_found';
  end if;
  if v_estado not in ('borrador', 'enviada') then
    raise exception 'La cotización ya está %: su línea no se cambia', v_estado using errcode = 'check_violation';
  end if;
  if v_actual is not null then
    raise exception 'Esta línea ya tiene su producto del catálogo' using errcode = 'check_violation';
  end if;

  select p.codigo, m.nombre into v_codigo, v_marca
    from productos p join marcas m on m.id = p.marca_id
   where p.id = p_producto and not p.archivado;
  if v_codigo is null then
    raise exception 'El producto no existe o está archivado' using errcode = 'no_data_found';
  end if;

  -- Lo cotizado (cantidad, precio, descripción) no se toca: el cliente lo vio así.
  update cotizacion_items
     set producto_id = p_producto,
         marca = coalesce(marca, nullif(v_marca, 'SIN MARCA'))
   where id = p_item;

  return jsonb_build_object('cotizacion_id', v_cot, 'codigo', v_codigo);
end $function$;

revoke all on function public.vincular_producto_linea(uuid, uuid) from public, anon;
grant execute on function public.vincular_producto_linea(uuid, uuid) to authenticated;

-- --------------------------------------------------------------- centinela
-- EJECUTA lo de verdad, como gerencia, y lo deshace: una cotización con una
-- línea suelta no se aprueba; enlazada, sí, y nace su pedido; y el clon
-- queda anotado. Sale por excepción, que es lo que lo borra todo.
do $$
declare
  v_usr  uuid;
  v_cli  uuid;
  p1     uuid;
  p2     uuid;
  r      jsonb;
  v_cot  uuid;
  v_otra uuid;
  v_item uuid;
  v_ok   boolean := false;
begin
  select id into v_usr from perfiles where rol = 'gerencia' and activo order by creado_en limit 1;
  select id into v_cli from clientes order by creado_en limit 1;
  select p.id into p1 from productos p where not p.archivado and not p.es_kit order by p.codigo limit 1;
  select p.id into p2 from productos p where not p.archivado and not p.es_kit and p.id <> p1 order by p.codigo limit 1;
  if v_usr is null or v_cli is null or p2 is null then
    raise notice '193: faltan datos para probar; se aplica sin ejecutar.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(
             jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'C193A',
               'descripcion', 'Centinela 193', 'cantidad', 1, 'unidad_codigo', 'NIU',
               'valor_unitario', 10, 'costo_unitario', 5),
             jsonb_build_object('producto_id', null, 'orden', 2, 'codigo', 'C193-SUELTA',
               'descripcion', 'Centinela 193 sin registrar', 'cantidad', 2, 'unidad_codigo', 'NIU',
               'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    select id into v_item from cotizacion_items where cotizacion_id = v_cot and producto_id is null;

    -- 1 · Con la línea suelta, no se aprueba.
    begin
      perform public.aprobar_cotizacion(v_cot, null::jsonb);
    exception when check_violation then
      if sqlerrm like 'Antes de aprobar, registra en el catálogo: C193-SUELTA%' then v_ok := true; else raise; end if;
    end;
    if not v_ok then
      raise exception '193: se aprobó una cotización con una línea sin producto';
    end if;
    if exists (select 1 from pedidos where cotizacion_id = v_cot) then
      raise exception '193: nació un pedido de una cotización que no debía aprobarse';
    end if;

    -- 2 · Enlazada, lo cotizado sigue igual.
    perform public.vincular_producto_linea(v_item, p2);
    if (select producto_id from cotizacion_items where id = v_item) is distinct from p2
       or (select valor_unitario from cotizacion_items where id = v_item) <> 10
       or (select descripcion from cotizacion_items where id = v_item) <> 'Centinela 193 sin registrar' then
      raise exception '193: enlazar la línea no la dejó con su producto y su precio';
    end if;

    -- 3 · El clon anotado (una segunda cotización, en borrador).
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'C193B',
             'descripcion', 'Centinela 193 clon', 'cantidad', 1, 'unidad_codigo', 'NIU',
             'valor_unitario', 10, 'costo_unitario', 5))));
    v_otra := (r ->> 'id')::uuid;
    perform public.anotar_clon(v_otra, v_cot);
    if (select clonada_de from cotizaciones where id = v_otra) is distinct from v_cot then
      raise exception '193: el clon no quedó con su origen';
    end if;

    -- 4 · Ya registrada, se aprueba y nace el pedido.
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    if not exists (select 1 from pedidos where cotizacion_id = v_cot) then
      raise exception '193: con todo registrado, aprobar no creó el pedido';
    end if;

    raise exception '__193_DESHACER__';
  exception when others then
    if sqlerrm <> '__193_DESHACER__' then raise; end if;
  end;
  raise notice '193: suelta no aprueba, enlazada sí, el clon sabe su origen; deshecho.';
end $$;
