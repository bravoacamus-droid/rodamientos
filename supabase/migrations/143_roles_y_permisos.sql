-- ###########################################################################
-- 143 · ROLES QUE SE CREAN, Y PERMISOS POR MÓDULO: VER, CREAR, EDITAR, ELIMINAR
-- ###########################################################################
--
-- El QA, 20/10, sobre Configuración › Permisos: *«falta botón para crear
-- permisos»*; las casillas enseñaban «A medias» y al pulsar ya solo había Sí
-- y No; y *«cuando no tiene permisos deja rellenar datos y al intentar
-- guardar no lo permite»*.
--
-- Luis, el mismo día: *«los roles y permisos es diferente… un rol, ya sea
-- admin, puede ser esto, esto, esto; lo que no pueden hacer ya se le marca o
-- no… se agrupa qué pueden hacer: leer, editar, el CRUD de los módulos. La
-- mayoría de roles más bajos seguro pueden ver pero no crear»*.
--
-- Lo que había detrás de las tres quejas es una sola cosa: **la regla vivía
-- en dos sitios**. La base miraba `permisos_rol` (tabla×rol, sí o no), y la
-- aplicación tenía su propia lista de roles escrita a mano en ~100 archivos.
-- Quitarle Clientes a Ventas en la pantalla dejaba el botón de guardar a la
-- vista —la lista a mano decía que sí— y la base lo rechazaba al final. Y al
-- revés: dárselo a Almacén no servía de nada, porque la lista a mano decía
-- que no.
--
-- Ahora hay UNA fuente:
--
--   · `roles`    — los seis de siempre más los que cree gerencia.
--   · `modulos`  — los módulos tal como salen en el menú, con sus acciones y
--                  las tablas que escriben.
--   · `permisos` — rol × módulo × acción. Una fila = puede.
--
--   · `puede(modulo, accion)` — lo que pregunta la aplicación y las funciones.
--   · `puede_escribir(tabla)` — la que ya usan las ~150 políticas; ahora lee
--     de `permisos`. No se toca ni una política.
--
-- Gerencia no tiene filas: lo puede todo siempre, y su columna no se edita
-- (sería un botón para encerrarse fuera).
--
-- ---------------------------------------------------------------------------
-- Por qué en la base escribir es «crear, editar o eliminar» y no uno a uno
-- ---------------------------------------------------------------------------
-- Las políticas distinguen INSERT, UPDATE y DELETE, y sería tentador casar
-- cada una con su acción. No se hace: corregir una cotización BORRA líneas
-- (`cotizacion_items`) y emitir una factura ACTUALIZA la guía. Con la
-- correspondencia literal, quien solo puede «editar» no podría quitar una
-- línea. La distinción fina la hace la aplicación (y `anular_*`, que miran
-- `eliminar`); la base garantiza que quien no tiene NINGUNA no escribe.
--
-- «Ver» decide el menú y si se abre la pantalla. Las lecturas siguen abiertas
-- a cualquier usuario activo: ventas tiene que poder elegir un producto al
-- cotizar aunque no tenga «Productos» en su menú.
--
-- ---------------------------------------------------------------------------
-- Por qué los roles nuevos amplían el enum y no lo sustituyen
-- ---------------------------------------------------------------------------
-- `perfiles.rol` es el enum `rol_usuario` desde la 002, y `mi_rol()` lo
-- devuelve; de él cuelgan 67 políticas de lectura. Pasarlo a texto obliga a
-- tirarlas y rehacerlas. En PostgreSQL 12+ `alter type … add value` funciona
-- dentro de una transacción, así que `crear_rol` añade el valor y registra el
-- rol en `roles`. Un valor de enum no se borra: «eliminar» un rol lo quita de
-- `roles` (y con él sus permisos); si se vuelve a crear con el mismo nombre,
-- reutiliza el valor.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1 · Roles
-- ---------------------------------------------------------------------------
create table if not exists roles (
  clave       text primary key check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre      text not null check (length(btrim(nombre)) >= 2),
  nombre_norm text generated always as (public.normalizar_texto(nombre)) stored,
  descripcion text,
  -- Los seis de la 002: no se borran (los usa el código: es_gerencia, el
  -- ajuste de inventario…). Sí se les cambian los permisos, salvo a gerencia.
  sistema     boolean not null default false,
  creado_en   timestamptz not null default now()
);
create unique index if not exists ux_roles_nombre on roles (nombre_norm);

