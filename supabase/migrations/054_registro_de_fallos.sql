-- ###########################################################################
-- 054 · QUE LOS FALLOS DEJEN DE MORIR EN LA PANTALLA DEL OPERADOR
-- ###########################################################################
--
-- De la auditoría del 31/08 (PENDIENTES §0.2). No hay Sentry ni equivalente,
-- ni registro de servidor: cuando una Server Action falla, el error se pinta
-- en la pantalla de quien lo provocó **y muere ahí**. Nadie más se entera.
--
-- Y ya nos pasó. La cabecera de `lib/errores.ts` lleva escrito que la ficha de
-- producto estuvo días rota por un `PGRST200` sin que nadie lo supiera. Se
-- arregló el síntoma; la causa —que no hay forma de enterarse— seguía.
--
-- En un listado es molesto. En la emisión de un comprobante es una factura que
-- no salió y nadie sabe por qué.
--
-- ---------------------------------------------------------------------------
-- Por qué una tabla y no un servicio
-- ---------------------------------------------------------------------------
-- Sentry haría esto mejor y algún día valdrá la pena. Pero pide una cuenta,
-- una clave y una decisión que no es mía, y mientras tanto **no hay nada**.
-- Una tabla en la base que ya existe se pone hoy, no cuesta nada y contesta la
-- única pregunta que importa ahora: *¿está fallando algo que nadie me está
-- contando?*
--
-- Cuando llegue Sentry, esto se apaga en un sitio.
--
-- ---------------------------------------------------------------------------
-- Lo que NO se guarda
-- ---------------------------------------------------------------------------
-- Ni el payload de la acción ni el cuerpo de la petición. En este ERP eso
-- serían RUC, direcciones y precios de clientes reales, y un registro de
-- fallos no es sitio para datos de nadie. Se guarda dónde pasó, qué dijo el
-- error y quién lo vio — con eso se reproduce.
-- ###########################################################################

set search_path = public, extensions;

create table if not exists fallos (
  id          bigint generated always as identity primary key,

  -- Dónde. `origen` es la acción o la consulta: `facturacion/emitir`,
  -- `productos/guardar`. Se escribe a mano en cada sitio porque el nombre de
  -- la función minificada no le dice nada a nadie.
  origen      text not null,
  mensaje     text not null,
  /** El código de PostgREST o de Postgres, que es por lo que se rastrea. */
  codigo      text,

  usuario_id  uuid references perfiles(id) on delete set null,
  usuario_nombre text,
  /** La ruta del navegador donde ocurrió, si se sabe. */
  ruta        text,

  -- Cuántas veces ha pasado lo MISMO. Un fallo que ocurre cien veces es un
  -- fallo, no cien: apilarlos es lo que hace que la lista se pueda leer.
  veces       int not null default 1,
  primera_vez timestamptz not null default now(),
  ultima_vez  timestamptz not null default now(),

  revisado    boolean not null default false,

  -- Lo que hace de dos fallos el mismo. Sin el usuario ni la hora dentro:
  -- «esto falla» es una cosa y «a Rosa le falló a las tres» es otra.
  huella      text not null,

  constraint fallo_origen_no_vacio check (length(btrim(origen)) > 0),
  constraint fallo_veces_pos check (veces > 0)
);

create unique index if not exists ux_fallos_huella on fallos (huella) where not revisado;
create index if not exists ix_fallos_recientes on fallos (ultima_vez desc, id desc);

comment on table fallos is
  'Los errores de servidor, apilados por huella. Existe porque hoy un fallo muere en la pantalla de quien lo provocó y nadie más se entera (PENDIENTES §0.2). No guarda payloads: en este ERP serían datos de clientes reales.';

