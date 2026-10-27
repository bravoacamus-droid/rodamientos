-- ###########################################################################
-- 160 · MARCAS, FAMILIAS Y SUB-FAMILIAS SE CORRIGEN; Y LOS CAMBIOS DE PRECIO
--       SE DESHACEN EN ORDEN (27/10)
-- ###########################################################################
--
-- Dos hallazgos de la auditoría del 27/10.
--
-- 1 · FS-04. Marcas, familias y sub-familias solo tenían ALTA.
--
--     `crear_marca`, `crear_familia` y `crear_subfamilia` existen desde la
--     028/039 y se llaman desde la ficha del producto y desde el alta rápida
--     de la cotización. Pero no había forma de corregir un nombre mal escrito
--     ni de retirar una marca: ningún `update` sobre esas tablas en toda la
--     aplicación, y la columna `marcas.activo` no la escribía nadie. Con 60
--     marcas, 12 familias y 39 sub-familias, «SKF » con un espacio o «TIMKEM»
--     dados de alta con prisa al teléfono solo se arreglaban por SQL.
--
--     Zonas y rubros del cliente (142) ya tienen su CRUD dentro del
--     desplegable. Aquí se copia esa forma:
--
--       · `renombrar_marca`, `renombrar_familia`, `renombrar_subfamilia`:
--         mismas reglas de nombre que el alta (sin espacios sobrantes, en
--         mayúsculas, como `crear_*`), y rechazan un nombre que ya existe
--         comparando por `nombre_norm` — que es la columna del índice único y
--         la que usa `crear_*` para decir «ya estaba». La sub-familia compara
--         dentro de su familia, como su alta.
--       · `cambiar_activo_marca`: DAR DE BAJA y no borrar. Una marca tiene
--         productos, cotizaciones y facturas detrás; lo que se quiere es que
--         no salga al elegir. Se vuelve a dar de alta escribiéndola otra vez:
--         `crear_marca` ya reactiva la que estaba de baja.
--
--     Tres filas no se tocan, porque el código las busca POR NOMBRE:
--     «SIN MARCA» (no-registrado.ts, kits.ts, la 056 y la 154), la familia
--     «OTROS» y su sub-familia «POR CLASIFICAR» (no-registrado.ts). Renombrar
--     cualquiera de ellas rompería en silencio el «producto no registrado» de
--     la cotización.
--
--     El candado es `puede('productos','editar')`, el mismo que comprueba la
--     Server Action, y va lo PRIMERO: son `security definer`.
--
-- 2 · QA-08. Deshacer un cambio de precios fuera de orden dejaba los precios
--     subidos y el cambio marcado como deshecho.
--
--     Probado con VAZEL: +10 % (A) y otro +10 % (B). Deshacer A devolvía 0
--     precios —ninguno seguía en el «después» de A, porque B los había
--     movido— pero lo marcaba deshecho igual. Deshacer B volvía al precio
--     tras A. Resultado: +10 % para siempre y los dos cambios «deshechos».
--
--     Ahora `deshacer_cambio_precios`:
--       · se niega si hay un cambio POSTERIOR de la misma marca sin deshacer
--         que todavía tiene algún precio puesto por él: «Deshaz primero el del
--         dd/mm hh:mm». Uno posterior cuyos precios ya se corrigieron todos a
--         mano no estorba: no hay nada suyo que deshacer encima.
--       · si no devuelve ningún precio, NO marca el cambio como deshecho y lo
--         dice (`deshecho: false`).
--
-- La pantalla que lista los cambios y deja deshacer cada uno va aparte
-- (precios-por-marca.tsx); `cambios_precio` ya se lee con la RLS de la 155.

-- ───────────────────────────────────────────── 1 · Catálogo editable ──────

