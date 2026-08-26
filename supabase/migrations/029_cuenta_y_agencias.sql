-- ###########################################################################
-- 029 · CUENTA BANCARIA EN LOS DOCUMENTOS Y MAESTRO DE AGENCIAS
-- ###########################################################################
--
-- Dos peticiones sueltas de la demo del 26/08.
--
-- ---------------------------------------------------------------------------
-- 1 · La cuenta bancaria (14:40)
-- ---------------------------------------------------------------------------
--   «Últimamente hay algunos clientes que me piden indicar número de cuenta en
--    la factura o en la cotización. En la cotización siempre debe salir. En la
--    factura también es una práctica recomendable que ya lleve pre-impresa la
--    cuenta corriente, porque a veces se confunden, para evitar los problemas.»
--
-- O sea: en la cotización SIEMPRE, sin interruptor; en la factura por defecto
-- SÍ, pero con la opción de quitarla. Por eso `comprobantes.mostrar_cuenta`
-- arranca en true y en cotizaciones no hay columna equivalente: un dato que
-- siempre sale no necesita una casilla que nadie va a desmarcar.
--
-- `empresa` ya tenía `cuenta_detraccion`, que es OTRA cosa —la del Banco de la
-- Nación para el SPOT— y no vale para cobrar. Se añaden las de verdad.
--
-- ---------------------------------------------------------------------------
-- 2 · Las agencias de transporte (21:00 y 22:31)
-- ---------------------------------------------------------------------------
--   «Cuando son empresas de transporte, cuando se envía a provincia… a veces
--    envío pedidos por agencia a Trujillo.»
--   «No son muchas, tengo dos o tres agencias.»
--
-- Los campos del transportista YA estaban en la guía desde la 002
-- (`transportista_documento`, `transportista_razon_social`, la placa, el
-- conductor). Lo que faltaba es la LISTA de la que elegir, para no volver a
-- teclear el RUC de Shalom en cada envío a provincia.
--
-- Se precargan las tres que cubren el 90 % de los envíos interprovinciales en
-- Perú, con su RUC real. Si Willy usa otras, se dan de alta y ya; y si alguna
-- de estas no le sirve, se desactiva sin borrarla —una guía vieja tiene que
-- poder seguir citándola—.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · Cuenta bancaria
-- ---------------------------------------------------------------------------
alter table empresa add column if not exists banco text;
alter table empresa add column if not exists cuenta_corriente text;
alter table empresa add column if not exists cci text;

comment on column empresa.cuenta_corriente is
  'Cuenta a la que cobra. NO confundir con `cuenta_detraccion`, que es la del Banco de la Nación para el SPOT y no sirve para cobrar.';
comment on column empresa.cci is
  'Código de Cuenta Interbancario, para transferencias desde otro banco. Es lo que de verdad piden los clientes que pagan desde un banco distinto.';

alter table comprobantes
  add column if not exists mostrar_cuenta boolean not null default true;

comment on column comprobantes.mostrar_cuenta is
  'Si la factura imprime la cuenta bancaria. Por defecto SÍ: Willy 26/08 (14:40), «es una práctica recomendable que ya lleve pre-impresa la cuenta corriente porque a veces se confunden». Se puede quitar caso por caso. En la cotización sale siempre y no hay interruptor.';

-- ---------------------------------------------------------------------------
-- 2 · Agencias de transporte
-- ---------------------------------------------------------------------------
create table if not exists agencias_transporte (
  id               uuid primary key default gen_random_uuid(),
  razon_social     text not null,
  numero_documento text,
  -- El nombre con el que se la conoce: «Shalom», no «SHALOM EMPRESARIAL S.A.C.».
  -- Es por el que se busca al despachar.
  nombre_corto     text,
  direccion        text,
  telefono         text,
  contacto         text,
  notas            text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  busqueda text generated always as (
    public.normalizar_texto(
      razon_social || ' ' || coalesce(nombre_corto, '') || ' ' || coalesce(numero_documento, '')
    )
  ) stored,
  constraint agencia_ruc_ok check (numero_documento is null or numero_documento ~ '^[0-9]{11}$')
);

create unique index if not exists ux_agencias_documento
  on agencias_transporte (numero_documento) where numero_documento is not null;
create unique index if not exists ux_agencias_nombre
  on agencias_transporte (public.normalizar_codigo(razon_social));