insert into roles (clave, nombre, descripcion, sistema) values
  ('gerencia',  'Gerencia',       'Todo, incluido el ajuste de inventario, los usuarios y los permisos.', true),
  ('admin',     'Administración', 'Casi todo: lo que gerencia no se reservó.', true),
  ('ventas',    'Ventas',         'Cotiza, despacha, factura y da de alta clientes.', true),
  ('almacen',   'Almacén',        'Recibe mercadería, prepara guías y mueve stock.', true),
  ('compras',   'Compras',        'Proveedores, compras, recepciones y el catálogo de productos.', true),
  ('cobranzas', 'Cobranzas',      'Cartera, pagos y gestiones de cobro.', true)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Módulos. Datos de estructura, no del cliente: van en la migración.
-- ---------------------------------------------------------------------------
create table if not exists modulos (
  clave    text primary key,
  nombre   text not null,
  ayuda    text not null,
  orden    int  not null,
  acciones text[] not null check (acciones <@ array['ver','crear','editar','eliminar']),
  -- Las tablas que escribe. `puede_escribir(tabla)` mira aquí.
  tablas   text[] not null default '{}'
);

insert into modulos (clave, nombre, ayuda, orden, acciones, tablas) values
  ('cotizaciones', 'Cotizaciones y pedidos', 'Cotizar, confirmar pedidos y mandarlos al cliente. Eliminar es borrar un pedido o una cotización.', 10,
     array['ver','crear','editar','eliminar'],
     array['cotizaciones','cotizacion_items','plantillas_mensaje']),
  ('guias', 'Guías de remisión', 'Preparar y emitir las guías con las que sale la mercadería. Eliminar es anular una guía.', 20,
     array['ver','crear','editar','eliminar'],
     array['guias_remision','guia_items']),
  ('facturacion', 'Facturación y SUNAT', 'Emitir facturas y notas, y mandarlas a SUNAT. Eliminar es anular o dar de baja.', 30,
     array['ver','crear','editar','eliminar'],
     array['comprobantes','comprobante_items','comprobante_cuotas']),
  ('cobranzas', 'Cobranzas', 'Anotar pagos, vouchers y gestiones de cobro.', 40,
     array['ver','crear','editar','eliminar'],
     array['pagos','gestiones_cobranza']),
  ('clientes', 'Clientes', 'Dar de alta y corregir clientes, sus contactos, zonas y rubros.', 50,
     array['ver','crear','editar','eliminar'],
     array['clientes','cliente_contactos']),
  ('productos', 'Productos y catálogo', 'Productos, kits, marcas y familias. Aquí viven los precios de venta.', 60,
     array['ver','crear','editar','eliminar'],
     array['productos','marcas','familias','subfamilias','tipos','unidades_medida']),
  ('equivalencias', 'Equivalencias', 'Decir qué producto reemplaza a cuál.', 70,
     array['ver','crear','eliminar'],
     array['producto_equivalencias']),
  ('almacen', 'Almacén', 'Ver el stock y el kardex, y recibir mercadería.', 80,
     array['ver','crear','editar'],
     array['stock','movimientos_inventario','recepciones','recepcion_items','recepcion_adjuntos']),
  ('transporte', 'Transporte', 'Agencias, conductores y vehículos de la guía.', 90,
     array['ver','crear','editar','eliminar'],
     array['agencias_transporte','conductores','vehiculos']),
  ('compras', 'Compras e importaciones', 'Pedir precios, órdenes de compra e importaciones. Aquí se ven los costos. Eliminar es anular una compra.', 100,
     array['ver','crear','editar','eliminar'],
     array['compras','compra_items','compra_adjuntos','gastos_importacion','analisis_importacion','analisis_importacion_items','proveedor_productos']),
  ('proveedores', 'Proveedores', 'Dar de alta y corregir proveedores y las marcas que venden.', 110,
     array['ver','crear','editar','eliminar'],
     array['proveedores','proveedor_marcas']),
  ('reportes', 'Reportes', 'Ventas por cliente, cotizado y ganado, lo facturado.', 120,
     array['ver'], '{}'),
  ('informe', 'Informe general', '«¿Cómo voy este mes?», la meta y el resumen del negocio.', 130,
     array['ver'], '{}'),
  ('configuracion', 'Datos de la empresa y numeración', 'Datos fiscales, cuentas para cobrar y series de los documentos.', 140,
     array['ver','editar'],
     array['empresa','series_documento','motivos_traslado','motivos_nota','cuentas_bancarias']),
  ('bitacora', 'Qué ha pasado', 'La bitácora de lo que se hizo en el sistema.', 150,
     array['ver'], '{}')
