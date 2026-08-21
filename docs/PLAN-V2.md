# Rodatech ERP · Plan de reconstrucción v2

> Base: demo actual en `E:\rodamientos` + reunión con Willy del 18/08/2026 (52 min) +
> activos reutilizables del monorepo `E:\itech`.
> Estado del documento: propuesta para aprobación. Nada de esto se ha ejecutado todavía.

---

## 1. De dónde partimos

La demo **no es un prototipo de humo**: 94 archivos, ~20k líneas, 27 tablas, 6 vistas,
~20 funciones Postgres, RLS real por rol y persistencia de verdad contra Supabase.
La auditoría no encontró mocks ni pantallas que finjan guardar. Lo que hay que arreglar
es de arquitectura y de alcance, no de honestidad del código.

### Lo que está bien y se conserva

| Decisión | Evidencia |
|---|---|
| Server Components por defecto | ninguna de las 28 páginas de `(erp)` lleva `"use client"` |
| Frontera cliente explícita por nombre de archivo | `acciones.tsx`, `constructor.tsx`, `formulario.tsx` |
| RLS con validación en Postgres, no en el cliente | `003_rls.sql:6-11,34-61` — `tiene_rol()` es `security definer` |
| `service_role` aislado en el servidor y con chequeo de rol | `src/app/api/usuarios/route.ts:25-30` |
| Todas las funciones SQL con `security definer set search_path = public` | `002_funciones.sql`, sin excepciones |
| PDF y Excel cargados con `await import()` dinámico | `src/lib/pdf/documentos.ts:26`, `src/lib/excel/exportar.ts:24` |
| Paginación real con `.range()` en 8 listados | `productos`, `clientes`, `compras`, `facturacion`… |

### Lo que hay que romper

**1. No existe capa de datos.** Las 30 páginas embeben sus propias consultas
(`supabase.from(...).select(...)`) dentro del componente. No hay `lib/data/` ni
`lib/queries/`. El mismo bloque de búsqueda + paginación está copiado 6 veces con
solo el nombre de tabla cambiado:
`productos/page.tsx:53-67`, `clientes/page.tsx:47-53`, `compras/page.tsx:59-65`,
`facturacion/page.tsx:61-68`, `pedidos/page.tsx:56-63`, `inventario/page.tsx:113-120`.

**2. Cero Server Actions.** `grep "use server"` → 0 resultados. **Todas** las escrituras
salen del navegador contra Supabase (23 archivos importan el cliente de browser).
Esto es lo que causa el problema siguiente.

**3. N+1 en las operaciones diarias.** El más caro del sistema:

| Dónde | Qué hace |
|---|---|
| `pedidos/[id]/acciones.tsx:169-181` | un `rpc("registrar_movimiento")` **por cada ítem** al emitir |
| `compras/[id]/acciones.tsx:301-320` | `insert` + `rpc` secuenciales por línea al recibir mercadería |
| `inventario/movimientos/formulario.tsx:93-100` | un `rpc("buscar_productos")` **por fila pegada** desde Excel |
| `inventario/movimientos/formulario.tsx:131-140` | un `rpc("registrar_movimiento")` por línea al guardar |
| `facturacion/[id]/acciones.tsx:208` | mismo patrón al copiar ítems |

Pegar 50 líneas desde Excel = 50 round-trips secuenciales navegador↔Supabase.
Con los 2.000+ productos que va a cargar Willy, esto es inusable.

**4. Búsquedas sin índice que las cubra.** `productos/page.tsx:58-60` y otros hacen
`.or("sku.ilike.%x%,codigo_fabricante.ilike.%x%,descripcion.ilike.%x%")`. Las
migraciones solo crean `gin_trgm_ops` sobre la columna consolidada `busqueda`
(`001_schema.sql:171,221`), **no** sobre las columnas que realmente se filtran.
Invisible con 1.500 SKU de demo; seq scan garantizado con el catálogo real.

**5. Componentes-Dios.** `cotizaciones/nueva/constructor.tsx` son 974 líneas en un
solo componente cliente: define sus tipos, todo el estado, el cálculo de precios,
cargos y negociación, y la persistencia. Igual `compras/nueva/constructor.tsx` (642)
y `pedidos/nuevo/constructor.tsx` (561). El cálculo de totales —lo que SUNAT valida—
no es testeable sin montar React.

**6. Sin caché en absoluto.** `export const dynamic = "force-dynamic"` en las 30
páginas, cero `unstable_cache` / `revalidate`. Coherente para un ERP, pero significa
que hasta el ubigeo, las marcas y las familias se van a Postgres en cada request.

