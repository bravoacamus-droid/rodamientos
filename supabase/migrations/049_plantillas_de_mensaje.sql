-- ###########################################################################
-- 049 · PLANTILLAS DE MENSAJE
-- ###########################################################################
--
-- Luis, 02/09: *«ya teniendo los proveedores sus números de celular, ayudar a
-- él en compras a mandar a su WhatsApp para preguntar los precios de los
-- productos»*, con *«mensajes predeterminados que puede crear»*.
--
-- ---------------------------------------------------------------------------
-- Qué es y qué NO es
-- ---------------------------------------------------------------------------
-- Es el texto que se manda, guardado y editable por él. El envío va por
-- enlaces `wa.me` —se abre WhatsApp con el mensaje escrito y la persona pulsa
-- enviar—, que es lo mismo que ya hace la cotización con el cliente.
--
-- **No es envío automático.** Eso sería la Cloud API de Meta: número dedicado,
-- verificación del negocio, plantillas aprobadas por Meta y pago por
-- conversación, más el riesgo de que baneen el número por mandar en masa a
-- quien no ha escrito. Para pedirle precio a cuatro proveedores conocidos no
-- compensa, y Willy ya lo hace así a mano (30:01: *«por WhatsApp o por
-- correo»*).
--
-- ---------------------------------------------------------------------------
-- Por qué una tabla y no un texto en el código
-- ---------------------------------------------------------------------------
-- Porque el mensaje lo escribe él. La forma de pedir precio de un rubro no la
-- sabe quien programa: la sabe quien lleva veinte años pidiéndolos. Dejarlo en
-- el código significa que cada cambio de una coma es un despliegue.
--
-- Las variables se escriben entre llaves —`{proveedor}`, `{items}`— y se
-- sustituyen al generar el mensaje. Qué variables existen lo decide el
-- dominio, en `plantillas.ts`, que es donde está probado.
-- ###########################################################################

set search_path = public, extensions;

do $$ begin
  -- Para qué sirve cada plantilla. El uso decide QUÉ variables tiene
  -- disponibles y desde qué pantalla se ofrece.
  create type uso_plantilla as enum ('pedido_precio', 'cotizacion', 'cobranza', 'general');
exception when duplicate_object then null; end $$;

do $$ begin
  create type canal_mensaje as enum ('whatsapp', 'correo');
exception when duplicate_object then null; end $$;

create table if not exists plantillas_mensaje (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  uso         uso_plantilla not null default 'pedido_precio',
  canal       canal_mensaje not null default 'whatsapp',

  -- Solo lo usa el correo. WhatsApp no tiene asunto, y guardar uno que no se
  -- manda confunde a quien edita la plantilla.
  asunto      text,
  cuerpo      text not null,

  -- La que se propone al abrir la pantalla. Una por (uso, canal).
  predeterminada boolean not null default false,
  activa      boolean not null default true,

  creado_por  uuid references perfiles(id) on delete set null,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint plantilla_nombre_no_vacio check (length(btrim(nombre)) > 0),
  constraint plantilla_cuerpo_no_vacio check (length(btrim(cuerpo)) > 0),
  -- WhatsApp tiene un tope real de 4.096 caracteres por mensaje. Un cuerpo más
  -- largo se cortaría al enviarlo, y el que se corta es el final: justo donde
  -- va la lista de códigos.
  constraint plantilla_cuerpo_cabe check (length(cuerpo) <= 3000),
  constraint plantilla_asunto_solo_correo check (canal = 'correo' or asunto is null)
);

-- Una sola predeterminada por uso y canal. Es un índice y no un check porque
-- la regla habla de VARIAS filas: dos predeterminadas dejarían a la pantalla
-- eligiendo por el orden en que Postgres las devuelva.
create unique index if not exists ux_plantilla_predeterminada
  on plantillas_mensaje (uso, canal) where predeterminada and activa;

create index if not exists ix_plantillas_uso on plantillas_mensaje (uso, canal) where activa;

comment on table plantillas_mensaje is
  'El texto que se manda a proveedores y clientes, editable desde Configuración. Las variables van entre llaves y las sustituye la aplicación.';

