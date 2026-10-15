-- ###########################################################################
-- 130 · LOS PEDIDOS
-- ###########################################################################
--
-- Luis, 15/10: *«en vez de listo para entregar sería pedidos, porque la
-- cotización puede duplicarse, se puede utilizar de nuevo, pero el pedido ya
-- es cuando se aprobó, y después desde ahí sí se puede vincular con órdenes de
-- compra… como dijo Willy, a veces quiere el mismo pedido el cliente»*.
--
-- Hasta hoy la cotización HACÍA de pedido. «Atender otro pedido» (121) sumaba
-- las cantidades nuevas a la misma cotización, y las órdenes de compra, las
-- guías y las facturas del pedido de octubre y del de noviembre colgaban
-- todas de lo mismo, mezcladas. No había forma de decir «este es el pedido 2,
-- y estas son SUS compras, SU guía y SU factura».
--
-- Ahora:
--
--   · `pedidos`: uno cada vez que el cliente confirma. Al aprobar la
--     cotización nace el primero (trigger: `aprobar_cotizacion` no se toca),
--     y cada «Atender otro pedido» crea el siguiente con sus cantidades.
--   · `compras`, `guias_remision` y `comprobantes` llevan `pedido_id`, que se
--     pone solo con el pedido VIGENTE de su cotización —el último—. Es
--     correcto porque «Atender otro pedido» solo se ofrece cuando el anterior
--     ya está despachado y facturado (121).
--   · Las cantidades siguen viviendo donde estaban (`cantidad_aprobada`, la
--     acumulada): los topes de guía y factura no cambian. El pedido guarda
--     las suyas para enseñarlas; las del primero se deducen (lo aprobado
--     menos lo de los pedidos siguientes), así que editar el pedido
--     confirmado no las descuadra.
--
-- Historia: las 631 cotizaciones CT02 cargadas del sistema viejo no tienen
-- nada en el ERP (ni guía, ni compra, ni factura) y no se les crea pedido:
-- serían 631 filas vacías en la lista. Si Willy repite una de ellas, su
-- pedido nace ese día.
-- ###########################################################################

set local search_path = public, extensions;

create sequence if not exists pedidos_numero_seq;

create table if not exists pedidos (
  id                    uuid primary key default gen_random_uuid(),
  numero                text not null unique,
  cotizacion_id         uuid not null references cotizaciones(id) on delete cascade,
  cliente_id            uuid not null references clientes(id),
  -- 1, 2, 3… dentro de su cotización.
  secuencia             int  not null check (secuencia > 0),
  -- El primero, nacido al aprobar: sus cantidades se deducen.
  desde_aprobacion      boolean not null default false,
  fecha                 date not null default ((now() at time zone 'America/Lima')::date),
  creado_por            uuid references perfiles(id),
  creado_en             timestamptz not null default now(),
  unique (cotizacion_id, secuencia)
);

comment on table pedidos is
  'Cada confirmación del cliente sobre una cotización (130). La cotización es la plantilla de precios; el pedido es lo que se compra, se despacha y se factura.';

create table if not exists pedido_items (
  pedido_id          uuid not null references pedidos(id) on delete cascade,
  cotizacion_item_id uuid not null references cotizacion_items(id) on delete cascade,
  cantidad           numeric(14,2) not null check (cantidad > 0),
  primary key (pedido_id, cotizacion_item_id)
);

alter table pedidos enable row level security;
alter table pedido_items enable row level security;
drop policy if exists pedidos_lectura on pedidos;
create policy pedidos_lectura on pedidos for select to authenticated using ((select public.mi_rol()) is not null);
drop policy if exists pedido_items_lectura on pedido_items;
create policy pedido_items_lectura on pedido_items for select to authenticated using ((select public.mi_rol()) is not null);
-- Se escriben solo desde las funciones de abajo.
revoke insert, update, delete on pedidos, pedido_items from authenticated, anon;

