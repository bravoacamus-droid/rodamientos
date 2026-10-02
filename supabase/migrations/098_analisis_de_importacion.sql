-- ###########################################################################
-- 098 · EL ANÁLISIS DE IMPORTACIÓN: LO QUE WILLY HACE EN EXCEL ANTES DE COMPRAR
-- ###########################################################################
--
-- Reunión del 01/10 (§AQ). Willy pasó su hoja «análisis compra importación
-- aérea» y aclaró lo que es: *«registro de compra… yo te he hablado de un
-- análisis de compra… lo que yo digo que el sistema me haga es el análisis de
-- compra, y me registre los precios que me están cotizando»*.
--
-- Es lo que pasa ANTES de la compra:
--
--   1. El proveedor de fuera manda una proforma: cantidad que se le pidió
--      cotizar, precio FOB y el costo de DHL de toda la carga.
--   2. Willy pone el peso de cada producto —*«eso lo saco yo… para verificar
--      que el peso de mi carga coincida con lo que me está cotizando»*—.
--   3. $ por kilo = DHL ÷ peso total; PU Lima = FOB + peso × $/kg.
--   4. Contra el precio de mercado que ya averiguó: el margen.
--   5. Decide la cantidad final de cada uno, *«en función del margen […] y en
--      función de la frecuencia F también de consumo»*.
--
-- Y después, *«aparte también debe existir un módulo para registrar el
-- pedido»*: eso es la compra, que ya existe, y de este análisis sale hecha.
--
-- ---------------------------------------------------------------------------
-- Las decisiones
-- ---------------------------------------------------------------------------
--   · UN proveedor por análisis: *«el trato es con un solo proveedor nomás»*.
--   · Una línea puede no estar en el catálogo (`producto_id` null, con su
--     código y marca escritos). De los 29 de su hoja real, 17 no estaban. Para
--     REGISTRAR la compra sí hace falta que existan; para analizar, no.
--   · Los análisis guardados SON el historial de precios cotizados: *«los
--     precios deben quedar en un historial […] para no volver a pedir»*.
--   · Numeración propia (ANA-26-00001) con una secuencia, no con
--     `tipo_documento`: añadir un valor a ese enum no se puede usar en la misma
--     transacción, y el centinela lo necesita.
--   · El peso escrito se apunta en el producto si no tenía (como en la 097),
--     y el precio de mercado también: los dos son el catálogo llenándose solo.
-- ###########################################################################

create sequence if not exists analisis_importacion_seq;

