-- ###########################################################################
-- 064 · LAS CUENTAS DEL PIE
-- ###########################################################################
--
-- Willy, 26/08 (14:40): *«últimamente hay algunos clientes que me piden
-- indicar número de cuenta… es una práctica recomendable que ya lleve
-- pre-impresa la cuenta corriente, porque a veces se confunden»*. Y el 07/09
-- (11:50), repasando su cotización: *«abajo de la cotización debe aparecer el
-- número de cuentas siempre»*.
--
-- ---------------------------------------------------------------------------
-- Son VARIAS, no una
-- ---------------------------------------------------------------------------
-- La 029 le puso a `empresa` un `banco`, un `cuenta_corriente` y un `cci`: una
-- cuenta y se acabó. El formato que mandó el 07/09 imprime DOS, y era
-- previsible — factura en dólares y cobra en soles a quien paga en soles:
--
--     BANCO DE CREDITO DEL PERU (BCP) - CUENTA DOLARES US$
--     N°: …  ·  CCI: …
--     BANCO DE CREDITO DEL PERU (BCP) - CUENTA SOLES S/
--     N°: …  ·  CCI: …
--
-- Con un solo juego de columnas, la segunda cuenta se queda fuera del papel y
-- el cliente que paga en soles transfiere a la de dólares. Eso no es un
-- problema de formato: es una transferencia que hay que ir a rescatar al banco.
--
-- ---------------------------------------------------------------------------
-- Las de `empresa` se quedan
-- ---------------------------------------------------------------------------
-- No se borran ni se migran a ciegas. Si alguien ya cargó una cuenta ahí, se
-- copia a la tabla nueva al final de este archivo; y las columnas viejas
-- quedan como estaban, porque `cuenta_detraccion` es otra cosa —la del Banco
-- de la Nación para el SPOT— y no tiene nada que ver con cobrar.
-- ###########################################################################

set local search_path = public, extensions;

create table if not exists cuentas_bancarias (
  id        uuid primary key default gen_random_uuid(),
  banco     text not null,
  -- 'PEN' o 'USD'. Es lo que decide cuál se le enseña al cliente cuando el
  -- documento va en una moneda o en otra.
  moneda    char(3) not null,
  numero    text not null,
  -- El CCI es el que sirve para transferir desde OTRO banco. Sin él, un
  -- cliente que no es del BCP no puede pagar, así que va impreso al lado.
  cci       text,
  -- El orden en que salen en el papel. Willy imprime primero la de dólares,
  -- que es la moneda en la que factura.
  orden     smallint not null default 0,
  activo    boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint cuenta_moneda_ok check (moneda in ('PEN', 'USD')),
  constraint cuenta_numero_no_vacio check (btrim(numero) <> '')
);

create unique index if not exists ux_cuentas_numero
  on cuentas_bancarias (public.normalizar_codigo(numero));
create index if not exists ix_cuentas_activas
  on cuentas_bancarias (activo, orden) where activo;

comment on table cuentas_bancarias is
  'Las cuentas a las que cobra, para imprimirlas al pie de cotizaciones y facturas. Willy 07/09: «abajo de la cotización debe aparecer el número de cuentas siempre». Son varias porque factura en dólares y cobra en soles a quien paga en soles: con una sola, el cliente transfiere a la que no es.';
comment on column cuentas_bancarias.cci is
  'Código de cuenta interbancario. Es el que sirve para transferir desde otro banco: sin él, un cliente que no es del mismo banco no puede pagar.';

drop trigger if exists trg_cuentas_actualizado on cuentas_bancarias;
create trigger trg_cuentas_actualizado
  before update on cuentas_bancarias
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------
-- Las LEE todo el mundo: salen impresas en cada cotización que manda ventas.
-- Las cambia quien administra la empresa, igual que los datos fiscales.
insert into permisos_rol (tabla, rol, nota)
select 'cuentas_bancarias', r.rol::rol_usuario, 'cuentas para cobrar'
from (values ('gerencia'),('admin')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table cuentas_bancarias enable row level security;

drop policy if exists "lectura_autenticados" on cuentas_bancarias;
create policy "lectura_autenticados" on cuentas_bancarias
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on cuentas_bancarias;
create policy "escritura_insert" on cuentas_bancarias
  for insert to authenticated
  with check ((select public.puede_escribir('cuentas_bancarias')));

drop policy if exists "escritura_update" on cuentas_bancarias;
create policy "escritura_update" on cuentas_bancarias
  for update to authenticated
  using ((select public.puede_escribir('cuentas_bancarias')))
  with check ((select public.puede_escribir('cuentas_bancarias')));

-- Sin DELETE: se desactivan. Una cotización vieja cita la cuenta que citó.
grant select, insert, update on cuentas_bancarias to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ya hubiera cargado en `empresa`
-- ---------------------------------------------------------------------------
-- Sin datos inventados: solo se copia lo que exista de verdad. Los números
-- reales del cliente NO van en una migración, que esto se versiona en git.
insert into cuentas_bancarias (banco, moneda, numero, cci, orden)
select coalesce(e.banco, 'Sin especificar'),
       case when upper(coalesce(e.moneda, 'USD')) = 'PEN' then 'PEN' else 'USD' end,
       e.cuenta_corriente,
       e.cci,
       0
from empresa e
where e.id = 1
  and e.cuenta_corriente is not null
  and btrim(e.cuenta_corriente) <> ''
  and not exists (
    select 1 from cuentas_bancarias c
     where public.normalizar_codigo(c.numero) = public.normalizar_codigo(e.cuenta_corriente)
  );
