-- ###########################################################################
-- 035 · UN CLIENTE TIENE VARIOS CONTACTOS, Y LA COTIZACIÓN VA DIRIGIDA A UNO
-- ###########################################################################
--
-- Pedido de Willy en la reunión del 31/08, y lo explicó él mejor de lo que se
-- puede resumir (2:36):
--
--   «La cotización puede ir dirigida al de compras generalmente, al de
--    logística, que es el asistente o el jefe de compras, rara vez el jefe de
--    compras, o en otros casos también al personal de mantenimiento, puesto
--    que en algunas empresas el mismo usuario es el encargado de pedir las
--    cotizaciones según su requerimiento. Entonces es conveniente a veces
--    colocarle a qué persona.»
--
-- Y después (4:02):
--
--   «Cuando hago la cotización debo tener la opción para elegir a qué contacto
--    de los ya creados va dirigido el presupuesto.»
--
-- Hasta hoy `clientes` tenía UN contacto y un cargo, dos columnas de texto. Un
-- cliente con jefe de compras, asistente de logística y jefe de mantenimiento
-- no cabía, y la cotización llevaba el nombre tecleado a mano cada vez.
--
-- ---------------------------------------------------------------------------
-- Por qué las columnas viejas se BORRAN en vez de quedarse
-- ---------------------------------------------------------------------------
-- Dejar `clientes.contacto` conviviendo con la tabla nueva es tener el dato en
-- dos sitios, y dos sitios se separan. Se pueden borrar sin perder nada porque
-- están VACÍAS en los 37 clientes reales: la carga del 28/08 no las llenó
-- —el Excel de Willy no traía contactos— y antes de eso solo había demo.
--
-- Aun así el traspaso se hace, y con el orden correcto: primero copiar, luego
-- borrar. Si mañana alguien reaplica la cadena sobre una base donde SÍ había
-- contactos escritos a mano, se conservan.
--
-- Lo que NO se copia son `email`, `telefono` y `whatsapp` del cliente. Están
-- pegados al contacto en el formulario de hoy, pero en la tabla son de la
-- EMPRESA, y adivinar de quién son es inventarse un dato. Se quedan donde
-- están; el contacto estrena los suyos vacíos.
--
-- ---------------------------------------------------------------------------
-- La cotización guarda el id Y el nombre
-- ---------------------------------------------------------------------------
-- `contacto_id` apunta a la ficha; `contacto` sigue siendo texto y guarda el
-- nombre TAL COMO ESTABA al cotizar. No es redundancia: es que un documento
-- dice lo que decía cuando se emitió. Si el jefe de compras se va de la
-- empresa y su ficha se desactiva o se corrige, la cotización de hace seis
-- meses tiene que seguir diciendo a quién se le mandó.
--
-- Es la misma decisión que la 029 tomó con la agencia de transporte en la
-- guía, y por el mismo motivo.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · La tabla
-- ---------------------------------------------------------------------------
create table if not exists cliente_contactos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  nombre         text not null,
  cargo          text,
  -- El área importa más que el cargo para saber a quién dirigir qué: Willy
  -- nombró compras, logística y mantenimiento. Texto libre y no un enum
  -- porque la lista real la sabe él, no nosotros.
  area           text,
  email          text,
  telefono       text,
  whatsapp       text,
  -- A quién se le manda si nadie elige. Uno por cliente como mucho.
  principal      boolean not null default false,
  activo         boolean not null default true,
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  busqueda       text generated always as (
                   public.normalizar_texto(
                     nombre || ' ' || coalesce(cargo,'') || ' ' || coalesce(area,'')
                   )
                 ) stored,
  constraint cc_nombre_no_vacio check (btrim(nombre) <> '')
);

create index if not exists ix_cliente_contactos_cliente
  on cliente_contactos (cliente_id, nombre) where activo;

-- Un solo principal por cliente. Parcial sobre `activo` a propósito: al dar de
-- baja al que era principal, el hueco queda libre para nombrar a otro sin
-- tener que limpiar antes la bandera del que se fue.
create unique index if not exists ux_cliente_contactos_principal
  on cliente_contactos (cliente_id) where principal and activo;