on conflict (clave) do update
  set nombre = excluded.nombre, ayuda = excluded.ayuda, orden = excluded.orden,
      acciones = excluded.acciones, tablas = excluded.tablas;

-- ---------------------------------------------------------------------------
-- 3 · Permisos
-- ---------------------------------------------------------------------------
create table if not exists permisos (
  rol    text not null references roles (clave) on delete cascade,
  modulo text not null references modulos (clave) on delete cascade,
  accion text not null check (accion in ('ver','crear','editar','eliminar')),
  primary key (rol, modulo, accion)
);

-- Lo que hacía cada rol hasta hoy, tal como lo decían las listas a mano de
-- la aplicación (que eran las que mandaban de verdad: la base dejaba más).
-- Admin, todo.
insert into permisos (rol, modulo, accion)
select 'admin', m.clave, a from modulos m, unnest(m.acciones) a
on conflict do nothing;

insert into permisos (rol, modulo, accion)
select s.rol, s.modulo, a
  from (values
    ('ventas','cotizaciones','ver,crear,editar,eliminar'),
    ('ventas','guias','ver,crear,editar'),
    ('ventas','facturacion','ver,crear,editar'),
    ('ventas','cobranzas','ver,crear'),
    ('ventas','clientes','ver,crear,editar'),
    ('ventas','productos','ver'),
    ('ventas','equivalencias','ver,crear,eliminar'),
    ('ventas','almacen','ver'),
    ('ventas','transporte','ver,crear,editar'),
    ('ventas','reportes','ver'),

    ('almacen','cotizaciones','ver'),
    ('almacen','guias','ver,crear,editar'),
    ('almacen','facturacion','ver'),
    ('almacen','clientes','ver'),
    ('almacen','productos','ver'),
    ('almacen','equivalencias','ver'),
    ('almacen','almacen','ver,crear,editar'),
    ('almacen','transporte','ver,crear,editar'),
    ('almacen','reportes','ver'),

    ('compras','cotizaciones','ver'),
    ('compras','guias','ver'),
    ('compras','facturacion','ver'),
    ('compras','clientes','ver'),
    ('compras','productos','ver,crear,editar,eliminar'),
    ('compras','equivalencias','ver,crear,eliminar'),
    ('compras','almacen','ver,crear,editar'),
    ('compras','compras','ver,crear,editar,eliminar'),
    ('compras','proveedores','ver,crear,editar,eliminar'),
    ('compras','reportes','ver'),

    ('cobranzas','cotizaciones','ver'),
    ('cobranzas','guias','ver'),
    ('cobranzas','facturacion','ver'),
    ('cobranzas','cobranzas','ver,crear,editar,eliminar'),
    ('cobranzas','clientes','ver'),
    ('cobranzas','productos','ver'),
    ('cobranzas','equivalencias','ver'),
    ('cobranzas','almacen','ver'),
    ('cobranzas','reportes','ver')
  ) s(rol, modulo, acciones),
  unnest(string_to_array(s.acciones, ',')) a
