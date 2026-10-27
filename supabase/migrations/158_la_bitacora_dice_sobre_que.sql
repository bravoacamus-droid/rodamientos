-- ###########################################################################
-- 158 · LA BITÁCORA DICE SOBRE QUÉ (27/10)
-- ###########################################################################
--
-- La auditoría de trazabilidad del 27/10 leyó «Qué ha pasado» como la leería
-- Willy, y la bitácora contestaba «quién» y «cuándo» pero no «sobre qué».
--
-- 1 · **Ninguna fila decía de qué documento o de qué persona era.** `tg_bitacora`
--     (051, retocado en la 145) guarda el id y los campos que cambiaron, nada
--     más. Un alta decía «Se creó» y un borrado «Se borró», sin número. Dar de
--     baja a un usuario dejaba «perfiles · activo: true → false», sin decir a
--     quién: seis filas seguidas de «Willy Fernández · Usuarios · Rol: gerencia
--     → ventas» y no se sabía de quién. Cambiar el inicial de una serie dejaba
--     «correlativo_inicial: 1 → 2», sin decir que era F002. En los borrados el
--     número SÍ estaba, dentro de `metadata.antes`, y la pantalla ni siquiera
--     pedía `metadata`.
--     Arreglo: `actividad.referencia`, el número o el nombre de lo que se tocó
--     (`F002-00000356`, `PED-26-00014`, `Juan Pérez`, `F002`, el código del
--     producto). La rellena un disparador BEFORE INSERT en la propia
--     `actividad`, y no `tg_bitacora`: así la llevan también las filas de
--     `tg_bitacora_permisos` (roles y permisos) y cualquier otra que escriba
--     mañana alguien que no se acuerde. En un alta o un cambio se lee la fila
--     viva (el disparador de la bitácora es AFTER, así que ya está); en un
--     borrado, `metadata.antes`, que es lo único que queda. Las 10 114 filas
--     viejas se rellenan con la misma función.
--
-- 2 · **Eliminar un pedido, emitir o anular una guía y borrar un cobro no
--     dejaban rastro propio.** `pedidos`, `guias_remision`, `pagos` y
--     `sunat_bajas` no tenían `tg_bitacora`. Ejecutado y deshecho:
--     `eliminar_pedido` dejaba solo «cotizaciones · estado: aprobada →
--     enviada», sin el número del pedido; borrar un cobro dejaba «comprobantes
--     · estado: parcial → emitido», sin monto ni que fue un cobro.
--     Arreglo: se enganchan las cuatro. Los cobros solo al crearse y al
--     borrarse (de un cobro solo cambia el voucher, 109), con el monto y la
--     forma de pago en la descripción y el comprobante en `metadata`, para que
--     la fila lleve a su factura. `pedidos` no tiene columna `estado` —se lee
--     de sus documentos—, así que solo se apunta cuándo nace y cuándo se borra.
--     Y dos argumentos vigilaban columnas que no existen y no apuntaban nada:
--     `ajustes_inventario.estado` (es `anulado`) y `recepciones.total`.
--
-- 3 · **La política DELETE de `pagos` dejaba borrar un cobro por PostgREST** a
--     quien tuviera cobranzas/eliminar, y ninguna pantalla lo hace: los cobros
--     se escriben solo por `registrar_pagos` (145). Se quita; sin política,
--     nadie con sesión borra un cobro. Y `tg_pagos_solo_voucher` decía
--     «anúlalo y regístralo otra vez», cuando no existe ninguna forma de anular
--     un cobro: ahora dice lo que sí se puede hacer.
--
-- 4 · **La bitácora la leía cualquiera con sesión.** Desde la 143 hay permiso
--     «Qué ha pasado › Ver», y la pantalla lo respetaba pero la tabla no: un
--     GET a /rest/v1/actividad la devolvía entera. Ahora pide ese permiso.
--
-- Centinela: EJECUTA un pedido nacido y eliminado, un cobro registrado y
-- borrado, y una baja de usuario, comprueba que cada una deja su fila con su
-- referencia, y lo deshace todo.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · La columna y cómo se rellena
-- ---------------------------------------------------------------------------
alter table public.actividad add column if not exists referencia text;

comment on column public.actividad.referencia is
  'El número o el nombre de lo que se tocó (F002-00000356, PED-26-00014, Juan Pérez). Lo rellena tg_actividad_referencia (158).';

