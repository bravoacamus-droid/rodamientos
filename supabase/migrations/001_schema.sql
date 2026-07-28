-- ============================================================================
-- ERP COMERCIAL RODATECH · Esquema base
-- Inversiones Rodatech E.I.R.L. · Distribución de rodamientos y repuestos
-- ============================================================================

create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------------
-- TIPOS
-- ---------------------------------------------------------------------------
do $$ begin
  create type rol_usuario as enum ('admin','gerencia','ventas','almacen','compras','cobranzas');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_cotizacion as enum ('borrador','enviada','aceptada','rechazada','vencida','convertida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_pedido as enum ('pendiente','aprobado','preparacion','despachado','facturado','anulado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_comprobante as enum ('emitido','pagado','parcial','vencido','anulado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_comprobante as enum ('factura','boleta','nota_venta','nota_credito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimiento as enum ('ingreso','salida','ajuste_positivo','ajuste_negativo','transferencia_entrada','transferencia_salida','regularizacion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_oc as enum ('borrador','enviada','confirmada','transito','recibida_parcial','recibida','anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_compra as enum ('local','importacion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_importacion as enum ('registrada','embarcada','en_aduana','nacionalizada','recibida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_equivalencia as enum ('exacta','similar','sustituto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lista_precio as enum ('mayorista','fabrica','importacion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type severidad_alerta as enum ('info','baja','media','alta','critica');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- CONFIGURACIÓN / EMPRESA
-- ---------------------------------------------------------------------------
create table if not exists empresa (
  id                smallint primary key default 1,
  razon_social      text not null,
  nombre_comercial  text not null,
  ruc               text not null,
  direccion         text,
  distrito          text,
  provincia         text,
  telefono          text,
  celular           text,
  email             text,
  email_ventas      text,
  web               text,
  logo_url          text,
  igv_porcentaje    numeric(5,2) not null default 18.00,
  moneda_base       text not null default 'PEN',
  tipo_cambio       numeric(10,4) not null default 3.75,
  eslogan           text,
  constraint empresa_unica check (id = 1)
);

create table if not exists series_documento (
  id            uuid primary key default gen_random_uuid(),
  tipo          tipo_comprobante not null,
  serie         text not null,
  correlativo   integer not null default 0,
  activo        boolean not null default true,
  descripcion   text,
  unique (tipo, serie)
);

-- ---------------------------------------------------------------------------
-- USUARIOS
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null,
  email          text not null unique,
  rol            rol_usuario not null default 'ventas',
  telefono       text,
  cargo          text,
  activo         boolean not null default true,
  ultimo_acceso  timestamptz,
  creado_en      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CATÁLOGOS BASE
-- ---------------------------------------------------------------------------
create table if not exists marcas (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  pais         text,
  segmento     text,              -- premium | estandar | economica
  descripcion  text,
  activo       boolean not null default true,
  orden        smallint default 100
);

create table if not exists categorias (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  slug         text not null unique,
  descripcion  text,
  icono        text,
  orden        smallint default 100
);

create table if not exists almacenes (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,
  nombre       text not null,
  direccion    text,
  responsable  text,
  activo       boolean not null default true
);

-- ---------------------------------------------------------------------------
-- MAESTRO DE PRODUCTOS
-- ---------------------------------------------------------------------------
create table if not exists productos (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null unique,
  codigo_fabricante   text not null,
  descripcion         text not null,
  marca_id            uuid references marcas(id) on delete set null,
  categoria_id        uuid references categorias(id) on delete set null,
  unidad              text not null default 'UND',
  atributos           jsonb not null default '{}'::jsonb,
  costo_promedio      numeric(14,4) not null default 0,
  ultimo_costo        numeric(14,4) not null default 0,
  precio_mayorista    numeric(14,2) not null default 0,
  precio_fabrica      numeric(14,2) not null default 0,
  precio_importacion  numeric(14,2) not null default 0,
  moneda              text not null default 'PEN',
  stock_minimo        numeric(14,2) not null default 0,
  stock_maximo        numeric(14,2) not null default 0,
  ubicacion           text,
  imagen_url          text,
  peso_kg             numeric(10,3) default 0,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  busqueda            text generated always as (
                        lower(coalesce(sku,'') || ' ' || coalesce(codigo_fabricante,'') || ' ' || coalesce(descripcion,''))
                      ) stored
);

create index if not exists idx_productos_busqueda_trgm on productos using gin (busqueda gin_trgm_ops);
create index if not exists idx_productos_marca on productos(marca_id);
create index if not exists idx_productos_categoria on productos(categoria_id);
create index if not exists idx_productos_codigo on productos(codigo_fabricante);
create index if not exists idx_productos_activo on productos(activo) where activo;

-- Cross-reference / equivalencias entre marcas
create table if not exists producto_equivalencias (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references productos(id) on delete cascade,
  equivalente_id uuid not null references productos(id) on delete cascade,
  tipo           tipo_equivalencia not null default 'exacta',
  nota           text,
  creado_en      timestamptz not null default now(),
  unique (producto_id, equivalente_id),
  check (producto_id <> equivalente_id)
);
create index if not exists idx_equiv_producto on producto_equivalencias(producto_id);
create index if not exists idx_equiv_equivalente on producto_equivalencias(equivalente_id);

-- ---------------------------------------------------------------------------
-- TERCEROS
-- ---------------------------------------------------------------------------
create table if not exists clientes (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  ruc                 text unique,
  razon_social        text not null,
  nombre_comercial    text,
  direccion           text,
  distrito            text,
  provincia           text default 'Lima',
  sector              text,
  contacto            text,
  cargo_contacto      text,
  email               text,
  telefono            text,
  whatsapp            text,
  lista_precio        lista_precio not null default 'mayorista',
  linea_credito       numeric(14,2) not null default 0,
  dias_credito        smallint not null default 30,
  dias_gracia         smallint not null default 10,
  vendedor_id         uuid references profiles(id) on delete set null,
  notas               text,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now(),
  busqueda            text generated always as (
                        lower(coalesce(codigo,'') || ' ' || coalesce(ruc,'') || ' ' || coalesce(razon_social,'') || ' ' || coalesce(nombre_comercial,''))
                      ) stored
);
create index if not exists idx_clientes_busqueda_trgm on clientes using gin (busqueda gin_trgm_ops);

create table if not exists proveedores (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  ruc               text,
  razon_social      text not null,
  tipo              tipo_compra not null default 'local',
  pais              text default 'Perú',
  moneda            text not null default 'PEN',
  direccion         text,
  contacto          text,
  email             text,
  telefono          text,
  dias_pago         smallint not null default 0,
  lead_time_dias    smallint not null default 3,
  marcas_provee     text[],
  notas             text,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INVENTARIO
-- ---------------------------------------------------------------------------
create table if not exists stock (
  producto_id   uuid not null references productos(id) on delete cascade,
  almacen_id    uuid not null references almacenes(id) on delete cascade,
  cantidad      numeric(14,2) not null default 0,
  reservado     numeric(14,2) not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (producto_id, almacen_id)
);
create index if not exists idx_stock_almacen on stock(almacen_id);

create table if not exists movimientos_inventario (
  id                uuid primary key default gen_random_uuid(),
  fecha             timestamptz not null default now(),
  producto_id       uuid not null references productos(id) on delete cascade,
  almacen_id        uuid not null references almacenes(id) on delete cascade,
  tipo              tipo_movimiento not null,
  cantidad          numeric(14,2) not null,
  costo_unitario    numeric(14,4) not null default 0,
  saldo_cantidad    numeric(14,2) not null default 0,
  saldo_valorizado  numeric(16,4) not null default 0,
  costo_promedio    numeric(14,4) not null default 0,
  referencia_tipo   text,          -- pedido | comprobante | recepcion | ajuste | importacion
  referencia_id     uuid,
  referencia_numero text,
  documento         text,
  motivo            text,
  usuario_id        uuid references profiles(id) on delete set null,
  creado_en         timestamptz not null default now()
);
create index if not exists idx_mov_producto_fecha on movimientos_inventario(producto_id, fecha desc);
create index if not exists idx_mov_almacen on movimientos_inventario(almacen_id);
create index if not exists idx_mov_referencia on movimientos_inventario(referencia_tipo, referencia_id);

-- ---------------------------------------------------------------------------
-- COTIZACIONES
-- ---------------------------------------------------------------------------
create table if not exists cotizaciones (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  cliente_id       uuid not null references clientes(id) on delete restrict,
  fecha            date not null default current_date,
  validez_dias     smallint not null default 15,
  fecha_vencimiento date generated always as (fecha + validez_dias) stored,
  moneda           text not null default 'PEN',
  tipo_cambio      numeric(10,4) not null default 3.75,
  lista_precio     lista_precio not null default 'mayorista',
  subtotal         numeric(14,2) not null default 0,
  descuento_total  numeric(14,2) not null default 0,
  igv              numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  costo_total      numeric(14,2) not null default 0,
  margen_pct       numeric(6,2) not null default 0,
  estado           estado_cotizacion not null default 'borrador',
  vendedor_id      uuid references profiles(id) on delete set null,
  contacto         text,
  condiciones      text,
  observaciones    text,
  tiempo_entrega   text,
  motivo_rechazo   text,
  enviada_en       timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists idx_cotiz_cliente on cotizaciones(cliente_id);
create index if not exists idx_cotiz_fecha on cotizaciones(fecha desc);
create index if not exists idx_cotiz_estado on cotizaciones(estado);

create table if not exists cotizacion_items (
  id              uuid primary key default gen_random_uuid(),
  cotizacion_id   uuid not null references cotizaciones(id) on delete cascade,
  producto_id     uuid references productos(id) on delete set null,
  orden           smallint not null default 1,
  codigo          text not null,
  descripcion     text not null,
  marca           text,
  cantidad        numeric(14,2) not null default 1,
  unidad          text not null default 'UND',
  precio_unitario numeric(14,4) not null default 0,
  descuento_pct   numeric(5,2) not null default 0,
  costo_unitario  numeric(14,4) not null default 0,
  subtotal        numeric(14,2) not null default 0,
  entrega         text
);
create index if not exists idx_cotiz_items on cotizacion_items(cotizacion_id);

-- ---------------------------------------------------------------------------
-- PEDIDOS / ÓRDENES DE VENTA
-- ---------------------------------------------------------------------------
create table if not exists pedidos (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  cliente_id        uuid not null references clientes(id) on delete restrict,
  cotizacion_id     uuid references cotizaciones(id) on delete set null,
  fecha             date not null default current_date,
  fecha_entrega     date,
  moneda            text not null default 'PEN',
  tipo_cambio       numeric(10,4) not null default 3.75,
  subtotal          numeric(14,2) not null default 0,
  igv               numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  costo_total       numeric(14,2) not null default 0,
  estado            estado_pedido not null default 'pendiente',
  es_emergencia     boolean not null default false,
  requiere_aprobacion boolean not null default false,
  aprobado_por      uuid references profiles(id) on delete set null,
  aprobado_en       timestamptz,
  orden_compra_cliente text,
  vendedor_id       uuid references profiles(id) on delete set null,
  almacen_id        uuid references almacenes(id) on delete set null,
  observaciones     text,
  creado_en         timestamptz not null default now()
);
create index if not exists idx_pedidos_cliente on pedidos(cliente_id);
create index if not exists idx_pedidos_estado on pedidos(estado);
create index if not exists idx_pedidos_fecha on pedidos(fecha desc);

create table if not exists pedido_items (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references pedidos(id) on delete cascade,
  producto_id     uuid references productos(id) on delete set null,
  orden           smallint not null default 1,
  codigo          text not null,
  descripcion     text not null,
  cantidad        numeric(14,2) not null default 1,
  cantidad_atendida numeric(14,2) not null default 0,
  unidad          text not null default 'UND',
  precio_unitario numeric(14,4) not null default 0,
  descuento_pct   numeric(5,2) not null default 0,
  costo_unitario  numeric(14,4) not null default 0,
  subtotal        numeric(14,2) not null default 0,
  por_reponer     boolean not null default false
);
create index if not exists idx_pedido_items on pedido_items(pedido_id);

-- ---------------------------------------------------------------------------
-- FACTURACIÓN / COMPROBANTES
-- ---------------------------------------------------------------------------
create table if not exists comprobantes (
  id                 uuid primary key default gen_random_uuid(),
  tipo               tipo_comprobante not null default 'factura',
  serie              text not null,
  correlativo        integer not null,
  numero             text generated always as (serie || '-' || lpad(correlativo::text, 8, '0')) stored,
  cliente_id         uuid not null references clientes(id) on delete restrict,
  pedido_id          uuid references pedidos(id) on delete set null,
  referencia_id      uuid references comprobantes(id) on delete set null,  -- para notas de crédito
  motivo_nota        text,
  fecha_emision      date not null default current_date,
  fecha_vencimiento  date,
  condicion_pago     text not null default 'credito',   -- contado | credito
  dias_credito       smallint not null default 30,
  moneda             text not null default 'PEN',
  tipo_cambio        numeric(10,4) not null default 3.75,
  op_gravada         numeric(14,2) not null default 0,
  op_exonerada       numeric(14,2) not null default 0,
  descuento_global   numeric(14,2) not null default 0,
  igv                numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  total_letras       text,
  costo_total        numeric(14,2) not null default 0,
  pagado             numeric(14,2) not null default 0,
  saldo              numeric(14,2) not null default 0,
  estado             estado_comprobante not null default 'emitido',
  vendedor_id        uuid references profiles(id) on delete set null,
  observaciones      text,
  guia_remision      text,
  orden_compra_cliente text,
  creado_en          timestamptz not null default now(),
  unique (tipo, serie, correlativo)
);
create index if not exists idx_comp_cliente on comprobantes(cliente_id);
create index if not exists idx_comp_estado on comprobantes(estado);
create index if not exists idx_comp_fecha on comprobantes(fecha_emision desc);
create index if not exists idx_comp_venc on comprobantes(fecha_vencimiento);

create table if not exists comprobante_items (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references comprobantes(id) on delete cascade,
  producto_id     uuid references productos(id) on delete set null,
  orden           smallint not null default 1,
  codigo          text not null,
  descripcion     text not null,
  cantidad        numeric(14,2) not null default 1,
  unidad          text not null default 'UND',
  precio_unitario numeric(14,4) not null default 0,
  descuento_pct   numeric(5,2) not null default 0,
  costo_unitario  numeric(14,4) not null default 0,
  subtotal        numeric(14,2) not null default 0
);
create index if not exists idx_comp_items on comprobante_items(comprobante_id);

-- ---------------------------------------------------------------------------
-- COBRANZAS
-- ---------------------------------------------------------------------------
create table if not exists pagos (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references comprobantes(id) on delete cascade,
  fecha           date not null default current_date,
  monto           numeric(14,2) not null,
  medio           text not null default 'transferencia', -- efectivo | transferencia | deposito | cheque | letra
  banco           text,
  referencia      text,
  observaciones   text,
  registrado_por  uuid references profiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);
create index if not exists idx_pagos_comprobante on pagos(comprobante_id);
create index if not exists idx_pagos_fecha on pagos(fecha desc);

create table if not exists gestiones_cobranza (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  comprobante_id  uuid references comprobantes(id) on delete cascade,
  fecha           timestamptz not null default now(),
  canal           text not null default 'whatsapp',
  resultado       text,
  compromiso_fecha date,
  nota            text,
  usuario_id      uuid references profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- COMPRAS E IMPORTACIONES
-- ---------------------------------------------------------------------------
create table if not exists ordenes_compra (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  proveedor_id   uuid not null references proveedores(id) on delete restrict,
  tipo           tipo_compra not null default 'local',
  fecha          date not null default current_date,
  fecha_estimada date,
  moneda         text not null default 'PEN',
  tipo_cambio    numeric(10,4) not null default 3.75,
  incoterm       text,
  subtotal       numeric(14,2) not null default 0,
  igv            numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  estado         estado_oc not null default 'borrador',
  almacen_id     uuid references almacenes(id) on delete set null,
  comprador_id   uuid references profiles(id) on delete set null,
  observaciones  text,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_oc_proveedor on ordenes_compra(proveedor_id);
create index if not exists idx_oc_estado on ordenes_compra(estado);

create table if not exists oc_items (
  id                uuid primary key default gen_random_uuid(),
  orden_compra_id   uuid not null references ordenes_compra(id) on delete cascade,
  producto_id       uuid references productos(id) on delete set null,
  orden             smallint not null default 1,
  codigo            text not null,
  descripcion       text not null,
  cantidad          numeric(14,2) not null default 1,
  cantidad_recibida numeric(14,2) not null default 0,
  unidad            text not null default 'UND',
  costo_unitario    numeric(14,4) not null default 0,
  subtotal          numeric(14,2) not null default 0,
  peso_kg           numeric(12,3) not null default 0,
  costo_landed      numeric(14,4) not null default 0
);
create index if not exists idx_oc_items on oc_items(orden_compra_id);

create table if not exists importaciones (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  orden_compra_id     uuid not null references ordenes_compra(id) on delete cascade,
  proveedor_id        uuid references proveedores(id) on delete set null,
  dua                 text,
  puerto_origen       text,
  puerto_destino      text default 'Callao',
  fecha_embarque      date,
  fecha_llegada       date,
  fecha_nacionalizacion date,
  moneda_origen       text not null default 'USD',
  tipo_cambio         numeric(10,4) not null default 3.75,
  valor_fob           numeric(14,2) not null default 0,
  metodo_prorrateo    text not null default 'valor',  -- valor | peso | cantidad
  flete               numeric(14,2) not null default 0,
  seguro              numeric(14,2) not null default 0,
  ad_valorem          numeric(14,2) not null default 0,
  igv_importacion     numeric(14,2) not null default 0,
  ipm                 numeric(14,2) not null default 0,
  percepcion          numeric(14,2) not null default 0,
  agente_aduana       numeric(14,2) not null default 0,
  almacen_portuario   numeric(14,2) not null default 0,
  transporte_interno  numeric(14,2) not null default 0,
  otros_gastos        numeric(14,2) not null default 0,
  total_gastos        numeric(14,2) not null default 0,
  costo_total_almacen numeric(14,2) not null default 0,
  factor_landed       numeric(10,4) not null default 1,
  estado              estado_importacion not null default 'registrada',
  observaciones       text,
  creado_en           timestamptz not null default now()
);

create table if not exists recepciones (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  orden_compra_id  uuid references ordenes_compra(id) on delete set null,
  importacion_id   uuid references importaciones(id) on delete set null,
  almacen_id       uuid not null references almacenes(id) on delete restrict,
  fecha            date not null default current_date,
  guia_proveedor   text,
  factura_proveedor text,
  recibido_por     uuid references profiles(id) on delete set null,
  observaciones    text,
  creado_en        timestamptz not null default now()
);

create table if not exists recepcion_items (
  id             uuid primary key default gen_random_uuid(),
  recepcion_id   uuid not null references recepciones(id) on delete cascade,
  producto_id    uuid not null references productos(id) on delete cascade,
  cantidad       numeric(14,2) not null,
  costo_unitario numeric(14,4) not null default 0
);

-- ---------------------------------------------------------------------------
-- INTELIGENCIA / ALERTAS / AUDITORÍA
-- ---------------------------------------------------------------------------
create table if not exists alertas (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,          -- stock_bajo | sin_rotacion | credito_vence | credito_vencido | margen_bajo | reposicion | linea_credito
  severidad      severidad_alerta not null default 'media',
  titulo         text not null,
  mensaje        text not null,
  entidad_tipo   text,
  entidad_id     uuid,
  entidad_nombre text,
  valor          numeric(14,2),
  accion_url     text,
  leida          boolean not null default false,
  archivada      boolean not null default false,
  generada_en    timestamptz not null default now()
);
create index if not exists idx_alertas_estado on alertas(archivada, leida, generada_en desc);
create index if not exists idx_alertas_tipo on alertas(tipo);

create table if not exists actividad (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid references profiles(id) on delete set null,
  usuario_nombre text,
  accion        text not null,
  entidad       text not null,
  entidad_id    uuid,
  descripcion   text,
  metadata      jsonb default '{}'::jsonb,
  creado_en     timestamptz not null default now()
);
create index if not exists idx_actividad_fecha on actividad(creado_en desc);

-- Historial de precios por cliente (cotización inteligente)
create or replace view v_historial_precios as
select
  ci.producto_id,
  c.cliente_id,
  cl.razon_social as cliente,
  c.fecha,
  c.numero as documento,
  'Cotización'::text as origen,
  ci.precio_unitario,
  ci.cantidad,
  c.estado::text as estado
from cotizacion_items ci
join cotizaciones c on c.id = ci.cotizacion_id
join clientes cl on cl.id = c.cliente_id
where ci.producto_id is not null
union all
select
  cmi.producto_id,
  cm.cliente_id,
  cl.razon_social,
  cm.fecha_emision,
  cm.numero,
  'Venta'::text,
  cmi.precio_unitario,
  cmi.cantidad,
  cm.estado::text
from comprobante_items cmi
join comprobantes cm on cm.id = cmi.comprobante_id
join clientes cl on cl.id = cm.cliente_id
where cmi.producto_id is not null and cm.estado <> 'anulado';
