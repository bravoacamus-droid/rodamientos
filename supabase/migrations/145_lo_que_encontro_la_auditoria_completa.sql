-- ###########################################################################
-- 145 · LO QUE ENCONTRÓ LA AUDITORÍA DE PUNTA A PUNTA (21/10)
-- ###########################################################################
--
-- Dos agentes recorrieron el ERP entero el 21/10, uno por la base y otro por
-- la pantalla. Lo que la base tiene que arreglar está aquí. Cada punto lleva
-- la marca del reporte (C = crítico, A = alto, M = medio):
--
-- C1 · **Quien se registraba elegía su rol.** `manejar_usuario_nuevo` tomaba
--      el rol de `raw_user_meta_data`, y esa la escribe quien se registra.
--      Con el registro público abierto, cualquiera nacía gerencia ACTIVA.
--      Ahora el rol sale de `raw_app_meta_data`, que solo escribe la clave de
--      servicio (el alta de Usuarios la manda desde hoy). Sin ella, el perfil
--      nace INACTIVO: entra a la pantalla de «cuenta desactivada» y nada más.
--
-- A1 · **Diecisiete lecturas no preguntaban quién llama.** Eran `security
--      definer` y se saltaban RLS: un usuario dado de baja, o una sesión sin
--      perfil, se bajaba el catálogo con costos, la cartera de clientes y las
--      ventas. Pasan a `security invoker`. Se comprobó antes de escribir esto
--      (simulándolo como ventas y deshaciéndolo): para un usuario activo las
--      diecisiete devuelven EXACTAMENTE lo mismo, porque toda la lectura es
--      `mi_rol() is not null`.
--
-- A2 · **Borrar sin «Eliminar».** La 144 cerró las funciones que borran y
--      dejó abiertas las políticas: con «Crear» o «Editar» se borraba por
--      PostgREST una cotización aprobada y su pedido en cascada. Las tablas
--      cabecera piden ahora `puede_eliminar(tabla)`. Las de detalle siguen con
--      escribir: corregir una cotización borra líneas, y eso es editar.
--
-- A3 · **Un vendedor daba por cobrada una factura.** `pagos` se escribía
--      directo: un INSERT por el saldo, o un UPDATE del monto a 0,01. Ahora
--      el cobro entra solo por `registrar_pagos`, que comprueba que el
--      documento existe, no está anulado y no se le cobra más que su saldo.
--      Por fuera solo se puede colgar el voucher.
--
-- M1 · La casilla de «descargar stock» que se retiró de la factura seguía
--      viva en `emitir_comprobante`: mandarla restaba el stock otra vez, que
--      ya salió con la guía (CLAUDE.md §6). Se ignora.
-- M2 · `emitir_comprobante` se fiaba del llamador en tres cosas: la guía
--      declarada podía estar ya facturada (facturar sin guía, reusando una
--      vieja), la nota no comprobaba su documento ni tenía tope, y la fecha
--      podía ser cualquiera. El costo de la línea y el vendedor SÍ siguen
--      viniendo de fuera, y no es un descuido: el costo es el del «Analizar
--      precio de compra» de la cotización (§BC), que no está en el producto,
--      y el vendedor es el de la cotización.
-- M3 · La bitácora se falsificaba: cualquiera escribía «Willy anuló…» con
--      fecha de hace tres días. Solo escriben en ella las funciones.
-- M4 · Las cuotas de una factura emitida se cambiaban a mano. Ahora solo
--      por función, como `comprobantes` (137).
-- M6 · Con «configuración: editar» se ponía una serie de prueba como real
--      (y se saltaba el candado de la 093) o se bajaba su correlativo (y se
--      repetían números fiscales). Esos dos campos, solo por función.
-- M8 · Cambiar la cuenta que se imprime en cada cotización no dejaba rastro,
--      y es el fraude de manual. Pasan por la bitácora las cuentas, la
--      empresa, las series, SUNAT, los roles y los permisos.
--
-- Y dos de la lista baja: «Anular» una cotización pide «Eliminar» (lo dice la
-- propia pantalla de permisos), y `authenticated` pierde TRUNCATE.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- C1 · El rol lo pone la clave de servicio, no quien se registra
-- ---------------------------------------------------------------------------
create or replace function public.manejar_usuario_nuevo()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_rol text := new.raw_app_meta_data ->> 'rol';
  v_valido boolean := v_rol is not null and exists (select 1 from public.roles r where r.clave = v_rol);
