# Esquema Postgres v2 · Rodatech ERP

Base de datos del ERP de **Inversiones Rodatech E.I.R.L.** (distribución de rodamientos y
repuestos industriales, Lima). Rediseño desde cero sobre el Supabase nuevo del cliente:
no es una migración del esquema de la demo, aunque conserva lo que la demo resolvió bien.

Especificación: [`docs/PLAN-V2.md`](../docs/PLAN-V2.md) §2.
Cada decisión no obvia lleva un `comment on` en español con la marca de tiempo de la
reunión del 18/08/2026 que la motivó.

---

## Orden de aplicación

| Archivo | Contenido |
|---|---|
| `001_extensiones.sql` | `pg_trgm`, `unaccent`, `btree_gin` en el esquema `extensions`, y las funciones **inmutables** (`normalizar_texto`, `normalizar_codigo`) sobre las que se construyen las columnas generadas y los índices |
| `002_esquema.sql` | tipos, 37 tablas, restricciones e índices |
| `003_consultas.sql` | caché, cuota y bitácora de las consultas RUC/DNI. **Lo declara el paquete `@rodatech/consultas`**, que fija el contrato de RPC (`consultas_reservar_cuota`, `consultas_liberar_cuota`, `consultas_marcar_agotado`) |
| `004_funciones.sql` | 30 funciones de negocio, incluidas las **por lote** (`jsonb`) |
| `005_vistas.sql` | 10 vistas analíticas + `kpis_dashboard()` |
| `006_rls.sql` | RLS en todas las tablas + grants |
| `007_seed_maestros.sql` | unidades SUNAT, catálogos 09/10/20, series, matriz de permisos, marcas, jerarquía base, ubigeo de Lima/Callao |

`003_consultas.sql` es de otro módulo: se numera antes de las funciones para que
`006_rls.sql` y `007_seed_maestros.sql` puedan cubrir sus tablas con la misma matriz de
permisos. El bucle de RLS salta con `to_regclass` cualquier tabla de la lista que todavía
no exista, para que el set siga aplicando aunque un módulo llegue después.

Pendiente de generar: `008_seed_ubigeo.sql` con el padrón INEI completo (~1.890 distritos).
`007` carga solo Lima Metropolitana + Callao + capitales de departamento, que cubre casi
todos los despachos y deja el autocompletado usable desde el primer día.

**No se han aplicado contra Supabase** (falta un token válido, PLAN-V2 §4.2). Sí se
validaron íntegras contra Postgres real: se aplican sin error, el flujo de negocio
completo corre de punta a punta y los índices trigram los elige el planner con 30.000 SKU.

---

## Alcance: lo que este esquema deliberadamente NO tiene

Decisiones de PLAN-V2 §2.11, ya cerradas con el cliente:

- **Un solo almacén.** No hay tabla `almacenes`, ni transferencias, ni sucursales.
  `stock` tiene como clave primaria `producto_id` a secas.
- **Una sola lista de precios.** Fuera `precio_mayorista` / `precio_fabrica` /
  `precio_importacion`. Quedan tres números con significados distintos: `costo_promedio`
  (lo calcula el kardex), `precio_promedio` (referencial, se alimenta solo) y
  `precio_venta` (la lista vigente).
- **Moneda siempre USD.** No hay columna `moneda` por documento ni tabla de tipo de
  cambio: la moneda es una constante del negocio y vive en `empresa`.
- **Sin bancos.**
- **Importaciones sin landed cost.** No hay DUA, FOB, ad valorem ni prorrateo por peso.
  Hay `compras.gastos_importacion` y una tabla `gastos_importacion` de conceptos sueltos,
  que se reparten proporcionalmente al valor al recibir. Willy compra por DHL.
- **Sin orden de compra formal.** `compras` es un *registro* de compra; el ciclo real es
  compra → recepción, y la recepción puede existir sin compra previa.

---

## El modelo de datos en dos párrafos