**7. Contraseña de demo en el bundle cliente.** `src/app/login/login-form.tsx:14-23`
tiene `CLAVE_DEMO = "Rodatech2026"` hardcodeada con 6 botones de acceso rápido por rol.
Funciona de verdad contra Supabase Auth. **Debe salir antes de cualquier despliegue.**

---

## 2. Lo que pidió Willy (reunión 18/08/2026)

Extraído de la transcripción, con la marca de tiempo para poder volver al audio.

### 2.1 Formato de cotización — correcciones explícitas

Willy fue muy concreto sobre el PDF, porque el formato de su sistema actual **le ha
costado ventas**:

> *"me han generado problemas porque se han confundido, han tomado este precio por
> este precio… y me han encontrado alto"* — 13:25

| # | Cambio | Timestamp |
|---|---|---|
| C1 | **Eliminar la columna "precio unitario"** (valor × 1.18). Solo va **valor unitario**. | 13:25, 14:18 |
| C2 | **Marca en columna propia**, hoy va embebida en la descripción | 14:54 |
| C3 | **No repetir el código** dentro de la descripción | 13:25, 14:18 |
| C4 | Columnas finales: `Código · Marca · Descripción · Cantidad · U.M. · Valor unitario · [Descuento] · Importe` | 14:54 |
| C5 | Descuento como **casilla habilitable**, no siempre visible | 15:52 |
| C6 | Moneda **siempre dólares** | 14:54 |

### 2.2 Guía de remisión — no existe en la demo, es prioridad alta

Es un módulo completo que hay que construir. Flujo que Willy quiere (prefiere el
manual al automático, 18:01):

- Botón **"Generar guía"** desde la cotización aprobada
- Motivo de traslado (venta) · **número de orden de compra** (siempre presente, clave)
- Fecha de inicio de traslado
- **Ubigeo con autocompletado**: escribe parte del distrito → lista → selecciona → la dirección se concatena (02:46)
- Verificación de ítems a atender
- **Peso** — *"el peso que es lo más importante"* (02:46)
- Transportista (vehículo propio por defecto) y persona que entrega (03:56)
- Vista previa · emitir · **anular guía** (18:56)

### 2.3 Facturación

- **Detracción / retención (SPOT)**: activar y estampar el texto legal en el documento — *"operación sujeta a detracción"*, *"retención (3%)"* (07:55, 09:45)
- Forma de pago **contado / crédito con cuotas**; 30 días es lo normal, hasta 60 (07:55)
- La factura arrastra: **N.° de cotización** (auto) · **N.° de orden de compra** · **N.° de guía** (09:10)
- Facturar desde el listado con selección múltiple (07:20)

### 2.4 Correlativos

> *"los correlativos… van a iniciar desde el número que usted se quedó"* — 06:08

**No arrancan en cero.** Cotizaciones, facturas y guías continúan la numeración del
sistema actual. Configurable por serie.

### 2.5 Maestro de productos

- Jerarquía de **3 niveles y no más**: `Categoría/Tipo → Familia → Subfamilia`
  Ejemplo suyo: `Rodamientos → Rodamiento de rodillos → …a rótula` (22:45)
  *"detallarlo más ya va a ser bien complicado"*
- **Marca** como campo separado
- Unidades: **unidad, metro, caja, kit/set** (11:56)
- Código único, **sin espacios** (10:44)
- **Archivar producto**: sale de las cotizaciones, sigue en el historial, reactivable (24:21)
- Alta de producto **desde el maestro**, no desde la cotización — Willy mismo dijo que el atajo de su sistema actual *"no creo que sea lo adecuado"* (10:44)
- **Exportación a Excel** del catálogo (18:56)

### 2.6 Carga inicial — una sola lista

> *"basta que un carácter sea diferente al otro y ya no hace match y se rompe todo"* — 27:42

Un **único Excel** con maestro + stock + stock mín/máx + precios. No dos listas.
Willy entrega tres archivos: **productos** (~2.000+), **clientes**, **proveedores** (50:31).

### 2.7 Inventario

- El stock se mueve **al recibir la mercadería**, no con la orden ni con la factura (25:21)
- **Botón de cuadre exclusivo de gerencia**, para la carga inicial y descuadres — *"un botón que lo va a usar con cuidado"* (26:49)
- Las alertas **tienen que llegar**, no esperar a que entre a buscarlas — *"pero no te llega como una alerta, tú tienes que entrar y ver"* (25:21)
- Alerta de **sobrestock / capital inmovilizado** — *"tengo 80 rodamientos que no sé cómo vender"* (25:21)
- **Valorización de inventario** — su sistema actual no se la da (24:21)