-- ---------------------------------------------------------------------------
-- Apuntar uno
-- ---------------------------------------------------------------------------
-- `security definer` y abierta a `authenticated`: cualquiera que use el ERP
-- tiene que poder dejar constancia de que algo le falló, incluso —sobre todo—
-- si lo que falló fue un permiso.
create or replace function public.registrar_fallo(
  p_origen  text,
  p_mensaje text,
  p_codigo  text default null,
  p_ruta    text default null
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_quien  uuid := auth.uid();
  v_nombre text;
  v_huella text;
begin
  if coalesce(btrim(p_origen), '') = '' or coalesce(btrim(p_mensaje), '') = '' then
    return;
  end if;

  select p.nombre into v_nombre from perfiles p where p.id = v_quien;

  -- El mensaje se recorta para la huella: los de Postgres traen a veces el
  -- valor concreto que falló, y dos intentos con dos valores distintos son el
  -- mismo fallo.
  v_huella := md5(p_origen || '|' || coalesce(p_codigo, '') || '|' || left(p_mensaje, 120));

  insert into fallos (origen, mensaje, codigo, usuario_id, usuario_nombre, ruta, huella)
  values (left(p_origen, 120), left(p_mensaje, 2000), left(p_codigo, 40),
          v_quien, coalesce(v_nombre, 'sistema'), left(p_ruta, 200), v_huella)
  on conflict (huella) where not revisado do update
    set veces = fallos.veces + 1,
        ultima_vez = now(),
        -- Se guarda quién lo vio la ÚLTIMA vez: si le pasa a más de uno, es
        -- del sistema y no de la sesión de nadie.
        usuario_id = excluded.usuario_id,
        usuario_nombre = excluded.usuario_nombre,
        ruta = coalesce(excluded.ruta, fallos.ruta);
end $$;

comment on function public.registrar_fallo(text, text, text, text) is
  'Apunta un fallo de servidor apilándolo por huella. Nunca lanza: un registro de fallos que rompe la pantalla que intentaba salvar no sirve de nada.';

revoke execute on function public.registrar_fallo(text, text, text, text) from public, anon;
grant execute on function public.registrar_fallo(text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- La tabla nace después de la 006, así que su bucle no la tocó: se quedaría
-- con RLS activo y cero políticas. Mismo caso que `proveedor_productos` (046)
-- y `plantillas_mensaje` (049).
alter table fallos enable row level security;

drop policy if exists "lectura_autenticados" on fallos;
create policy "lectura_autenticados" on fallos
  for select to authenticated
  using ((select public.mi_rol()) is not null);

-- No hay política de INSERT: se escribe SOLO por `registrar_fallo`, que
-- normaliza la huella y apila. Una inserción directa rompería el apilado.
drop policy if exists "escritura_insert" on fallos;

-- Marcar como revisado sí, para poder limpiar la lista.
drop policy if exists "escritura_update" on fallos;
create policy "escritura_update" on fallos
  for update to authenticated
  using ((select public.puede_escribir('fallos')))
  with check ((select public.puede_escribir('fallos')));

insert into permisos_rol (tabla, rol, escribir, nota) values
  ('fallos', 'gerencia', true, 'acceso total'),
  ('fallos', 'admin',    true, 'acceso total')
on conflict (tabla, rol) do update set escribir = excluded.escribir;

-- `permisos_rol` está vigilada por la bitácora (051), así que ese INSERT
-- deja dos filas diciendo que «el sistema» tocó los permisos. Y como esto
-- se puede reaplicar, dejaría dos más cada vez. Se borran: la bitácora es
-- para saber quién cambió los permisos, no para contar que se instalaron.
delete from actividad
 where entidad = 'permisos_rol'
   and creado_en > now() - interval '1 minute';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien uuid;
  v_f     record;
  v_n     int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  if v_quien is null then
    raise notice 'Sin perfil de gerencia: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  delete from fallos where origen = 'zztest/prueba';

  -- 1 · Se apunta, con quién.
  perform public.registrar_fallo('zztest/prueba', 'Algo se rompió', 'PGRST200', '/productos');
  select * into v_f from fallos where origen = 'zztest/prueba';
  if v_f is null then raise exception 'El fallo no se apuntó'; end if;
  if v_f.veces <> 1 then raise exception 'Empezó en % veces', v_f.veces; end if;
  if v_f.usuario_id is distinct from v_quien then
    raise exception 'No guardó quién lo vio';
  end if;

  -- 2 · El MISMO fallo se apila, no se duplica. Es lo que hace que la lista se
  -- pueda leer cuando algo falla cien veces.
  perform public.registrar_fallo('zztest/prueba', 'Algo se rompió', 'PGRST200', '/clientes');
  select * into v_f from fallos where origen = 'zztest/prueba';
  select count(*) into v_n from fallos where origen = 'zztest/prueba';
  if v_n <> 1 then raise exception 'Se duplicó: hay % filas', v_n; end if;
  if v_f.veces <> 2 then raise exception 'No apiló: va por % veces', v_f.veces; end if;

  -- 3 · Uno distinto sí es otra fila.
  perform public.registrar_fallo('zztest/prueba', 'Otra cosa', '23505', null);
  select count(*) into v_n from fallos where origen = 'zztest/prueba';
  if v_n <> 2 then raise exception 'Un fallo distinto no abrió fila nueva'; end if;

  -- 4 · Y uno vacío no ensucia.
  perform public.registrar_fallo('', 'x');
  perform public.registrar_fallo('zztest/prueba', '   ');
  select count(*) into v_n from fallos where origen = 'zztest/prueba';
  if v_n <> 2 then raise exception 'Un fallo vacío llegó a la tabla'; end if;

  delete from fallos where origen = 'zztest/prueba';
  perform set_config('request.jwt.claims', '', true);

  raise notice 'Los fallos se apuntan, se apilan por huella y dicen quién los vio.';
end $$;