begin
  insert into public.perfiles (id, nombre, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when v_valido then v_rol::rol_usuario else 'ventas' end,
    -- Sin rol puesto por el servidor, la cuenta no la dio de alta gerencia:
    -- nace sin poder entrar, y gerencia la activa si es de alguien.
    v_valido
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- A1 · Las lecturas preguntan quién llama
-- ---------------------------------------------------------------------------
alter function public.buscar_clientes(text, integer) security invoker;
alter function public.buscar_productos(text, integer, boolean) security invoker;
alter function public.clientes_de_producto(uuid, date, date) security invoker;
alter function public.clientes_sugeridos(integer) security invoker;
alter function public.contactos_de_cliente(uuid) security invoker;
alter function public.historial_precio_producto(uuid, uuid, integer) security invoker;
alter function public.kit_suma(uuid) security invoker;
alter function public.kpis_dashboard(date, date) security invoker;
alter function public.productos_pagina(text, integer, text, uuid, uuid, uuid, uuid, boolean, boolean) security invoker;
alter function public.proveedores_por_id(uuid[]) security invoker;
alter function public.proveedores_sugeridos(integer) security invoker;
alter function public.resumen_trazabilidad(uuid) security invoker;
alter function public.serie_compras(date, date, text) security invoker;
alter function public.serie_ventas(date, date, text) security invoker;
alter function public.top_clientes_rango(date, date, integer) security invoker;
alter function public.top_productos_rango(date, date, integer) security invoker;
alter function public.guia_esta_facturada(uuid) security invoker;

-- ---------------------------------------------------------------------------
-- A2 · Borrar una cabecera pide «Eliminar» de su módulo
-- ---------------------------------------------------------------------------
create or replace function public.puede_eliminar(p_tabla text)
returns boolean language sql stable security definer
set search_path = public, extensions as $$
  select case
    when public.mi_rol() is null then false
    when public.mi_rol() = 'gerencia' then true
    else exists (
      select 1 from permisos p join modulos m on m.clave = p.modulo
       where p.rol = public.mi_rol()::text
         and p.accion = 'eliminar'
         and p_tabla = any (m.tablas))
  end
$$;

do $$
declare r record;
begin
  -- Las cabeceras y los maestros. Una consulta de precios es de compras, aunque
  -- su tabla no esté en `modulos.tablas`: se pregunta por `compras`.
  for r in
    select * from (values
      ('cotizaciones', 'cotizaciones'), ('compras', 'compras'), ('recepciones', 'recepciones'),
      ('recepcion_items', 'recepcion_items'), ('consultas_precio', 'compras'),
      ('productos', 'productos'), ('marcas', 'marcas'), ('familias', 'familias'),
      ('subfamilias', 'subfamilias'), ('tipos', 'tipos'), ('unidades_medida', 'unidades_medida'),
      ('producto_equivalencias', 'producto_equivalencias'), ('empresa', 'empresa'),
      ('series_documento', 'series_documento'), ('motivos_nota', 'motivos_nota'),
      ('motivos_traslado', 'motivos_traslado')
    ) t(tabla, pregunta)
  loop
    execute format('drop policy if exists escritura_delete on public.%I', r.tabla);
    execute format(
      'create policy escritura_delete on public.%I for delete to authenticated using ((select public.puede_eliminar(%L)))',
      r.tabla, r.pregunta);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- A3 · Los cobros entran por su función
-- ---------------------------------------------------------------------------
drop policy if exists escritura_insert on pagos;

create or replace function public.tg_pagos_solo_voucher()
returns trigger language plpgsql
set search_path = public, extensions as $$
begin
  if public.escribe_una_funcion() then return new; end if;
  -- Por fuera de las funciones, de un cobro solo se cambia su voucher (109).
  if (to_jsonb(new) - array['voucher_ruta','voucher_nombre','voucher_mime'])
     is distinct from (to_jsonb(old) - array['voucher_ruta','voucher_nombre','voucher_mime']) then
    raise exception 'Un cobro no se corrige a mano: anúlalo y regístralo otra vez.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tg_pagos_solo_voucher on pagos;
create trigger tg_pagos_solo_voucher before update on pagos
  for each row execute function public.tg_pagos_solo_voucher();

create or replace function public.registrar_pagos(p_pagos jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare v_n int; r record;
begin
  -- Va lo PRIMERO (004): es `security definer` y se salta la RLS.
  if not public.puede('cobranzas', 'crear') then
    raise exception 'Tu rol no puede registrar cobros'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i
              where coalesce((i ->> 'monto')::numeric, 0) <= 0) then
    raise exception 'Cada cobro tiene que ser por más de cero' using errcode = 'check_violation';
  end if;

  -- Lo que hacía la pantalla (`cobrar.ts`), ahora también aquí. Se bloquea el
  -- documento para que dos cobros a la vez no se pasen entre los dos.
  for r in
    select (i ->> 'comprobante_id')::uuid as id, sum((i ->> 'monto')::numeric) as monto
      from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i
     group by 1
  loop
    perform 1 from comprobantes c where c.id = r.id for update;
    if not found then
      raise exception 'Uno de los documentos ya no existe' using errcode = 'check_violation';
    end if;
    if exists (select 1 from comprobantes c where c.id = r.id and c.estado = 'anulado') then
      raise exception '% está anulado: no se le pueden aplicar cobros',
        (select numero from comprobantes where id = r.id) using errcode = 'check_violation';
    end if;
    if r.monto > (select coalesce(c.saldo, 0) + 0.01 from comprobantes c where c.id = r.id) then
      raise exception '%: se están aplicando % sobre un saldo de %',
        (select numero from comprobantes where id = r.id), r.monto,
        (select saldo from comprobantes where id = r.id) using errcode = 'check_violation';
    end if;
  end loop;

  insert into pagos (comprobante_id, cuota_id, fecha, monto, medio, referencia, observaciones,
                     registrado_por, voucher_ruta, voucher_nombre, voucher_mime)
  select (i ->> 'comprobante_id')::uuid,
         nullif(i ->> 'cuota_id','')::uuid,
         coalesce(nullif(i ->> 'fecha','')::date, current_date),
         (i ->> 'monto')::numeric,
         coalesce(nullif(i ->> 'medio',''), 'transferencia'),
         nullif(i ->> 'referencia',''),
         nullif(i ->> 'observaciones',''),
         -- Quién cobra es quien llama, no lo que diga el cuerpo.
         auth.uid(),
         nullif(i ->> 'voucher_ruta',''),
         nullif(i ->> 'voucher_nombre',''),
         nullif(i ->> 'voucher_mime','')
  from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i;
  get diagnostics v_n = row_count;
  return jsonb_build_object('pagos', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- M1 y M2 · emitir_comprobante, sobre su definición viva
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.emitir_comprobante(jsonb)'::regprocedure);
  v_nueva text := v_def;
  r record;
begin
  for r in
    select * from (values
      -- M1: la casilla retirada no hace nada.
      ($a$coalesce((p_datos ->> 'descargar_stock')::boolean, false)$a$,
       $a$false /* 145: el stock sale con la guía; la casilla se retiró */$a$),
      -- M2: la guía declarada no puede estar ya facturada.
      ($a$and gr.cliente_id = (p_datos ->> 'cliente_id')::uuid)$a$,
       $a$and gr.cliente_id = (p_datos ->> 'cliente_id')::uuid
          and not public.guia_esta_facturada(gr.id))$a$),
      ($a$'La guia declarada no existe, no esta emitida o es de otro cliente'$a$,
       $a$'La guia declarada no existe, no esta emitida, es de otro cliente o ya esta facturada'$a$),
      -- M2: la nota, contra su documento; y la fecha, ni futura ni vieja.
      ($a$if jsonb_array_length(v_items) = 0 then$a$,
       $a$-- 145: la nota corrige un documento VIVO del MISMO cliente.
  if v_tipo in ('nota_credito','nota_debito') and not exists (
    select 1 from comprobantes r
     where r.id = nullif(p_datos ->> 'referencia_id','')::uuid
       and r.tipo in ('factura','boleta') and r.estado <> 'anulado'
       and r.cliente_id = (p_datos ->> 'cliente_id')::uuid) then
    raise exception 'La nota no apunta a una factura o boleta vigente de este cliente'
      using errcode = 'check_violation';
  end if;

  -- 145: SUNAT no recibe documentos con fecha futura, y uno de hace más de
  -- una semana es un error de tecleo, no una venta.
  if nullif(p_datos ->> 'fecha_emision','')::date > current_date + 1
     or nullif(p_datos ->> 'fecha_emision','')::date < current_date - 7 then
    raise exception 'La fecha de emision tiene que ser de la ultima semana'
      using errcode = 'check_violation';
  end if;

  if jsonb_array_length(v_items) = 0 then$a$),
      -- M2: una nota de crédito no acredita más de lo que queda del documento.
      ($a$v_total   := v_gravada + v_igv;$a$,
       $a$v_total   := v_gravada + v_igv;

  if v_tipo = 'nota_credito' and v_total > (
       select r.total - coalesce((select sum(n.total) from comprobantes n
                                   where n.referencia_id = r.id and n.tipo = 'nota_credito'
                                     and n.estado <> 'anulado'), 0)
         from comprobantes r where r.id = (p_datos ->> 'referencia_id')::uuid) + 0.05 then
    raise exception 'La nota de credito pasa de lo que queda por acreditar de su documento'
      using errcode = 'check_violation';
  end if;$a$)
    ) t(viejo, nuevo)
  loop
    if position(r.viejo in v_nueva) = 0 then
      raise exception '145: no encontré en emitir_comprobante: %', left(r.viejo, 60);
    end if;
    v_nueva := replace(v_nueva, r.viejo, r.nuevo);
  end loop;
  execute v_nueva;