### 2.8 Precio promedio

> *"el promedio se obtiene del costo y de todas las ventas que ha tenido un producto…
> el precio se va ajustando en promedio de venta"* — 28:30

Willy no importa a gran escala: compra local y por DHL. Necesita un **precio referencial
que se alimenta solo** del costo y del histórico de ventas.

### 2.9 Cotizador con sustitutos

> *"si un producto no tiene stock, crear la recomendación de productos que estén dentro
> de la familia/subfamilia, que estén en precios alineados, que le marque mejor oferta"* — 49:56

Ya existe parcialmente en `/equivalencias`; hay que engancharlo al constructor.

### 2.10 Consulta RUC/DNI y WhatsApp

- **100 consultas RUC/DNI mensuales gratis** vía Decolecta (31:12)
- Alta rápida de cliente pegando el RUC desde la propia cotización (34:12)
- **Botón de enviar por WhatsApp** cotización / guía / factura (02:18)

### 2.11 Lo que se ELIMINA — Willy no lo usa

| Módulo actual | Motivo |
|---|---|
| **Bancos** | *"bancos tampoco nunca lo he usado"* (31:12) |
| **Multi-almacén / transferencias / sucursales** | una sola sede (30:01) |
| **Tres listas de precio** | trabaja con precio promedio y precio final; no maneja listas |
| **Importaciones con landed cost completo** | *"hacemos compras por DHL, compras pequeñas"* (30:01) → se degrada a un registro de gastos de importación simple |
| **Órdenes de compra formales para compra local** | *"generalmente no hacemos órdenes de compra"* (30:01) → se simplifica a registro de compra + recepción |
| **Acceso rápido por rol en el login** | es andamiaje de demo con contraseña en el bundle |

---

## 3. Arquitectura propuesta

Decisiones aprobadas: **monorepo pnpm + turbo**, **shadcn/ui + Tailwind v4**,
**esquema rediseñado desde cero** en el Supabase nuevo del cliente.

### 3.1 Forma del repositorio

```
rodatech/
├─ apps/
│  └─ web/
│     └─ src/
│        ├─ app/(erp)/cotizaciones/page.tsx   ← una línea
│        └─ modules/
│           └─ cotizaciones/
│              ├─ index.ts        barrel público: lo único que la app importa
│              ├─ dominio/        cálculo puro, sin React ni Supabase → unit-testable
│              │  ├─ totales.ts   IGV, detracción, retención, cuotas
│              │  └─ tipos.ts
│              ├─ api/            consultas server-only, cacheables
│              ├─ acciones/       "use server" — todas las escrituras
│              └─ ui/             pagina.tsx, tabla.tsx, constructor/
├─ packages/
│  ├─ ui/          design system: shadcn/ui + tokens Rodatech + TanStack Table
│  ├─ db/          clientes Supabase (browser/server) + tipos generados
│  ├─ sunat/       COPIADO TAL CUAL de @itech/sunat
│  ├─ consultas/   Decolecta RUC/DNI + tipo de cambio, con control de cuota
│  └─ config/      tsconfig base, eslint, preset de Tailwind
└─ e2e/            Playwright
```

La página de cada módulo queda literalmente en una línea:

```tsx
// apps/web/src/app/(erp)/cotizaciones/page.tsx
export { PaginaCotizaciones as default } from "@/modules/cotizaciones";
```

**Por qué `dominio/` separado importa más de lo que parece:** el cálculo de IGV,
detracción, retención y cuotas es exactamente lo que SUNAT rechaza si está mal.
Hoy vive dentro de un componente de 974 líneas y no se puede probar sin montar React.
Sacarlo a funciones puras permite cubrirlo con tests unitarios que corren en
milisegundos — es el mismo patrón que hace que `@itech/sunat` tenga 88 tests en verde.

### 3.2 Qué se trae de itech