create index if not exists ix_pedidos_cotizacion on pedidos (cotizacion_id, secuencia desc);
create index if not exists ix_pedidos_fecha on pedidos (fecha desc, numero desc);

alter table compras        add column if not exists pedido_id uuid references pedidos(id) on delete set null;
alter table guias_remision add column if not exists pedido_id uuid references pedidos(id) on delete set null;
alter table comprobantes   add column if not exists pedido_id uuid references pedidos(id) on delete set null;
create index if not exists ix_compras_pedido on compras (pedido_id) where pedido_id is not null;
create index if not exists ix_guias_pedido on guias_remision (pedido_id) where pedido_id is not null;
create index if not exists ix_comprobantes_pedido on comprobantes (pedido_id) where pedido_id is not null;

-- ---------------------------------------------------------------------------
-- Crear un pedido. Interna: la llaman el trigger y `repetir_pedido`.
-- ---------------------------------------------------------------------------
create or replace function public.crear_pedido(p_cot uuid, p_items jsonb, p_fecha date default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cliente uuid;
  v_sec     int;
  v_id      uuid;
begin
  select cliente_id into v_cliente from cotizaciones where id = p_cot;
  if v_cliente is null then
    raise exception 'Cotización % no existe', p_cot using errcode = 'no_data_found';
  end if;
  select coalesce(max(secuencia), 0) + 1 into v_sec from pedidos where cotizacion_id = p_cot;

  insert into pedidos (numero, cotizacion_id, cliente_id, secuencia, desde_aprobacion, fecha, creado_por)
  values (
    'PED-' || to_char(coalesce(p_fecha, (now() at time zone 'America/Lima')::date), 'YY') || '-'
      || lpad(nextval('pedidos_numero_seq')::text, 5, '0'),
    p_cot, v_cliente, v_sec, p_items is null,
    coalesce(p_fecha, (now() at time zone 'America/Lima')::date),
    auth.uid()
  ) returning id into v_id;

  if p_items is not null then
    insert into pedido_items (pedido_id, cotizacion_item_id, cantidad)
    select v_id, (i ->> 'cotizacion_item_id')::uuid, (i ->> 'cantidad')::numeric
      from jsonb_array_elements(p_items) i
     where coalesce((i ->> 'cantidad')::numeric, 0) > 0;
  end if;
  return v_id;
end $$;

revoke all on function public.crear_pedido(uuid, jsonb, date) from public, anon, authenticated;

-- Al aprobar la cotización nace su primer pedido.
create or replace function public.tg_pedido_al_aprobar()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.estado = 'aprobada'
     and old.estado not in ('aprobada', 'atendida')
     and not exists (select 1 from pedidos where cotizacion_id = new.id) then
    perform public.crear_pedido(new.id, null, (coalesce(new.aprobada_en, now()) at time zone 'America/Lima')::date);
  end if;
  return null;
end $$;

drop trigger if exists tg_cotizaciones_pedido on cotizaciones;
create trigger tg_cotizaciones_pedido
  after update of estado on cotizaciones
  for each row execute function public.tg_pedido_al_aprobar();

-- Lo que nace de una cotización cuelga de su pedido vigente.
create or replace function public.tg_pedido_vigente()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.cotizacion_id is not null and new.pedido_id is null then
    select id into new.pedido_id from pedidos
     where cotizacion_id = new.cotizacion_id
     order by secuencia desc limit 1;
  end if;
  return new;
end $$;

drop trigger if exists tg_compras_pedido on compras;
create trigger tg_compras_pedido before insert or update of cotizacion_id on compras
  for each row execute function public.tg_pedido_vigente();
drop trigger if exists tg_guias_pedido on guias_remision;
create trigger tg_guias_pedido before insert or update of cotizacion_id on guias_remision
  for each row execute function public.tg_pedido_vigente();
drop trigger if exists tg_comprobantes_pedido on comprobantes;
create trigger tg_comprobantes_pedido before insert or update of cotizacion_id on comprobantes
  for each row execute function public.tg_pedido_vigente();

-- ---------------------------------------------------------------------------
-- «Atender otro pedido» crea el pedido siguiente con sus cantidades.
-- ---------------------------------------------------------------------------
create or replace function public.repetir_pedido(p_id uuid, p_lineas jsonb, p_oc text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_estado estado_cotizacion;
  v_fila   jsonb;
  v_item   uuid;
  v_cant   numeric(14,2);
  v_n      int := 0;
  v_items  jsonb := '[]'::jsonb;
  v_pedido uuid;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede atender pedidos' using errcode = 'insufficient_privilege';
  end if;

  select estado into v_estado from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado not in ('aprobada', 'atendida') then
    raise exception 'Solo se repite el pedido de una cotización aprobada o atendida (está %)', v_estado
      using errcode = 'check_violation';
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_item := nullif(v_fila ->> 'item_id', '')::uuid;
    v_cant := coalesce((v_fila ->> 'cantidad')::numeric, 0);
    if v_item is null or v_cant < 0 then
      raise exception 'Una línea llegó sin item_id o con cantidad negativa' using errcode = 'invalid_parameter_value';
    end if;
    continue when v_cant = 0;
    update cotizacion_items
       set cantidad_aprobada = coalesce(cantidad_aprobada, cantidad) + v_cant
     where id = v_item and cotizacion_id = p_id;
    if not found then
      raise exception 'La línea % no es de esta cotización', v_item using errcode = 'foreign_key_violation';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('cotizacion_item_id', v_item, 'cantidad', v_cant));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'El pedido nuevo no lleva nada: pon al menos una cantidad' using errcode = 'check_violation';
  end if;

  -- El pedido nuevo, con lo suyo (130). Antes del cambio de estado: el
  -- trigger de aprobación ve que ya hay pedidos y no crea otro.
  v_pedido := public.crear_pedido(p_id, v_items);

  update cotizaciones
     set estado = 'aprobada',
         -- La del pedido nuevo, o vacía: la vieja no vale para este (123).
         orden_compra_cliente = nullif(trim(coalesce(p_oc, '')), '')
   where id = p_id;

  return jsonb_build_object('id', p_id, 'lineas', v_n, 'pedido_id', v_pedido,
    'pedido', (select numero from pedidos where id = v_pedido));
end $$;

revoke all on function public.repetir_pedido(uuid, jsonb, text) from public, anon;
grant execute on function public.repetir_pedido(uuid, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Las líneas de cada pedido: las suyas, o las deducidas del primero.
-- ---------------------------------------------------------------------------
create or replace view v_pedido_lineas
with (security_invoker = true) as
select p.id as pedido_id, ci.id as cotizacion_item_id, ci.orden, ci.producto_id, ci.codigo, ci.descripcion,
       ci.unidad_codigo, ci.valor_unitario, ci.descuento_pct,
       case
         when p.desde_aprobacion then greatest(coalesce(ci.cantidad_aprobada, 0) - coalesce((
           select sum(pi.cantidad) from pedido_items pi join pedidos o on o.id = pi.pedido_id
            where pi.cotizacion_item_id = ci.id and o.id <> p.id), 0), 0)
         else coalesce(pi.cantidad, 0)
       end as cantidad
  from pedidos p
  join cotizacion_items ci on ci.cotizacion_id = p.cotizacion_id
  left join pedido_items pi on pi.pedido_id = p.id and pi.cotizacion_item_id = ci.id;

grant select on v_pedido_lineas to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ya existe: un primer pedido para las cotizaciones vivas en el ERP.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select co.id, co.aprobada_en from cotizaciones co
     where not exists (select 1 from pedidos p where p.cotizacion_id = co.id)
       and (co.estado = 'aprobada'
            or exists (select 1 from guias_remision g where g.cotizacion_id = co.id)
            or exists (select 1 from compras k where k.cotizacion_id = co.id)
            or exists (select 1 from comprobantes f where f.cotizacion_id = co.id))
     order by co.aprobada_en nulls last, co.creado_en
  loop
    perform public.crear_pedido(c.id, null, (coalesce(c.aprobada_en, now()) at time zone 'America/Lima')::date);
  end loop;
end $$;

update compras k set pedido_id = (select id from pedidos p where p.cotizacion_id = k.cotizacion_id order by secuencia desc limit 1)
 where k.cotizacion_id is not null and k.pedido_id is null;
update guias_remision g set pedido_id = (select id from pedidos p where p.cotizacion_id = g.cotizacion_id order by secuencia desc limit 1)
 where g.cotizacion_id is not null and g.pedido_id is null;
update comprobantes f set pedido_id = (select id from pedidos p where p.cotizacion_id = f.cotizacion_id order by secuencia desc limit 1)
 where f.cotizacion_id is not null and f.pedido_id is null;

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA: aprobar crea el pedido 1, repetir crea el 2 con lo suyo, y una
-- compra enlazada después cuelga del 2. Se deshace.
do $$
declare
  v_usuario uuid; v_cliente uuid; p1 uuid; r jsonb; v_cot uuid; i1 uuid; v_prov uuid; v_comp uuid; x record;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_cliente from clientes order by creado_en limit 1;
  select id into v_prov from proveedores order by creado_en limit 1;
  select id into p1 from productos where coalesce(es_kit, false) = false and coalesce(precio_minimo, 0) = 0 order by codigo limit 1;
  if v_usuario is null or v_cliente is null or p1 is null or v_prov is null then
    raise notice '130: faltan datos para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cliente, 'validez_dias', 15,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1, 'codigo', 'X1', 'descripcion', 'uno',
        'cantidad', 20, 'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 0))));
    v_cot := (r ->> 'id')::uuid;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    if (select count(*) from pedidos where cotizacion_id = v_cot) <> 1 then
      raise exception '130: aprobar no creó el pedido 1';
    end if;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    update cotizacion_items set cantidad_atendida = 20 where id = i1;
    update cotizaciones set estado = 'atendida' where id = v_cot;

    r := public.repetir_pedido(v_cot, jsonb_build_array(jsonb_build_object('item_id', i1, 'cantidad', 7)), null);
    if (select count(*) from pedidos where cotizacion_id = v_cot) <> 2 then
      raise exception '130: repetir no creó el pedido 2 (o creó de más)';
    end if;
    select (select cantidad from v_pedido_lineas l join pedidos p on p.id = l.pedido_id where p.cotizacion_id = v_cot and p.secuencia = 1) uno,
           (select cantidad from v_pedido_lineas l join pedidos p on p.id = l.pedido_id where p.cotizacion_id = v_cot and p.secuencia = 2) dos
      into x;
    if x.uno <> 20 or x.dos <> 7 then
      raise exception '130: las líneas de los pedidos no cuadran: %', row_to_json(x);
    end if;

    r := public.crear_compra(jsonb_build_object('proveedor_id', v_prov, 'tipo', 'local', 'moneda', 'USD',
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 7, 'costo_unitario', 1, 'unidad_codigo', 'NIU'))));
    v_comp := (r ->> 'id')::uuid;
    update compras set cotizacion_id = v_cot where id = v_comp;
    if (select p.secuencia from compras k join pedidos p on p.id = k.pedido_id where k.id = v_comp) is distinct from 2 then
      raise exception '130: la orden no quedó en el pedido vigente';
    end if;
    raise exception '__130_DESHACER__';
  exception when others then
    if sqlerrm <> '__130_DESHACER__' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice '130: pedido al aprobar, pedido nuevo al repetir, la orden cuelga del vigente; deshecho limpio.';
end $$;