**Maestro y existencias.** El centro es `productos`, colgado de cuatro catálogos:
`marcas` (entidad separada, porque hasta hoy la marca iba embebida en la descripción y
eso rompía el filtro y el PDF), `unidades_medida` (con el código del catálogo 03 de
SUNAT como clave primaria) y una jerarquía de **exactamente tres niveles**:
`categorias → familias → subfamilias`. Son tres tablas y no un árbol auto-referenciado
porque el límite de profundidad tenía que ser estructural, no un trigger que cuenta
ancestros. Los tres niveles se guardan denormalizados en el producto pero **garantizados
por claves foráneas compuestas** —`(familia_id, categoria_id) → familias(id, categoria_id)`—,
de modo que se puede indexar y filtrar por cualquier nivel sin joins y sin que la base
admita una familia que no pertenezca a su categoría. El código es único por su forma
canónica (`codigo_norm`: sin espacios, en mayúsculas, sin tildes) y hay además un CHECK
que prohíbe espacios en el código original. El saldo vive en `stock` (una fila por
producto, con `cantidad`, `valorizado` y `costo_promedio` corrientes) y la historia en
`movimientos_inventario`, un kardex valorizado con costo promedio ponderado, append-only:
`cantidad` es siempre positiva y el signo lo pone `tipo`, así que no existe el estado
imposible «una salida de −5». El stock entra **solo** por `recepciones` y sale por la
emisión de la guía de remisión; el cuadre lo hace `ajustes_inventario`, restringido a
gerencia por RLS y además por la propia función.

**Ciclo comercial.** `cotizaciones` → `guias_remision` → `comprobantes`, con dos hilos
que atraviesan los tres: el `cliente_id` y el `orden_compra_cliente`, que nace en la
cotización y se arrastra hasta la factura. Las líneas de cotización y de comprobante
llevan `valor_unitario` (sin IGV) y un `importe` que es **columna generada**, de modo que
el detalle y la cabecera no pueden discrepar. `comprobantes` cubre factura, boleta, nota
de crédito y nota de débito en una sola tabla, con un CHECK que obliga a las notas a
referenciar el documento que corrigen y a las facturas/boletas a no hacerlo; lleva la
detracción y la retención SPOT, el cronograma en `comprobante_cuotas`, y un
`estado_sunat` separado del estado comercial —una factura puede estar *pagada* y a la vez
*rechazada por SUNAT*—, con ticket, hash del CDR, XML firmado y respuesta cruda. La
cobranza se cierra con `pagos`, que por trigger recalcula el saldo del comprobante (que a
su vez es una columna generada `total - pagado`) y reparte el importe sobre las cuotas de
la más antigua a la más nueva. Alrededor: `clientes`/`proveedores` con RUC/DNI validado
por CHECK según el tipo de documento, `consultas_cache` como caché con TTL de Decolecta
más `consultas_cuota` como contador mensual atómico, `ubigeo` indexado por
trigram para el autocompletado, y `alertas` como cola de notificación.

---

## Cómo fluye una venta de punta a punta

```
 cliente pide          almacén                    calle                  SUNAT / caja
 ───────────────────────────────────────────────────────────────────────────────────
 crear_cotizacion()
   COT1-000001  ─────────────────────────────────────────────────────────┐
   · arrastra orden_compra_cliente                                        │
   · totales por trigger sobre las líneas                                 │
        │                                                                 │
 aprobar_cotizacion()   estado: borrador → aprobada                       │
        │                                                                 │
 generar_guia_desde_cotizacion()                                          │
   T001-00000001 (borrador)                                               │
   · ubigeo partida/llegada + direcciones                                 │
   · PESO obligatorio (del maestro o declarado)                           │
   · transportista + persona que entrega                                  │
        │                                                                 │
 emitir_guia()  ──────► SALE EL STOCK                                     │
   registrar_movimientos([...])  · 1 llamada, N líneas                    │
        │                                                                 │
 emitir_comprobante() ◄───────────────────────────────────────────────────┘
   F001-00000001
   · correlativo atómico desde el número configurado
   · cabecera + N ítems + cuotas + detracción, en UN round-trip
   · total en letras
   · descargar_stock = false (ya salió con la guía)
   · cotización pasa a "atendida"
        │
 registrar_pagos([...])  ─► trigger: pagado, saldo, estado, reparto en cuotas
        │
 v_cartera · aging 0 / 1-30 / 31-60 / 61-90 / 90+
```

Y del otro lado:

```
 compras (registro, sin OC formal)
     └─► recepcionar_mercaderia()  ─► ENTRA EL STOCK
            · reparte gastos de importación por valor
            · registrar_movimientos([...]) → costo promedio ponderado
            · avanza cantidad_recibida y el estado de la compra
```

---

## Qué decisión responde a qué pedido

| Pedido de Willy (timestamp) | Cómo se resuelve en el esquema |
|---|---|
| «Eliminar la columna precio unitario» (13:25) | La columna no existe en el modelo, no solo en el PDF: `cotizacion_items.valor_unitario` es lo único que se guarda. `importe` es generada. |
| «Marca en columna propia» (14:54) | `marcas` es una tabla y `productos.marca_id` es NOT NULL. Los ítems guardan además un *snapshot* del nombre para que el PDF impreso no cambie si mañana se renombra la marca. |
| «No repetir el código en la descripción» (14:54) | `codigo` y `descripcion` son columnas distintas y con índices trigram distintos. |
| «Descuento como casilla habilitable» (15:52) | `cotizaciones.mostrar_descuento`. |
| «Moneda siempre dólares» (14:54) | `empresa.moneda` con CHECK `= 'USD'`. No hay moneda por documento. |
| «Los correlativos inician desde el número que usted se quedó» (06:08) | `series_documento` tiene `correlativo_inicial` **y** `correlativo_actual`; `siguiente_correlativo()` devuelve `greatest(actual + 1, inicial)`. Se carga el número del sistema viejo y la numeración continúa. |
| Jerarquía de 3 niveles «y no más» (22:45) | Tres tablas, no un árbol. La base no puede representar un cuarto nivel. |
| Unidades: unidad, metro, caja, kit (11:56) | `unidades_medida` con la PK en el código SUNAT (NIU, MTR, BX, SET). |
| Código único sin espacios (10:44) | CHECK `codigo !~ '[[:space:]]'` **y** índice único sobre `codigo_norm`. Doble candado. |
| Archivar producto, reactivable (24:21) | `archivado` + `archivado_en`/`archivado_por`/`motivo`. Todas las FK históricas son `ON DELETE RESTRICT`: archivar nunca pierde el pasado. |
| «Basta que un carácter sea diferente y se rompe todo» (27:42) | `normalizar_codigo()` es la única forma de comparar códigos y nombres de catálogo. El importador resuelve marca/categoría/familia por nombre normalizado. |
| «El stock se mueve al recibir» (25:21) | `recepcionar_mercaderia()` es la única función que genera movimientos de ingreso. Ni la compra ni la factura tocan stock. |
| «Un botón de cuadre que va a usar con cuidado» (26:49) | `ajustes_inventario` con política RLS exclusiva de gerencia **y** un `raise exception` dentro de la propia función. |
| «Las alertas tienen que llegar» (25:21) | `alertas.notificado_en`: la tabla es una cola de envío, no solo un tablero. Un worker consume las que están en NULL. |
| «Tengo 80 rodamientos que no sé cómo vender» (25:21) | `stock_maximo` + alerta `sobrestock` valorizada + `v_valorizacion_inventario`. |
| «Valorización de inventario» (24:21) | `stock.valorizado` corriente + `v_valorizacion_inventario` por categoría y familia. |
| «El promedio se obtiene del costo y de todas las ventas» (28:30) | `productos.precio_promedio`, recalculado por `recalcular_precios_promedio()`: promedio ponderado de lo facturado en N meses, con piso en costo + margen objetivo. |
| Sustitutos por familia con «mejor oferta» (49:56) | `sustitutos_de()`: cascada equivalencia explícita → subfamilia → familia, con banda de precio y priorizando stock. Ver la discusión abajo. |
| Guía: ubigeo con autocompletado (02:46) | `ubigeo` con columna `busqueda` sin tildes + GIN trigram, y `etiqueta` generada lista para concatenar en la dirección. |
| «El peso, que es lo más importante» (02:46) | `guias_remision.peso_bruto_kg` NOT NULL con CHECK `> 0`. La función lo calcula del maestro si no viene declarado y **falla** si da cero. |
| Transportista y persona que entrega (03:56) | Bloque de transporte con CHECK: modalidad pública exige transportista identificado, privada exige placa. Solo el borrador se libra. |
| Anular guía (18:56) | `anular_guia()` exige motivo, repone el stock que la guía sacó, y se niega si hay un comprobante vigente que la referencia. |
| Detracción / retención (07:55, 09:45) | Bloque SPOT en `comprobantes`, con CHECK de coherencia, exclusión mutua detracción/retención y prohibición sobre boletas. Si el llamador no se pronuncia, `emitir_comprobante()` decide por el umbral de `empresa.detraccion_monto_minimo`. |
| Crédito con cuotas, 30 a 60 días (07:55) | `comprobante_cuotas`; `emitir_comprobante()` rechaza el documento si la suma de cuotas no cuadra con el total. |
| La factura arrastra cotización, OC y guía (09:10) | `comprobantes.cotizacion_id`, `guia_id`, `orden_compra_cliente` + la vista `v_trazabilidad_venta`. |
| 100 consultas RUC/DNI al mes (31:12) | `003_consultas.sql`: `consultas_cache` (caché con TTL), `consultas_cuota` (contador mensual atómico), `consultas_log` (bitácora) y `consultas_reservar_cuota()`, que reserva una unidad antes de salir a la red. Lo declara el paquete `@rodatech/consultas`; este esquema le da las políticas RLS y las filas de `permisos_rol`. |
| Ciclo SUNAT | `estado_sunat`, `sunat_ticket`, `sunat_hash_cdr`, `sunat_xml_firmado`, `sunat_cdr_url`, `sunat_respuesta` (jsonb), con índice parcial sobre la cola de envío. |