on conflict do nothing;

alter table roles    enable row level security;
alter table modulos  enable row level security;
alter table permisos enable row level security;
drop policy if exists lectura_autenticados on roles;
drop policy if exists lectura_autenticados on modulos;
drop policy if exists lectura_autenticados on permisos;
create policy lectura_autenticados on roles    for select to authenticated using ((select mi_rol()) is not null);
create policy lectura_autenticados on modulos  for select to authenticated using ((select mi_rol()) is not null);
create policy lectura_autenticados on permisos for select to authenticated using ((select mi_rol()) is not null);
-- Se escriben solo por las funciones de abajo.
revoke all on roles, modulos, permisos from anon, public;
grant select on roles, modulos, permisos to authenticated;
grant all on roles, modulos, permisos to service_role;

-- ---------------------------------------------------------------------------
-- 4 · Las preguntas
-- ---------------------------------------------------------------------------
create or replace function public.puede(p_modulo text, p_accion text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select case
    when public.mi_rol() is null then false
    when public.mi_rol() = 'gerencia' then true
    else exists (
      select 1 from permisos
       where rol = public.mi_rol()::text and modulo = p_modulo and accion = p_accion)
  end
$$;

-- Las tablas de fondo que escribe cualquiera que esté trabajando: los avisos,
-- la bitácora, el registro de fallos y la caché de «Traer datos» por RUC/DNI.
create or replace function public._tabla_de_todos(p_tabla text)
returns boolean language sql immutable as $$
  select p_tabla = any (array['alertas','actividad','fallos','consultas_cache','consultas_cuota','consultas_log'])
$$;

create or replace function public.puede_escribir(p_tabla text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select case
    when public.mi_rol() is null then false
    when public.mi_rol() = 'gerencia' then true
    when public._tabla_de_todos(p_tabla) then true
    -- Las funciones de la 141/142 y otras preguntan por el NOMBRE de una
    -- tabla principal; se responde por su módulo.
    else exists (
      select 1 from permisos p join modulos m on m.clave = p.modulo
       where p.rol = public.mi_rol()::text
         and p.accion in ('crear','editar','eliminar')
         and p_tabla = any (m.tablas))
  end
$$;
comment on function public.puede_escribir(text) is
  '143: lee de permisos×modulos. Escribir = tener crear, editar o eliminar en el módulo de la tabla.';

-- Todo lo que puede el usuario de esta sesión, en una sola llamada: la
-- aplicación la hace una vez por petición y decide menú, botones y acciones.
create or replace function public.mis_permisos()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'rol', r::text,
    'nombre_rol', (select nombre from roles where clave = r::text),
    'permisos', coalesce((
      case when r = 'gerencia' then
        (select jsonb_agg(m.clave || ':' || a) from modulos m, unnest(m.acciones) a)
      else
        (select jsonb_agg(modulo || ':' || accion) from permisos where rol = r::text)
      end), '[]'::jsonb))
  from (select public.mi_rol() r) x
  where r is not null
$$;

-- ---------------------------------------------------------------------------
-- 5 · Cambiar permisos y roles. Solo gerencia.
-- ---------------------------------------------------------------------------
create or replace function public._solo_gerencia()
returns void language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Solo Gerencia cambia los roles y los permisos' using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function public.cambiar_permiso(p_rol text, p_modulo text, p_accion text, p_puede boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._solo_gerencia();
  if p_rol = 'gerencia' then
    raise exception 'Gerencia lo puede todo siempre: no se le quitan permisos' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from roles where clave = p_rol) then
    raise exception 'Ese rol ya no existe' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from modulos where clave = p_modulo and p_accion = any (acciones)) then
    raise exception 'Ese permiso no existe' using errcode = 'invalid_parameter_value';
  end if;

  if p_puede then
    insert into permisos values (p_rol, p_modulo, p_accion) on conflict do nothing;
    -- No se crea ni se edita lo que no se ve.
    if p_accion <> 'ver' then
      insert into permisos values (p_rol, p_modulo, 'ver') on conflict do nothing;
    end if;
  elsif p_accion = 'ver' then
    -- Sin ver, nada: quitar «ver» quita el módulo entero.
    delete from permisos where rol = p_rol and modulo = p_modulo;
  else
    delete from permisos where rol = p_rol and modulo = p_modulo and accion = p_accion;
  end if;

  return coalesce((select jsonb_agg(accion) from permisos where rol = p_rol and modulo = p_modulo), '[]'::jsonb);
