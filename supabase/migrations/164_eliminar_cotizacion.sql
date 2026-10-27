-- ###########################################################################
-- 164 · ELIMINAR UNA COTIZACIÓN, Y QUE EL NÚMERO VUELVA
-- ###########################################################################
--
-- Luis, 27/10: *«se puede eliminar una cotización y que siga con el
-- correlativo: ponte que elimino la COT-010, la cotización que voy a crear
-- tiene que ser la 010, no la 11»*.
--
-- El problema: una cotización mal hecha —el cliente equivocado, una prueba,
-- una que se duplicó— solo se podía ANULAR. Anulada se queda en la lista para
-- siempre y se come su número: la siguiente sale con el de después, y en el
-- libro de Willy queda un hueco que no explica nada. La cotización no es un
-- documento fiscal (no va a SUNAT), así que no hay nada que obligue a
-- guardarla mientras no sea un compromiso de nadie.
--
-- La regla es la de siempre (§6 de CLAUDE.md, la misma que la 135 para el
-- pedido): se deshace hasta donde el documento todavía no es un compromiso.
--
--   · Solo si NADA cuelga de ella: ni pedido, ni guía, ni comprobante, ni
--     orden de compra enlazada (`compras.cotizacion_id`), ni una línea suya
--     dentro de una guía. Da igual que esos documentos estén anulados: las
--     claves de `guias_remision`, `comprobantes` y `compras` hacia la
--     cotización son RESTRICT / NO ACTION, y un anulado sigue siendo historia
--     que apunta a ella. El mensaje dice QUÉ tiene, con su número.
--   · Estados: borrador, enviada, rechazada, vencida, anulada y aprobada
--     (esta solo si no tiene nada colgando: al aprobar nace su pedido, así
--     que en la práctica hay que eliminar antes el pedido). Atendida nunca:
--     es una venta hecha.
--   · Lo que es SOLO de ella se va con ella: líneas, su análisis de compra
--     (`cotizacion_item_proveedores`, por cascada), sus alertas y su bloqueo
--     de edición. El enlace público `/ver` es una columna de la fila: muere
--     con ella.
--
-- El número:
--
--   · Si es la ÚLTIMA de su serie (su correlativo = `correlativo_actual`), el
--     contador baja al mayor correlativo que siga existiendo en la serie, y
--     nunca por debajo de `correlativo_inicial - 1`: así `siguiente_correlativo`
--     —que da `greatest(actual + 1, inicial)`— vuelve a dar ese número.
--   · Si NO es la última, el contador no se toca: bajarlo haría que la
--     siguiente choque con la que existe detrás. Su número queda libre y no
--     se vuelve a usar; la pantalla lo dice antes de confirmar.
--   · La fila de la serie se bloquea (`for update`) antes de mirar el
--     contador. `siguiente_correlativo` hace un `update` sobre esa misma fila,
--     así que una cotización que se está creando a la vez espera a que esto
--     termine, o esto espera a que ella termine y ve el contador ya subido.
--     CT02 (la real de Willy) y COT1 (la de prueba) se comportan igual: la
--     cotización no está en la lista fiscal de la 093.
--
-- El rastro: `tg_bitacora_cotizaciones` ya apunta el borrado con quién y
-- cuándo, y la 158 le pone el número en `referencia`. Esta función le cambia
-- el «Se borró» por una frase que dice qué se hizo con el número.
--
-- Permiso: «Eliminar» en Cotizaciones (143/144), aquí y en la Server Action.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · Por qué no se puede eliminar (null si se puede)
-- ---------------------------------------------------------------------------
-- Una sola función para la previa de la pantalla y para la eliminación: si
-- las reglas estuvieran escritas dos veces, el diálogo diría «se puede» y el
-- botón contestaría que no.
create or replace function public._por_que_no_se_elimina_cotizacion(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_estado  estado_cotizacion;
  v_partes  text[] := '{}';
  v_nums    text[];
  v_venta   boolean := false;
  v_frase   text;
begin
  select estado into v_estado from cotizaciones where id = p_id;
  if v_estado is null then
    return 'La cotización no existe.';
  end if;

  -- Los pedidos.
  select array_agg(numero order by secuencia) into v_nums from pedidos where cotizacion_id = p_id;
  if v_nums is not null then
    v_partes := v_partes || (case when cardinality(v_nums) = 1 then 'el pedido ' else 'los pedidos ' end
                             || array_to_string(v_nums, ', '));
  end if;

  -- Las guías: las suyas y las que llevan alguna línea suya.
  select array_agg(distinct g.numero) into v_nums
    from guias_remision g
   where g.cotizacion_id = p_id
      or g.id in (select gi.guia_id from guia_items gi
                    join cotizacion_items ci on ci.id = gi.cotizacion_item_id
                   where ci.cotizacion_id = p_id);
  if v_nums is not null then
    v_venta := true;
    v_partes := v_partes || (case when cardinality(v_nums) = 1 then 'la guía ' else 'las guías ' end
                             || array_to_string(v_nums, ', '));
  end if;

  -- Los comprobantes.
  select array_agg(numero order by numero) into v_nums from comprobantes where cotizacion_id = p_id;
  if v_nums is not null then
    v_venta := true;
    v_partes := v_partes || (case when cardinality(v_nums) = 1 then 'el comprobante ' else 'los comprobantes ' end
                             || array_to_string(v_nums, ', '));
  end if;

  -- Las órdenes de compra que salieron de ella (su análisis de compra).
  select array_agg(numero order by numero) into v_nums from compras where cotizacion_id = p_id;
  if v_nums is not null then
    v_partes := v_partes || (case when cardinality(v_nums) = 1 then 'la orden de compra ' else 'las órdenes de compra ' end
                             || array_to_string(v_nums, ', '));
  end if;

  if cardinality(v_partes) > 0 then
    v_frase := case
      when cardinality(v_partes) = 1 then v_partes[1]
      else array_to_string(v_partes[1:cardinality(v_partes) - 1], ', ') || ' y ' || v_partes[cardinality(v_partes)]
    end;
    return 'Tiene ' || v_frase || '; '
      || case when v_venta
              then 'ya es una venta y se queda en el historial.'
              else 'anúlala en vez de eliminarla.'
         end;
  end if;

  if v_estado = 'atendida' then
    return 'Está atendida: es una venta hecha y se queda en el historial.';
  end if;

  return null;
end $$;

revoke all on function public._por_que_no_se_elimina_cotizacion(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · La previa: lo que dice el diálogo antes de confirmar
-- ---------------------------------------------------------------------------
create or replace function public.previa_eliminar_cotizacion(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_cot    record;
  v_ser    record;
  v_max    integer;
  v_ultima boolean := false;
  v_sig    integer;
begin
  if not public.puede('cotizaciones', 'eliminar') then
    raise exception 'Tu rol no puede eliminar cotizaciones' using errcode = 'insufficient_privilege';
  end if;

  select id, serie, correlativo, numero into v_cot from cotizaciones where id = p_id;
  if v_cot.id is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;

  select correlativo_actual, correlativo_inicial into v_ser
    from series_documento where tipo = 'cotizacion' and serie = v_cot.serie;

  if v_ser.correlativo_actual is not null and v_cot.correlativo = v_ser.correlativo_actual then
    v_ultima := true;
    select coalesce(max(correlativo), 0) into v_max
      from cotizaciones where serie = v_cot.serie and id <> p_id;
    v_sig := greatest(greatest(v_max, v_ser.correlativo_inicial - 1) + 1, v_ser.correlativo_inicial);
  end if;

  return jsonb_build_object(
    'numero', v_cot.numero,
    'motivo', public._por_que_no_se_elimina_cotizacion(p_id),
    'ultima', v_ultima,
    -- El que dará la próxima, formado como la columna `numero`.
    'siguiente', case when v_ultima then v_cot.serie || '-' || lpad(v_sig::text, 6, '0') end
  );
end $$;

revoke all on function public.previa_eliminar_cotizacion(uuid) from public, anon;
grant execute on function public.previa_eliminar_cotizacion(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3 · Eliminar
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_cotizacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cot     record;
  v_ser     record;
  v_motivo  text;
  v_max     integer;
  v_nuevo   integer;
  v_ultima  boolean := false;
  v_desc    text;
begin
  -- Lo primero, como en todas: validar a media función deja cosas a medias.
  if not public.puede('cotizaciones', 'eliminar') then
    raise exception 'Tu rol no puede eliminar cotizaciones' using errcode = 'insufficient_privilege';
  end if;

  -- La cotización bloqueada: nada se le cuelga mientras se mira.
  select id, serie, correlativo, numero, cliente_id into v_cot from cotizaciones where id = p_id for update;
  if v_cot.id is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;

  v_motivo := public._por_que_no_se_elimina_cotizacion(p_id);
  if v_motivo is not null then
    raise exception '%', v_motivo using errcode = 'check_violation';
  end if;

  -- El candado de la serie ANTES de mirar el contador (ver cabecera).
  select id, correlativo_actual, correlativo_inicial into v_ser
    from series_documento
   where tipo = 'cotizacion' and serie = v_cot.serie
   for update;

  delete from alertas where entidad_tipo = 'cotizacion' and entidad_id = p_id;
  delete from bloqueos_edicion where entidad = 'cotizacion' and registro_id = p_id;
  -- Líneas y su análisis de compra se van por cascada.
  delete from cotizaciones where id = p_id;

  if v_ser.id is not null and v_cot.correlativo = v_ser.correlativo_actual then
    v_ultima := true;
    select coalesce(max(correlativo), 0) into v_max from cotizaciones where serie = v_cot.serie;
    v_nuevo := greatest(v_max, v_ser.correlativo_inicial - 1);
    update series_documento set correlativo_actual = v_nuevo where id = v_ser.id;
  end if;

  v_desc := 'Se eliminó la cotización ' || v_cot.numero || '. '
    || case when v_ultima
            then 'La próxima de la serie ' || v_cot.serie || ' será la '
                 || v_cot.serie || '-' || lpad(greatest(v_nuevo + 1, v_ser.correlativo_inicial)::text, 6, '0') || '.'
            else 'Su número no se volverá a usar.'
       end;

  -- La fila que acaba de escribir `tg_bitacora_cotizaciones`: que diga qué
  -- pasó con el número, y no solo «Se borró».
  update actividad
     set descripcion = v_desc,
         metadata = metadata || jsonb_build_object(
           'eliminada', true, 'numero_reutilizable', v_ultima,
           'contador', case when v_ultima
                            then jsonb_build_object('antes', v_ser.correlativo_actual, 'despues', v_nuevo) end)
   where id = (select max(id) from actividad
                where entidad = 'cotizaciones' and entidad_id = p_id and accion = 'borrado');

  return jsonb_build_object(
    'numero', v_cot.numero,
    'ultima', v_ultima,
    'siguiente', case when v_ultima
                      then v_cot.serie || '-' || lpad(greatest(v_nuevo + 1, v_ser.correlativo_inicial)::text, 6, '0')
                 end
  );
end $$;

revoke all on function public.eliminar_cotizacion(uuid) from public, anon;
grant execute on function public.eliminar_cotizacion(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Centinela: lo EJECUTA y lo deshace. La serie tiene que quedar idéntica.
-- ---------------------------------------------------------------------------
do $$
declare
  v_series  jsonb := (select jsonb_agg(to_jsonb(s) order by s.id) from series_documento s);
  v_usuario uuid;
  v_almacen uuid;
  v_cliente uuid;
  p1        uuid;
  v_items   jsonb;
  v_a       uuid;
  v_b       uuid;
  v_c       uuid;
  v_d       uuid;
  v_num     text;
  v_ped     text;
  v_antes   integer;
  r         jsonb;
  x         record;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_almacen from perfiles p where activo and rol <> 'gerencia'
     and not exists (select 1 from permisos where rol = p.rol::text and modulo = 'cotizaciones' and accion = 'eliminar')
   limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null then
    raise notice '164: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  v_items := jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
    'cantidad', 2, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0));

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    -- 1 · La última: se elimina y el contador vuelve.
    select correlativo_actual into v_antes from series_documento where tipo = 'cotizacion' and serie = 'COT1';
    r := public.crear_cotizacion(jsonb_build_object('serie', 'COT1', 'cliente_id', v_cliente, 'items', v_items));
    v_a := (r ->> 'id')::uuid;
    v_num := r ->> 'numero';
    -- Lo que es solo suyo y tiene que irse con ella.
    insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, huella)
    values ('cotizacion_borrador', 'info', 'prueba', 'prueba', 'cotizacion', v_a, 'prueba-164-' || v_a);
    insert into bloqueos_edicion (entidad, registro_id, usuario_id) values ('cotizacion', v_a, v_usuario);

    r := public.previa_eliminar_cotizacion(v_a);
    if (r ->> 'motivo') is not null or not (r ->> 'ultima')::boolean then
      raise exception '164: la previa de la última dice %', r;
    end if;
    r := public.eliminar_cotizacion(v_a);
    if (r ->> 'siguiente') <> v_num then
      raise exception '164: la próxima debía ser % y dice %', v_num, r ->> 'siguiente';
    end if;
    select (select correlativo_actual from series_documento where tipo = 'cotizacion' and serie = 'COT1') actual,
           (select count(*) from cotizaciones where id = v_a) cot,
           (select count(*) from cotizacion_items where cotizacion_id = v_a) lineas,
           (select count(*) from alertas where entidad_id = v_a) alertas,
           (select count(*) from bloqueos_edicion where registro_id = v_a) bloqueos,
           (select count(*) from actividad where entidad = 'cotizaciones' and entidad_id = v_a and accion = 'borrado'
              and referencia = v_num and usuario_id = v_usuario and descripcion like 'Se eliminó%') bitacora
      into x;
    if x.actual <> v_antes or x.cot <> 0 or x.lineas <> 0 or x.alertas <> 0 or x.bloqueos <> 0 or x.bitacora <> 1 then
      raise exception '164: eliminar la última no dejó todo en su sitio: %', row_to_json(x);
    end if;
    -- Y la siguiente sale con el mismo número.
    r := public.crear_cotizacion(jsonb_build_object('serie', 'COT1', 'cliente_id', v_cliente, 'items', v_items));
    if r ->> 'numero' <> v_num then
      raise exception '164: tras eliminar % la siguiente salió %', v_num, r ->> 'numero';
    end if;
    perform public.eliminar_cotizacion((r ->> 'id')::uuid);

    -- 2 · Dos: eliminar la primera no mueve el contador.
    v_b := (public.crear_cotizacion(jsonb_build_object('serie', 'COT1', 'cliente_id', v_cliente, 'items', v_items)) ->> 'id')::uuid;
    v_c := (public.crear_cotizacion(jsonb_build_object('serie', 'COT1', 'cliente_id', v_cliente, 'items', v_items)) ->> 'id')::uuid;
    select correlativo_actual into v_antes from series_documento where tipo = 'cotizacion' and serie = 'COT1';
    r := public.previa_eliminar_cotizacion(v_b);
    if (r ->> 'ultima')::boolean or (r ->> 'siguiente') is not null then
      raise exception '164: la previa de una de en medio dice %', r;
    end if;
    r := public.eliminar_cotizacion(v_b);
    if (r ->> 'ultima')::boolean
       or (select correlativo_actual from series_documento where tipo = 'cotizacion' and serie = 'COT1') <> v_antes then
      raise exception '164: eliminar una de en medio movió el contador';
    end if;
    perform public.eliminar_cotizacion(v_c);

    -- 3 · Con pedido no se elimina, y dice cuál.
    v_d := (public.crear_cotizacion(jsonb_build_object('serie', 'COT1', 'cliente_id', v_cliente, 'items', v_items)) ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_d, null::jsonb);
    select numero into v_ped from pedidos where cotizacion_id = v_d;
    if v_ped is null then raise exception '164: al aprobar no nació el pedido'; end if;
    begin
      perform public.eliminar_cotizacion(v_d);
      raise exception '164: dejó eliminar una cotización con pedido';
    exception when check_violation then
      if sqlerrm not like 'Tiene el pedido ' || v_ped || '; anúlala%' then
        raise exception '164: el aviso del pedido dice «%»', sqlerrm;
      end if;
    end;

    -- 4 · Sin «Eliminar» en Cotizaciones, rebota en la base.
    if v_almacen is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', v_almacen, 'role', 'authenticated')::text, true);
      begin
        perform public.eliminar_cotizacion(v_d);
        raise exception '164: un rol sin permiso eliminó';
      exception when insufficient_privilege then null;
      end;
    end if;

    raise exception '__164_DESHACER__';
  exception when others then
    if sqlerrm <> '__164_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);

  if (select jsonb_agg(to_jsonb(s) order by s.id) from series_documento s) is distinct from v_series then
    raise exception '164: series_documento no quedó idéntica tras el centinela';
  end if;
  raise notice '164: eliminar la última (vuelve el número), una de en medio (no se mueve), con pedido (rebota) y sin permiso (rebota); deshecho limpio.';
end $$;