---

## Los tres problemas técnicos de la demo, y qué se hizo distinto

### 1. Índices que no cubrían los filtros reales

La demo creó `gin_trgm_ops` sobre una columna consolidada `busqueda`, pero las páginas
filtraban con `.or("sku.ilike.%x%,codigo_fabricante.ilike.%x%,descripcion.ilike.%x%")`.
Un índice sobre `A || B || C` no sirve para un `LIKE` sobre `A`: seq scan garantizado.

Aquí hay **una columna generada e indexada por cada filtro que existe de verdad**:

| Índice | Consulta que lo usa |
|---|---|
| `ix_productos_busq_codigo_trgm` | filtro solo por código |
| `ix_productos_busq_codigo_fab_trgm` | filtro solo por código de fabricante |
| `ix_productos_busq_descripcion_trgm` | filtro solo por descripción |
| `ix_productos_busqueda_trgm` (GIN mixto con `archivado`) | caja única del constructor — `btree_gin` mete el booleano en el mismo índice para que «solo productos vivos» no obligue a un recheck sobre miles de filas |
| `ix_productos_keyset_codigo` (parcial `where not archivado`) | paginación del catálogo |
| `ix_productos_subfamilia` / `ix_productos_familia` `(nivel, precio_venta)` | búsqueda de sustitutos con banda de precio |
| `ix_comp_cartera` (parcial sobre estados con saldo) | aging de cartera |
| `ix_comp_sunat_pendiente` (parcial) | cola de envío a SUNAT |
| `ix_mov_producto_fecha (producto_id, fecha desc, id desc)` | kardex y su paginación |

Verificado con `EXPLAIN` sobre 30.000 productos sintéticos: el planner elige cada uno de
los índices trigram para su forma de consulta.

### 2. N+1 en las operaciones diarias

La demo hacía un `rpc` por ítem al emitir, uno por línea al recibir y uno por fila pegada
desde Excel. Aquí las operaciones sobre N líneas reciben `jsonb` y resuelven el lote
entero del lado del servidor:

| Función | Sustituye a |
|---|---|
| `registrar_movimientos(jsonb)` | un `rpc("registrar_movimiento")` por línea |
| `importar_productos(jsonb)` | un `rpc("buscar_productos")` por fila pegada + N inserts |
| `emitir_comprobante(jsonb)` | correlativo + N ítems + cuotas + N movimientos |
| `recepcionar_mercaderia(jsonb)` | insert + rpc secuenciales por línea |
| `crear_cotizacion(jsonb)`, `generar_guia_desde_cotizacion(jsonb)`, `registrar_pagos(jsonb)` | ídem |

50 líneas pegadas desde Excel = **1** round-trip.