create table if not exists analisis_importacion (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique default (
                    'ANA-' || to_char(current_date, 'YY') || '-' ||
                    lpad(nextval('analisis_importacion_seq')::text, 5, '0')),
  proveedor_id    uuid not null references proveedores(id),
  fecha           date not null default current_date,
  -- El número de la proforma del proveedor (PI NO: FT250730TA).
  referencia      text,
  -- El costo de envío de TODA la carga cotizada, como viene en la proforma.
  costo_envio     numeric(14,2) not null default 0,
  -- Lo que el proveedor dice que pesa la carga, para comprobarlo. Opcional.
  peso_declarado  numeric(12,3),
  notas           text,
  estado          text not null default 'borrador',
  -- La compra que salió de este análisis, cuando se registra.
  compra_id       uuid references compras(id) on delete set null,
  creado_por      uuid references perfiles(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint analisis_estado_valido check (estado in ('borrador', 'comprado')),
  constraint analisis_envio_pos check (costo_envio >= 0),
  constraint analisis_peso_decl_pos check (peso_declarado is null or peso_declarado >= 0)
);

create index if not exists ix_analisis_proveedor on analisis_importacion (proveedor_id, fecha desc);

comment on table analisis_importacion is
  'El análisis de una proforma de importación ANTES de comprar (098, §AQ): FOB + peso × $/kg = puesto en Lima, contra el precio de mercado. Un proveedor por análisis. Es también el historial de precios cotizados.';

create table if not exists analisis_importacion_items (
  id                uuid primary key default gen_random_uuid(),
  analisis_id       uuid not null references analisis_importacion(id) on delete cascade,
  orden             smallint not null default 0,
  -- Null si todavía no está en el catálogo: se analiza igual.
  producto_id       uuid references productos(id) on delete set null,
  codigo            text not null,
  marca             text,
  descripcion       text,
  -- Lo que se le pidió cotizar (CANT. Ref) y lo que se decide pedir.
  cantidad_ref      numeric(12,2) not null default 0,
  cantidad_pedido   numeric(12,2) not null default 0,
  precio_fob        numeric(14,4) not null default 0,
  -- Cinco decimales: su hoja tiene 0.00454 kg (HK 1012).
  peso_kg           numeric(12,5) not null default 0,
  -- Su precio de referencia en Lima y de quién es (P.M y PROV.).
  precio_mercado    numeric(14,4) not null default 0,
  proveedor_mercado text,
  -- Veces al año que lo piden sus clientes («f»).
  frecuencia        numeric(8,2),
  constraint ana_item_cantidades_pos check (cantidad_ref >= 0 and cantidad_pedido >= 0),
  constraint ana_item_precios_pos check (precio_fob >= 0 and precio_mercado >= 0 and peso_kg >= 0)
);

-- Si la tabla ya existía con cuatro decimales.
alter table analisis_importacion_items alter column peso_kg type numeric(12,5);

create index if not exists ix_ana_items_analisis on analisis_importacion_items (analisis_id, orden);
create index if not exists ix_ana_items_producto on analisis_importacion_items (producto_id);

-- ---------------------------------------------------------------------------
-- Permisos: los mismos que compras
-- ---------------------------------------------------------------------------
insert into permisos_rol (tabla, rol, nota)
select t.tabla, r.rol::rol_usuario, 'análisis de importación (098)'
from (values ('analisis_importacion'), ('analisis_importacion_items')) as t(tabla),
     (values ('gerencia'), ('admin'), ('compras')) as r(rol)
on conflict (tabla, rol) do nothing;

alter table analisis_importacion enable row level security;
alter table analisis_importacion_items enable row level security;

drop policy if exists "lectura_autenticados" on analisis_importacion;
create policy "lectura_autenticados" on analisis_importacion
  for select to authenticated using ((select public.mi_rol()) is not null);
drop policy if exists "escritura" on analisis_importacion;
create policy "escritura" on analisis_importacion
  for all to authenticated
  using ((select public.puede_escribir('analisis_importacion')))
  with check ((select public.puede_escribir('analisis_importacion')));

drop policy if exists "lectura_autenticados" on analisis_importacion_items;
create policy "lectura_autenticados" on analisis_importacion_items
  for select to authenticated using ((select public.mi_rol()) is not null);
drop policy if exists "escritura" on analisis_importacion_items;
create policy "escritura" on analisis_importacion_items
  for all to authenticated
  using ((select public.puede_escribir('analisis_importacion_items')))
  with check ((select public.puede_escribir('analisis_importacion_items')));

-- ###########################################################################
-- guardar_analisis: cabecera e ítems en UNA transacción
-- ###########################################################################
-- Crea o reescribe. Los ítems se borran y se reinsertan, como la edición de
-- una cotización (069): las claves de línea no significan nada fuera de la
-- pantalla. Un análisis ya convertido en compra no se toca.
create or replace function public.guardar_analisis(p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_id     uuid := nullif(p_datos ->> 'id', '')::uuid;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_prov   uuid := nullif(p_datos ->> 'proveedor_id', '')::uuid;
  v_estado text;
  v_numero text;
begin
  -- Primero el rol: es `security definer` y se salta RLS.
  if not public.puede_escribir('analisis_importacion') then
    raise exception 'Tu rol no puede hacer análisis de importación'
      using errcode = 'insufficient_privilege';
  end if;
  if v_prov is null then
    raise exception 'El análisis necesita un proveedor' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El análisis no tiene productos' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_items) i
     where nullif(trim(i ->> 'codigo'), '') is null
  ) then
    raise exception 'Hay una línea sin código' using errcode = 'invalid_parameter_value';
  end if;

  if v_id is null then
    insert into analisis_importacion (proveedor_id, fecha, referencia, costo_envio, peso_declarado, notas, creado_por)
    values (
      v_prov,
      coalesce(nullif(p_datos ->> 'fecha', '')::date, current_date),
      nullif(trim(p_datos ->> 'referencia'), ''),
      greatest(coalesce(nullif(p_datos ->> 'costo_envio', '')::numeric, 0), 0),
      nullif(p_datos ->> 'peso_declarado', '')::numeric,
      nullif(trim(p_datos ->> 'notas'), ''),
      auth.uid()
    ) returning id, numero into v_id, v_numero;
  else
    select estado, numero into v_estado, v_numero from analisis_importacion where id = v_id for update;
    if v_estado is null then
      raise exception 'El análisis no existe' using errcode = 'no_data_found';
    end if;
    if v_estado = 'comprado' then
      raise exception 'Este análisis ya se convirtió en compra: no se cambia. Haz uno nuevo.'
        using errcode = 'invalid_parameter_value';
    end if;
    update analisis_importacion
       set proveedor_id   = v_prov,
           fecha          = coalesce(nullif(p_datos ->> 'fecha', '')::date, fecha),
           referencia     = nullif(trim(p_datos ->> 'referencia'), ''),
           costo_envio    = greatest(coalesce(nullif(p_datos ->> 'costo_envio', '')::numeric, 0), 0),
           peso_declarado = nullif(p_datos ->> 'peso_declarado', '')::numeric,
           notas          = nullif(trim(p_datos ->> 'notas'), ''),
           actualizado_en = now()
     where id = v_id;
    delete from analisis_importacion_items where analisis_id = v_id;
  end if;

  insert into analisis_importacion_items (
    analisis_id, orden, producto_id, codigo, marca, descripcion,
    cantidad_ref, cantidad_pedido, precio_fob, peso_kg,
    precio_mercado, proveedor_mercado, frecuencia
  )
  select v_id, i.orden::smallint,
         nullif(i.valor ->> 'producto_id', '')::uuid,
         left(trim(i.valor ->> 'codigo'), 80),
         nullif(left(trim(i.valor ->> 'marca'), 60), ''),
         nullif(left(trim(i.valor ->> 'descripcion'), 300), ''),
         greatest(coalesce(nullif(i.valor ->> 'cantidad_ref', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'cantidad_pedido', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'precio_fob', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'peso_kg', '')::numeric, 0), 0),
         greatest(coalesce(nullif(i.valor ->> 'precio_mercado', '')::numeric, 0), 0),
         nullif(left(trim(i.valor ->> 'proveedor_mercado'), 120), ''),
         nullif(i.valor ->> 'frecuencia', '')::numeric
    from jsonb_array_elements(v_items) with ordinality as i(valor, orden);

  -- El catálogo se llena solo con lo que no tenía: el peso y el precio de
  -- mercado. Lo que ya tenía no se pisa: un análisis es una cotización, no
  -- una corrección del maestro.
  update productos p
     set peso_kg = round(ai.peso_kg, 3)
    from analisis_importacion_items ai
   where ai.analisis_id = v_id and ai.producto_id = p.id
     and ai.peso_kg > 0 and p.peso_kg = 0;
  update productos p
     set precio_mercado = ai.precio_mercado
    from analisis_importacion_items ai
   where ai.analisis_id = v_id and ai.producto_id = p.id
     and ai.precio_mercado > 0 and coalesce(p.precio_mercado, 0) = 0;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end $function$;

-- ###########################################################################
-- La «f» propuesta: en cuántas facturas salió cada producto en el último año
-- ###########################################################################
-- Willy, 01/10: *«es la frecuencia de compra del producto por parte de mis
-- clientes, en número de veces al año»*. Se propone con sus facturas (las 515
-- de F002 están cargadas) y él la cambia si sabe otra cosa.
create or replace function public.frecuencia_de_venta(p_productos uuid[])
 returns table (producto_id uuid, veces bigint)
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  select i.producto_id, count(distinct c.id)
    from comprobante_items i
    join comprobantes c on c.id = i.comprobante_id
   where i.producto_id = any (p_productos)
     and c.fecha_emision >= current_date - 365
     and c.estado::text not in ('anulado', 'rechazado')
   group by i.producto_id
$function$;

-- ###########################################################################
-- Centinela · SE EJECUTA Y SE DESHACE (regla de la 091)
-- ###########################################################################
do $$
declare
  v_perfil uuid; v_prov uuid; v_prod uuid;
  v_r jsonb; v_r2 jsonb; v_items int; v_items2 int; v_libre int; v_fallo text;
begin
  select p.id into v_perfil from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.escribir and pr.tabla = 'analisis_importacion'
   where p.activo limit 1;
  select id into v_prov from proveedores limit 1;
  select id into v_prod from productos where not es_kit limit 1;
  if v_perfil is null or v_prov is null or v_prod is null then
    raise notice '098: faltan datos para el centinela; no corre.';
    return;
  end if;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);

    -- Uno del catálogo y uno que no está.
    v_r := public.guardar_analisis(jsonb_build_object(
      'proveedor_id', v_prov, 'costo_envio', 1039, 'referencia', 'PI-PRUEBA',
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_prod, 'codigo', 'X', 'cantidad_ref', 6,
                           'cantidad_pedido', 6, 'precio_fob', 9.432, 'peso_kg', 1.73),
        jsonb_build_object('codigo', 'NO-ESTA-1', 'marca', 'INA', 'cantidad_ref', 20,
                           'cantidad_pedido', 20, 'precio_fob', 0.393, 'peso_kg', 0.0045))));
    select count(*), count(*) filter (where producto_id is null)
      into v_items, v_libre
      from analisis_importacion_items where analisis_id = (v_r ->> 'id')::uuid;

    -- Reescribirlo con una sola línea.
    v_r2 := public.guardar_analisis(jsonb_build_object(
      'id', v_r ->> 'id', 'proveedor_id', v_prov, 'costo_envio', 500,
      'items', jsonb_build_array(jsonb_build_object('codigo', 'NO-ESTA-2', 'precio_fob', 1))));
    select count(*) into v_items2 from analisis_importacion_items where analisis_id = (v_r ->> 'id')::uuid;

    raise exception using message = '__098_DESHACER__';
  exception when others then
    if sqlerrm <> '__098_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  if v_fallo is not null then
    raise exception '098: el centinela se rompió: %', v_fallo;
  end if;
  if v_r ->> 'numero' !~ '^ANA-\d{2}-\d{5}$' then
    raise exception '098: el número salió «%»', v_r ->> 'numero';
  end if;
  if v_items <> 2 or v_libre <> 1 then
    raise exception '098: se guardaron % líneas (% sin catálogo); tenían que ser 2 y 1', v_items, v_libre;
  end if;
  if v_items2 <> 1 or v_r2 ->> 'id' <> v_r ->> 'id' then
    raise exception '098: al reescribir quedaron % líneas', v_items2;
  end if;
  raise notice '098: análisis con una línea del catálogo y otra libre, reescrito; número %.', v_r ->> 'numero';
end $$;