create or replace function public._nombre_de_producto_catalogo(p text, p_que text)
returns text language plpgsql immutable as $$
-- El mismo trato que da `crear_marca` al nombre (btrim + upper), más quitar
-- los espacios dobles, que es justo el error que se viene a corregir.
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if length(v) < 2 then
    raise exception 'El nombre de la % es demasiado corto', p_que using errcode = 'invalid_parameter_value';
  end if;
  if length(v) > 120 then
    raise exception 'El nombre de la % es demasiado largo', p_que using errcode = 'invalid_parameter_value';
  end if;
  return upper(v);
end $$;

create or replace function public.renombrar_marca(p_id uuid, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text; v_otra text; v_actual text;
begin
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar marcas' using errcode = 'insufficient_privilege';
  end if;
  select nombre_norm into v_actual from marcas where id = p_id for update;
  if not found then
    raise exception 'Esa marca ya no existe' using errcode = 'no_data_found';
  end if;
  if v_actual = 'SINMARCA' then
    raise exception '«SIN MARCA» la usa el sistema para lo que no tiene marca: no se le cambia el nombre'
      using errcode = 'check_violation';
  end if;
  v := public._nombre_de_producto_catalogo(p_nombre, 'marca');
  select nombre into v_otra from marcas
   where nombre_norm = public.normalizar_codigo(v) and id <> p_id;
  if v_otra is not null then
    raise exception 'Ya hay una marca «%»', v_otra using errcode = 'unique_violation';
  end if;
  update marcas set nombre = v where id = p_id;
  return (select jsonb_build_object('id', id, 'nombre', nombre, 'codigo', nombre_norm, 'activo', activo)
            from marcas where id = p_id);
end $$;

create or replace function public.cambiar_activo_marca(p_id uuid, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_norm text;
begin
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar marcas' using errcode = 'insufficient_privilege';
  end if;
  if p_activo is null then
    raise exception 'Falta decir si se da de alta o de baja' using errcode = 'invalid_parameter_value';
  end if;
  select nombre_norm into v_norm from marcas where id = p_id for update;
  if not found then
    raise exception 'Esa marca ya no existe' using errcode = 'no_data_found';
  end if;
  if v_norm = 'SINMARCA' and not p_activo then
    raise exception '«SIN MARCA» la usa el sistema para lo que no tiene marca: no se da de baja'
      using errcode = 'check_violation';
  end if;
  update marcas set activo = p_activo where id = p_id;
  -- Los productos NO se tocan: siguen con su marca. Se devuelve cuántos tiene
  -- para que la pantalla lo diga.
  return (select jsonb_build_object(
            'id', m.id, 'nombre', m.nombre, 'activo', m.activo,
            'productos', (select count(*) from productos p where p.marca_id = m.id and not p.archivado))
            from marcas m where m.id = p_id);
end $$;

create or replace function public.renombrar_familia(p_id uuid, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text; v_otra text; v_actual text;
begin
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar familias' using errcode = 'insufficient_privilege';
  end if;
  select nombre_norm into v_actual from familias where id = p_id for update;
  if not found then
    raise exception 'Esa familia ya no existe' using errcode = 'no_data_found';
  end if;
  if v_actual = public.normalizar_codigo('OTROS') then
    raise exception '«OTROS» la usa el sistema para los productos no registrados: no se le cambia el nombre'
      using errcode = 'check_violation';
  end if;
  v := public._nombre_de_producto_catalogo(p_nombre, 'familia');
  select nombre into v_otra from familias
   where nombre_norm = public.normalizar_codigo(v) and id <> p_id;
  if v_otra is not null then
    raise exception 'Ya hay una familia «%»', v_otra using errcode = 'unique_violation';
  end if;
  -- El `codigo` NO cambia: es la clave estable (los kits buscan la familia
  -- por `codigo = 'KITS'`, 085) y nadie lo ve.
  update familias set nombre = v where id = p_id;
  return (select jsonb_build_object('id', id, 'nombre', nombre, 'codigo', codigo) from familias where id = p_id);
end $$;

create or replace function public.renombrar_subfamilia(p_id uuid, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text; v_otra text; v_actual text; v_familia uuid;
begin
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar sub-familias' using errcode = 'insufficient_privilege';
  end if;
  select nombre_norm, familia_id into v_actual, v_familia from subfamilias where id = p_id for update;
  if not found then
    raise exception 'Esa sub-familia ya no existe' using errcode = 'no_data_found';
  end if;
  if v_actual = public.normalizar_codigo('POR CLASIFICAR') then
    raise exception '«POR CLASIFICAR» la usa el sistema para los productos no registrados: no se le cambia el nombre'
      using errcode = 'check_violation';
  end if;
  v := public._nombre_de_producto_catalogo(p_nombre, 'sub-familia');
  -- Dentro de su familia, como el alta (028): dos familias pueden tener una
  -- sub-familia que se llame igual.
  select nombre into v_otra from subfamilias
   where familia_id = v_familia and nombre_norm = public.normalizar_codigo(v) and id <> p_id;
  if v_otra is not null then
    raise exception 'Ya hay una sub-familia «%» en esa familia', v_otra using errcode = 'unique_violation';
  end if;
  update subfamilias set nombre = v where id = p_id;
  return (select jsonb_build_object('id', id, 'nombre', nombre, 'codigo', codigo) from subfamilias where id = p_id);
end $$;

revoke execute on function public.renombrar_marca(uuid, text) from anon, public;
revoke execute on function public.cambiar_activo_marca(uuid, boolean) from anon, public;
revoke execute on function public.renombrar_familia(uuid, text) from anon, public;
revoke execute on function public.renombrar_subfamilia(uuid, text) from anon, public;
revoke execute on function public._nombre_de_producto_catalogo(text, text) from anon, public;
grant execute on function public.renombrar_marca(uuid, text) to authenticated;
grant execute on function public.cambiar_activo_marca(uuid, boolean) to authenticated;
grant execute on function public.renombrar_familia(uuid, text) to authenticated;
grant execute on function public.renombrar_subfamilia(uuid, text) to authenticated;
grant execute on function public._nombre_de_producto_catalogo(text, text) to authenticated;

-- ─────────────────────────────────── 2 · Deshacer los precios en orden ──────
--
-- Se reescribe entera y no con un parche: es de la 155, de veinte líneas, y
-- ninguna migración posterior la toca (comprobado con grep el 27/10).

create or replace function public.deshacer_cambio_precios(p_cambio bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_n int; v_saltados int; v_marca uuid; v_posterior timestamptz;
begin
  if not public.puede('productos', 'editar') then
    raise exception 'Tu rol no puede cambiar precios' using errcode = 'insufficient_privilege';
  end if;
  select marca_id into v_marca from cambios_precio
   where id = p_cambio and deshecho_en is null for update;
  if not found then
    raise exception 'Ese cambio no existe o ya se deshizo' using errcode = 'check_violation';
  end if;

  -- Uno posterior de la misma marca que todavía tiene precios suyos puestos
  -- va primero: deshacer este por debajo no devolvería nada (QA-08).
  select c.creado_en into v_posterior
    from cambios_precio c
   where c.marca_id = v_marca and c.id > p_cambio and c.deshecho_en is null
     and exists (select 1 from cambios_precio_items i join productos p on p.id = i.producto_id
                  where i.cambio_id = c.id and p.precio_venta = i.venta_despues)
   order by c.id desc limit 1;
  if v_posterior is not null then
    raise exception 'Deshaz primero el del %',
      to_char(v_posterior at time zone 'America/Lima', 'DD/MM HH24:MI')
      using errcode = 'check_violation';
  end if;

  -- Solo los que siguen con el precio que les puso el cambio.
  update productos p
     set precio_venta = i.venta_antes,
         precio_minimo = case when i.minimo_despues is not null then i.minimo_antes else p.precio_minimo end,
         actualizado_en = now()
    from cambios_precio_items i
   where i.cambio_id = p_cambio and i.producto_id = p.id and p.precio_venta = i.venta_despues;
  get diagnostics v_n = row_count;
  select count(*) - v_n into v_saltados from cambios_precio_items where cambio_id = p_cambio;

  -- Sin ningún precio devuelto no se marca: «deshecho» tiene que querer decir
  -- que los precios volvieron.
  if v_n > 0 then
    update cambios_precio set deshecho_en = now(), deshecho_por = auth.uid() where id = p_cambio;
  end if;
  return jsonb_build_object('devueltos', v_n, 'respetados', v_saltados, 'deshecho', v_n > 0);
end $$;

revoke execute on function public.deshacer_cambio_precios(bigint) from anon, public;
grant execute on function public.deshacer_cambio_precios(bigint) to authenticated;

-- ─────────────────────────────────────────────────────────── Centinela ──────
-- EJECUTA cada función como gerencia —y el candado como un rol sin permiso—,
-- y lo deshace todo saliendo por excepción.
do $$
declare
  v_usr uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  -- Un perfil activo cuyo rol NO puede editar productos, si lo hay.
  v_sin uuid := (select pf.id from perfiles pf
                  where pf.activo and pf.rol::text <> 'gerencia'
                    and not exists (select 1 from permisos pm
                                     where pm.rol = pf.rol::text and pm.modulo = 'productos' and pm.accion = 'editar')
                  order by pf.creado_en limit 1);
  v_m1 uuid; v_m2 uuid; v_m2nombre text; v_sin_marca uuid;
  v_f uuid; v_s uuid; v_s2nombre text;
  v_marca uuid; v_p uuid; v_antes numeric; r jsonb; a bigint; b bigint; v_ok boolean;
  v_ser_antes text; v_ser_despues text;
begin
  if v_usr is null then raise notice '160: no hay gerencia activa; se salta.'; return; end if;
  select string_agg(serie || ':' || coalesce(correlativo_actual::text, ''), ',' order by serie)
    into v_ser_antes from series_documento;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- ── Marcas ──
    select id into v_m1 from marcas where nombre_norm <> 'SINMARCA' order by nombre limit 1;
    select id, nombre into v_m2, v_m2nombre from marcas where nombre_norm <> 'SINMARCA' and id <> v_m1 order by nombre limit 1;
    select id into v_sin_marca from marcas where nombre_norm = 'SINMARCA';

    r := public.renombrar_marca(v_m1, '  zz   centinela 160 ');
    if (select nombre from marcas where id = v_m1) <> 'ZZ CENTINELA 160' then
      raise exception '160: renombrar_marca no dejó el nombre limpio: %', r;
    end if;

    v_ok := false;
    begin perform public.renombrar_marca(v_m1, lower(v_m2nombre));
    exception when unique_violation then v_ok := true; end;
    if not v_ok then raise exception '160: renombrar_marca aceptó un nombre repetido'; end if;

    if v_sin_marca is not null then
      v_ok := false;
      begin perform public.renombrar_marca(v_sin_marca, 'OTRA COSA');
      exception when check_violation then v_ok := true; end;
      if not v_ok then raise exception '160: dejó renombrar SIN MARCA'; end if;
    end if;

    r := public.cambiar_activo_marca(v_m1, false);
    if (select activo from marcas where id = v_m1) then raise exception '160: no dio de baja la marca'; end if;
    -- `crear_marca` con el mismo nombre la reactiva: es como se vuelve atrás.
    r := public.crear_marca('zz centinela 160');
    if not (select activo from marcas where id = v_m1) or (r ->> 'id')::uuid <> v_m1 then
      raise exception '160: crear_marca no reactivó la marca dada de baja: %', r;
    end if;

    -- ── Familias y sub-familias ──
    select id into v_f from familias where nombre_norm <> public.normalizar_codigo('OTROS') order by orden, nombre limit 1;
    perform public.renombrar_familia(v_f, 'zz familia 160');
    if (select nombre from familias where id = v_f) <> 'ZZ FAMILIA 160' then
      raise exception '160: renombrar_familia no cambió el nombre';
    end if;

    select s.id into v_s from subfamilias s
     where s.nombre_norm <> public.normalizar_codigo('POR CLASIFICAR')
       and (select count(*) from subfamilias x where x.familia_id = s.familia_id) > 1
     order by s.orden, s.nombre limit 1;
    if v_s is not null then
      perform public.renombrar_subfamilia(v_s, 'zz sub 160');
      if (select nombre from subfamilias where id = v_s) <> 'ZZ SUB 160' then
        raise exception '160: renombrar_subfamilia no cambió el nombre';
      end if;
      select x.nombre into v_s2nombre from subfamilias x, subfamilias s
       where s.id = v_s and x.familia_id = s.familia_id and x.id <> s.id limit 1;
      v_ok := false;
      begin perform public.renombrar_subfamilia(v_s, v_s2nombre);
      exception when unique_violation then v_ok := true; end;
      if not v_ok then raise exception '160: renombrar_subfamilia aceptó un nombre repetido en su familia'; end if;
    end if;

    -- ── Deshacer en orden (QA-08) ──
    select p.marca_id, p.id, p.precio_venta into v_marca, v_p, v_antes
      from productos p where not p.archivado and p.precio_venta > 0 order by p.codigo limit 1;
    if v_marca is not null then
      a := (public.cambiar_precios_por_marca(v_marca, 10, true) ->> 'cambio_id')::bigint;
      b := (public.cambiar_precios_por_marca(v_marca, 10, true) ->> 'cambio_id')::bigint;

      v_ok := false;
      begin perform public.deshacer_cambio_precios(a);
      exception when check_violation then
        v_ok := sqlerrm like 'Deshaz primero el del %';
      end;
      if not v_ok then raise exception '160: dejó deshacer A con B encima'; end if;
      if (select deshecho_en from cambios_precio where id = a) is not null then
        raise exception '160: A quedó marcado como deshecho';
      end if;

      perform public.deshacer_cambio_precios(b);
      perform public.deshacer_cambio_precios(a);
      if (select precio_venta from productos where id = v_p) <> v_antes then
        raise exception '160: deshacer B y luego A no devolvió el precio original';
      end if;

      -- Sin nada que devolver, no se marca.
      a := (public.cambiar_precios_por_marca(v_marca, 10, true) ->> 'cambio_id')::bigint;
      perform set_config('role', 'postgres', true);
      update productos p set precio_venta = i.venta_despues + 1
        from cambios_precio_items i where i.cambio_id = a and i.producto_id = p.id;
      perform set_config('role', 'authenticated', true);
      r := public.deshacer_cambio_precios(a);
      if (r ->> 'devueltos')::int <> 0 or (r ->> 'deshecho')::boolean
         or (select deshecho_en from cambios_precio where id = a) is not null then
        raise exception '160: marcó deshecho un cambio que no devolvió nada: %', r;
      end if;
    else
      raise notice '160: no hay productos con precio; se salta la prueba de deshacer.';
    end if;

    -- ── El candado ──
    if v_sin is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', v_sin, 'role', 'authenticated')::text, true);
      v_ok := false;
      begin perform public.renombrar_marca(v_m2, 'NO DEBERIA');
      exception when insufficient_privilege then v_ok := true; end;
      if not v_ok then raise exception '160: un rol sin permiso renombró una marca'; end if;
    end if;

    perform set_config('role', 'postgres', true);
    raise exception '__160_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__160_DESHACER__' then raise; end if;
  end;

  if (select nombre from marcas where id = v_m1) = 'ZZ CENTINELA 160' then
    raise exception '160: el centinela no deshizo el renombrado';
  end if;
  select string_agg(serie || ':' || coalesce(correlativo_actual::text, ''), ',' order by serie)
    into v_ser_despues from series_documento;
  if v_ser_antes is distinct from v_ser_despues then
    raise exception '160: se movió un correlativo';
  end if;
  raise notice '160: marcas, familias y sub-familias se corrigen; los precios se deshacen en orden.';
end $$;
