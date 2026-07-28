<div align="center">

<img src="public/logo.png" alt="Inversiones Rodatech E.I.R.L." height="90" />

# Rodatech ERP

**ERP Comercial a medida para distribución de rodamientos y repuestos de mantenimiento industrial**

Inversiones Rodatech E.I.R.L. · Jr. Los Huertos N° 2232, Lima 36 · Perú
*"Su proveedor de soluciones en Rodamientos y más..."*

Next.js 15 · TypeScript · Tailwind v4 · Supabase · Vercel

</div>

---

## Qué resuelve

Plataforma web a medida que centraliza la operación comercial de un distribuidor industrial:
catálogo masivo con equivalencias entre marcas, cotización inteligente con historial de precios,
control real de inventario con trazabilidad, atención de pedidos de emergencia, cálculo de costo
de importación puesto en almacén, facturación brandeada y crédito/cobranzas — todo sobre una
base de datos propia, sin licencias mensuales.

## Módulos

| Módulo | Ruta | Qué hace |
|---|---|---|
| **Tablero** | `/dashboard` | KPIs del mes, evolución de ventas y margen, proyección lineal, aging de cartera, alertas prioritarias y bitácora del equipo |
| **Maestro de productos** | `/productos` | 1,500+ SKU multimarca con atributos técnicos, tres listas de precio, stock consolidado y ficha con trazabilidad completa |
| **Cross-Reference** | `/equivalencias` | Busca un código y devuelve sus equivalentes en otras marcas, agrupados por segmento (prestigio / estándar / económica) y ordenados por disponibilidad. Sugiere alternativas automáticamente cuando el ítem pedido está agotado |
| **Inventario y almacén** | `/inventario` | Existencias valorizadas por almacén, kardex con costo promedio ponderado, ingresos individuales y carga masiva por pegado desde Excel |
| **Cotizaciones** | `/cotizaciones` | Constructor con búsqueda inteligente, margen por línea en tiempo real, historial de precios por cliente aplicable con un clic, y PDF brandeado |
| **Pedidos y emergencias** | `/pedidos` | Conversión de cotización a pedido y **venta por reponer**: stock negativo controlado con aprobación administrativa y regularización automática al ingresar la mercadería |
| **Facturación** | `/facturacion` | Facturas, boletas y notas de crédito con series y correlativos propios, IGV, monto en letras, representación impresa brandeada y descuento automático de inventario |
| **Compras e importaciones** | `/compras` · `/importaciones` | Órdenes locales y del exterior con **landed cost**: prorrateo de flete, seguro, ad-valorem, IPM, agente de aduana, almacenaje portuario y transporte interno. Incluye simulador interactivo |
| **Crédito y cobranzas** | `/cobranzas` | Cartera con aging 1-15 / 16-30 / 31-60 / +60, línea y plazo por cliente, registro de pagos parciales, gestiones de cobranza y estado de cuenta en PDF |
| **Reportería y BI** | `/reportes` | Tableros dinámicos: ventas vs. compras, top de productos por venta y por margen, ranking de clientes, participación por línea y por sector industrial, rentabilidad por SKU |
| **Inteligencia y alertas** | `/alertas` | Motor de reglas Nivel 1 sobre el histórico: stock por agotarse, reposición sugerida por rotación, capital inmovilizado, créditos vencidos y por vencer, línea de crédito excedida, emergencias sin autorizar y margen bajo |
| **Configuración** | `/configuracion` | Datos de la empresa, series de comprobantes, almacenes, marcas, líneas de producto, usuarios y matriz de permisos |

## Arquitectura

```
src/
├─ app/
│  ├─ (erp)/            módulos protegidos (layout con sidebar + topbar)
│  ├─ login/            acceso con atajos por rol para desarrollo
│  ├─ globals.css       tokens de marca y de visualización de datos
│  └─ manifest.ts       PWA instalable
├─ components/
│  ├─ ui/               primitivas, estados, KPIs, skeletons
│  ├─ layout/           shell, sidebar, command palette (⌘K)
│  ├─ charts/           gráficos Recharts con paleta validada
│  ├─ comercial/        buscador de productos reutilizable
│  └─ marca/            logotipo y elementos de identidad
├─ lib/
│  ├─ supabase/         clientes de navegador y servidor + sesión memoizada
│  ├─ pdf/              documentos brandeados (carga diferida de jsPDF)
│  ├─ navegacion.ts     menú y control de acceso por rol
│  └─ utils.ts          formato de moneda, fechas y utilidades
└─ middleware.ts        refresco de sesión y protección de rutas

supabase/migrations/    esquema, funciones, RLS y datos de demostración
scripts/                utilidades de migración y siembra
```

### Base de datos

27 tablas, 6 vistas analíticas y 12 funciones en PostgreSQL 17:

- **`registrar_movimiento()`** — asienta el kardex, actualiza el stock y recalcula el costo promedio ponderado en una sola operación atómica.
- **`calcular_landed_cost()`** — prorratea los gastos de importación por valor, peso o cantidad y devuelve el costo unitario puesto en almacén.
- **`generar_alertas()`** — motor de reglas priorizado que evalúa toda la operación.
- **`kpis_dashboard()`** — indicadores del periodo con comparación contra el anterior.
- **`proyeccion_ventas()`** — regresión lineal sobre los últimos 12 meses.
- **`buscar_productos()` / `equivalencias_de()` / `historial_producto()`** — búsqueda con `pg_trgm` y cross-reference bidireccional.
- **`numero_a_letras()`** — importe en letras en español para los comprobantes.
- **`siguiente_correlativo()`** — reserva atómica del número de serie.