end $$;

-- ---------------------------------------------------------------------------
-- M3 · La bitácora la escriben las funciones
-- ---------------------------------------------------------------------------
drop policy if exists escritura_insert on actividad;

-- ---------------------------------------------------------------------------
-- M4 · Las cuotas, solo por función
-- ---------------------------------------------------------------------------
drop trigger if exists tg_comprobante_cuotas_solo_rpc on comprobante_cuotas;
create trigger tg_comprobante_cuotas_solo_rpc before insert or update or delete on comprobante_cuotas
  for each row execute function public.tg_solo_funciones();

-- ---------------------------------------------------------------------------
-- M6 · Lo fiscal de una serie, solo por función
-- ---------------------------------------------------------------------------
create or replace function public.tg_series_lo_fiscal()
returns trigger language plpgsql
set search_path = public, extensions as $$
begin
  if public.escribe_una_funcion() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    -- Una serie que se crea desde la pantalla es real y empieza de cero; el
    -- punto de partida es «Desde» (`correlativo_inicial`).
    new.es_prueba := false;
    new.correlativo_actual := 0;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.es_prueba is distinct from old.es_prueba
       or new.correlativo_actual is distinct from old.correlativo_actual then
      raise exception 'El número por el que va una serie y si es de prueba no se cambian a mano: se repetirían números fiscales.'
        using errcode = '42501';
    end if;
    if new.serie is distinct from old.serie and old.correlativo_actual > 0 then
      raise exception 'La serie % ya emitió documentos: no se le cambia el nombre.', old.serie
        using errcode = '42501';
    end if;
    return new;
  else
    if old.correlativo_actual > 0 then
      raise exception 'La serie % ya emitió documentos: se desactiva, no se borra.', old.serie
        using errcode = '42501';
    end if;
    return old;
  end if;
