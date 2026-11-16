-- ###########################################################################
-- 200 · CANTIDADES CON DECIMALES, SEGÚN LA UNIDAD
-- ###########################################################################
--
-- Willy, por Luis (16/11): *«algunos productos los puede vender 3.5 metros,
-- 2.98… él ya sabe qué productos son, pero quiere la cantidad en decimales»*.
-- Luis eligió que lo decida la UNIDAD del producto: lo que se mide (metro,
-- kilo, galón, hora) o se cuenta por grupos (docena, ciento) admite dos
-- decimales; lo que se cuenta por pieza (unidad, kit, caja, par) sigue
-- entero, para que «3.5 rodamientos» no se pueda escribir por error.
--
-- La base ya guardaba dos decimales en todas las cantidades (numeric(14,2))
-- y ninguna función los redondeaba: lo que los impedía eran las pantallas.
-- Aquí va la regla, la misma lista que `lib/cantidad.ts`, y su candado en
-- las líneas de cotización, guía, compra y comprobante.
--
-- El candado mira SOLO la cantidad que se escribe o se cambia: el historial
-- de SIMPLE trae siete líneas con decimales (cadenas registradas como
-- «unidad», 0.25 de un ciento) y se quedan como están.
-- ###########################################################################

create or replace function public.unidad_admite_decimales(p_unidad text)
returns boolean
language sql
immutable
parallel safe
set search_path to 'public', 'extensions'
as $function$
  select upper(btrim(coalesce(p_unidad, ''))) = any (array[
    'MTR','CMT','MMT','INH','FOT','YRD',
    'MTK','MTQ','LTR','MLT','GLL',
    'KGM','GRM','TNE','LBR','ONZ',
    'HUR','DAY','MON','ANN',
    'DZN','GRO','CEN','MIL'])
$function$;

comment on function public.unidad_admite_decimales(text) is
  'Si una unidad admite cantidades con decimales (200). La misma lista que apps/web/src/lib/cantidad.ts.';

create or replace function public.tg_cantidad_segun_unidad()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  v_nueva  jsonb := to_jsonb(new);
  v_vieja  jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_campo  text;
  v_valor  numeric;
begin
  if public.unidad_admite_decimales(new.unidad_codigo) then
    return new;
  end if;
  foreach v_campo in array array['cantidad', 'cantidad_aprobada'] loop
    continue when not (v_nueva ? v_campo) or v_nueva ->> v_campo is null;
    -- Solo lo que se escribe ahora: lo guardado antes no se revisa.
    continue when tg_op = 'UPDATE'
      and (v_nueva -> v_campo) is not distinct from (v_vieja -> v_campo)
      and new.unidad_codigo is not distinct from old.unidad_codigo;
    v_valor := (v_nueva ->> v_campo)::numeric;
    if v_valor <> trunc(v_valor) then
      raise exception '% se vende por pieza: la cantidad tiene que ser entera (llegó %). Si se vende por metro, kilo u otra medida, cambia su unidad en la ficha del producto.',
        coalesce(nullif(v_nueva ->> 'codigo', ''), 'Este producto'), v_valor
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $function$;

do $$
declare t text;
begin
  foreach t in array array['cotizacion_items', 'guia_items', 'compra_items', 'comprobante_items'] loop
    execute format('drop trigger if exists tg_cantidad_segun_unidad on public.%I', t);
    execute format('create trigger tg_cantidad_segun_unidad before insert or update on public.%I
                      for each row execute function public.tg_cantidad_segun_unidad()', t);
  end loop;
end $$;

-- --------------------------------------------------------------- centinela
-- EJECUTA: una cotización con 2.5 metros se guarda; con 1.5 unidades, no. Se
-- deshace.
do $$
declare
  v_usr  uuid;
  v_cli  uuid;
  p_m    uuid;
  p_u    uuid;
  r      jsonb;
  v_msg  text;
begin
  if not public.unidad_admite_decimales('MTR') or public.unidad_admite_decimales('NIU') then
    raise exception '200: la lista de unidades no es la esperada';
  end if;
  select id into v_usr from perfiles where rol = 'gerencia' and activo order by creado_en limit 1;
  select id into v_cli from clientes order by creado_en limit 1;
  select id into p_m from productos where unidad_codigo = 'MTR' and not archivado order by codigo limit 1;
  select id into p_u from productos where unidad_codigo = 'NIU' and not archivado and not es_kit order by codigo limit 1;
  if v_usr is null or v_cli is null or p_m is null or p_u is null then
    raise notice '200: faltan datos para probar; se aplica sin ejecutar.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p_m, 'orden', 1,
             'codigo', 'C200M', 'descripcion', 'Centinela 200 metros', 'cantidad', 2.5,
             'unidad_codigo', 'MTR', 'valor_unitario', 10, 'costo_unitario', 5))));
    if (select cantidad from cotizacion_items where cotizacion_id = (r ->> 'id')::uuid) <> 2.5 then
      raise exception '200: 2.5 metros no se guardó como 2.5';
    end if;

    begin
      perform public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
             'items', jsonb_build_array(jsonb_build_object('producto_id', p_u, 'orden', 1,
               'codigo', 'C200U', 'descripcion', 'Centinela 200 unidades', 'cantidad', 1.5,
               'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 5))));
    exception when check_violation then v_msg := sqlerrm;
    end;
    if v_msg is null or v_msg not like 'C200U se vende por pieza%' then
      raise exception '200: 1.5 unidades dijo: %', coalesce(v_msg, 'nada (se guardó)');
    end if;

    raise exception '__200_DESHACER__';
  exception when others then
    if sqlerrm <> '__200_DESHACER__' then raise; end if;
  end;
  raise notice '200: 2.5 metros sí, 1.5 unidades no; deshecho.';
end $$;
