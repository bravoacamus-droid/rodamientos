-- ###########################################################################
-- 060 · EL MAESTRO DE TRANSPORTE
-- ###########################################################################
--
-- Luis, 07/09: *«deberíamos tener nuestra data maestra de transporte, ¿no?,
-- donde tenemos público y privado, así pueden editar, crear o dar de baja»*.
--
-- ---------------------------------------------------------------------------
-- Lo que faltaba
-- ---------------------------------------------------------------------------
-- La guía de remisión distingue dos modalidades y solo una tenía maestro:
--
--   · **Transporte público** — la 029 creó `agencias_transporte`, y desde el
--     07/09 se pueden dar de alta sin salir de la guía.
--   · **Transporte privado** — la camioneta de la empresa y quien la conduce
--     se **tecleaban enteros en cada guía**: placa, nombre, DNI y licencia.
--
-- Son los mismos dos o tres vehículos y los mismos dos o tres choferes todas
-- las semanas. Teclearlos cada vez no es solo trabajo repetido: es la vía por
-- la que un número de licencia entra mal y sale impreso en un documento que
-- fiscaliza SUNAT, sin que nada lo compare con la vez anterior.
--
-- ---------------------------------------------------------------------------
-- Se DESACTIVAN, no se borran
-- ---------------------------------------------------------------------------
-- Igual que las agencias, y por la misma razón: una guía de hace ocho meses
-- tiene que poder seguir citando el vehículo con el que salió. Dar de baja
-- significa «no me lo ofrezcas más», no «haz como si no hubiera existido».
--
-- Por eso no hay política de DELETE en ninguna de las dos.
--
-- ---------------------------------------------------------------------------
-- Y la guía sigue guardando el texto
-- ---------------------------------------------------------------------------
-- `vehiculo_id` y `conductor_id` son el atajo para no teclear, no la fuente.
-- La placa, el nombre, el DNI y la licencia se quedan COPIADOS en la guía —ya
-- estaban ahí— porque el documento tiene que decir lo que decía el día que se
-- emitió, aunque el chofer renueve la licencia después. Es exactamente lo que
-- la 029 decidió para `agencia_id`.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1 · Los vehículos propios
-- ---------------------------------------------------------------------------
create table if not exists vehiculos (
  id             uuid primary key default gen_random_uuid(),
  -- Sin guion y en mayúsculas: «ABC123». Se normaliza al guardar para que
  -- «abc-123» y «ABC 123» no entren dos veces como si fueran dos camionetas.
  placa          text not null,
  -- Con lo que se le reconoce en el patio: «Hyundai H100 blanca».
  descripcion    text,
  marca          text,
  notas          text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint vehiculo_placa_ok check (placa ~ '^[A-Z0-9]{6,8}$')
);

create unique index if not exists ux_vehiculos_placa on vehiculos (placa);
create index if not exists ix_vehiculos_activos on vehiculos (activo) where activo;

comment on table vehiculos is
  'Los vehículos propios con los que se despacha en transporte privado. Luis 07/09: «nuestra data maestra de transporte, donde tenemos público y privado». Se DESACTIVAN, no se borran: una guía vieja tiene que poder seguir citando el suyo.';
comment on column vehiculos.placa is
  'Sin guion y en mayúsculas. La normaliza la aplicación antes de guardar, para que «abc-123» no entre como un vehículo distinto de «ABC123».';

drop trigger if exists trg_vehiculos_actualizado on vehiculos;
create trigger trg_vehiculos_actualizado
  before update on vehiculos
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- 2 · Los conductores
-- ---------------------------------------------------------------------------
create table if not exists conductores (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  numero_documento text,
  licencia         text,
  telefono         text,
  notas            text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  -- El DNI es opcional, pero si está tiene que ser un DNI: sale impreso en la
  -- guía y SUNAT lo valida.
  constraint conductor_dni_ok check (numero_documento is null or numero_documento ~ '^[0-9]{8}$')
);

create unique index if not exists ux_conductores_documento
  on conductores (numero_documento) where numero_documento is not null;
create unique index if not exists ux_conductores_nombre
  on conductores (public.normalizar_codigo(nombre));
create index if not exists ix_conductores_activos on conductores (activo) where activo;

comment on table conductores is
  'Quién conduce en transporte privado. El nombre, el DNI y la licencia salen impresos en la guía, así que tenerlos escritos una vez y bien vale más que teclearlos en cada despacho.';
comment on column conductores.licencia is
  'Licencia de conducir. Sin ella la guía se prepara, pero no se puede emitir en transporte privado.';

drop trigger if exists trg_conductores_actualizado on conductores;
create trigger trg_conductores_actualizado
  before update on conductores
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- 3 · El atajo en la guía
-- ---------------------------------------------------------------------------
-- De dónde se copiaron los datos. La placa, el nombre, el DNI y la licencia
-- siguen guardándose en sus propias columnas de `guias_remision`: el documento
-- dice lo que decía al emitirse. Esto solo sirve para no teclear, y para poder
-- preguntar después «¿qué salió con esta camioneta?».
alter table guias_remision
  add column if not exists vehiculo_id  uuid references vehiculos(id) on delete set null,
  add column if not exists conductor_id uuid references conductores(id) on delete set null;

create index if not exists ix_guias_vehiculo
  on guias_remision (vehiculo_id) where vehiculo_id is not null;
create index if not exists ix_guias_conductor
  on guias_remision (conductor_id) where conductor_id is not null;

comment on column guias_remision.vehiculo_id is
  'De qué vehículo se copió la placa. La placa queda copiada en la guía a propósito: el documento dice lo que decía al emitirse.';
comment on column guias_remision.conductor_id is
  'De qué conductor se copiaron el nombre, el DNI y la licencia. Quedan copiados en la guía: si el chofer renueva la licencia, la guía vieja sigue diciendo la que llevaba ese día.';

-- ---------------------------------------------------------------------------
-- 4 · Permisos y RLS
-- ---------------------------------------------------------------------------
-- Los mismos que `agencias_transporte` en la 029: quien despacha elige el
-- vehículo, así que lo lee todo el mundo y lo mantienen los mismos que las
-- guías.
insert into permisos_rol (tabla, rol, nota)
select t.tabla, r.rol::rol_usuario, t.nota
from (values
        ('vehiculos',   'vehículos propios'),
        ('conductores', 'conductores')
     ) as t(tabla, nota)
cross join (values ('gerencia'),('admin'),('ventas'),('almacen')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table vehiculos   enable row level security;
alter table conductores enable row level security;

drop policy if exists "lectura_autenticados" on vehiculos;
create policy "lectura_autenticados" on vehiculos
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on vehiculos;
create policy "escritura_insert" on vehiculos
  for insert to authenticated
  with check ((select public.puede_escribir('vehiculos')));

drop policy if exists "escritura_update" on vehiculos;
create policy "escritura_update" on vehiculos
  for update to authenticated
  using ((select public.puede_escribir('vehiculos')))
  with check ((select public.puede_escribir('vehiculos')));

drop policy if exists "lectura_autenticados" on conductores;
create policy "lectura_autenticados" on conductores
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on conductores;
create policy "escritura_insert" on conductores
  for insert to authenticated
  with check ((select public.puede_escribir('conductores')));

drop policy if exists "escritura_update" on conductores;
create policy "escritura_update" on conductores
  for update to authenticated
  using ((select public.puede_escribir('conductores')))
  with check ((select public.puede_escribir('conductores')));

-- Sin política de DELETE en ninguna de las dos: se desactivan.
grant select, insert, update on vehiculos   to authenticated;
grant select, insert, update on conductores to authenticated;