end $$;

drop trigger if exists tg_series_lo_fiscal on series_documento;
create trigger tg_series_lo_fiscal before insert or update or delete on series_documento
  for each row execute function public.tg_series_lo_fiscal();

-- ---------------------------------------------------------------------------
-- M8 · Lo que cambia adónde va el dinero y quién puede qué, a la bitácora
-- ---------------------------------------------------------------------------
-- `tg_bitacora` daba por hecho que el id es un uuid; `empresa` y `config_sunat`
-- tienen un smallint (id = 1) y el cast reventaría el guardado.
create or replace function public._uuid_o_nulo(p text)
returns uuid language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.tg_bitacora()'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(replace(v_def,
    $a$(to_jsonb(NEW) ->> 'id')::uuid$a$, $a$public._uuid_o_nulo(to_jsonb(NEW) ->> 'id')$a$),
    $a$(to_jsonb(OLD) ->> 'id')::uuid$a$, $a$public._uuid_o_nulo(to_jsonb(OLD) ->> 'id')$a$);
  if v_nueva = v_def then raise exception '145: no encontré el id en tg_bitacora'; end if;
  execute v_nueva;
end $$;

drop trigger if exists tg_bitacora_cuentas_bancarias on cuentas_bancarias;
create trigger tg_bitacora_cuentas_bancarias after insert or update or delete on cuentas_bancarias
  for each row execute function public.tg_bitacora('banco', 'moneda', 'numero', 'cci', 'activo');