-- Ni dos «Juan Pérez» activos en el mismo cliente. Normalizado, porque «JUAN
-- PEREZ» y «Juan Pérez» son la misma persona tecleada dos veces.
create unique index if not exists ux_cliente_contactos_nombre
  on cliente_contactos (cliente_id, public.normalizar_texto(nombre)) where activo;

comment on table cliente_contactos is
  'Las personas de una empresa cliente. Pedido de Willy (31/08): la cotización va dirigida al de compras, al de logística o al de mantenimiento según el caso, y hay que poder elegir a cuál.';
comment on column cliente_contactos.principal is
  'A quién se dirige la cotización si nadie elige. Como mucho uno activo por cliente.';

drop trigger if exists trg_cliente_contactos_touch on cliente_contactos;
create trigger trg_cliente_contactos_touch
  before update on cliente_contactos
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- 2 · Traspaso y borrado de las columnas viejas
-- ---------------------------------------------------------------------------
do $$
declare v_copiados int := 0;
begin
  -- `if exists` porque al reaplicar la cadena la columna ya no está.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'clientes' and column_name = 'contacto'
  ) then
    execute $ins$
      insert into cliente_contactos (cliente_id, nombre, cargo, principal)
      select c.id,
             btrim(c.contacto),
             nullif(btrim(coalesce(c.cargo_contacto, '')), ''),
             true
        from clientes c
       where coalesce(btrim(c.contacto), '') <> ''
      on conflict do nothing
    $ins$;
    get diagnostics v_copiados = row_count;
    raise notice 'Contactos traspasados desde clientes.contacto: %', v_copiados;
  end if;
end $$;

alter table clientes drop column if exists contacto;
alter table clientes drop column if exists cargo_contacto;

-- ---------------------------------------------------------------------------
-- 3 · La cotización apunta a uno
-- ---------------------------------------------------------------------------
-- `on delete set null`: si alguien borra la ficha del contacto, la cotización
-- pierde el enlace pero CONSERVA el nombre en `contacto`. El documento no se
-- queda mudo.
alter table cotizaciones
  add column if not exists contacto_id uuid references cliente_contactos(id) on delete set null;

create index if not exists ix_cotizaciones_contacto
  on cotizaciones (contacto_id) where contacto_id is not null;

comment on column cotizaciones.contacto is
  'El nombre TAL COMO ESTABA al cotizar. No se recalcula desde contacto_id: un documento dice lo que decía cuando se emitió.';
comment on column cotizaciones.contacto_id is
  'La ficha del contacto, para poder listar «qué le hemos cotizado a esta persona». Puede quedar en null sin que el documento pierda el nombre.';

-- ---------------------------------------------------------------------------
-- 4 · crear_cotizacion acepta el contacto elegido
-- ---------------------------------------------------------------------------
-- Se redefine entera porque `create or replace` no admite tocar solo un
-- trozo. Es la misma de la 004 con dos cambios: `contacto_id` en el insert, y
-- que si viene el id y NO viene el nombre, el nombre se saca de la ficha —así
-- quien llama no tiene que mandar los dos y no pueden contradecirse.
create or replace function public.crear_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_serie    text := coalesce(nullif(p_datos ->> 'serie',''),
                              (select serie from series_documento where tipo='cotizacion' and predeterminada and activo limit 1),
                              'COT1');
  v_corr     integer := public.siguiente_correlativo('cotizacion', v_serie);
  v_items    jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_contacto uuid := nullif(p_datos ->> 'contacto_id','')::uuid;
  v_nombre   text := nullif(p_datos ->> 'contacto','');
  v_cliente  uuid := (p_datos ->> 'cliente_id')::uuid;
