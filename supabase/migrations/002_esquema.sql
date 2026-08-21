-- ============================================================================
-- RODATECH ERP v2 · 002 · Tipos, tablas, restricciones e índices
-- ----------------------------------------------------------------------------
-- Alcance fijado por PLAN-V2.md §2 y §2.11:
--   · UN solo almacén  → no hay tabla `almacenes` ni transferencias
--   · UNA sola lista de precios → costo, precio promedio y precio de venta
--   · Moneda siempre USD → no hay tabla de tipo de cambio ni columna `moneda`
--   · Sin módulo de bancos
--   · Importación = registro simple de gastos, sin landed cost prorrateado
--   · Compra local = registro de compra + recepción, sin OC formal obligatoria
-- ============================================================================

set search_path = public, extensions;

-- ###########################################################################
-- 1. TIPOS
-- ###########################################################################

do $$ begin
  create type rol_usuario as enum ('gerencia','admin','ventas','almacen','compras','cobranzas');
exception when duplicate_object then null; end $$;

-- Un solo enum para todo lo numerado por serie+correlativo. Permite que
-- `series_documento` sea UNA tabla y que el correlativo configurable de
-- Willy (§2.4, 06:08) aplique igual a cotizaciones, guías y comprobantes.
do $$ begin
  create type tipo_documento as enum (
    'cotizacion','guia_remision','factura','boleta','nota_credito','nota_debito',
    'compra','recepcion','ajuste_inventario'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_cotizacion as enum
    ('borrador','enviada','aprobada','rechazada','vencida','atendida','anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_guia as enum ('borrador','emitida','anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_comprobante as enum ('emitido','parcial','pagado','vencido','anulado');
exception when duplicate_object then null; end $$;

-- Ciclo de vida frente a SUNAT. Separado del estado comercial a propósito:
-- una factura puede estar PAGADA y a la vez RECHAZADA por SUNAT.
do $$ begin
  create type estado_sunat as enum
    ('no_enviado','pendiente','enviado','aceptado','observado','rechazado','baja_solicitada','baja_aceptada');
exception when duplicate_object then null; end $$;

-- Sin transferencias: un solo almacén (§2.11).
do $$ begin
  create type tipo_movimiento as enum ('ingreso','salida','ajuste_positivo','ajuste_negativo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_compra as enum ('local','importacion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_compra as enum ('registrada','recibida_parcial','recibida','anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type condicion_pago as enum ('contado','credito');
exception when duplicate_object then null; end $$;

-- Catálogo 06 de SUNAT (tipo de documento de identidad).
do $$ begin
  create type tipo_documento_identidad as enum ('RUC','DNI','CE','PAS','SIN_DOC');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_ajuste as enum ('cuadre_inicial','descuadre','merma','devolucion_interna');
exception when duplicate_object then null; end $$;

do $$ begin
  create type severidad_alerta as enum ('info','baja','media','alta','critica');
exception when duplicate_object then null; end $$;

-- ###########################################################################
-- 2. CONFIGURACIÓN Y SERIES
-- ###########################################################################

create table if not exists empresa (
  id                smallint primary key default 1,
  razon_social      text not null,
  nombre_comercial  text not null,
  ruc               char(11) not null,
  direccion         text,
  ubigeo_codigo     char(6),
  telefono          text,
  celular           text,
  email             text,
  email_ventas      text,
  web               text,
  logo_url          text,
  eslogan           text,
  igv_porcentaje    numeric(5,2) not null default 18.00,
  -- Willy cotiza y factura siempre en dólares (14:54). La moneda no es un dato
  -- por documento sino una constante del negocio: vive aquí y solo aquí.
  moneda            char(3) not null default 'USD',
  -- Umbral SUNAT para detracción (SPOT). Configurable porque cambia por norma.
  detraccion_monto_minimo numeric(14,2) not null default 700.00,
  detraccion_porcentaje   numeric(5,2)  not null default 12.00,
  retencion_porcentaje    numeric(5,2)  not null default 3.00,
  cuenta_detraccion       text,
  agente_retencion        boolean not null default false,
  actualizado_en    timestamptz not null default now(),
  constraint empresa_unica          check (id = 1),
  constraint empresa_ruc_valido     check (ruc ~ '^[0-9]{11}$'),
  constraint empresa_moneda_usd     check (moneda = 'USD'),
  constraint empresa_igv_rango      check (igv_porcentaje >= 0 and igv_porcentaje <= 100)
);

comment on table empresa is 'Fila única (id=1) con los datos del emisor. La moneda vive aquí porque es constante del negocio, no un dato por documento.';

-- ---------------------------------------------------------------------------
-- Series y correlativos
-- ---------------------------------------------------------------------------
-- "los correlativos… van a iniciar desde el número que usted se quedó" (06:08).
-- Por eso hay DOS columnas: `correlativo_inicial` es el número desde el que
-- arranca la serie migrada del sistema anterior, y `correlativo_actual` es el
-- último emitido. `siguiente_correlativo()` devuelve
--   greatest(correlativo_actual + 1, correlativo_inicial).
create table if not exists series_documento (
  id                  uuid primary key default gen_random_uuid(),
  tipo                tipo_documento not null,
  serie               text not null,
  correlativo_inicial integer not null default 1,
  correlativo_actual  integer not null default 0,
  longitud            smallint not null default 8,
  predeterminada      boolean not null default false,
  activo              boolean not null default true,
  descripcion         text,
  creado_en           timestamptz not null default now(),
  constraint series_unica          unique (tipo, serie),
  constraint series_inicial_pos    check (correlativo_inicial >= 1),
  constraint series_actual_pos     check (correlativo_actual  >= 0),
  constraint series_longitud       check (longitud between 4 and 10),
  constraint series_formato        check (serie ~ '^[A-Z0-9]{2,6}$')
);

-- Una sola serie predeterminada por tipo: evita que la UI tenga que adivinar.
create unique index if not exists ux_series_predeterminada
  on series_documento (tipo) where predeterminada;

comment on column series_documento.correlativo_inicial is
  'Número desde el que continúa la numeración del sistema anterior. Willy 06:08: los correlativos no arrancan en cero.';
comment on column series_documento.correlativo_actual is
  'Último correlativo efectivamente emitido. Se incrementa de forma atómica en siguiente_correlativo().';

-- ###########################################################################
-- 3. USUARIOS
-- ###########################################################################

-- Nombre en español (`perfiles`, no `profiles`): el resto del esquema está en
-- español y el único anglicismo de la demo no justificaba la excepción.
create table if not exists perfiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null,
  email          text,
  rol            rol_usuario not null default 'ventas',
  telefono       text,
  cargo          text,
  activo         boolean not null default true,
  ultimo_acceso  timestamptz,
  creado_en      timestamptz not null default now()
);

-- Índice funcional en vez de citext: una extensión menos y el mismo efecto.
create unique index if not exists ux_perfiles_email on perfiles (lower(email)) where email is not null;
create index if not exists ix_perfiles_rol on perfiles (rol) where activo;

-- ---------------------------------------------------------------------------
-- Permisos declarativos por rol (base de las políticas RLS de 005).
-- ---------------------------------------------------------------------------
create table if not exists permisos_rol (
  tabla     text        not null,
  rol       rol_usuario not null,
  escribir  boolean     not null default true,
  nota      text,
  primary key (tabla, rol)
);

comment on table permisos_rol is
  'Matriz declarativa tabla×rol. Cambiar quién escribe qué es un INSERT/DELETE aquí, no un ALTER POLICY. Las políticas de 005 consultan esta tabla vía public.puede_escribir().';

-- ###########################################################################
-- 4. UBIGEO
-- ###########################################################################

-- "escribe parte del distrito → lista → selecciona → la dirección se
-- concatena" (02:46). El autocompletado escribe por tecla, así que la tabla
-- está pensada para trigram sobre texto ya normalizado (sin tildes) y para
-- devolver la etiqueta lista para pegar en la guía.
create table if not exists ubigeo (
  codigo        char(6) primary key,
  codigo_sunat  char(6),
  departamento  text not null,
  provincia     text not null,
  distrito      text not null,
  etiqueta      text generated always as (distrito || ', ' || provincia || ', ' || departamento) stored,
  busqueda      text generated always as (
                  public.normalizar_texto(distrito || ' ' || provincia || ' ' || departamento)
                ) stored,
  constraint ubigeo_codigo_valido check (codigo ~ '^[0-9]{6}$')
);

create index if not exists ix_ubigeo_busqueda_trgm
  on ubigeo using gin (busqueda extensions.gin_trgm_ops);
-- El autocompletado casi siempre filtra por distrito primero; este índice
-- resuelve el prefijo exacto sin tocar el GIN.
create index if not exists ix_ubigeo_distrito
  on ubigeo (public.normalizar_texto(distrito) text_pattern_ops);
create index if not exists ix_ubigeo_departamento on ubigeo (departamento, provincia, distrito);

comment on table ubigeo is
  'Departamento/provincia/distrito del Perú (INEI). Datos en seed aparte. Indexado con GIN trigram sobre texto sin tildes para el autocompletado de la guía de remisión (02:46).';

alter table empresa
  drop constraint if exists empresa_ubigeo_fk;
alter table empresa
  add constraint empresa_ubigeo_fk foreign key (ubigeo_codigo) references ubigeo(codigo) on delete set null;

-- Catálogo 20 de SUNAT · motivo de traslado de la guía de remisión.
create table if not exists motivos_traslado (
  codigo      char(2) primary key,
  descripcion text not null,
  activo      boolean not null default true,
  orden       smallint not null default 100
);

-- Catálogos 09 y 10 de SUNAT · motivos de nota de crédito / débito.
create table if not exists motivos_nota (
  codigo      char(2) not null,
  tipo        tipo_documento not null,
  descripcion text not null,
  activo      boolean not null default true,
  primary key (tipo, codigo),
  constraint motivos_nota_tipo check (tipo in ('nota_credito','nota_debito'))
);

-- ###########################################################################
-- 5. CATÁLOGOS DEL MAESTRO DE PRODUCTOS
-- ###########################################################################

-- Marca como ENTIDAD, no como texto dentro de la descripción. Hoy va embebida
-- y eso es un bug del formato: Willy pidió columna propia en el PDF (C2, 14:54)
-- y el filtro por marca es imposible sobre texto libre.
create table if not exists marcas (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  nombre_norm  text generated always as (public.normalizar_codigo(nombre)) stored,
  pais         text,
  segmento     text,
  descripcion  text,
  activo       boolean not null default true,
  orden        smallint not null default 100,
  creado_en    timestamptz not null default now(),
  constraint marcas_segmento check (segmento is null or segmento in ('premium','estandar','economica'))
);
create unique index if not exists ux_marcas_nombre on marcas (nombre_norm);
create index if not exists ix_marcas_activas on marcas (orden, nombre) where activo;
create index if not exists ix_marcas_trgm
  on marcas using gin (public.normalizar_texto(nombre) extensions.gin_trgm_ops);

comment on table marcas is 'Marca como entidad separada (C2, 14:54). Antes vivía embebida en la descripción, lo que impedía filtrar y rompía el PDF.';

-- --------------------------------------------------------------------------
-- Jerarquía de EXACTAMENTE tres niveles.
-- --------------------------------------------------------------------------
-- "Rodamientos → Rodamiento de rodillos → …a rótula" y textualmente
-- "detallarlo más ya va a ser bien complicado" (22:45).
--
-- Decisión: TRES TABLAS, no un árbol auto-referenciado. Una adjacency list
-- admite profundidad arbitraria y habría que limitarla con un trigger que
-- cuenta ancestros en cada INSERT. Con tres tablas el límite es estructural:
-- la base NO PUEDE representar un cuarto nivel.
create table if not exists familias (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  nombre      text not null,
  nombre_norm text generated always as (public.normalizar_codigo(nombre)) stored,
  descripcion text,
  icono       text,
  orden       smallint not null default 100,
  activo      boolean not null default true,
  constraint familias_codigo_fmt check (codigo ~ '^[A-Z0-9_-]{2,20}$')
);
create unique index if not exists ux_familias_codigo on familias (codigo);
create unique index if not exists ux_familias_nombre on familias (nombre_norm);

create table if not exists subfamilias (
  id           uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias(id) on delete restrict,
  codigo       text not null,
  nombre       text not null,
  nombre_norm  text generated always as (public.normalizar_codigo(nombre)) stored,
  orden        smallint not null default 100,
  activo       boolean not null default true,
  -- Clave alternativa que habilita la FK compuesta desde tipos:
  -- garantiza que la subfamilia denormalizada en el producto pertenezca de
  -- verdad a esa familia. Integridad, no confianza.
  constraint subfamilias_id_familia unique (id, familia_id)
);
create unique index if not exists ux_subfamilias_codigo on subfamilias (codigo);
create unique index if not exists ux_subfamilias_nombre_cat on subfamilias (familia_id, nombre_norm);
create index if not exists ix_subfamilias_familia on subfamilias (familia_id, orden, nombre) where activo;

create table if not exists tipos (
  id           uuid primary key default gen_random_uuid(),
  subfamilia_id   uuid not null,
  familia_id uuid not null,
  codigo       text not null,
  nombre       text not null,
  nombre_norm  text generated always as (public.normalizar_codigo(nombre)) stored,
  orden        smallint not null default 100,
  activo       boolean not null default true,
  constraint tipos_subfamilia_fk
    foreign key (subfamilia_id, familia_id) references subfamilias(id, familia_id) on delete restrict,
  constraint tipos_id_subfamilia unique (id, subfamilia_id)
);
create unique index if not exists ux_tipos_codigo on tipos (codigo);
create unique index if not exists ux_tipos_nombre_fam on tipos (subfamilia_id, nombre_norm);
create index if not exists ix_tipos_subfamilia on tipos (subfamilia_id, orden, nombre) where activo;

comment on table tipos is
  'Tercer y último nivel. La jerarquía son tres tablas y no un árbol para que la base no pueda representar un cuarto nivel (Willy 22:45: "detallarlo más ya va a ser bien complicado").';

-- Unidades de medida con código del catálogo 03 de SUNAT (11:56).
create table if not exists unidades_medida (
  codigo       text primary key,
  etiqueta     text not null,
  abreviatura  text not null,
  activo       boolean not null default true,
  orden        smallint not null default 100,
  constraint unidades_codigo_sunat check (codigo ~ '^[A-Z0-9]{2,3}$')
);
comment on table unidades_medida is 'Catálogo 03 de SUNAT. La PK es el código que viaja en el XML (NIU, MTR, BX, SET).';

-- ###########################################################################
-- 6. MAESTRO DE PRODUCTOS
-- ###########################################################################

create table if not exists productos (
  id                 uuid primary key default gen_random_uuid(),

  codigo             text not null,
  -- Forma canónica: es la que lleva el UNIQUE y contra la que compara el
  -- importador de Excel. Ver normalizar_codigo() en 001.
  codigo_norm        text generated always as (public.normalizar_codigo(codigo)) stored,
  codigo_fabricante  text,
  descripcion        text not null,

  marca_id           uuid not null references marcas(id) on delete restrict,

  -- Jerarquía denormalizada PERO garantizada por FKs compuestas: no hay forma
  -- de guardar una subfamilia que no pertenezca a la familia indicada. A cambio
  -- se puede filtrar e indexar por cualquiera de los tres niveles sin joins,
  -- que es justo lo que necesita la búsqueda de sustitutos.
  familia_id       uuid not null,
  subfamilia_id         uuid not null,
  tipo_id      uuid,

  unidad_codigo      text not null default 'NIU' references unidades_medida(codigo) on delete restrict,

  -- ---- Precios ---------------------------------------------------------
  -- El Excel de Willy ("ESTRUCTURA DE BASE DE PRODUCTOS") trae TRES columnas
  -- de precio, todas en dólares, y así se mapean:
  --
  --   P.C. $  ->  ultimo_costo (y costo_promedio en la carga inicial)
  --   P.V. $  ->  precio_venta
  --   P.M. $  ->  precio_minimo
  --
  -- En las 7 filas reales que mandó, P.V. = P.C. x 1.20 EXACTO (3.26->3.92,
  -- 10.70->12.84, 12.63->15.16, 6.30->7.56, 11.86->14.23, 34.43->41.32,
  -- 32.89->39.47). Por eso margen_objetivo_pct arranca en 20: la plantilla
  -- calcula sola el P.V. y Willy solo tipea el costo.
  --
  -- P.M. en cambio NO sigue ninguna fórmula (va entre 9% y 18% sobre el
  -- costo, irregular): es un valor que él pone a mano producto por producto.
  --
  -- CONFIRMADO por Willy el 21/08/2026: "es el precio mínimo que se puede
  -- vender para cotizar al cliente, no puede vender menos de eso porque si no
  -- no es rentable". O sea que es un PISO DURO, no una referencia: lo hace
  -- cumplir el check `cotiz_item_respeta_piso` de cotizacion_items, contra el
  -- precio ya descontado.
  costo_promedio     numeric(14,4) not null default 0,   -- lo calcula el kardex
  ultimo_costo       numeric(14,4) not null default 0,   -- última entrada
  precio_promedio    numeric(14,4) not null default 0,   -- costo + histórico de ventas (28:30)
  precio_venta       numeric(14,2) not null default 0,   -- lista vigente (P.V.)
  precio_minimo      numeric(14,2) not null default 0,   -- piso de venta (P.M.); 0 = sin piso
  margen_objetivo_pct numeric(5,2) not null default 20.00,
  precio_promedio_actualizado_en timestamptz,

  -- ---- Reposición ------------------------------------------------------
  stock_minimo       numeric(14,2) not null default 0,
  stock_maximo       numeric(14,2) not null default 0,

  peso_kg            numeric(12,3) not null default 0,   -- alimenta el peso de la guía
  ubicacion          text,
  imagen_url         text,
  atributos          jsonb not null default '{}'::jsonb,

  -- ---- Archivado (24:21) ----------------------------------------------
  -- "sale de las cotizaciones, sigue en el historial, reactivable". Por eso
  -- es un flag y no un DELETE, y por eso todas las FK de histórico apuntan
  -- con ON DELETE RESTRICT: un producto archivado nunca pierde su pasado.
  archivado          boolean not null default false,
  archivado_en       timestamptz,
  archivado_por      uuid references perfiles(id) on delete set null,
  motivo_archivado   text,

  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  creado_por         uuid references perfiles(id) on delete set null,

  -- ---- Columnas de búsqueda -------------------------------------------
  -- La demo indexó SOLO una columna consolidada `busqueda` mientras las
  -- consultas hacían `.or(sku.ilike, codigo_fabricante.ilike, descripcion.ilike)`.
  -- El planner no puede usar un índice sobre A||B||C para un LIKE sobre A.
  -- Aquí hay una columna generada e indexada POR CADA filtro real, más la
  -- consolidada para la caja de búsqueda única.
  busq_codigo        text generated always as (public.normalizar_texto(codigo)) stored,
  busq_codigo_fab    text generated always as (public.normalizar_texto(coalesce(codigo_fabricante,''))) stored,
  busq_descripcion   text generated always as (public.normalizar_texto(descripcion)) stored,
  busqueda           text generated always as (
                       public.normalizar_texto(
                         codigo || ' ' || coalesce(codigo_fabricante,'') || ' ' || descripcion
                       )
                     ) stored,

  -- ---- Designación base: la clave de los equivalentes entre marcas -----
  -- Willy lo dejó dicho con el propio archivo: hay filas con la MISMA
  -- descripción, la misma familia y la misma subfamilia, y lo único que las
  -- distingue es el código. Pasa porque el código es del FABRICANTE:
  --
  --   6205-2RS1/C3  SKF     6208LLU/2ASU1  NTN     6310-2Z.C3  FAG
  --
  -- El núcleo ISO (6205, 6208, 6310) es lo que SÍ comparten todas las
  -- marcas: es la MEDIDA. Los sufijos (-2RS1, LLU, -2Z, /C3) son sellado y
  -- juego, y cada fabricante los escribe a su manera. Extrayendo el núcleo
  -- salen casi todas las equivalencias sin que nadie capture un solo par a
  -- mano. Alimenta la prioridad intermedia de sustitutos_de().
  designacion_base   text generated always as (
                       -- Sobre upper(codigo) y NO sobre codigo_norm: la forma
                       -- canónica se come los separadores, y sin ellos
                       -- '6205-2RS1/C3' quedaría '62052RS1C3' y el núcleo
                       -- saldría '62052'. Los separadores son justo lo que
                       -- marca dónde termina la medida.
                       substring(upper(codigo) from '^[A-Z]{0,4}[0-9]{2,5}')
                     ) stored,

  -- El código se guarda TAL CUAL lo escribe el fabricante, espacios
  -- incluidos. La reunión decía "el código es único y sin espacios" (10:44),
  -- pero el archivo que él mismo mandó trae '7210 BEP' y '7308 BEP': lo que
  -- quería decir es que no se DUPLICA por un espacio, no que el espacio esté
  -- prohibido. Prohibirlo obligaba a reescribir su código, y ese código es el
  -- que el cliente lee en la cotización.
  --
  -- La unicidad no se apoya en esta columna sino en codigo_norm, que sí
  -- colapsa espacios y separadores. Aquí solo se exige que no venga con
  -- espacios al principio o al final, que es error de tipeo puro.
  constraint productos_codigo_sin_bordes check (codigo = btrim(codigo)),
  constraint productos_precio_min_pos       check (precio_minimo >= 0),
  -- El piso no puede quedar por encima de la lista, o el cotizador
  -- rechazaría hasta el precio de lista.
  constraint productos_precio_min_coherente check (
    precio_minimo = 0 or precio_venta = 0 or precio_minimo <= precio_venta
  ),
  constraint productos_codigo_no_vacio     check (length(btrim(codigo)) > 0),
  constraint productos_costo_pos           check (costo_promedio >= 0 and ultimo_costo >= 0),
  constraint productos_precio_pos          check (precio_venta >= 0 and precio_promedio >= 0),
  constraint productos_stock_min_pos       check (stock_minimo >= 0 and stock_maximo >= 0),
  -- stock_maximo = 0 significa "sin tope definido"; si hay tope, tiene que ser
  -- coherente con el mínimo o la alerta de sobrestock no significa nada.
  constraint productos_stock_max_coherente check (stock_maximo = 0 or stock_maximo >= stock_minimo),
  constraint productos_peso_pos            check (peso_kg >= 0),
  constraint productos_archivado_coherente check (
    (archivado and archivado_en is not null) or (not archivado and archivado_en is null)
  ),
  constraint productos_subfamilia_fk
    foreign key (subfamilia_id, familia_id) references subfamilias(id, familia_id) on delete restrict,
  constraint productos_tipo_fk
    foreign key (tipo_id, subfamilia_id) references tipos(id, subfamilia_id) on delete restrict
);

-- Unicidad real del código: sobre la forma normalizada.
create unique index if not exists ux_productos_codigo_norm on productos (codigo_norm);

-- Búsqueda: un GIN trigram por columna que se filtra de verdad.
create index if not exists ix_productos_busq_codigo_trgm
  on productos using gin (busq_codigo extensions.gin_trgm_ops);
create index if not exists ix_productos_busq_codigo_fab_trgm
  on productos using gin (busq_codigo_fab extensions.gin_trgm_ops);
create index if not exists ix_productos_busq_descripcion_trgm
  on productos using gin (busq_descripcion extensions.gin_trgm_ops);
-- Caja única del constructor de cotizaciones: un solo término contra todo.
-- Va con btree_gin para poder meter `archivado` en el MISMO índice y que el
-- filtro "solo productos vivos" no obligue a un recheck sobre miles de filas.
create index if not exists ix_productos_busqueda_trgm
  on productos using gin (busqueda extensions.gin_trgm_ops, archivado);

-- Paginación por keyset del catálogo (2.000+ SKU y creciendo): la clave de
-- orden estable es codigo_norm, que ya es única. `where not archivado` deja el
-- índice del tamaño del catálogo vivo.
create index if not exists ix_productos_keyset_codigo
  on productos (codigo_norm) where not archivado;
create index if not exists ix_productos_keyset_reciente
  on productos (creado_en desc, id desc);

-- Filtros de listado y de sustitutos.
create index if not exists ix_productos_marca         on productos (marca_id) where not archivado;
create index if not exists ix_productos_familia     on productos (familia_id, precio_venta) where not archivado;
create index if not exists ix_productos_subfamilia       on productos (subfamilia_id, precio_venta) where not archivado;
create index if not exists ix_productos_tipo    on productos (tipo_id, precio_venta) where not archivado and tipo_id is not null;
-- Equivalentes entre marcas: 'dame todo lo que sea un 6205, lo fabrique
-- quien lo fabrique'. Incluye marca_id para que el índice resuelva solo la
-- consulta típica, que es justamente la de OTRA marca.
create index if not exists ix_productos_designacion_base
  on productos (designacion_base, marca_id)
  where not archivado and designacion_base is not null;
create index if not exists ix_productos_codigo_fab    on productos (public.normalizar_codigo(codigo_fabricante)) where codigo_fabricante is not null;
create index if not exists ix_productos_archivados    on productos (archivado_en desc) where archivado;

comment on column productos.codigo_norm is 'Código canónico (sin espacios, mayúsculas, sin tildes). Aquí vive el UNIQUE real y es la clave de la paginación keyset.';
comment on column productos.precio_promedio is 'Precio referencial que se alimenta solo del costo y del histórico de ventas (Willy 28:30). Lo recalcula recalcular_precios_promedio().';
comment on column productos.archivado is 'Archivar ≠ borrar: el producto sale del cotizador pero conserva su historial y se puede reactivar (24:21).';
comment on column productos.stock_maximo is 'Tope para la alerta de sobrestock / capital inmovilizado ("tengo 80 rodamientos que no sé cómo vender", 25:21). 0 = sin tope.';
comment on column productos.precio_minimo is 'Columna P.M. del maestro: piso DURO de venta. Por debajo de esto la operación no es rentable (Willy, 21/08/2026), y el check cotiz_item_respeta_piso lo impide sobre el precio ya descontado. 0 = piso sin definir.';
comment on column productos.designacion_base is 'Núcleo ISO del código (6205 en 6205-2RS1/C3). Es lo único que comparten las marcas, así que es la clave de los equivalentes automáticos. Sale del código en CRUDO, no de codigo_norm: la forma canónica se come los separadores y con ellos se pierde dónde termina la medida.';

-- --------------------------------------------------------------------------
-- Equivalencias explícitas entre marcas
-- --------------------------------------------------------------------------
-- DECISIÓN sobre sustitutos (49:56), evaluadas las dos alternativas:
--
--   (a) Solo jerarquía + índice. Ventaja: cero mantenimiento, funciona el
--       primer día con los 2.000 SKU del Excel de Willy sin que nadie capture
--       nada. Límite: la tipo describe el TIPO CONSTRUCTIVO ("rodillos
--       a rótula"), no la MEDIDA. Un 6205 y un 6320 comparten tipo y no
--       son sustituibles; la banda de precio los separa en la práctica pero no
--       siempre.
--   (b) Solo tabla de equivalencias explícitas. Ventaja: precisión total
--       (SKF 6205-2RS ≡ FAG 6205-2RSR). Límite: es data que HOY NO EXISTE.
--       Exigirla es dejar la función muerta hasta que alguien capture miles
--       de pares a mano, y Willy no va a hacerlo.
--
--   ELEGIDO: LAS DOS, EN CASCADA. `sustitutos_de()` devuelve primero las
--   equivalencias explícitas (prioridad 1, confianza alta) y completa con los
--   productos de la misma tipo/subfamilia dentro de una banda de precio
--   (prioridad 2). Así el sistema es útil desde el día uno y mejora sin
--   reescribir nada a medida que se capturan equivalencias reales.
create table if not exists producto_equivalencias (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references productos(id) on delete cascade,
  equivalente_id uuid not null references productos(id) on delete cascade,
  -- 'exacta' = intercambiable sin criterio; 'similar' = misma medida, otra
  -- serie; 'sustituto' = sirve con criterio técnico.
  clase          text not null default 'exacta',
  nota           text,
  creado_por     uuid references perfiles(id) on delete set null,
  creado_en      timestamptz not null default now(),
  constraint equiv_distinta      check (producto_id <> equivalente_id),
  constraint equiv_clase         check (clase in ('exacta','similar','sustituto')),
  constraint equiv_unica         unique (producto_id, equivalente_id)
);
create index if not exists ix_equiv_producto    on producto_equivalencias (producto_id);
create index if not exists ix_equiv_equivalente on producto_equivalencias (equivalente_id);

-- ###########################################################################
-- 7. TERCEROS
-- ###########################################################################

create table if not exists clientes (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null,
  tipo_documento     tipo_documento_identidad not null default 'RUC',
  numero_documento   text,
  razon_social       text not null,
  nombre_comercial   text,
  direccion          text,
  ubigeo_codigo      char(6) references ubigeo(codigo) on delete set null,
  referencia_direccion text,
  sector             text,
  contacto           text,
  cargo_contacto     text,
  email              text,
  telefono           text,
  whatsapp           text,

  -- Cobranzas: línea de crédito por cliente.
  condicion_pago     condicion_pago not null default 'credito',
  linea_credito      numeric(14,2) not null default 0,
  dias_credito       smallint not null default 30,
  dias_gracia        smallint not null default 10,
  bloqueado          boolean not null default false,
  motivo_bloqueo     text,

  vendedor_id        uuid references perfiles(id) on delete set null,
  notas              text,
  activo             boolean not null default true,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  busq_documento     text generated always as (coalesce(numero_documento,'')) stored,
  busq_razon_social  text generated always as (public.normalizar_texto(razon_social)) stored,
  busqueda           text generated always as (
                       public.normalizar_texto(
                         codigo || ' ' || coalesce(numero_documento,'') || ' ' ||
                         razon_social || ' ' || coalesce(nombre_comercial,'')
                       )
                     ) stored,

  constraint clientes_linea_pos    check (linea_credito >= 0),
  constraint clientes_dias_pos     check (dias_credito >= 0 and dias_gracia >= 0),
  -- Coherencia documento/número: un RUC son 11 dígitos, un DNI son 8.
  constraint clientes_documento_ok check (
    case tipo_documento
      when 'RUC'     then numero_documento ~ '^[0-9]{11}$'
      when 'DNI'     then numero_documento ~ '^[0-9]{8}$'
      when 'SIN_DOC' then numero_documento is null
      else numero_documento is not null and length(btrim(numero_documento)) between 4 and 20
    end
  )
);
create unique index if not exists ux_clientes_codigo on clientes (public.normalizar_codigo(codigo));
create unique index if not exists ux_clientes_documento
  on clientes (tipo_documento, numero_documento) where numero_documento is not null;
create index if not exists ix_clientes_busqueda_trgm
  on clientes using gin (busqueda extensions.gin_trgm_ops, activo);
create index if not exists ix_clientes_razon_trgm
  on clientes using gin (busq_razon_social extensions.gin_trgm_ops);
create index if not exists ix_clientes_documento_prefijo
  on clientes (busq_documento text_pattern_ops) where numero_documento is not null;
create index if not exists ix_clientes_keyset on clientes (razon_social, id) where activo;
create index if not exists ix_clientes_vendedor on clientes (vendedor_id) where activo;

comment on column clientes.linea_credito is 'Tope de exposición. v_resumen_clientes lo cruza con el saldo vivo para dar la línea disponible.';

create table if not exists proveedores (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null,
  tipo_documento    tipo_documento_identidad not null default 'RUC',
  numero_documento  text,
  razon_social      text not null,
  tipo              tipo_compra not null default 'local',
  pais              text not null default 'Perú',
  direccion         text,
  ubigeo_codigo     char(6) references ubigeo(codigo) on delete set null,
  contacto          text,
  email             text,
  telefono          text,
  whatsapp          text,
  dias_pago         smallint not null default 0,
  lead_time_dias    smallint not null default 3,
  notas             text,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  busqueda          text generated always as (
                      public.normalizar_texto(
                        codigo || ' ' || coalesce(numero_documento,'') || ' ' || razon_social
                      )
                    ) stored,
  constraint proveedores_dias_pos check (dias_pago >= 0 and lead_time_dias >= 0)
);
create unique index if not exists ux_proveedores_codigo on proveedores (public.normalizar_codigo(codigo));
create unique index if not exists ux_proveedores_documento
  on proveedores (tipo_documento, numero_documento) where numero_documento is not null;
create index if not exists ix_proveedores_busqueda_trgm
  on proveedores using gin (busqueda extensions.gin_trgm_ops, activo);
create index if not exists ix_proveedores_keyset on proveedores (razon_social, id) where activo;

-- Marcas que provee cada proveedor (relación real, no un text[]).
create table if not exists proveedor_marcas (
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  marca_id     uuid not null references marcas(id) on delete cascade,
  primary key (proveedor_id, marca_id)
);
create index if not exists ix_proveedor_marcas_marca on proveedor_marcas (marca_id);

-- Las tablas de caché y cuota de consultas RUC/DNI viven en 007_consultas.sql:
-- son propiedad del paquete @rodatech/consultas, que define su contrato de RPC.

-- ###########################################################################
-- 8. INVENTARIO
-- ###########################################################################

-- Un solo almacén: la PK es el producto, no (producto, almacén).
-- Tabla aparte de `productos` a propósito: cada movimiento actualiza el saldo,
-- y meterlo en la fila del producto obligaría a reescribir una fila ancha con
-- una decena de índices (incluidos cuatro GIN) en cada recepción o venta.
create table if not exists stock (
  producto_id    uuid primary key references productos(id) on delete restrict,
  cantidad       numeric(14,2) not null default 0,
  reservado      numeric(14,2) not null default 0,
  -- Saldo valorizado corriente. Vive aquí y no se recalcula leyendo el último
  -- movimiento: así `registrar_movimientos()` bloquea UNA fila por producto
  -- (`select … for update`) y procesa un lote completo sin escanear el kardex
  -- una vez por línea.
  valorizado     numeric(16,4) not null default 0,
  costo_promedio numeric(14,4) not null default 0,
  actualizado_en timestamptz not null default now(),
  constraint stock_reservado_pos check (reservado >= 0),
  constraint stock_costo_pos     check (costo_promedio >= 0)
);
-- `cantidad` puede ser negativa a propósito: si almacén despacha antes de
-- registrar la recepción, preferimos un saldo negativo VISIBLE (y una alerta)
-- a bloquear la operación o a mentir con un cero.
create index if not exists ix_stock_bajo on stock (cantidad) where cantidad <= 0;

comment on table stock is 'Saldo actual del único almacén. Separado de productos para no reescribir una fila con 4 índices GIN en cada movimiento.';
comment on column stock.cantidad is 'Puede ser negativa: preferimos un descuadre visible a bloquear el despacho. Genera alerta y se corrige con ajuste de gerencia.';

create table if not exists movimientos_inventario (
  id                bigint generated always as identity primary key,
  fecha             timestamptz not null default now(),
  producto_id       uuid not null references productos(id) on delete restrict,
  tipo              tipo_movimiento not null,
  -- Siempre positiva: el signo lo determina `tipo`. Así ningún camino de
  -- código puede grabar "una salida de -5" y sumar stock por accidente.
  cantidad          numeric(14,2) not null,
  costo_unitario    numeric(14,4) not null default 0,
  saldo_cantidad    numeric(14,2) not null,
  saldo_valorizado  numeric(16,4) not null,
  costo_promedio    numeric(14,4) not null default 0,
  referencia_tipo   text,     -- recepcion | comprobante | guia | ajuste | compra
  referencia_id     uuid,
  referencia_numero text,
  motivo            text,
  usuario_id        uuid references perfiles(id) on delete set null,
  creado_en         timestamptz not null default now(),
  constraint mov_cantidad_pos check (cantidad > 0),
  constraint mov_costo_pos    check (costo_unitario >= 0)
);
-- Kardex de un producto, y clave keyset estable: (fecha desc, id desc).
create index if not exists ix_mov_producto_fecha
  on movimientos_inventario (producto_id, fecha desc, id desc);
create index if not exists ix_mov_fecha on movimientos_inventario (fecha desc, id desc);
create index if not exists ix_mov_referencia
  on movimientos_inventario (referencia_tipo, referencia_id) where referencia_id is not null;
create index if not exists ix_mov_tipo_fecha on movimientos_inventario (tipo, fecha desc);

comment on table movimientos_inventario is
  'Kardex valorizado con costo promedio ponderado. `id` es identity bigint porque es la única tabla donde el ORDEN DE INSERCIÓN es semántico: el promedio depende de la secuencia.';
comment on column movimientos_inventario.cantidad is 'Siempre > 0. El signo lo pone `tipo`, para que no exista el estado imposible "salida negativa".';

-- --------------------------------------------------------------------------
-- Ajustes de inventario · "un botón que lo va a usar con cuidado" (26:49)
-- --------------------------------------------------------------------------
create table if not exists ajustes_inventario (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  fecha          date not null default current_date,
  tipo           tipo_ajuste not null default 'descuadre',
  motivo         text not null,
  usuario_id     uuid references perfiles(id) on delete set null,
  anulado        boolean not null default false,
  creado_en      timestamptz not null default now(),
  constraint ajuste_motivo_no_vacio check (length(btrim(motivo)) >= 5)
);
create index if not exists ix_ajustes_fecha on ajustes_inventario (fecha desc, id desc);

create table if not exists ajuste_items (
  id               uuid primary key default gen_random_uuid(),
  ajuste_id        uuid not null references ajustes_inventario(id) on delete cascade,
  producto_id      uuid not null references productos(id) on delete restrict,
  cantidad_sistema numeric(14,2) not null,
  cantidad_fisica  numeric(14,2) not null,
  diferencia       numeric(14,2) generated always as (cantidad_fisica - cantidad_sistema) stored,
  costo_unitario   numeric(14,4) not null default 0,
  constraint ajuste_item_unico unique (ajuste_id, producto_id),
  constraint ajuste_costo_pos  check (costo_unitario >= 0)
);
create index if not exists ix_ajuste_items_producto on ajuste_items (producto_id);

comment on table ajustes_inventario is
  'Cuadre inicial y descuadres. RLS lo restringe a gerencia/admin (Willy 26:49: "un botón que lo va a usar con cuidado").';

-- ###########################################################################
-- 9. COMPRAS Y RECEPCIÓN
-- ###########################################################################

-- Sin orden de compra formal (§2.11, 30:01): esto es el REGISTRO de la compra.
create table if not exists compras (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  proveedor_id        uuid not null references proveedores(id) on delete restrict,
  tipo                tipo_compra not null default 'local',
  fecha               date not null default current_date,
  fecha_estimada      date,
  documento_proveedor text,             -- factura / invoice del proveedor
  guia_proveedor      text,
  subtotal            numeric(14,2) not null default 0,
  igv                 numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  -- Importación: registro SIMPLE de gastos, no landed cost prorrateado (§2.11).
  -- Willy compra por DHL, envíos pequeños. El total de gastos se puede
  -- repartir por valor al recibir, pero no hay DUA, ni FOB, ni ad valorem.
  gastos_importacion  numeric(14,2) not null default 0,
  tracking            text,
  courier             text,
  estado              estado_compra not null default 'registrada',
  comprador_id        uuid references perfiles(id) on delete set null,
  observaciones       text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint compras_montos_pos check (subtotal >= 0 and igv >= 0 and total >= 0 and gastos_importacion >= 0)
);
create index if not exists ix_compras_proveedor on compras (proveedor_id, fecha desc);
create index if not exists ix_compras_keyset    on compras (fecha desc, id desc);
create index if not exists ix_compras_estado    on compras (estado, fecha desc);

comment on column compras.gastos_importacion is
  'Registro simple de gastos (courier, aduana express). NO es landed cost prorrateado: Willy hace compras chicas por DHL (30:01).';

create table if not exists compra_items (
  id                uuid primary key default gen_random_uuid(),
  compra_id         uuid not null references compras(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete restrict,
  orden             smallint not null default 1,
  cantidad          numeric(14,2) not null,
  cantidad_recibida numeric(14,2) not null default 0,
  unidad_codigo     text not null default 'NIU' references unidades_medida(codigo) on delete restrict,
  costo_unitario    numeric(14,4) not null default 0,
  importe           numeric(14,2) generated always as (round(cantidad * costo_unitario, 2)) stored,
  constraint compra_item_cant_pos      check (cantidad > 0),
  constraint compra_item_recibida_ok   check (cantidad_recibida >= 0 and cantidad_recibida <= cantidad),
  constraint compra_item_costo_pos     check (costo_unitario >= 0),
  constraint compra_item_unico         unique (compra_id, producto_id)
);
create index if not exists ix_compra_items_compra   on compra_items (compra_id, orden);
create index if not exists ix_compra_items_producto on compra_items (producto_id);

create table if not exists gastos_importacion (
  id          uuid primary key default gen_random_uuid(),
  compra_id   uuid not null references compras(id) on delete cascade,
  concepto    text not null,
  monto       numeric(14,2) not null,
  fecha       date not null default current_date,
  documento   text,
  creado_en   timestamptz not null default now(),
  constraint gasto_monto_pos check (monto >= 0)
);
create index if not exists ix_gastos_compra on gastos_importacion (compra_id);

-- --------------------------------------------------------------------------
-- Recepción: AQUÍ y solo aquí se mueve el stock (25:21).
-- --------------------------------------------------------------------------
create table if not exists recepciones (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  compra_id         uuid references compras(id) on delete restrict,
  proveedor_id      uuid references proveedores(id) on delete restrict,
  fecha             date not null default current_date,
  guia_proveedor    text,
  factura_proveedor text,
  recibido_por      uuid references perfiles(id) on delete set null,
  observaciones     text,
  anulada           boolean not null default false,
  creado_en         timestamptz not null default now()
);
create index if not exists ix_recepciones_compra on recepciones (compra_id);
create index if not exists ix_recepciones_keyset on recepciones (fecha desc, id desc);

create table if not exists recepcion_items (
  id             uuid primary key default gen_random_uuid(),
  recepcion_id   uuid not null references recepciones(id) on delete cascade,
  producto_id    uuid not null references productos(id) on delete restrict,
  cantidad       numeric(14,2) not null,
  costo_unitario numeric(14,4) not null default 0,
  constraint recepcion_item_cant_pos  check (cantidad > 0),
  constraint recepcion_item_costo_pos check (costo_unitario >= 0),
  constraint recepcion_item_unico     unique (recepcion_id, producto_id)
);
create index if not exists ix_recepcion_items_producto on recepcion_items (producto_id);

comment on table recepciones is
  'El stock se mueve al RECIBIR la mercadería, no con la compra ni con la factura (Willy 25:21). Las funciones de recepción son las únicas que generan movimientos de ingreso.';

-- ###########################################################################
-- 10. COTIZACIONES
-- ###########################################################################

create table if not exists cotizaciones (
  id                uuid primary key default gen_random_uuid(),
  serie             text not null default 'COT1',
  correlativo       integer not null,
  numero            text generated always as (serie || '-' || lpad(correlativo::text, 6, '0')) stored,

  cliente_id        uuid not null references clientes(id) on delete restrict,
  fecha             date not null default current_date,
  validez_dias      smallint not null default 15,
  fecha_vencimiento date generated always as (fecha + validez_dias) stored,

  -- Willy: el número de orden de compra del cliente "siempre presente, clave"
  -- (§2.2). Nace en la cotización y viaja a la guía y a la factura.
  orden_compra_cliente text,

  subtotal          numeric(14,2) not null default 0,
  descuento_total   numeric(14,2) not null default 0,
  igv               numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  costo_total       numeric(14,2) not null default 0,
  margen_pct        numeric(6,2)  not null default 0,

  -- C5 (15:52): el descuento es una casilla habilitable, no una columna que
  -- siempre se ve. El PDF lee este flag para decidir si imprime la columna.
  mostrar_descuento boolean not null default false,

  estado            estado_cotizacion not null default 'borrador',
  vendedor_id       uuid references perfiles(id) on delete set null,
  contacto          text,
  condiciones       text,
  observaciones     text,
  tiempo_entrega    text,
  enviada_en        timestamptz,
  aprobada_en       timestamptz,
  aprobada_por      uuid references perfiles(id) on delete set null,
  motivo_rechazo    text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),

  constraint cotiz_serie_correlativo unique (serie, correlativo),
  constraint cotiz_validez_pos  check (validez_dias between 1 and 365),
  constraint cotiz_montos_pos   check (subtotal >= 0 and descuento_total >= 0 and igv >= 0 and total >= 0),
  constraint cotiz_aprobada_ok  check (estado <> 'aprobada' or aprobada_en is not null)
);
create index if not exists ix_cotiz_cliente on cotizaciones (cliente_id, fecha desc);
create index if not exists ix_cotiz_keyset  on cotizaciones (fecha desc, id desc);
create index if not exists ix_cotiz_estado  on cotizaciones (estado, fecha desc);
create index if not exists ix_cotiz_numero  on cotizaciones (numero);
create index if not exists ix_cotiz_oc      on cotizaciones (public.normalizar_codigo(orden_compra_cliente))
  where orden_compra_cliente is not null;
-- Alerta "cotización por vencer": índice parcial sobre las que siguen vivas.
create index if not exists ix_cotiz_por_vencer
  on cotizaciones (fecha_vencimiento) where estado in ('enviada','aprobada');

comment on column cotizaciones.mostrar_descuento is 'C5 (15:52): el descuento es casilla habilitable. El PDF imprime la columna solo si esto es true.';
comment on column cotizaciones.orden_compra_cliente is 'N.° de OC del cliente. Willy insiste en que va "siempre presente" y se arrastra a guía y factura (§2.2, 09:10).';

create table if not exists cotizacion_items (
  id              uuid primary key default gen_random_uuid(),
  cotizacion_id   uuid not null references cotizaciones(id) on delete cascade,
  producto_id     uuid references productos(id) on delete restrict,
  orden           smallint not null default 1,

  -- Snapshot: lo que se imprimió en el PDF no puede cambiar porque después se
  -- editó el maestro. Marca en columna propia (C2) y descripción SIN el código
  -- repetido dentro (C3).
  codigo          text not null,
  marca           text,
  descripcion     text not null,

  cantidad        numeric(14,2) not null default 1,
  unidad_codigo   text not null default 'NIU' references unidades_medida(codigo) on delete restrict,

  -- C1 (13:25, 14:18): SOLO valor unitario. La columna "precio unitario"
  -- (valor × 1.18) desaparece del modelo, no solo del PDF — es la que le hizo
  -- perder ventas porque el cliente comparaba el precio con IGV contra el
  -- valor de la competencia.
  valor_unitario  numeric(14,4) not null default 0,
  descuento_pct   numeric(5,2)  not null default 0,
  importe         numeric(14,2) generated always as (
                    round(cantidad * valor_unitario * (1 - descuento_pct / 100.0), 2)
                  ) stored,
  costo_unitario  numeric(14,4) not null default 0,

  -- Piso de negociación, copiado de productos.precio_minimo (la columna P.M.
  -- del maestro) en el momento de cotizar. Willy, 21/08/2026: "es el precio
  -- mínimo que se puede vender para cotizar al cliente, no puede vender menos
  -- de eso porque si no no es rentable".
  --
  -- Va COPIADO y no leído por join, por dos razones:
  --   1. El piso cambia con el tiempo. Una cotización de hace tres meses tiene
  --      que poder auditarse contra el piso que regía ENTONCES, no contra el
  --      de hoy.
  --   2. Sin la copia, el check de abajo tendría que mirar otra tabla, y un
  --      CHECK no puede. Habría que hacerlo con trigger, que es más lento y
  --      más fácil de saltarse.
  --
  -- 0 = producto sin piso definido (todavía no se cargó su P.M.).
  precio_minimo_ref numeric(14,2) not null default 0,

  entrega         text,

  constraint cotiz_item_cant_pos     check (cantidad > 0),
  constraint cotiz_item_valor_pos    check (valor_unitario >= 0),
  constraint cotiz_item_desc_rango   check (descuento_pct >= 0 and descuento_pct <= 100),
  constraint cotiz_item_piso_pos     check (precio_minimo_ref >= 0),

  -- LA regla comercial de Rodatech, y por eso vive aquí y no solo en el
  -- formulario: se compara el precio NETO (ya con el descuento aplicado)
  -- contra el piso. Descontar 30 % sobre un precio que respeta el piso es
  -- exactamente la forma de vender por debajo del piso sin darse cuenta.
  constraint cotiz_item_respeta_piso check (
    precio_minimo_ref = 0
    or round(valor_unitario * (1 - descuento_pct / 100.0), 4) >= precio_minimo_ref
  ),

  constraint cotiz_item_orden_unico  unique (cotizacion_id, orden)
);
create index if not exists ix_cotiz_items on cotizacion_items (cotizacion_id, orden);
create index if not exists ix_cotiz_items_producto on cotizacion_items (producto_id) where producto_id is not null;

comment on column cotizacion_items.valor_unitario is
  'Valor unitario SIN IGV. La demo llevaba también "precio unitario" (valor × 1.18) y esa columna es la que confundió a los clientes de Willy (C1, 13:25).';
comment on column cotizacion_items.descripcion is
  'Descripción limpia: sin la marca (va en su columna) y sin repetir el código (C2 y C3, 14:54).';

-- ###########################################################################
-- 11. GUÍA DE REMISIÓN
-- ###########################################################################

create table if not exists guias_remision (
  id                 uuid primary key default gen_random_uuid(),
  serie              text not null default 'T001',
  correlativo        integer not null,
  numero             text generated always as (serie || '-' || lpad(correlativo::text, 8, '0')) stored,

  cotizacion_id      uuid references cotizaciones(id) on delete restrict,
  cliente_id         uuid not null references clientes(id) on delete restrict,
  orden_compra_cliente text,

  fecha_emision      date not null default current_date,
  fecha_traslado     date not null default current_date,
  motivo_codigo      char(2) not null default '01' references motivos_traslado(codigo) on delete restrict,
  motivo_descripcion text,

  -- Partida y llegada: ubigeo + dirección. El autocompletado del ubigeo
  -- rellena la dirección concatenada (02:46).
  ubigeo_partida     char(6) not null references ubigeo(codigo) on delete restrict,
  direccion_partida  text not null,
  ubigeo_llegada     char(6) not null references ubigeo(codigo) on delete restrict,
  direccion_llegada  text not null,

  -- "el peso que es lo más importante" (02:46). NOT NULL y > 0, sin excusas:
  -- SUNAT rechaza la GRE sin peso bruto total.
  peso_bruto_kg      numeric(12,3) not null,
  unidad_peso        text not null default 'KGM',
  numero_bultos      integer not null default 1,

  -- Transporte. Por defecto privado: "vehículo propio por defecto" (03:56).
  modalidad_traslado char(2) not null default '02',   -- 01 público, 02 privado
  transportista_documento text,
  transportista_razon_social text,
  transportista_placa text,
  conductor_documento text,
  conductor_nombre   text,
  conductor_licencia text,

  -- "persona que entrega" (03:56): quién de Rodatech sale con la mercadería.
  entregado_por      text,
  recibido_por       text,

  estado             estado_guia not null default 'borrador',
  anulada_en         timestamptz,
  anulada_por        uuid references perfiles(id) on delete set null,
  motivo_anulacion   text,

  -- Ciclo SUNAT (GRE se emite por API REST con ticket asíncrono).
  estado_sunat       estado_sunat not null default 'no_enviado',
  sunat_ticket       text,
  sunat_hash_cdr     text,
  sunat_xml_url      text,
  sunat_cdr_url      text,
  sunat_codigo_respuesta text,
  sunat_mensaje      text,
  sunat_enviado_en   timestamptz,

  observaciones      text,
  creado_por         uuid references perfiles(id) on delete set null,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  constraint guia_serie_correlativo unique (serie, correlativo),
  constraint guia_serie_formato     check (serie ~ '^[TVEG][0-9]{3}$'),
  constraint guia_peso_pos          check (peso_bruto_kg > 0),
  constraint guia_bultos_pos        check (numero_bultos > 0),
  constraint guia_modalidad         check (modalidad_traslado in ('01','02')),
  constraint guia_anulacion_ok      check (
    estado <> 'anulada' or (anulada_en is not null and length(btrim(coalesce(motivo_anulacion,''))) >= 5)
  ),
  -- Transporte público exige transportista identificado; el privado exige placa.
  constraint guia_transporte_ok check (
    (modalidad_traslado = '01' and transportista_documento is not null)
    or (modalidad_traslado = '02' and transportista_placa is not null)
    or estado = 'borrador'
  )
);
create index if not exists ix_guias_cliente     on guias_remision (cliente_id, fecha_emision desc);
create index if not exists ix_guias_keyset      on guias_remision (fecha_emision desc, id desc);
create index if not exists ix_guias_cotizacion  on guias_remision (cotizacion_id) where cotizacion_id is not null;
create index if not exists ix_guias_estado      on guias_remision (estado, fecha_emision desc);
create index if not exists ix_guias_sunat_pend  on guias_remision (estado_sunat, sunat_enviado_en)
  where estado_sunat in ('pendiente','enviado','observado');
create index if not exists ix_guias_oc on guias_remision (public.normalizar_codigo(orden_compra_cliente))
  where orden_compra_cliente is not null;

comment on column guias_remision.peso_bruto_kg is 'Obligatorio. "el peso que es lo más importante" (02:46) y sin él SUNAT rechaza la GRE.';
comment on column guias_remision.entregado_por is 'Persona de Rodatech que sale con la mercadería (03:56).';
comment on table guias_remision is
  'Guía de remisión remitente. Se genera desde la cotización aprobada, arrastra la OC del cliente y es anulable (18:56).';

create table if not exists guia_items (
  id            uuid primary key default gen_random_uuid(),
  guia_id       uuid not null references guias_remision(id) on delete cascade,
  producto_id   uuid not null references productos(id) on delete restrict,
  cotizacion_item_id uuid references cotizacion_items(id) on delete set null,
  orden         smallint not null default 1,
  codigo        text not null,
  descripcion   text not null,
  cantidad      numeric(14,2) not null,
  unidad_codigo text not null default 'NIU' references unidades_medida(codigo) on delete restrict,
  peso_kg       numeric(12,3) not null default 0,
  constraint guia_item_cant_pos  check (cantidad > 0),
  constraint guia_item_peso_pos  check (peso_kg >= 0),
  constraint guia_item_unico     unique (guia_id, orden)
);
create index if not exists ix_guia_items on guia_items (guia_id, orden);
create index if not exists ix_guia_items_producto on guia_items (producto_id);

-- ###########################################################################
-- 12. COMPROBANTES
-- ###########################################################################

create table if not exists comprobantes (
  id                 uuid primary key default gen_random_uuid(),
  tipo               tipo_documento not null default 'factura',
  serie              text not null,
  correlativo        integer not null,
  numero             text generated always as (serie || '-' || lpad(correlativo::text, 8, '0')) stored,

  cliente_id         uuid not null references clientes(id) on delete restrict,

  -- Trazabilidad de punta a punta: "la factura arrastra N.° de cotización
  -- (auto), N.° de orden de compra y N.° de guía" (09:10).
  cotizacion_id      uuid references cotizaciones(id) on delete restrict,
  guia_id            uuid references guias_remision(id) on delete restrict,
  orden_compra_cliente text,

  -- Notas de crédito/débito: apuntan al comprobante que modifican.
  referencia_id      uuid references comprobantes(id) on delete restrict,
  motivo_nota_codigo char(2),

  fecha_emision      date not null default current_date,
  condicion_pago     condicion_pago not null default 'credito',
  dias_credito       smallint not null default 0,
  fecha_vencimiento  date,

  op_gravada         numeric(14,2) not null default 0,
  op_exonerada       numeric(14,2) not null default 0,
  op_inafecta        numeric(14,2) not null default 0,
  descuento_global   numeric(14,2) not null default 0,
  igv                numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  total_letras       text,
  costo_total        numeric(14,2) not null default 0,

  -- Cobranzas
  pagado             numeric(14,2) not null default 0,
  saldo              numeric(14,2) generated always as (total - pagado) stored,
  estado             estado_comprobante not null default 'emitido',

  -- SPOT / detracción y retención (07:55, 09:45).
  detraccion_aplica     boolean not null default false,
  detraccion_codigo     text,             -- catálogo 54 SUNAT
  detraccion_porcentaje numeric(5,2) not null default 0,
  detraccion_monto      numeric(14,2) not null default 0,
  detraccion_cuenta     text,
  retencion_aplica      boolean not null default false,
  retencion_porcentaje  numeric(5,2) not null default 0,
  retencion_monto       numeric(14,2) not null default 0,

  -- Ciclo de vida SUNAT
  estado_sunat       estado_sunat not null default 'no_enviado',
  sunat_ticket       text,
  sunat_hash_cdr     text,
  sunat_xml_firmado  text,      -- ruta en Storage del XML firmado
  sunat_cdr_url      text,
  sunat_codigo_respuesta text,
  sunat_mensaje      text,
  sunat_respuesta    jsonb,
  sunat_enviado_en   timestamptz,

  vendedor_id        uuid references perfiles(id) on delete set null,
  observaciones      text,
  anulado_en         timestamptz,
  anulado_por        uuid references perfiles(id) on delete set null,
  motivo_anulacion   text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  constraint comp_tipo_fiscal check (tipo in ('factura','boleta','nota_credito','nota_debito')),
  constraint comp_serie_unica unique (tipo, serie, correlativo),
  constraint comp_serie_formato check (serie ~ '^[BF][A-Z0-9]{3}$'),
  constraint comp_montos_pos check (
    op_gravada >= 0 and op_exonerada >= 0 and op_inafecta >= 0
    and descuento_global >= 0 and igv >= 0 and total >= 0
  ),
  constraint comp_pagado_rango  check (pagado >= 0 and pagado <= total + 0.01),
  -- Una nota siempre referencia el documento que corrige, y solo una nota lo hace.
  constraint comp_nota_referencia check (
    (tipo in ('nota_credito','nota_debito') and referencia_id is not null and motivo_nota_codigo is not null)
    or (tipo in ('factura','boleta') and referencia_id is null and motivo_nota_codigo is null)
  ),
  -- Boleta no lleva detracción ni retención (son regímenes de comprobante de pago con RUC).
  constraint comp_boleta_sin_spot check (tipo <> 'boleta' or (not detraccion_aplica and not retencion_aplica)),
  constraint comp_detraccion_ok check (
    not detraccion_aplica or (detraccion_porcentaje > 0 and detraccion_monto > 0 and detraccion_codigo is not null)
  ),
  constraint comp_retencion_ok check (
    not retencion_aplica or (retencion_porcentaje > 0 and retencion_monto > 0)
  ),
  -- Detracción y retención son excluyentes por norma.
  constraint comp_spot_excluyente check (not (detraccion_aplica and retencion_aplica)),
  constraint comp_credito_ok check (
    (condicion_pago = 'credito' and fecha_vencimiento is not null)
    or (condicion_pago = 'contado' and dias_credito = 0)
  ),
  constraint comp_anulado_ok check (estado <> 'anulado' or anulado_en is not null),
  constraint comp_no_autoreferencia check (referencia_id is null or referencia_id <> id)
);
create index if not exists ix_comp_cliente   on comprobantes (cliente_id, fecha_emision desc);
create index if not exists ix_comp_keyset    on comprobantes (fecha_emision desc, id desc);
create index if not exists ix_comp_estado    on comprobantes (estado, fecha_emision desc);
create index if not exists ix_comp_tipo      on comprobantes (tipo, fecha_emision desc);
create index if not exists ix_comp_cotizacion on comprobantes (cotizacion_id) where cotizacion_id is not null;
create index if not exists ix_comp_guia      on comprobantes (guia_id) where guia_id is not null;
create index if not exists ix_comp_referencia on comprobantes (referencia_id) where referencia_id is not null;
-- Cartera: el aging solo mira comprobantes con saldo vivo.
create index if not exists ix_comp_cartera
  on comprobantes (cliente_id, fecha_vencimiento)
  where estado in ('emitido','parcial','vencido');
create index if not exists ix_comp_vencimiento
  on comprobantes (fecha_vencimiento) where estado in ('emitido','parcial','vencido');
-- Cola de envío a SUNAT.
create index if not exists ix_comp_sunat_pendiente
  on comprobantes (estado_sunat, fecha_emision)
  where estado_sunat in ('no_enviado','pendiente','enviado','observado');
create index if not exists ix_comp_oc on comprobantes (public.normalizar_codigo(orden_compra_cliente))
  where orden_compra_cliente is not null;

comment on column comprobantes.saldo is 'Generado: total - pagado. No puede desincronizarse con los pagos porque no se escribe a mano.';
comment on column comprobantes.detraccion_aplica is 'SPOT. Al activarse, el PDF estampa "Operación sujeta a detracción" (07:55).';
comment on column comprobantes.estado_sunat is 'Ciclo SUNAT, independiente del estado comercial: una factura puede estar PAGADA y RECHAZADA a la vez.';

alter table comprobantes drop constraint if exists comp_motivo_nota_fk;
alter table comprobantes
  add constraint comp_motivo_nota_fk
  foreign key (tipo, motivo_nota_codigo) references motivos_nota(tipo, codigo) on delete restrict;

create table if not exists comprobante_items (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references comprobantes(id) on delete cascade,
  producto_id     uuid references productos(id) on delete restrict,
  orden           smallint not null default 1,
  codigo          text not null,
  marca           text,
  descripcion     text not null,
  cantidad        numeric(14,2) not null default 1,
  unidad_codigo   text not null default 'NIU' references unidades_medida(codigo) on delete restrict,
  valor_unitario  numeric(14,4) not null default 0,
  descuento_pct   numeric(5,2)  not null default 0,
  importe         numeric(14,2) generated always as (
                    round(cantidad * valor_unitario * (1 - descuento_pct / 100.0), 2)
                  ) stored,
  igv_item        numeric(14,2) not null default 0,
  tipo_afectacion char(2) not null default '10',   -- catálogo 07 SUNAT: 10 gravado
  costo_unitario  numeric(14,4) not null default 0,
  constraint comp_item_cant_pos    check (cantidad > 0),
  constraint comp_item_valor_pos   check (valor_unitario >= 0),
  constraint comp_item_desc_rango  check (descuento_pct >= 0 and descuento_pct <= 100),
  constraint comp_item_orden_unico unique (comprobante_id, orden)
);
create index if not exists ix_comp_items on comprobante_items (comprobante_id, orden);
create index if not exists ix_comp_items_producto on comprobante_items (producto_id) where producto_id is not null;

-- --------------------------------------------------------------------------
-- Cuotas · crédito a 30 días, hasta 60 (07:55)
-- --------------------------------------------------------------------------
create table if not exists comprobante_cuotas (
  id                uuid primary key default gen_random_uuid(),
  comprobante_id    uuid not null references comprobantes(id) on delete cascade,
  numero            smallint not null,
  fecha_vencimiento date not null,
  monto             numeric(14,2) not null,
  pagado            numeric(14,2) not null default 0,
  saldo             numeric(14,2) generated always as (monto - pagado) stored,
  constraint cuota_numero_pos check (numero > 0),
  constraint cuota_monto_pos  check (monto > 0),
  constraint cuota_pagado_ok  check (pagado >= 0 and pagado <= monto + 0.01),
  constraint cuota_unica      unique (comprobante_id, numero)
);
create index if not exists ix_cuotas_comprobante on comprobante_cuotas (comprobante_id, numero);
-- Cartera por cuota vencida.
create index if not exists ix_cuotas_vencidas on comprobante_cuotas (fecha_vencimiento) where pagado < monto;

comment on table comprobante_cuotas is
  'Cronograma de pago del crédito. SUNAT exige el detalle de cuotas en la factura a crédito (Cat. 52: FormaPago/Cuota).';

-- ###########################################################################
-- 13. COBRANZAS
-- ###########################################################################

create table if not exists pagos (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references comprobantes(id) on delete cascade,
  cuota_id        uuid references comprobante_cuotas(id) on delete set null,
  fecha           date not null default current_date,
  monto           numeric(14,2) not null,
  medio           text not null default 'transferencia',
  referencia      text,
  observaciones   text,
  registrado_por  uuid references perfiles(id) on delete set null,
  creado_en       timestamptz not null default now(),
  constraint pago_monto_pos check (monto > 0),
  constraint pago_medio_ok  check (medio in ('efectivo','transferencia','deposito','cheque','letra','detraccion','retencion','nota_credito'))
);
create index if not exists ix_pagos_comprobante on pagos (comprobante_id, fecha desc);
create index if not exists ix_pagos_keyset      on pagos (fecha desc, id desc);
create index if not exists ix_pagos_cuota       on pagos (cuota_id) where cuota_id is not null;

comment on column pagos.medio is
  'Incluye detracción y retención: el importe que el cliente deposita al Banco de la Nación reduce el saldo igual que un pago.';

create table if not exists gestiones_cobranza (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id) on delete cascade,
  comprobante_id   uuid references comprobantes(id) on delete cascade,
  fecha            timestamptz not null default now(),
  canal            text not null default 'whatsapp',
  resultado        text,
  compromiso_fecha date,
  nota             text,
  usuario_id       uuid references perfiles(id) on delete set null
);
create index if not exists ix_gestiones_cliente on gestiones_cobranza (cliente_id, fecha desc);
create index if not exists ix_gestiones_compromiso on gestiones_cobranza (compromiso_fecha) where compromiso_fecha is not null;

-- ###########################################################################
-- 14. ALERTAS Y AUDITORÍA
-- ###########################################################################

-- "pero no te llega como una alerta, tú tienes que entrar y ver" (25:21).
-- Por eso hay `notificado_en`: la tabla no es solo un tablero, es una cola de
-- envío. Un worker toma las no notificadas y las manda por WhatsApp/email.
create table if not exists alertas (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,
  severidad      severidad_alerta not null default 'media',
  titulo         text not null,
  mensaje        text not null,
  entidad_tipo   text,
  entidad_id     uuid,
  entidad_nombre text,
  valor          numeric(14,2),
  accion_url     text,
  -- Huella estable para no duplicar la misma alerta en cada corrida.
  huella         text not null,
  leida          boolean not null default false,
  archivada      boolean not null default false,
  notificado_en  timestamptz,
  generada_en    timestamptz not null default now(),
  constraint alerta_tipo_ok check (tipo in (
    'quiebre_stock','stock_bajo','sobrestock','stock_negativo',
    'credito_por_vencer','credito_vencido','linea_credito',
    'cotizacion_por_vencer','sunat_rechazo','sin_rotacion','margen_bajo'
  ))
);
create unique index if not exists ux_alertas_huella on alertas (huella) where not archivada;
create index if not exists ix_alertas_bandeja on alertas (archivada, leida, severidad, generada_en desc);
create index if not exists ix_alertas_pendientes_envio on alertas (generada_en) where notificado_en is null and not archivada;
create index if not exists ix_alertas_entidad on alertas (entidad_tipo, entidad_id);

comment on column alertas.notificado_en is
  'Marca de envío. La alerta tiene que LLEGAR, no esperar a que Willy entre a buscarla (25:21): un worker consume las que tienen esto en null.';
comment on column alertas.huella is
  'Identidad lógica de la alerta (tipo + entidad + ventana). El índice único parcial impide que cada corrida de generar_alertas() duplique la bandeja.';

create table if not exists actividad (
  id             bigint generated always as identity primary key,
  usuario_id     uuid references perfiles(id) on delete set null,
  usuario_nombre text,
  accion         text not null,
  entidad        text not null,
  entidad_id     uuid,
  descripcion    text,
  metadata       jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now()
);
create index if not exists ix_actividad_keyset  on actividad (creado_en desc, id desc);
create index if not exists ix_actividad_entidad on actividad (entidad, entidad_id, creado_en desc);
create index if not exists ix_actividad_usuario on actividad (usuario_id, creado_en desc);

-- ###########################################################################
-- 15. TRIGGERS DE `actualizado_en`
-- ###########################################################################

do $$
declare t text;
begin
  foreach t in array array[
    'empresa','perfiles','productos','clientes','proveedores','compras',
    'cotizaciones','guias_remision','comprobantes'
  ] loop
    execute format('drop trigger if exists trg_%s_actualizado on public.%I', t, t);
    execute format(
      'create trigger trg_%s_actualizado before update on public.%I
         for each row execute function public.tocar_actualizado_en()', t, t);
  end loop;
end $$;