**Row Level Security** activo en todas las tablas: cualquier usuario autenticado lee, la escritura se
restringe por rol mediante `tiene_rol()`. Verificado: un usuario de ventas no puede crear órdenes de
compra y uno de compras no puede registrar pagos.

### Roles

| Rol | Alcance |
|---|---|
| `gerencia` | Todos los módulos, aprobación de emergencias, configuración |
| `admin` | Configuración, usuarios, series, aprobaciones, anulaciones |
| `ventas` | Cotizaciones, pedidos, facturación, clientes, consulta de stock |
| `almacen` | Inventario, kardex, ingresos y ajustes, recepción de compras |
| `compras` | Órdenes de compra, importaciones, proveedores, maestro de productos |
| `cobranzas` | Cartera, pagos, gestiones y estados de cuenta |

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # completar con las credenciales del proyecto Supabase
npm run dev                    # http://localhost:3000
```

Variables de entorno:

| Variable | La usa | Dónde se necesita |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | La aplicación | Local y despliegue |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La aplicación | Local y despliegue |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo `scripts/seed-usuarios.py` | Solo local |
| `SUPABASE_PROJECT_REF` | Solo los scripts de migración | Solo local |
| `SUPABASE_MGMT_TOKEN` | Solo los scripts de migración | Solo local |

El *service role key* omite por completo las políticas de RLS: no debe cargarse en
el entorno de despliegue, donde la aplicación nunca lo utiliza.

### Base de datos desde cero

Las migraciones se aplican en orden sobre un proyecto Supabase vacío:

```bash
python scripts/run-sql.py supabase/migrations/001_schema.sql
python scripts/run-sql.py supabase/migrations/002_funciones.sql
python scripts/run-sql.py supabase/migrations/003_rls.sql
python scripts/run-sql.py supabase/migrations/004_seed_maestros.sql
python scripts/gen_productos.py                                    # genera 005
python scripts/run-sql-chunked.py supabase/migrations/005_seed_productos.sql
python scripts/seed-usuarios.py                                    # usuarios de Auth
python scripts/run-sql.py supabase/migrations/006_seed_stock_inicial.sql
python scripts/run-sql.py supabase/migrations/007_seed_compras.sql
python scripts/run-sql.py supabase/migrations/008_seed_ventas.sql
python scripts/run-sql.py supabase/migrations/009_seed_cobranzas.sql
python scripts/run-sql.py supabase/migrations/010_alertas_v2.sql
```

### Despliegue en Vercel

1. Importar el repositorio en Vercel (detecta Next.js automáticamente).
2. Cargar en *Settings → Environment Variables* únicamente estas dos, en los tres
   entornos (Production, Preview y Development):

   ```
   NEXT_PUBLIC_SUPABASE_URL       https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  eyJhbGciOi...
   ```

3. Desplegar. No requiere configuración adicional.

## Accesos de demostración

Disponibles como atajos en la pantalla de acceso. **Retirar antes de producción.**

| Rol | Usuario | Contraseña |
|---|---|---|
| Gerencia | `gerencia@rodatechperu.com` | `Rodatech2026` |
| Administración | `admin@rodatechperu.com` | `Rodatech2026` |
| Ventas | `ventas@rodatechperu.com` | `Rodatech2026` |
| Almacén | `almacen@rodatechperu.com` | `Rodatech2026` |
| Compras | `compras@rodatechperu.com` | `Rodatech2026` |
| Cobranzas | `cobranzas@rodatechperu.com` | `Rodatech2026` |

## Datos de demostración

La plataforma viene sembrada con una operación completa de 10 meses:

- 1,509 productos en 10 líneas · 35 marcas · 1,582 relaciones de cross-reference
- 26 clientes industriales (minería, papeleras, plástico, textil, alimentos, pesquera, cemento)
- 10 proveedores (7 locales · 3 del exterior)
- 42 órdenes de compra · 6 expedientes de importación con landed cost calculado
- 505 cotizaciones · 215 pedidos (28 de emergencia) · 208 comprobantes
- ~3,000 movimientos de kardex valorizados · 180 pagos · 174 alertas activas

## Diseño

Identidad de marca Rodatech: `#0E4C73` (azul) · `#F2E307` (amarillo) · `#A8A8AD` (gris) · negro y blanco.

La paleta de **visualización de datos** se derivó aparte y se validó de forma automática (banda de
luminosidad, piso de croma, separación para daltonismo y contraste sobre la superficie) en modo claro
y oscuro. El amarillo de marca no transporta datos porque no alcanza 3:1 sobre blanco: se reserva
para acentos de interfaz. Ningún gráfico usa doble eje.

Optimización: componentes de servidor con streaming y `Suspense`, skeletons por ruta, índices
`pg_trgm` para búsqueda, carga diferida de jsPDF, registro explícito de íconos y `optimizePackageImports`.
Carga inicial compartida de 102 kB; 201 kB en los módulos operativos.

---

<div align="center">

Desarrollado a medida por **[Promptive](https://www.promptivedev.com)** · Luciérnaga & Asociados S.A.C.
El código fuente y la base de datos son propiedad de Inversiones Rodatech E.I.R.L.

</div>