`registrar_movimientos` recorre el array **con `ordinality`** porque el orden importa: el
costo promedio ponderado depende de la secuencia. Antes de procesar, inserta las filas de
`stock` que falten y las bloquea con `SELECT … ORDER BY producto_id FOR UPDATE`, para que
dos lotes que tocan los mismos SKU no se traben mutuamente.

### 3. Paginación por offset

`.range()` se degrada linealmente. `productos_pagina(p_cursor, …)` pagina por **keyset**
sobre `codigo_norm`, que es único e indexado: la página 40 cuesta lo mismo que la primera.
Las tablas de documentos tienen su clave de orden estable indexada como `(fecha desc, id desc)`.

---

## RLS

Mismo principio que la demo —**lee todo autenticado, escribe según el rol, y lo decide
Postgres**— con una diferencia: las políticas no llevan la lista de roles embebida en el
DDL. Consultan la tabla `permisos_rol` a través de `puede_escribir(tabla)`:

```sql
create policy "escritura_insert" on public.productos
  for insert to authenticated
  with check ((select public.puede_escribir('productos')));
```

Cambiar quién puede tocar qué es un `INSERT` en `permisos_rol`, no una migración.
El `(select …)` no es decorativo: fuerza a Postgres a evaluar la función una vez por
sentencia (InitPlan) en lugar de una vez por fila.

Endurecimientos que la matriz no puede expresar y se declaran aparte:

- **`movimientos_inventario` es append-only**: no existe política de UPDATE ni DELETE.
  Un error del kardex se corrige con otro movimiento, no reescribiendo la historia.
- **Los comprobantes no se borran**; y un trigger congela identidad e importes en cuanto
  `estado_sunat` llega a `aceptado`. Se corrige con nota de crédito.
- **`ajustes_inventario` solo gerencia.**
- **`permisos_rol` solo gerencia** — si cualquiera pudiera escribirla, el modelo sería
  decorativo.
- **`ubigeo` es de solo lectura** (data del Estado, entra por seed).
- **`anon` no tiene nada**, ni tablas ni `EXECUTE`; también se revoca de `PUBLIC` y en los
  `default privileges`, porque Postgres concede EXECUTE a PUBLIC en cada función nueva.

Las vistas se declaran `with (security_invoker = true)`. Sin eso una vista pertenece a
`postgres` y lee **saltándose el RLS** de las tablas base: es el agujero clásico de
Supabase.

RLS se activa con `ENABLE`, **no** con `FORCE`, a propósito: el dueño de las tablas tiene
que poder saltarse las políticas, porque es el rol bajo el que corren todas las funciones
`security definer`. Con `FORCE`, `registrar_movimientos` no podría escribir un kardex que
es append-only por política.

---

## Decisiones donde había más de un camino

### Sustitutos: jerarquía vs. tabla de equivalencias

Las dos alternativas del encargo, evaluadas:

- **Solo jerarquía + índice.** Cero mantenimiento; funciona el primer día con los 2.000 SKU
  del Excel sin que nadie capture nada. Pero la subfamilia describe el *tipo constructivo*
  («rodillos a rótula»), no la *medida*: un 6205 y un 6320 comparten subfamilia y no son
  intercambiables. La banda de precio los separa casi siempre, no siempre.
- **Solo equivalencias explícitas.** Precisión total (SKF 6205-2RS ≡ FAG 6205-2RSR), pero
  es data que **hoy no existe**. Exigirla deja la función muerta hasta que alguien capture
  miles de pares a mano, y Willy no lo va a hacer.

**Elegido: las dos, en cascada.** `sustitutos_de()` devuelve primero las equivalencias
explícitas (prioridad 1), luego la misma subfamilia dentro de la banda de precio
(prioridad 2), luego la misma familia (prioridad 3), y ordena poniendo delante lo que
tiene stock —un sustituto sin stock no resuelve el problema que motivó la búsqueda—.
El sistema es útil desde el día uno y mejora solo, sin reescribir nada, a medida que se
capturan equivalencias reales. La justificación completa está en el comentario de
`producto_equivalencias` en `002_esquema.sql`.

### Jerarquía denormalizada en el producto