-- El nombre que se le da a una fila, según su tabla. Lo genérico es el número;
-- donde el número no dice nada se usa lo que se lee (el nombre de un cliente y
-- no su código interno, el banco y la cuenta y no solo la cuenta).
create or replace function public._referencia_de(p_tabla text, p_fila jsonb)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select nullif(btrim(case p_tabla
    -- Un cobro se busca por su factura: «F002-00000356» encuentra sus cobros.
    when 'pagos' then coalesce(
      (select c.numero from comprobantes c where c.id = public._uuid_o_nulo(p_fila ->> 'comprobante_id')),
      p_fila ->> 'referencia')
    when 'clientes' then coalesce(p_fila ->> 'razon_social', p_fila ->> 'numero_documento')
    when 'proveedores' then coalesce(p_fila ->> 'razon_social', p_fila ->> 'numero_documento')
    when 'productos' then p_fila ->> 'codigo'
    when 'perfiles' then coalesce(p_fila ->> 'nombre', p_fila ->> 'email')
    when 'cuentas_bancarias' then concat_ws(' ', p_fila ->> 'banco', p_fila ->> 'numero')
    when 'sunat_bajas' then p_fila ->> 'identificador'
    when 'roles' then coalesce(
      (select r.nombre from roles r where r.clave = p_fila ->> 'clave'), p_fila ->> 'nombre')
    when 'permisos' then coalesce(
      (select r.nombre from roles r where r.clave = p_fila ->> 'rol'), p_fila ->> 'rol')
    when 'permisos_rol' then coalesce(
      (select r.nombre from roles r where r.clave = p_fila ->> 'rol'), p_fila ->> 'rol')
    else coalesce(p_fila ->> 'numero', p_fila ->> 'serie', p_fila ->> 'codigo',
                  p_fila ->> 'razon_social', p_fila ->> 'nombre', p_fila ->> 'ruc')
  end), '')
$$;

revoke all on function public._referencia_de(text, jsonb) from public, anon, authenticated;

-- La referencia de UNA fila de la bitácora: lo vivo si existe, lo de antes si
-- se borró. Las tablas van por lista y no por `to_regclass`: el `execute`
-- lleva el nombre dentro y no tiene que aceptar cualquier cosa.
create or replace function public._referencia_de_actividad(
  p_entidad text, p_entidad_id uuid, p_accion text, p_metadata jsonb)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_fila jsonb;
begin
  if p_accion = 'borrado' then
    v_fila := nullif(p_metadata -> 'antes', '{}'::jsonb);
  elsif p_entidad_id is not null and p_entidad = any (array[
      'comprobantes', 'cotizaciones', 'compras', 'recepciones', 'ajustes_inventario',
      'perfiles', 'clientes', 'proveedores', 'productos', 'cuentas_bancarias',
      'series_documento', 'pedidos', 'guias_remision', 'pagos', 'sunat_bajas']) then
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_entidad)
      into v_fila using p_entidad_id;
  end if;

  -- Roles y permisos no tienen id: su fila va en `metadata` (145).
  if v_fila is null then
    v_fila := coalesce(nullif(p_metadata -> 'despues', '{}'::jsonb),
                       nullif(p_metadata -> 'antes', '{}'::jsonb));
  end if;
  if v_fila is null or jsonb_typeof(v_fila) <> 'object' then return null; end if;

  return public._referencia_de(p_entidad, v_fila);
end $$;