begin
  -- Control de rol. Va lo PRIMERO: validar a media función deja un correlativo
  -- quemado o stock movido.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede emitir una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  -- El contacto tiene que ser DE ESTE CLIENTE. Sin esto, quien llame por
  -- PostgREST puede dirigir la cotización de un cliente al comprador de otro,
  -- y el nombre saldría impreso en el PDF que se manda.
  if v_contacto is not null then
    if not exists (
      select 1 from cliente_contactos cc
       where cc.id = v_contacto and cc.cliente_id = v_cliente
    ) then
      raise exception 'El contacto elegido no pertenece a ese cliente'
        using errcode = 'foreign_key_violation';
    end if;
    -- El nombre que se imprime sale de la ficha si no vino puesto.
    if v_nombre is null then
      select cc.nombre into v_nombre from cliente_contactos cc where cc.id = v_contacto;
    end if;
  end if;

  insert into cotizaciones (
    serie, correlativo, cliente_id, fecha, validez_dias, orden_compra_cliente,
    mostrar_descuento, vendedor_id, contacto, contacto_id, condiciones,
    observaciones, tiempo_entrega, estado
  ) values (
    v_serie, v_corr,
    v_cliente,
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    coalesce(nullif(p_datos ->> 'validez_dias','')::smallint, 15),
    nullif(p_datos ->> 'orden_compra_cliente',''),
    coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    coalesce(nullif(p_datos ->> 'vendedor_id','')::uuid, auth.uid()),
    v_nombre,
    v_contacto,
    nullif(p_datos ->> 'condiciones',''),
    nullif(p_datos ->> 'observaciones',''),
    nullif(p_datos ->> 'tiempo_entrega',''),
    coalesce(nullif(p_datos ->> 'estado','')::estado_cotizacion, 'borrador')
  ) returning id into v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    precio_minimo_ref, entrega
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         i.ord::smallint,
         i.value ->> 'codigo',
         nullif(i.value ->> 'marca',''),
         i.value ->> 'descripcion',
         (i.value ->> 'cantidad')::numeric,
         coalesce(nullif(i.value ->> 'unidad_codigo',''), 'NIU'),
         (i.value ->> 'valor_unitario')::numeric,
         coalesce((i.value ->> 'descuento_pct')::numeric, 0),
         coalesce((i.value ->> 'costo_unitario')::numeric, 0),
         coalesce(
           (select p.precio_minimo from productos p
             where p.id = nullif(i.value ->> 'producto_id','')::uuid),
           0),
         nullif(i.value ->> 'entrega','')
    from jsonb_array_elements(v_items) with ordinality as i(value, ord);

  return jsonb_build_object('ok', true, 'id', v_id,
                            'numero', v_serie || '-' || lpad(v_corr::text, 8, '0'));
end $$;

comment on function public.crear_cotizacion(jsonb) is
  'Alta de cotización completa en una llamada. Desde la 035 acepta `contacto_id` y comprueba que el contacto sea de ese cliente: dirigir la cotización de una empresa al comprador de otra imprimiría un nombre ajeno en el PDF que se manda.';

-- ---------------------------------------------------------------------------
-- 5 · Los contactos de un cliente, para el selector de la cotización
-- ---------------------------------------------------------------------------
-- `stable`, solo lee. El principal primero y después por nombre: quien abre el
-- desplegable casi siempre quiere el de siempre.
create or replace function public.contactos_de_cliente(
  p_cliente uuid
) returns table (
  id       uuid,
  nombre   text,
  cargo    text,
  area     text,
  email    text,
  telefono text,
  whatsapp text,
  principal boolean
)
language sql stable security definer set search_path = public, extensions
as $$
  select cc.id, cc.nombre, cc.cargo, cc.area, cc.email, cc.telefono,
         cc.whatsapp, cc.principal
    from cliente_contactos cc
   where cc.cliente_id = p_cliente
     and cc.activo
   order by cc.principal desc, cc.nombre;
$$;

comment on function public.contactos_de_cliente(uuid) is
  'Los contactos activos de un cliente, el principal primero. Lo usa el selector «a quién va dirigida» del constructor de cotizaciones.';

-- ---------------------------------------------------------------------------
-- 6 · buscar_clientes y clientes_sugeridos, al día
-- ---------------------------------------------------------------------------
-- Devolvían `clientes.contacto`, que ya no existe. Ahora devuelven el nombre
-- del PRINCIPAL y CUÁNTOS hay: en la fila del buscador, «3 contactos» dice
-- algo que un nombre suelto no dice.
--
-- Hay que tirarlas antes: cambia la firma de salida y `create or replace` no
-- admite cambiar el tipo de retorno.
drop function if exists public.buscar_clientes(text, int);
drop function if exists public.clientes_sugeridos(int);