Guardar `categoria_id`, `familia_id` y `subfamilia_id` en `productos` es denormalizar, y
denormalizar suele invitar a la deriva. Aquí no puede haberla: las FK son **compuestas**
(`(familia_id, categoria_id) → familias(id, categoria_id)`), así que la base rechaza una
familia que no pertenezca a la categoría declarada. Se gana poder indexar y filtrar por
cualquiera de los tres niveles sin joins, que es exactamente lo que necesitan el listado
del catálogo y la búsqueda de sustitutos.

### `stock` como tabla aparte

Con un solo almacén, `cantidad` podría ser una columna de `productos`. Está aparte porque
cada movimiento actualiza el saldo, y meterlo en la fila del producto obligaría a
reescribir una fila ancha con **cuatro índices GIN** en cada recepción y en cada venta.
`stock` guarda además `valorizado` y `costo_promedio` corrientes, que es lo que permite a
`registrar_movimientos` bloquear una sola fila por producto y procesar un lote completo
sin escanear el kardex una vez por línea.

### Saldo de stock negativo permitido

`stock.cantidad` admite valores negativos. Si almacén despacha antes de registrar la
recepción, preferimos un descuadre **visible** —con alerta crítica y un cuadre de gerencia
esperándolo— a bloquear el despacho o a mentir con un cero.

---

## Convenciones

- Todo en español, incluida la tabla de perfiles (`perfiles`, no `profiles`: era el único
  anglicismo de la demo y no justificaba la excepción).
- Toda función es `security definer set search_path = public, extensions`. Se incluye
  `extensions` porque las extensiones no viven en `public` (evita el hallazgo del security
  advisor de Supabase); ningún nombre queda sin calificar.
- `id` es `uuid` salvo en `movimientos_inventario` y `actividad`, donde es `bigint
  identity`: son las dos tablas donde el orden de inserción es semántico.
- Toda cantidad y todo monto lleva CHECK. Toda FK lleva la acción de borrado pensada:
  `restrict` en histórico, `cascade` solo en líneas de detalle que no tienen vida propia.

---

## Cómo validar los cambios sin credenciales

El esquema se probó contra Postgres real corriendo en WASM, sin red:

```bash
npm i @electric-sql/pglite
# Crear los shims de `auth.users` y `auth.uid()` que Supabase provee,
# aplicar las migraciones en orden y correr el flujo de negocio completo.
```

Cubierto: aplicación de las 7 migraciones en orden, importación de productos con filas inválidas,
recepción con costo promedio ponderado verificado a mano (50 @ 7.20 + 50 @ 9.20 → 8.20),
cotización → aprobación → guía → factura → pago parcial, aging, sustitutos, alertas, KPIs,
y cinco restricciones que **deben** rechazarse (código con espacios, cantidad negativa en
el kardex, cuota negativa, pago negativo, stock máximo menor que el mínimo).

---

## Lo que falta

1. **`008_seed_ubigeo.sql`** con el padrón INEI completo.
2. **Datos reales de `empresa`**: el RUC de `007_seed_maestros.sql` viene de la demo y hay
   que validarlo contra la ficha RUC de Rodatech.
3. **Los `correlativo_inicial` de verdad** (§2.4). Están en 1 como marcador; antes de la
   primera emisión hay que poner el número por el que va Willy hoy.
4. **Importadores de clientes y proveedores** equivalentes a `importar_productos()`; hacen
   falta las muestras de los Excel para fijar el mapeo.
5. **Job de mantenimiento**: `generar_alertas()` y `recalcular_precios_promedio()` están
   escritas para correr en batch, pero nadie las dispara todavía (`pg_cron` o un cron de
   Vercel).
6. **Worker de notificación** que consuma `alertas` con `notificado_en is null` y las
   empuje por WhatsApp/email — sin él, las alertas siguen siendo un tablero.
7. **Almacenamiento de XML/CDR**: las columnas guardan rutas; falta crear los buckets de
   Storage y sus políticas.
8. **Catálogo 54 de SUNAT** (bienes y servicios sujetos a detracción) como tabla, para que
   `detraccion_codigo` sea una FK y no texto libre.
9. **Nada de esto se ha aplicado contra Supabase**: falta el token de la Management API o
   el password de Postgres (PLAN-V2 §4.2).