drop trigger if exists tg_bitacora_empresa on empresa;
create trigger tg_bitacora_empresa after update on empresa
  for each row execute function public.tg_bitacora(
    'razon_social', 'ruc', 'direccion', 'banco', 'cuenta_corriente', 'cci', 'cuenta_detraccion',
    'igv_porcentaje', 'retencion_porcentaje', 'detraccion_porcentaje', 'detraccion_monto_minimo',
    'agente_retencion', 'email', 'telefono', 'celular');

-- `correlativo_actual` no: cambia con cada documento emitido.
drop trigger if exists tg_bitacora_series_documento on series_documento;
create trigger tg_bitacora_series_documento after insert or update or delete on series_documento
  for each row execute function public.tg_bitacora(
    'serie', 'correlativo_inicial', 'predeterminada', 'activo', 'es_prueba');

-- `probado_*` no: cambia cada vez que se prueba la conexión.
drop trigger if exists tg_bitacora_config_sunat on config_sunat;
create trigger tg_bitacora_config_sunat after update on config_sunat
  for each row execute function public.tg_bitacora(
    'ambiente', 'usuario_sol', 'certificado_nombre', 'certificado_caduca_en',
    'serie_factura', 'serie_boleta', 'gre_client_id');

-- Roles y permisos no tienen id: se describen con sus claves.
create or replace function public.tg_bitacora_permisos()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
declare
  -- Solo si tiene perfil: un cambio por SQL o con la clave de servicio no lo
  -- hace nadie con ficha, y `actividad.usuario_id` apunta a `perfiles`.
  v_quien uuid := (select id from perfiles where id = auth.uid());
  v_fila jsonb := to_jsonb(coalesce(new, old));
  v_desc text;