| Paquete | Veredicto | Detalle |
|---|---|---|
| `@itech/sunat` | **copiar tal cual** | Acoplamiento cero verificado: sin imports `@itech/*`, sin `process.env`, sin Supabase. 88 tests unitarios pasan en 460 ms. Solo hay que pasarle el `ConfigSunat` de Rodatech. |
| Decolecta | **copiar y completar** | Lo de itech (`apps/admin/lib/consulta-doc.ts`) es fetch + caché con URL configurable. Le falta **todo el control de cuota** que exige `D:\Integraciones\apisunat_decolecta_api\PROMPT_INTEGRACION_DECOLECTA.md`: contador persistente y atómico, umbrales 50/75/90/95/100 %, prioridades, validación del dígito verificador del RUC antes de gastar cuota, single-flight. Con 100 consultas/mes esto **no es opcional**. |
| `@itech/ui` | **no reutilizar** | Es Tailwind **v3** sin Radix, y sus componentes de impresión dependen de `@itech/sunat/dominio`. Vamos a shadcn/ui + Tailwind v4. |
| `@itech/db` | **replicar el patrón, no el contenido** | Los tipos son del esquema de itech. El patrón (browser/server + tipos generados + alias de dominio) sí se copia. |
| `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | **copiar como plantilla** | Genéricos; solo ajustar la lista de env vars. |

### 3.3 Plan de rendimiento — concreto

| Problema de hoy | Corrección |
|---|---|
| N+1 en emisión, recepción y pegado masivo | Server Actions + funciones Postgres que reciben `jsonb[]`: `registrar_movimientos(jsonb)` en vez de un `rpc` por línea. 50 líneas = 1 round-trip. |
| Escrituras desde el navegador | Todas las mutaciones pasan a `"use server"`. El cliente de browser queda solo para lectura reactiva. |
| `ilike` sin índice sobre `sku`/`codigo_fabricante`/`descripcion` | Columna generada `busqueda` + índice `gin_trgm_ops`, y un único RPC `buscar_productos` en vez de `.or()` de tres `ilike`. |
| Catálogo de 2.000+ SKU con `.range()` (offset) | Paginación por **keyset/cursor** — el offset se degrada linealmente. |
| Ubigeo consultado por tecla | Tabla de ubigeo con índice trigram + `unstable_cache`; es data estática, se cachea indefinidamente. |
| Marcas, familias, unidades en cada request | `unstable_cache` con `revalidateTag` al editarlas desde Configuración. |
| `force-dynamic` en las 30 páginas | Se conserva donde hay datos vivos; los agregados de baja volatilidad (`v_ventas_mensuales`) pasan a `revalidate`. |
| `recharts` importado estáticamente (`charts/graficos.tsx:18-21`) | `next/dynamic` con `ssr: false`. |
| Listados sin streaming | `loading.tsx` + `Suspense` por sección: la tabla llega sin esperar a los KPIs. |

---

## 4. Riesgos y bloqueantes

### 4.1 Guía de remisión electrónica — el riesgo técnico real

`@itech/sunat` **no emite guías**. La interfaz `ConectorSunat` (`packages/sunat/src/index.ts:92-133`)
expone factura, boleta, notas, resumen diario, comunicación de baja y prueba de
conexión — pero **ningún método de guía**. Existen `ubl/guia.ts` y `dominio/guia.ts`
escritos, sin cablear ("Fase D" pendiente en itech también).

**CONFIRMADO** — investigación completa en [`INVESTIGACION-GRE.md`](INVESTIGACION-GRE.md):

- `transporte/endpoints.ts` apunta la guía al web service **SOAP** `ol-ti-itemision-guia-gem`, que es el sistema **anterior**. El PDF oficial de SUNAT «Servicios WEB Disponibles», actualizado en mayo de 2026, **ya no lista ninguna URL de guía**, ni en beta ni en producción. El WSDL viejo todavía responde, pero eso solo dice que la infraestructura sigue levantada.
- El **Anexo N.° 13**, en la versión sustituida por la **RS 000108-2026/SUNAT** (vigente desde el 01/06/2026), establece que el envío va por **servicio REST**: POST de un ZIP más su hash, que devuelve un ticket.
- **La GRE es obligatoria desde el 01/07/2026.** La tolerancia con guía física venció el 30/06. Ya estamos dentro del régimen obligatorio.
- Autenticación **OAuth2**: token en `api-seguridad.sunat.gob.pe`, envío y consulta en `api-cpe.sunat.gob.pe`. El `client_id`/`client_secret` **no sustituye** al usuario SOL: hacen falta los cuatro a la vez.

Dos hallazgos incómodos:

1. **SUNAT no tiene ambiente de pruebas para la GRE.** No existe beta. La única alternativa es el simulador gratuito de NubeFact.
2. **No hay API de baja.** Anular una guía emitida es exclusivamente manual desde el portal SOL — ni un OSE ni un PSE pueden hacerlo. Eso condiciona el diseño: la anulación en el ERP marca el estado y le indica al usuario que complete la baja en SOL.

**Bug encontrado de paso y ya corregido:** `dominio/guia.ts` tenía el catálogo 20
desplazado desde `TRANSFORMACION` en adelante. `EXPORTACION` apuntaba a `"14"`, que
es *venta sujeta a confirmación del comprador*: una exportación se habría emitido con
el motivo equivocado. Como la GRE no estaba cableada, el error nunca llegó a emitir
nada. Quedó alineado con el catálogo real.

**Estimación: ~5 días** para la GRE Remitente (09). Se reutiliza al 100 % la firma
XML-DSig, el empaquetado ZIP y el parser de CDR; hay que escribir el cliente OAuth2,
el transporte REST con consulta de ticket, y corregir el XML.

Dado que la guía es central en la operación de Willy y ya es obligatoria,
**hay que atacarla temprano**, no al final.

### 4.2 Credenciales

- El **token de Supabase `sbp_…`** devuelve `Unauthorized` contra la Management API. Está revocado, vencido o sin los scopes necesarios. Sin él no se pueden aplicar migraciones por API; hace falta uno nuevo o el password de Postgres.
- El proyecto `vlvwrobbdrxvcxvahunf` responde 200 y **está vacío**: cero tablas. Confirma que arrancamos con esquema limpio.
- **La `service_role` y el token de gestión viajaron por chat en texto plano.** Son claves que saltan RLS por completo. Van a `.env.local` (ya está en `.gitignore`) y **se rotan antes de entregar**, como se acordó.

### 4.3 Certificado digital SUNAT

Willy dijo que entrega el mismo `.pfx` que usa hoy y que *"ya fue el año pasado"*,
o sea que puede quedarle poco (51:30). Se necesita el archivo, su clave, y el usuario
y clave **SOL secundario** (formato `RUC + usuario`). Hasta tenerlos solo se puede
probar contra **beta**, que es lo correcto igual para todo el desarrollo.

### 4.4 Los tres Excel

Productos, clientes y proveedores. Willy los está depurando él mismo y todavía no
están. **No bloquean**: se arranca con datos ficticios como él mismo propuso (23:44),
pero el importador hay que diseñarlo contra el formato real, así que conviene pedirle
una **muestra de 50 filas** cuanto antes para no rehacer el mapeo.

---

## 5. Plan de trabajo

| Fase | Qué entrega | Depende de |
|---|---|---|
| **0 · Cimientos** | Monorepo pnpm+turbo, shadcn/ui + tokens Rodatech, `packages/db`, esquema v2 aplicado al Supabase del cliente, CI con typecheck + tests | token de Supabase válido |
| **1 · Núcleo comercial** | Maestro de productos con jerarquía de 3 niveles, importador de Excel único, clientes/proveedores con consulta RUC | muestra del Excel |
| **2 · Cotización** | Constructor descompuesto, `dominio/totales.ts` con tests, **PDF con las 6 correcciones (C1-C6)**, clonar, sustitutos por familia, WhatsApp | fase 1 |
| **3 · Inventario** | Recepción de mercadería, kardex con costo promedio, cuadre de gerencia, valorización, alertas que notifican | fase 1 |
| **4 · Facturación SUNAT** | `packages/sunat` integrado, factura/boleta/NC/ND contra beta, detracción y retención, cuotas, correlativos continuados | certificado + credenciales SOL |
| **5 · Guía de remisión** | Módulo completo + emisión GRE | investigación de 4.1 |
| **6 · Pruebas E2E** | Playwright sobre los flujos completos: cotizar → aprobar → guía → facturar → cobrar; y compra → recepción → stock | fases 2-5 |
| **7 · Endurecimiento** | Quitar login de demo, rotar credenciales, RLS revisada, presupuesto de rendimiento | todo |

Las fases 2 y 3 son independientes entre sí y pueden ir en paralelo con agentes
separados. La 5 arranca su investigación desde el día uno porque es la incógnita.

---

## 6. Qué falta para arrancar

1. **Token de Supabase nuevo** (Management API) o el password de Postgres del proyecto.
2. **Confirmar la lista de eliminaciones** de §2.11 — sobre todo multi-almacén y las tres listas de precio, porque condicionan el esquema y no son baratas de revertir.
3. **Muestra de 50 filas** del Excel de productos de Willy.
4. **Certificado `.pfx` + clave + usuario/clave SOL secundario** cuando estén (no bloquea hasta la fase 4).
5. **Luz verde** para arrancar la fase 0.