create function public.buscar_clientes(
  p_q     text,
  p_limit int default 20
) returns table (
  id                uuid,
  codigo            text,
  tipo_documento    tipo_documento_identidad,
  numero_documento  text,
  razon_social      text,
  nombre_comercial  text,
  contacto          text,
  contactos         int,
  telefono          text,
  whatsapp          text,
  email             text,
  condicion_pago    condicion_pago,
  dias_credito      smallint,
  linea_credito     numeric,
  bloqueado         boolean,
  motivo_bloqueo    text,
  activo            boolean,
  cotizaciones      int,
  ultima_cotizacion date,
  puntaje           int
)
language sql stable security definer set search_path = public, extensions
as $$
  with q as (
    select public.normalizar_texto(coalesce(p_q, ''))         as texto,
           regexp_replace(coalesce(p_q, ''), '\D', '', 'g')    as digitos,
           public.normalizar_codigo(coalesce(p_q, ''))         as codigo
  ),
  elegidos as (
    select c.id,
           case
             when q.digitos <> '' and c.busq_documento = q.digitos                then 4
             when q.digitos <> '' and c.busq_documento like q.digitos || '%'      then 3
             when q.codigo is not null
                  and public.normalizar_codigo(c.codigo) = q.codigo               then 3
             when q.texto <> '' and c.busq_razon_social like q.texto || '%'       then 2
             when q.texto <> '' and c.busqueda like '%' || q.texto || '%'         then 1
             else 0
           end                                                as puntaje,
           similarity(c.busq_razon_social, q.texto)           as parecido,
           c.activo, c.bloqueado, c.razon_social
      from clientes c
     cross join q
     where q.texto = ''
        or c.busqueda like '%' || q.texto || '%'
        or (q.digitos <> '' and c.busq_documento like q.digitos || '%')
        or c.busq_razon_social % q.texto
     order by c.activo desc, c.bloqueado asc, puntaje desc, parecido desc, c.razon_social
     limit greatest(p_limit, 1)
  ),
  historial as (
    select ct.cliente_id, count(*)::int as veces, max(ct.fecha) as ultima
      from cotizaciones ct
     where ct.cliente_id in (select id from elegidos)
     group by ct.cliente_id
  ),
  gente as (
    select cc.cliente_id,
           count(*)::int                                             as cuantos,
           max(cc.nombre) filter (where cc.principal)                as principal,
           min(cc.nombre)                                            as cualquiera
      from cliente_contactos cc
     where cc.cliente_id in (select id from elegidos)
       and cc.activo
     group by cc.cliente_id
  )
  select c.id, c.codigo, c.tipo_documento, c.numero_documento,
         c.razon_social, c.nombre_comercial,
         coalesce(g.principal, g.cualquiera), coalesce(g.cuantos, 0),
         c.telefono, c.whatsapp, c.email, c.condicion_pago, c.dias_credito,
         c.linea_credito, c.bloqueado, c.motivo_bloqueo, c.activo,
         coalesce(h.veces, 0), h.ultima, e.puntaje
    from elegidos e
    join clientes c        on c.id = e.id
    left join historial h  on h.cliente_id = e.id
    left join gente g      on g.cliente_id = e.id
   order by e.activo desc, e.bloqueado asc, e.puntaje desc,
            e.parecido desc, e.razon_social;
$$;

comment on function public.buscar_clientes(text, int) is
  'Caja de búsqueda del selector de cliente. Busca por RUC/DNI, código y razón social a la vez, y ORDENA: documento completo > prefijo de documento o código > razón social que empieza por lo tecleado > contiene > se parece. Los desactivados salen marcados y al final. Desde la 035 `contacto` es el nombre del contacto principal y `contactos` cuántos tiene.';