-- ---------------------------------------------------------------------------
-- Las dos primeras, para que no arranque en blanco
-- ---------------------------------------------------------------------------
-- Una pantalla con un editor vacío y sin ejemplo se queda vacía. Estas dos son
-- un punto de partida que él va a corregir, y está bien que lo haga: por eso
-- son filas y no código.
insert into plantillas_mensaje (nombre, uso, canal, cuerpo, predeterminada)
select 'Pedido de precios · WhatsApp', 'pedido_precio', 'whatsapp',
-- Sin punto después de `{proveedor}`: casi toda razón social peruana ya
-- termina en uno («S.A.C.», «E.I.R.L.») y saldría doble.
E'Buenos días, {proveedor}\n' ||
-- Coma y no punto, por lo mismo: «E.I.R.L.» ya trae el suyo.
E'Le escribo de {empresa}, ¿me puede cotizar lo siguiente?\n\n' ||
E'{items}\n\n' ||
E'Necesito precio unitario, tiempo de entrega y hasta cuándo me lo respeta.\n' ||
E'Gracias.\n{yo}',
       true
 where not exists (select 1 from plantillas_mensaje where uso = 'pedido_precio' and canal = 'whatsapp');

insert into plantillas_mensaje (nombre, uso, canal, asunto, cuerpo, predeterminada)
select 'Pedido de precios · correo', 'pedido_precio', 'correo',
       'Solicitud de cotización · {empresa}',
E'Estimados {proveedor}:\n\n' ||
E'Agradeceré su cotización de los siguientes ítems:\n\n' ||
E'{items}\n\n' ||
E'Por favor indicar precio unitario, plazo de entrega y validez de la oferta.\n\n' ||
E'Saludos,\n{yo}\n{empresa}',
       true
 where not exists (select 1 from plantillas_mensaje where uso = 'pedido_precio' and canal = 'correo');

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
-- La tabla nace después de la 006, así que su bucle no la tocó: se quedaría
-- con RLS activo y cero políticas, que en Postgres significa que nadie lee.
-- Mismo caso que `proveedor_productos` en la 046.
alter table plantillas_mensaje enable row level security;

drop policy if exists "lectura_autenticados" on plantillas_mensaje;
create policy "lectura_autenticados" on plantillas_mensaje
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on plantillas_mensaje;
create policy "escritura_insert" on plantillas_mensaje
  for insert to authenticated
  with check ((select public.puede_escribir('plantillas_mensaje')));

drop policy if exists "escritura_update" on plantillas_mensaje;
create policy "escritura_update" on plantillas_mensaje
  for update to authenticated
  using ((select public.puede_escribir('plantillas_mensaje')))
  with check ((select public.puede_escribir('plantillas_mensaje')));

drop policy if exists "escritura_delete" on plantillas_mensaje;
create policy "escritura_delete" on plantillas_mensaje
  for delete to authenticated
  using ((select public.puede_escribir('plantillas_mensaje')));

-- Quién puede escribirlas. Compras entra: el que pide los precios es quien
-- sabe cómo hay que pedirlos, y mandarlo a Gerencia por una coma haría que
-- nadie las corrija nunca.
insert into permisos_rol (tabla, rol, escribir, nota) values
  ('plantillas_mensaje', 'gerencia', true, 'acceso total'),
  ('plantillas_mensaje', 'admin',    true, 'acceso total'),
  ('plantillas_mensaje', 'compras',  true, 'redacta sus pedidos de precio')
on conflict (tabla, rol) do update set escribir = excluded.escribir;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_n  int;
  v_id uuid;
begin
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'plantillas_mensaje';
  if v_n <> 4 then
    raise exception 'plantillas_mensaje se quedó con % políticas y necesita 4', v_n;
  end if;

  select count(*) into v_n from plantillas_mensaje where uso = 'pedido_precio';
  if v_n < 2 then
    raise exception 'Faltan las plantillas de arranque: hay %', v_n;
  end if;

  -- Dos predeterminadas del mismo uso y canal dejarían a la pantalla eligiendo
  -- al azar. El índice tiene que impedirlo.
  begin
    insert into plantillas_mensaje (nombre, uso, canal, cuerpo, predeterminada)
    values ('ZZTEST segunda', 'pedido_precio', 'whatsapp', 'x', true);
    raise exception 'Dejó dos plantillas predeterminadas para el mismo uso y canal';
  exception when unique_violation then null;
  end;

  -- Y un asunto en una de WhatsApp no tiene dónde salir.
  begin
    insert into plantillas_mensaje (nombre, uso, canal, asunto, cuerpo)
    values ('ZZTEST asunto', 'general', 'whatsapp', 'no debería', 'x')
    returning id into v_id;
    raise exception 'Dejó guardar un asunto en una plantilla de WhatsApp';
  exception when check_violation then null;
  end;

  delete from plantillas_mensaje where nombre like 'ZZTEST%';

  raise notice 'plantillas_mensaje lista, con sus dos plantillas de arranque.';
end $$;