create index if not exists ix_agencias_busqueda
  on agencias_transporte using gin (busqueda extensions.gin_trgm_ops, activo);

comment on table agencias_transporte is
  'Agencias con las que se despacha a provincia. Willy 26/08 (22:31): «no son muchas, tengo dos o tres». Se DESACTIVAN, no se borran: una guía vieja tiene que poder seguir citando la suya.';

drop trigger if exists trg_agencias_actualizado on agencias_transporte;
create trigger trg_agencias_actualizado
  before update on agencias_transporte
  for each row execute function public.tocar_actualizado_en();

-- La guía apunta a la agencia elegida. Sigue guardando el nombre y el RUC en
-- sus propias columnas —el documento tiene que decir lo que decía el día que
-- se emitió, aunque la agencia cambie de razón social después—; esto es solo
-- el atajo para no teclearlos.
alter table guias_remision
  add column if not exists agencia_id uuid references agencias_transporte(id) on delete set null;

create index if not exists ix_guias_agencia
  on guias_remision (agencia_id) where agencia_id is not null;

comment on column guias_remision.agencia_id is
  'De qué agencia se copiaron los datos del transportista. El nombre y el RUC quedan copiados en la guía a propósito: el documento dice lo que decía al emitirse.';

-- ---------------------------------------------------------------------------
-- 3 · Permisos y RLS
-- ---------------------------------------------------------------------------
-- Quien despacha elige la agencia, así que la lee todo el mundo y la mantienen
-- los mismos que las guías.
insert into permisos_rol (tabla, rol, nota)
select 'agencias_transporte', r.rol::rol_usuario, 'agencias de transporte'
from (values ('gerencia'),('admin'),('ventas'),('almacen')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table agencias_transporte enable row level security;

drop policy if exists "lectura_autenticados" on agencias_transporte;
create policy "lectura_autenticados" on agencias_transporte
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on agencias_transporte;
create policy "escritura_insert" on agencias_transporte
  for insert to authenticated
  with check ((select public.puede_escribir('agencias_transporte')));

drop policy if exists "escritura_update" on agencias_transporte;
create policy "escritura_update" on agencias_transporte
  for update to authenticated
  using ((select public.puede_escribir('agencias_transporte')))
  with check ((select public.puede_escribir('agencias_transporte')));

-- Sin política de DELETE: se desactivan. Una guía emitida no puede quedarse
-- apuntando a una agencia que desapareció.

grant select, insert, update on agencias_transporte to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Las que cubren casi todos los envíos a provincia
-- ---------------------------------------------------------------------------
insert into agencias_transporte (razon_social, nombre_corto, numero_documento, notas)
values
  ('SHALOM EMPRESARIAL S.A.C.', 'Shalom', '20601226310',
   'La más usada para provincia. Cobro en destino.'),
  ('TRANSPORTES CRUZ DEL SUR S.A.C.', 'Cruz del Sur', '20111708873',
   'Carga por bus. Cobertura nacional.'),
  ('OLVA COURIER S.A.C.', 'Olva', '20297868790',
   'Paquetería pequeña, entrega a domicilio.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'empresa' and column_name = 'cuenta_corriente'
  ) then
    raise exception 'No se creó empresa.cuenta_corriente';
  end if;

  -- La de detracción sigue siendo OTRA columna. Confundirlas sería poner en la
  -- factura una cuenta del Banco de la Nación a la que el cliente no puede
  -- transferir.
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'empresa' and column_name = 'cuenta_detraccion'
  ) then
    raise exception 'Se perdió empresa.cuenta_detraccion';
  end if;

  -- La factura la imprime POR DEFECTO.
  if (select column_default from information_schema.columns
       where table_name = 'comprobantes' and column_name = 'mostrar_cuenta') !~ 'true' then
    raise exception 'comprobantes.mostrar_cuenta no arranca en true';
  end if;

  if (select count(*) from agencias_transporte) < 3 then
    raise exception 'No se precargaron las agencias';
  end if;

  -- Y no se pueden borrar: solo desactivar.
  if exists (
    select 1 from pg_policies
     where tablename = 'agencias_transporte' and cmd = 'DELETE'
  ) then
    raise exception 'Hay una política que permite BORRAR agencias';
  end if;

  raise notice 'Cuenta bancaria en los documentos y maestro de agencias en su sitio.';
end $$;