end $$;

create or replace function public._clave_de_rol(p_nombre text)
returns text language sql immutable as $$
  select left(trim(both '_' from regexp_replace(public.normalizar_texto(p_nombre), '[^a-z0-9]+', '_', 'g')), 40)
$$;

create or replace function public.crear_rol(p_nombre text, p_descripcion text default null, p_copiar_de text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_nombre text; v_clave text;
begin
  perform public._solo_gerencia();
  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  if length(v_nombre) < 2 then
    raise exception 'El nombre del rol es demasiado corto' using errcode = 'invalid_parameter_value';
  end if;
  if length(v_nombre) > 40 then
    raise exception 'El nombre del rol es demasiado largo' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from roles where nombre_norm = public.normalizar_texto(v_nombre)) then
    raise exception 'Ya hay un rol «%»', v_nombre using errcode = 'unique_violation';
  end if;

  v_clave := public._clave_de_rol(v_nombre);
  if v_clave !~ '^[a-z]' then v_clave := 'rol_' || v_clave; end if;
  if length(v_clave) < 2 then
    raise exception 'Ponle al rol un nombre con letras' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from roles where clave = v_clave) then
    raise exception 'Ya hay un rol que se llama casi igual' using errcode = 'unique_violation';
  end if;

  -- El valor se puede usar en cuanto esta transacción termine; aquí solo se
  -- registra, que es texto.
  execute format('alter type public.rol_usuario add value if not exists %L', v_clave);
  insert into roles (clave, nombre, descripcion) values (v_clave, v_nombre, nullif(btrim(p_descripcion), ''));

  if p_copiar_de is not null and p_copiar_de <> 'gerencia' then
    insert into permisos (rol, modulo, accion)
    select v_clave, modulo, accion from permisos where rol = p_copiar_de;
  elsif p_copiar_de = 'gerencia' then
    insert into permisos (rol, modulo, accion)
    select v_clave, m.clave, a from modulos m, unnest(m.acciones) a;
  end if;

  return (select jsonb_build_object('clave', clave, 'nombre', nombre, 'descripcion', descripcion) from roles where clave = v_clave);
end $$;

create or replace function public.renombrar_rol(p_clave text, p_nombre text, p_descripcion text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_nombre text;
begin
  perform public._solo_gerencia();
  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  if length(v_nombre) < 2 or length(v_nombre) > 40 then
    raise exception 'El nombre del rol tiene que tener entre 2 y 40 letras' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from roles where nombre_norm = public.normalizar_texto(v_nombre) and clave <> p_clave) then
    raise exception 'Ya hay un rol «%»', v_nombre using errcode = 'unique_violation';
  end if;
  update roles set nombre = v_nombre, descripcion = nullif(btrim(p_descripcion), '') where clave = p_clave;
  if not found then raise exception 'Ese rol ya no existe' using errcode = 'no_data_found'; end if;
  return (select jsonb_build_object('clave', clave, 'nombre', nombre, 'descripcion', descripcion) from roles where clave = p_clave);