begin
  if tg_table_name = 'permisos' then
    v_desc := format('%s · %s: %s %s',
      coalesce((select nombre from roles where clave = v_fila ->> 'rol'), v_fila ->> 'rol'),
      coalesce((select nombre from modulos where clave = v_fila ->> 'modulo'), v_fila ->> 'modulo'),
      v_fila ->> 'accion',
      case tg_op when 'INSERT' then 'concedido' else 'quitado' end);
  else
    v_desc := case tg_op
      when 'INSERT' then format('Rol creado: %s', new.nombre)
      when 'DELETE' then format('Rol eliminado: %s', old.nombre)
      else format('Rol renombrado: %s → %s', old.nombre, new.nombre) end;
    if tg_op = 'UPDATE' and new.nombre is not distinct from old.nombre
       and new.descripcion is not distinct from old.descripcion then
      return null;
    end if;
  end if;

  insert into actividad (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, metadata)
  values (v_quien,
          coalesce((select nombre from perfiles where id = v_quien), 'sistema'),
          case tg_op when 'INSERT' then 'creado' when 'DELETE' then 'borrado' else 'cambiado' end,
          tg_table_name, null, v_desc,
          jsonb_build_object('antes', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                             'despues', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return null;
end $$;

drop trigger if exists tg_bitacora_permisos on permisos;
create trigger tg_bitacora_permisos after insert or delete on permisos
  for each row execute function public.tg_bitacora_permisos();
drop trigger if exists tg_bitacora_roles on roles;
create trigger tg_bitacora_roles after insert or update or delete on roles
  for each row execute function public.tg_bitacora_permisos();

-- ---------------------------------------------------------------------------
-- Baja · Anular una cotización es «Eliminar», como dice la pantalla
-- ---------------------------------------------------------------------------
create or replace function public.tg_cotizacion_anular_pide_eliminar()
returns trigger language plpgsql
set search_path = public, extensions as $$
begin
  if not public.escribe_una_funcion()
     and new.estado = 'anulada' and old.estado is distinct from 'anulada'
     and not public.puede('cotizaciones', 'eliminar') then
    raise exception 'Tu rol no puede anular cotizaciones' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tg_cotizacion_anular_pide_eliminar on cotizaciones;
create trigger tg_cotizacion_anular_pide_eliminar before update of estado on cotizaciones
  for each row execute function public.tg_cotizacion_anular_pide_eliminar();

-- ---------------------------------------------------------------------------
-- Baja · Vaciar tablas enteras no es de nadie con sesión
-- ---------------------------------------------------------------------------
revoke truncate on all tables in schema public from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA cada arreglo como ventas, como alguien sin perfil y como
-- alguien que se registra solo. Todo debe rebotar. Deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ven uuid; v_fac uuid; v_cot uuid; v_cuota uuid; v_serie uuid; v_pago uuid;
  v_nuevo uuid := gen_random_uuid(); v_perfil record; n int; h text;
begin
  select id into v_ven from perfiles where rol = 'ventas' and activo limit 1;
  select id into v_fac from comprobantes where tipo = 'factura' and estado in ('emitido','parcial') and saldo > 1 limit 1;
  select id into v_cot from cotizaciones where estado = 'aprobada' limit 1;
  select id into v_cuota from comprobante_cuotas limit 1;
  select id into v_serie from series_documento where correlativo_actual > 0 limit 1;
  if v_ven is null then raise notice '145: sin usuario de ventas; centinela omitido.'; return; end if;

  begin
    -- C1: alguien se registra solo pidiendo ser gerencia.
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (v_nuevo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'centinela145@ejemplo.invalid', '{"rol":"gerencia"}', '{}', now(), now());
    select rol, activo into v_perfil from perfiles where id = v_nuevo;
    if v_perfil.rol = 'gerencia' or v_perfil.activo then
      raise exception '145: el registro libre nació % activo=%', v_perfil.rol, v_perfil.activo;
    end if;

    -- A1: una sesión sin perfil no lee nada.
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into n from productos_pagina(null, 50, null, null, null, null, null, false, null);
    if n > 0 then raise exception '145: sin perfil, productos_pagina devolvió %', n; end if;
    select count(*) into n from buscar_clientes('a', 50);
    if n > 0 then raise exception '145: sin perfil, buscar_clientes devolvió %', n; end if;
    perform set_config('role', 'postgres', true);

    -- Como ventas, sin «Eliminar» en cotizaciones ni «Editar» en cobranzas.
    delete from permisos where rol = 'ventas' and modulo = 'cotizaciones' and accion = 'eliminar';
    perform set_config('request.jwt.claims', json_build_object('sub', v_ven, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- A1, y que un usuario activo SIGUE leyendo.
    select count(*) into n from productos_pagina(null, 50, null, null, null, null, null, false, null);
    if n = 0 then raise exception '145: ventas ya no lee el catálogo'; end if;

    -- A2: borrar una cotización aprobada.
    if v_cot is not null then
      delete from cotizaciones where id = v_cot;
      get diagnostics n = row_count;
      if n > 0 then raise exception '145: ventas borró una cotización sin «Eliminar»'; end if;
      -- y anularla.
      begin
        update cotizaciones set estado = 'anulada' where id = v_cot;
        get diagnostics n = row_count;
        if n > 0 then raise exception '145: ventas anuló sin «Eliminar»'; end if;
      exception when others then
        -- Tiene que rebotar por ESTE candado, no por otra regla de la cotización.
        if sqlerrm not like '%no puede anular cotizaciones%' then
          raise exception '145: anular rebotó por otra cosa: %', sqlerrm;
        end if;
      end;
    end if;

    if v_fac is not null then
      -- A3: un cobro directo.
      begin
        insert into pagos (comprobante_id, fecha, monto, medio, registrado_por)
        values (v_fac, current_date, 1, 'transferencia', v_ven);
        raise exception '145: ventas insertó un cobro directo';
      exception when insufficient_privilege then null;
      end;
      -- A3: por la función, más que el saldo.
      begin
        perform registrar_pagos(jsonb_build_array(jsonb_build_object(
          'comprobante_id', v_fac, 'monto', (select saldo + 100 from comprobantes where id = v_fac))));
        raise exception '145: registrar_pagos cobró más que el saldo';
      exception when check_violation then null;
      end;
      -- A3: por la función, bien: entra, y luego no se corrige a mano.
      perform registrar_pagos(jsonb_build_array(jsonb_build_object('comprobante_id', v_fac, 'monto', 1)));
      select id into v_pago from pagos where comprobante_id = v_fac and registrado_por = v_ven order by creado_en desc limit 1;
      if v_pago is null then raise exception '145: registrar_pagos no registró'; end if;
      begin
        update pagos set monto = 0.01 where id = v_pago;
        get diagnostics n = row_count;
        if n > 0 then raise exception '145: ventas corrigió el monto de un cobro'; end if;
      exception when insufficient_privilege then null;
      end;
      -- El voucher sí.
      update pagos set voucher_nombre = 'centinela.pdf' where id = v_pago;
    end if;

    -- M3: falsificar la bitácora.
    begin
      insert into actividad (usuario_id, usuario_nombre, accion, entidad, descripcion)
      values (v_ven, 'Willy Fernández', 'borrado', 'comprobantes', 'falso');
      raise exception '145: ventas escribió en la bitácora';
    exception when insufficient_privilege then null;
    end;

    -- M4: tocar una cuota.
    if v_cuota is not null then
      begin
        update comprobante_cuotas set monto = monto where id = v_cuota;
        get diagnostics n = row_count;
        if n > 0 then raise exception '145: ventas cambió una cuota'; end if;
      exception when insufficient_privilege then null;
      end;
    end if;

    perform set_config('role', 'postgres', true);

    -- M6: ni gerencia baja el correlativo a mano (simulada como gerencia).
    if v_serie is not null then
      perform set_config('request.jwt.claims', json_build_object('sub',
        (select id from perfiles where rol = 'gerencia' and activo limit 1), 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      begin
        update series_documento set correlativo_actual = 0 where id = v_serie;
        raise exception '145: se bajó el correlativo de una serie a mano';
      exception when insufficient_privilege then null;
      end;
      -- M8: y lo que sí cambia, queda en la bitácora.
      update series_documento set descripcion = descripcion, activo = activo, predeterminada = predeterminada where id = v_serie;
      update cuentas_bancarias set numero = numero || '' where id = (select id from cuentas_bancarias limit 1);
      perform set_config('role', 'postgres', true);
    end if;

    -- M8: empresa ya no revienta el guardado con su id smallint.
    update empresa set telefono = coalesce(telefono, '') || '' where id = 1;
    update empresa set email = email where id = 1;

    raise exception '__145_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__145_DESHACER__' then raise; end if;
  end;
  raise notice '145: auditoría completa aplicada.';
end $$;