revoke all on function public._referencia_de_actividad(text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.tg_actividad_referencia()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pago jsonb;
begin
  if new.referencia is null then
    new.referencia := public._referencia_de_actividad(new.entidad, new.entidad_id, new.accion, new.metadata);
  end if;

  -- Un cobro dice cuánto y cómo, y lleva a su factura. `tg_bitacora` solo
  -- apunta «Se creó» / «Se borró», que de un cobro no dice nada.
  if new.entidad = 'pagos' and new.accion in ('creado', 'borrado') then
    if new.accion = 'borrado' then
      v_pago := new.metadata -> 'antes';
    else
      select to_jsonb(p) into v_pago from pagos p where p.id = new.entidad_id;
    end if;
    if v_pago is not null then
      new.descripcion := format('monto: %s · medio: %s',
        to_char((v_pago ->> 'monto')::numeric, 'FM999999990.00'),
        coalesce(v_pago ->> 'medio', '—'));
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object('comprobante_id', v_pago ->> 'comprobante_id');
    end if;
  end if;

  return new;
end $$;

revoke all on function public.tg_actividad_referencia() from public, anon, authenticated;

drop trigger if exists tg_actividad_referencia on public.actividad;
create trigger tg_actividad_referencia
  before insert on public.actividad
  for each row execute function public.tg_actividad_referencia();

-- Las filas que ya estaban. Es una columna nueva de la bitácora, derivada de
-- lo que ya guardaba: no cambia lo que dice ninguna fila.
update public.actividad a
   set referencia = public._referencia_de_actividad(a.entidad, a.entidad_id, a.accion, a.metadata)
 where a.referencia is null;

-- El alta y los cambios de algo que después se borró: la fila viva ya no
-- está, pero su borrado guardó el número. De aquí en adelante no hace falta,
-- porque la referencia se escribe cuando la fila todavía existe.
update public.actividad a
   set referencia = b.referencia
  from public.actividad b
 where a.referencia is null
   and b.accion = 'borrado' and b.referencia is not null
   and b.entidad = a.entidad and b.entidad_id = a.entidad_id;

-- ---------------------------------------------------------------------------
-- 2 · Las tablas que faltaban, y los argumentos que no vigilaban nada
-- ---------------------------------------------------------------------------
-- `pedidos` no tiene `estado`: se apunta cuándo nace y cuándo se elimina.
drop trigger if exists tg_bitacora_pedidos on public.pedidos;
create trigger tg_bitacora_pedidos after insert or delete on public.pedidos
  for each row execute function public.tg_bitacora();

-- Emitir una guía mueve stock; anularla lo devuelve.
drop trigger if exists tg_bitacora_guias_remision on public.guias_remision;
create trigger tg_bitacora_guias_remision after insert or update or delete on public.guias_remision
  for each row execute function public.tg_bitacora('estado', 'estado_sunat', 'motivo_anulacion');

-- De un cobro solo cambia el voucher (109), y eso no es de la bitácora.
drop trigger if exists tg_bitacora_pagos on public.pagos;
create trigger tg_bitacora_pagos after insert or delete on public.pagos
  for each row execute function public.tg_bitacora();

drop trigger if exists tg_bitacora_sunat_bajas on public.sunat_bajas;
create trigger tg_bitacora_sunat_bajas after insert or update or delete on public.sunat_bajas
  for each row execute function public.tg_bitacora('estado', 'codigo');

-- 051 vigilaba `ajustes_inventario.estado`, que no existe: es `anulado`.
drop trigger if exists tg_bitacora_ajustes_inventario on public.ajustes_inventario;
create trigger tg_bitacora_ajustes_inventario after insert or update or delete on public.ajustes_inventario
  for each row execute function public.tg_bitacora('anulado');

-- Y `recepciones.total`, que tampoco existe.
drop trigger if exists tg_bitacora_recepciones on public.recepciones;
create trigger tg_bitacora_recepciones after insert or update or delete on public.recepciones
  for each row execute function public.tg_bitacora('anulada');

-- ---------------------------------------------------------------------------
-- 3 · Un cobro no se borra por PostgREST, y el mensaje dice la verdad
-- ---------------------------------------------------------------------------
drop policy if exists "escritura_delete" on public.pagos;

do $$
declare
  v_def text;
  v_viejo text := $a$'Un cobro no se corrige a mano: anúlalo y regístralo otra vez.'$a$;
begin
  v_def := replace(pg_get_functiondef('public.tg_pagos_solo_voucher()'::regprocedure), E'\r\n', E'\n');
  if position('158: un cobro no se cambia' in v_def) > 0 then return; end if;
  if position(v_viejo in v_def) = 0 then
    raise exception '158: no encontré el mensaje de tg_pagos_solo_voucher';
  end if;
  -- No existe forma de anular un cobro: el mensaje no puede mandar a hacerlo.
  v_def := replace(v_def, v_viejo,
    $a$'Un cobro ya apuntado no se puede cambiar: solo se le sube o se le cambia el voucher. Si se apuntó mal, avisa a gerencia.' -- 158: un cobro no se cambia$a$);
  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · La bitácora la lee quien tiene «Qué ha pasado › Ver»
-- ---------------------------------------------------------------------------
drop policy if exists "lectura_autenticados" on public.actividad;
create policy "lectura_autenticados" on public.actividad
  for select to authenticated
  using ((select public.puede('bitacora', 'ver')));

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA cada arreglo y lo deshace (CLAUDE.md §2)
-- ---------------------------------------------------------------------------
do $$
declare
  v_usr  uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_otro uuid;
  v_otro_nombre text;
  v_cli  uuid; v_p uuid; v_cot uuid; v_ped uuid; v_ped_num text; v_fac uuid; v_fac_num text; v_pago uuid;
  r      jsonb;
  v_n    int;
  v_ok   boolean;
  v_series text := (select string_agg(serie || ':' || correlativo_actual, ',' order by serie) from series_documento);
begin
  -- Las filas viejas: un borrado de compra sin referencia es lo que había.
  select count(*) into v_n from actividad
   where accion = 'borrado' and entidad in ('compras', 'cotizaciones', 'recepciones', 'comprobantes')
     and referencia is null;
  if v_n > 0 then raise exception '158: % borrados viejos se quedaron sin número', v_n; end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- La bitácora se lee con el permiso, y gerencia lo tiene.
    if not exists (select 1 from actividad limit 1) then
      raise exception '158: gerencia no ve la bitácora';
    end if;

    -- 2 · Un pedido que nace y se elimina.
    select id into v_cli from clientes where tipo_documento = 'RUC' order by creado_en limit 1;
    select id into v_p from productos where not archivado and not es_kit and unidad_codigo = 'NIU'
     order by codigo limit 1;
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', v_p, 'orden', 1,
             'codigo', 'C158', 'descripcion', 'Centinela 158', 'cantidad', 1,
             'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 2))));
    v_cot := (r ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    select id, numero into v_ped, v_ped_num from pedidos where cotizacion_id = v_cot;
    if v_ped is null then raise exception '158: aprobar no creó pedido'; end if;
    perform public.eliminar_pedido(v_ped);

    if not exists (select 1 from actividad where entidad = 'pedidos' and entidad_id = v_ped
                     and accion = 'creado' and referencia = v_ped_num and usuario_id = v_usr) then
      raise exception '158: el pedido % nació sin dejar fila con su número', v_ped_num;
    end if;
    if not exists (select 1 from actividad where entidad = 'pedidos' and entidad_id = v_ped
                     and accion = 'borrado' and referencia = v_ped_num and usuario_id = v_usr) then
      raise exception '158: eliminar el pedido % no dejó fila con su número', v_ped_num;
    end if;

    -- 2 · Un cobro: se registra, no se cambia ni se borra con sesión, y su
    -- borrado (por SQL) queda apuntado con monto y factura.
    select id, numero into v_fac, v_fac_num from comprobantes
     where tipo = 'factura' and estado in ('emitido', 'vencido') and saldo > 5
     order by fecha_emision desc limit 1;
    if v_fac is null then raise exception '158: no hay ninguna factura con saldo para probar'; end if;
    perform public.registrar_pagos(jsonb_build_array(jsonb_build_object(
      'comprobante_id', v_fac, 'monto', 1.5, 'medio', 'efectivo', 'fecha', current_date)));
    select id into v_pago from pagos where comprobante_id = v_fac order by creado_en desc limit 1;
    if not exists (select 1 from actividad where entidad = 'pagos' and entidad_id = v_pago
                     and accion = 'creado' and referencia = v_fac_num
                     and descripcion = 'monto: 1.50 · medio: efectivo'
                     and metadata ->> 'comprobante_id' = v_fac::text) then
      raise exception '158: el cobro de % no dejó su fila (monto, medio y factura)', v_fac_num;
    end if;

    v_ok := false;
    begin
      update pagos set monto = 2 where id = v_pago;
    exception when insufficient_privilege then v_ok := sqlerrm like '%solo se le sube o se le cambia el voucher%';
    end;
    if not v_ok then raise exception '158: cambiar un cobro no dio el mensaje nuevo'; end if;

    delete from pagos where id = v_pago;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception '158: un usuario con sesión borró un cobro por PostgREST'; end if;

    perform set_config('role', 'postgres', true);
    delete from pagos where id = v_pago;
    if not exists (select 1 from actividad where entidad = 'pagos' and entidad_id = v_pago
                     and accion = 'borrado' and referencia = v_fac_num
                     and descripcion = 'monto: 1.50 · medio: efectivo') then
      raise exception '158: borrar el cobro de % no dejó fila con monto y factura', v_fac_num;
    end if;

    -- 1 · Dar de baja a un usuario dice a quién.
    select id, nombre into v_otro, v_otro_nombre from perfiles
     where activo and id <> v_usr order by creado_en limit 1;
    update perfiles set activo = false where id = v_otro;
    if not exists (select 1 from actividad where entidad = 'perfiles' and entidad_id = v_otro
                     and accion = 'cambiado' and referencia = v_otro_nombre
                     and descripcion = 'activo: true → false') then
      raise exception '158: la baja de % no dice a quién', v_otro_nombre;
    end if;

    -- 2 · Los cuatro disparadores de columnas: se cambia la columna vigilada
    -- y se mira la fila. Vigilar una columna que no existe no da error, solo
    -- silencio (051 con `estado` y `total`), y eso solo lo ve un centinela
    -- que cambia el valor.
    update guias_remision set motivo_anulacion = 'Centinela 158'
     where id = (select id from guias_remision order by creado_en limit 1)
    returning numero into v_ped_num;
    if v_ped_num is not null and not exists (
         select 1 from actividad where entidad = 'guias_remision' and accion = 'cambiado'
            and referencia = v_ped_num and descripcion like 'motivo_anulacion:%') then
      raise exception '158: cambiar la guía % no dejó fila', v_ped_num;
    end if;

    update recepciones set anulada = true
     where id = (select id from recepciones where not anulada order by creado_en limit 1)
    returning numero into v_ped_num;
    if v_ped_num is not null and not exists (
         select 1 from actividad where entidad = 'recepciones' and accion = 'cambiado'
            and referencia = v_ped_num and descripcion = 'anulada: false → true') then
      raise exception '158: anular la recepción % no dejó fila', v_ped_num;
    end if;

    insert into ajustes_inventario (numero, motivo, usuario_id)
    values ('AJU-C158', 'Centinela 158', v_usr) returning id into v_cot;
    update ajustes_inventario set anulado = true where id = v_cot;
    if not exists (select 1 from actividad where entidad = 'ajustes_inventario' and entidad_id = v_cot
                     and accion = 'cambiado' and referencia = 'AJU-C158'
                     and descripcion = 'anulado: false → true') then
      raise exception '158: anular un ajuste no dejó fila';
    end if;

    insert into sunat_bajas (fecha_comunicacion, correlativo, identificador, fecha_documentos, comprobantes)
    values (current_date, 99158, 'RA-C158', current_date, array[v_fac]) returning id into v_cot;
    update sunat_bajas set estado = 'aceptada', codigo = '0' where id = v_cot;
    if not exists (select 1 from actividad where entidad = 'sunat_bajas' and entidad_id = v_cot
                     and accion = 'cambiado' and referencia = 'RA-C158'
                     and descripcion like '%estado: enviada → aceptada%') then
      raise exception '158: la respuesta de SUNAT a una baja no dejó fila';
    end if;

    -- 4 · Sin el permiso no se lee: un rol sin «bitacora/ver».
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select p.id from perfiles p
                                 where p.rol <> 'gerencia' and not exists (
                                   select 1 from permisos x where x.rol = p.rol::text
                                      and x.modulo = 'bitacora' and x.accion = 'ver')
                                 limit 1), 'role', 'authenticated')::text, true);
    if (select current_setting('request.jwt.claims', true)::jsonb ->> 'sub') is not null then
      perform set_config('role', 'authenticated', true);
      if exists (select 1 from actividad limit 1) then
        raise exception '158: un rol sin «Qué ha pasado» lee la bitácora';
      end if;
      perform set_config('role', 'postgres', true);
    end if;

    perform set_config('role', 'postgres', true);
    raise exception '__158_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__158_DESHACER__' then raise; end if;
  end;
  -- La cotización de prueba gastó un correlativo; al deshacer, vuelve.
  if v_series is distinct from (select string_agg(serie || ':' || correlativo_actual, ',' order by serie)
                                  from series_documento) then
    raise exception '158: el centinela movió las series';
  end if;
  raise notice '158: cada fila dice sobre qué; pedido, cobro, baja de usuario, guía, recepción, ajuste y baja en SUNAT quedan apuntados; un cobro no se borra con sesión; la bitácora pide su permiso.';
end $$;