create function public.clientes_sugeridos(
  p_limit int default 8
) returns table (
  id                uuid,
  codigo            text,
  tipo_documento    tipo_documento_identidad,
  numero_documento  text,
  razon_social      text,
  nombre_comercial  text,
  contacto          text,
  contactos         int,
  telefono          text,
  whatsapp          text,
  email             text,
  condicion_pago    condicion_pago,
  dias_credito      smallint,
  linea_credito     numeric,
  bloqueado         boolean,
  motivo_bloqueo    text,
  activo            boolean,
  cotizaciones      int,
  ultima_cotizacion date,
  puntaje           int
)
language sql stable security definer set search_path = public, extensions
as $$
  with historial as (
    select ct.cliente_id, count(*)::int as veces, max(ct.fecha) as ultima
      from cotizaciones ct
     group by ct.cliente_id
  ),
  gente as (
    select cc.cliente_id,
           count(*)::int                              as cuantos,
           max(cc.nombre) filter (where cc.principal) as principal,
           min(cc.nombre)                             as cualquiera
      from cliente_contactos cc
     where cc.activo
     group by cc.cliente_id
  )
  select c.id, c.codigo, c.tipo_documento, c.numero_documento,
         c.razon_social, c.nombre_comercial,
         coalesce(g.principal, g.cualquiera), coalesce(g.cuantos, 0),
         c.telefono, c.whatsapp, c.email, c.condicion_pago, c.dias_credito,
         c.linea_credito, c.bloqueado, c.motivo_bloqueo, c.activo,
         coalesce(h.veces, 0), h.ultima, 0
    from clientes c
    left join historial h on h.cliente_id = c.id
    left join gente g     on g.cliente_id = c.id
   where c.activo and not c.bloqueado
   order by h.ultima desc nulls last, c.razon_social
   limit greatest(p_limit, 1);
$$;

comment on function public.clientes_sugeridos(int) is
  'Los últimos cotizados, para que el selector de cliente enseñe algo útil antes de teclear. Cae al orden alfabético cuando todavía no hay cotizaciones.';