end $$;

create or replace function public.eliminar_rol(p_clave text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform public._solo_gerencia();
  if exists (select 1 from roles where clave = p_clave and sistema) then
    raise exception 'Los seis roles de siempre no se eliminan; sí se les cambian los permisos' using errcode = 'invalid_parameter_value';
  end if;
  select count(*) into n from perfiles where rol::text = p_clave;
  if n > 0 then
    raise exception 'Lo tienen % usuario%: cámbiales el rol antes de eliminarlo', n, case when n = 1 then '' else 's' end
      using errcode = 'foreign_key_violation';
  end if;
  delete from roles where clave = p_clave;
end $$;

-- ---------------------------------------------------------------------------
-- 6 · Las tres funciones que nombraban roles a mano
-- ---------------------------------------------------------------------------
-- anular_comprobante decía tiene_rol('gerencia','admin') y anular_guia
-- es_gerencia(): ahora es «eliminar» de su módulo, que es lo que se marca en
-- la pantalla. Se reescribe solo la comprobación, con un reemplazo sobre la
-- definición viva y un error si no encuentra el texto.
do $$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef('public.anular_comprobante'::regproc);
  v_nueva := replace(v_def, 'if not public.tiene_rol(''gerencia'',''admin'') then',
                            'if not public.puede(''facturacion'',''eliminar'') then');
  if v_nueva = v_def then raise exception '143: no encontré la comprobación de anular_comprobante'; end if;
  execute v_nueva;

  v_def := pg_get_functiondef('public.anular_guia'::regproc);
  v_nueva := replace(v_def, 'if not public.es_gerencia() then',
                            'if not public.puede(''guias'',''eliminar'') then');
  if v_nueva = v_def then raise exception '143: no encontré la comprobación de anular_guia'; end if;
  execute v_nueva;
end $$;

-- `permisos_rol` deja de existir: dos tablas diciendo lo mismo es como
-- empezó el problema.
drop table if exists permisos_rol;

revoke execute on function public._tabla_de_todos(text) from public, anon;
revoke execute on function public._solo_gerencia() from public, anon;
revoke execute on function public._clave_de_rol(text) from public, anon;
revoke execute on function public.puede(text, text) from public, anon;
revoke execute on function public.mis_permisos() from public, anon;
revoke execute on function public.cambiar_permiso(text, text, text, boolean) from public, anon;
revoke execute on function public.crear_rol(text, text, text) from public, anon;
revoke execute on function public.renombrar_rol(text, text, text) from public, anon;
revoke execute on function public.eliminar_rol(text) from public, anon;
grant execute on function public.puede(text, text) to authenticated, service_role;
grant execute on function public.mis_permisos() to authenticated, service_role;
grant execute on function public.cambiar_permiso(text, text, text, boolean) to authenticated, service_role;
grant execute on function public.crear_rol(text, text, text) to authenticated, service_role;
grant execute on function public.renombrar_rol(text, text, text) to authenticated, service_role;
grant execute on function public.eliminar_rol(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA todo como gerencia y como ventas, y deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ger uuid; v_ven uuid; r jsonb; v_msg text; v_suelta text;
begin
  -- Toda tabla que una política o una función protege con puede_escribir
  -- tiene que estar en un módulo o en las de todos. Si no, nadie salvo
  -- gerencia podría escribirla y no saldría en la pantalla.
  select string_agg(distinct t, ', ') into v_suelta
    from (
      select substring(coalesce(qual, '') || coalesce(with_check, '') from 'puede_escribir\(''([a-z_]+)''') t
        from pg_policies where schemaname = 'public'
      union
      select (regexp_matches(p.prosrc, 'puede_escribir\(''([a-z_]+)''\)', 'g'))[1]
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname <> 'puede_escribir'
    ) x
   where t is not null
     and not public._tabla_de_todos(t)
     and not exists (select 1 from modulos where t = any (tablas));
  if v_suelta is not null then raise exception '143: tablas sin módulo: %', v_suelta; end if;

  select id into v_ger from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_ven from perfiles where rol = 'ventas' and activo limit 1;
  if v_ger is null or v_ven is null then raise notice '143: sin gerencia o ventas activa; centinela omitido.'; return; end if;

  begin
    -- Ventas, como quedó sembrada.
    perform set_config('request.jwt.claims', json_build_object('sub', v_ven, 'role', 'authenticated')::text, true);
    if not public.puede('cotizaciones', 'crear') then raise exception '143: ventas no puede cotizar'; end if;
    if public.puede('compras', 'crear') then raise exception '143: ventas puede comprar'; end if;
    if not public.puede_escribir('cotizacion_items') then raise exception '143: ventas no escribe líneas'; end if;
    if not public.puede_escribir('clientes') then raise exception '143: ventas no escribe clientes'; end if;
    if public.puede_escribir('proveedores') then raise exception '143: ventas escribe proveedores'; end if;
    if not public.puede_escribir('alertas') then raise exception '143: ventas no marca avisos'; end if;
    if jsonb_array_length(public.mis_permisos()->'permisos') < 10 then raise exception '143: mis_permisos corto'; end if;
    begin
      perform public.cambiar_permiso('ventas', 'clientes', 'crear', false);
      raise exception '143: ventas cambió un permiso';
    exception when insufficient_privilege then null;
    end;

    -- Gerencia: crea un rol copiando a ventas, lo toca y lo borra.
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    if (select count(*) from jsonb_array_elements(public.mis_permisos()->'permisos'))
       <> (select count(*) from modulos, unnest(acciones)) then
      raise exception '143: gerencia no lo tiene todo';
    end if;
    r := public.crear_rol('  Vendedor   júnior ', 'De prueba', 'ventas');
    if r->>'clave' <> 'vendedor_junior' then raise exception '143: clave %', r; end if;
    if (select count(*) from permisos where rol = 'vendedor_junior') <> (select count(*) from permisos where rol = 'ventas') then
      raise exception '143: no copió los permisos';
    end if;
    begin
      perform public.crear_rol('VENDEDOR JUNIOR');
      raise exception '143: dejó repetir un rol';
    exception when unique_violation then null;
    end;
    -- Quitar «ver» quita el módulo entero; dar «editar» da «ver».
    perform public.cambiar_permiso('vendedor_junior', 'cotizaciones', 'ver', false);
    if exists (select 1 from permisos where rol = 'vendedor_junior' and modulo = 'cotizaciones') then
      raise exception '143: quitar ver dejó el resto';
    end if;
    perform public.cambiar_permiso('vendedor_junior', 'compras', 'editar', true);
    if not exists (select 1 from permisos where rol = 'vendedor_junior' and modulo = 'compras' and accion = 'ver') then
      raise exception '143: editar sin ver';
    end if;
    begin
      perform public.cambiar_permiso('gerencia', 'clientes', 'ver', false);
      raise exception '143: le quitó algo a gerencia';
    exception when invalid_parameter_value then null;
    end;
    r := public.renombrar_rol('vendedor_junior', 'Vendedor de mostrador', null);
    if r->>'nombre' <> 'Vendedor de mostrador' then raise exception '143: renombrar %', r; end if;
    begin
      perform public.eliminar_rol('ventas');
      raise exception '143: borró un rol de sistema';
    exception when invalid_parameter_value then get stacked diagnostics v_msg = message_text;
    end;
    perform public.eliminar_rol('vendedor_junior');
    if exists (select 1 from permisos where rol = 'vendedor_junior') then raise exception '143: quedaron permisos'; end if;
    raise exception '__143_DESHACER__';
  exception when others then
    if sqlerrm <> '__143_DESHACER__' then raise; end if;
  end;
  raise notice '143: roles y permisos por módulo.';
end $$;