-- ---------------------------------------------------------------------------
-- 7 · Permisos, RLS y roles
-- ---------------------------------------------------------------------------
-- Los mismos que escriben `clientes`: gerencia y admin por el bloque de todo,
-- y ventas por el ciclo comercial. Quien puede dar de alta a la empresa puede
-- dar de alta a su gente.
insert into permisos_rol (tabla, rol, nota)
select 'cliente_contactos', r.rol::rol_usuario, 'contactos del cliente'
from (values ('gerencia'),('admin'),('ventas')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table cliente_contactos enable row level security;

drop policy if exists "lectura_autenticados" on cliente_contactos;
create policy "lectura_autenticados" on cliente_contactos
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on cliente_contactos;
create policy "escritura_insert" on cliente_contactos
  for insert to authenticated
  with check ((select public.puede_escribir('cliente_contactos')));

drop policy if exists "escritura_update" on cliente_contactos;
create policy "escritura_update" on cliente_contactos
  for update to authenticated
  using ((select public.puede_escribir('cliente_contactos')))
  with check ((select public.puede_escribir('cliente_contactos')));

-- Sin política de DELETE: se desactivan. Una cotización emitida no puede
-- quedarse apuntando a un contacto que desapareció — y aunque `on delete set
-- null` la protege, perder a quién se le mandó es perder información.
grant select, insert, update on cliente_contactos to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.buscar_clientes(text, int)',
    'public.clientes_sugeridos(int)',
    'public.contactos_de_cliente(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_cli   uuid;
  v_otro  uuid;
  v_c1    uuid;
  v_c2    uuid;
  v_ajeno uuid;
  v_n     int;
  v_txt   text;
begin
  -- Las columnas viejas ya no están.
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='clientes'
       and column_name in ('contacto','cargo_contacto')
  ) then
    raise exception 'clientes todavía tiene las columnas de contacto viejas';
  end if;

  insert into clientes (codigo, tipo_documento, numero_documento, razon_social)
  values ('ZZTEST035A', 'RUC', '20999977771', 'ZZTEST ACEROS DEL SUR SAC')
  returning id into v_cli;

  insert into clientes (codigo, tipo_documento, numero_documento, razon_social)
  values ('ZZTEST035B', 'RUC', '20999977772', 'ZZTEST OTRA EMPRESA SAC')
  returning id into v_otro;

  insert into cliente_contactos (cliente_id, nombre, cargo, area, principal)
  values (v_cli, 'Juan Pérez', 'Jefe de compras', 'compras', true)
  returning id into v_c1;

  insert into cliente_contactos (cliente_id, nombre, cargo, area)
  values (v_cli, 'Ana Torres', 'Asistente de logística', 'logistica')
  returning id into v_c2;

  insert into cliente_contactos (cliente_id, nombre, area)
  values (v_otro, 'Contacto Ajeno', 'compras')
  returning id into v_ajeno;

  -- Dos principales activos, no.
  begin
    update cliente_contactos set principal = true where id = v_c2;
    raise exception 'Dejó marcar dos contactos principales en el mismo cliente';
  exception when unique_violation then null;
  end;

  -- El mismo nombre dos veces en el mismo cliente, tampoco. Ni con tildes y
  -- mayúsculas distintas, que es como se teclea la segunda vez.
  begin
    insert into cliente_contactos (cliente_id, nombre) values (v_cli, 'JUAN PEREZ');
    raise exception 'Dejó duplicar un contacto por tildes o mayúsculas';
  exception when unique_violation then null;
  end;

  -- Pero en OTRO cliente sí, que Juan Pérez hay muchos.
  insert into cliente_contactos (cliente_id, nombre) values (v_otro, 'Juan Pérez');

  -- El selector los devuelve con el principal delante.
  select cd.nombre into v_txt from public.contactos_de_cliente(v_cli) cd limit 1;
  if v_txt is distinct from 'Juan Pérez' then
    raise exception 'contactos_de_cliente no pone primero al principal: %', v_txt;
  end if;

  select count(*) into v_n from public.contactos_de_cliente(v_cli);
  if v_n <> 2 then raise exception 'contactos_de_cliente devuelve % en vez de 2', v_n; end if;

  -- Y no se cuela el de otra empresa.
  if exists (select 1 from public.contactos_de_cliente(v_cli) cd where cd.id = v_ajeno) then
    raise exception 'contactos_de_cliente mezcla contactos de otro cliente';
  end if;

  -- El buscador enseña al principal y cuántos hay.
  select b.contacto, b.contactos into v_txt, v_n
    from public.buscar_clientes('20999977771', 5) b limit 1;
  if v_txt is distinct from 'Juan Pérez' then
    raise exception 'buscar_clientes no devuelve el contacto principal: %', v_txt;
  end if;
  if v_n <> 2 then
    raise exception 'buscar_clientes cuenta % contactos en vez de 2', v_n;
  end if;

  -- Un cliente sin contactos da 0 y no null: la pantalla resta y compara.
  select b.contactos into v_n
    from public.buscar_clientes('ZZTEST ACEROS', 5) b where b.id = v_cli limit 1;
  if v_n is null then raise exception 'buscar_clientes devuelve null en contactos'; end if;

  -- Al dar de baja al principal, el buscador cae al que queda en vez de mentir.
  update cliente_contactos set activo = false where id = v_c1;
  select b.contacto, b.contactos into v_txt, v_n
    from public.buscar_clientes('20999977771', 5) b limit 1;
  if v_txt is distinct from 'Ana Torres' then
    raise exception 'buscar_clientes sigue enseñando al contacto dado de baja: %', v_txt;
  end if;
  if v_n <> 1 then raise exception 'buscar_clientes cuenta bajas: %', v_n; end if;
  update cliente_contactos set activo = true, principal = true where id = v_c1;

  -- Y el hueco de principal se libera al desactivar, para poder nombrar a otro.
  update cliente_contactos set activo = false where id = v_c1;
  update cliente_contactos set principal = true where id = v_c2;
  update cliente_contactos set principal = false where id = v_c2;
  update cliente_contactos set activo = true where id = v_c1;

  -- Borrar al cliente se lleva a su gente por delante.
  delete from clientes where id = v_otro;
  if exists (select 1 from cliente_contactos where id = v_ajeno) then
    raise exception 'Los contactos sobreviven al borrado del cliente';
  end if;

  delete from clientes where id = v_cli;

  raise notice 'Contactos de cliente: varios por empresa, uno principal, y la cotización elige.';
end $$;
