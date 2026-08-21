# `@rodatech/ui`

Design system del ERP de **Inversiones Rodatech E.I.R.L.**
shadcn/ui + Radix + Tailwind v4, con los tokens de marca y los componentes de
dominio que se repiten en todos los módulos.

El código de las primitivas vive **en este repositorio**, no en una
dependencia: es la premisa de shadcn/ui. Cuando algo no encaja con la forma de
operar de Rodatech, se edita el archivo y punto.

---

## 1. Qué hay dentro

```
src/
├─ tokens.css        tokens de marca, tema claro/oscuro, utilidades, animación
├─ lib/              cn() + formateo de importes, números y fechas
├─ primitivas/       Button, Input, Dialog, Select, Command… (nombre en inglés)
├─ tabla/            DataTable sobre TanStack Table v8 + filtros ligados a la URL
└─ dominio/          Moneda, EstadoBadge, KpiCard, BuscadorProductos… (español)
```

### Nomenclatura

- **Primitivas → inglés.** `Button`, `Dialog`, `Popover`, `Combobox`. Se llaman
  así en shadcn y en Radix; traducirlas obligaría a mantener un diccionario.
- **Dominio → español.** `Moneda`, `EstadoBadge`, `BuscadorProductos`,
  `PaginacionKeyset`. Son conceptos del negocio, no de la interfaz.

Si un componente de `dominio/` se pudiera copiar tal cual a otro producto,
probablemente esté en la carpeta equivocada.

---

## 2. Cómo se consume desde `apps/web`

### 2.1 Dependencia

```jsonc
// apps/web/package.json
{
  "dependencies": {
    "@rodatech/ui": "workspace:*"
  }
}
```

Como el paquete exporta TypeScript sin compilar, Next tiene que transpilarlo:

```ts
// apps/web/next.config.ts
const config = {
  transpilePackages: ["@rodatech/ui"],
};
export default config;
```

### 2.2 Estilos

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";
@import "@rodatech/ui/tokens.css";
```

El orden importa: `tailwindcss` primero. `tokens.css` ya trae dentro el
`@source "../src"` que hace que Tailwind escanee los componentes del paquete;
sin eso, ninguna clase usada dentro de `@rodatech/ui` se generaría.

### 2.3 Tema claro / oscuro

Los tokens responden a **`.dark` en `<html>`** (que es lo que pone `next-themes`
con `attribute="class"`) y también a `[data-theme="dark"]`, que es lo que usaba
la demo. Sirven los dos.

```tsx
// apps/web/src/app/layout.tsx
<ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
```

Todo color está definido en `:root` y **redefinido** bajo el bloque oscuro.
Nunca hay un color que exista solo en oscuro: si añades uno, añádelo en los dos.

### 2.4 Providers del layout

```tsx
import { Toaster, TooltipProvider } from "@rodatech/ui";

export default function LayoutErp({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
```

### 2.5 Importaciones

```ts
import { Button, Moneda, EstadoBadge } from "@rodatech/ui";
import { DataTable, columnaMoneda, PaginacionKeyset } from "@rodatech/ui/tabla";
```

`@rodatech/ui/tabla` es un subpath aparte a propósito: arrastra TanStack Table
(~40 KB) y una ficha de documento o el panel de configuración no tienen por qué
pagar ese peso solo por importar un `Button`.

---

## 3. La frontera `"use client"`

El ERP es Server Components por defecto. Cada archivo del paquete que lleva
`"use client"` **explica en un comentario por qué**, y el que no lo lleva es
porque de verdad no lo necesita.

### Se renderizan en el SERVIDOR (sin `"use client"`)

`Button` · `Input` · `Textarea` · `SelectNativo` · `Label` · `Campo` · `Badge` ·
`Card` · `Separator` · `Skeleton` · primitivas de `Table` · `Moneda` ·
`EstadoBadge` · `KpiCard` · `EstadoVacio` · `EstadoError`

Son elementos HTML con clases. Un `<form action={serverAction}>` con `Label`,
`Input` y `Button` funciona **sin una línea de JavaScript**. Marcar `Button`
como cliente habría empujado Radix al bundle de todas las páginas que solo
quieren un botón de envío.

Tres decisiones concretas que mantienen esta frontera:

| Componente | Decisión |
|---|---|
| `Label` | `<label htmlFor>` nativo en lugar de `@radix-ui/react-label`. Radix solo aporta que el doble clic no seleccione texto, y a cambio convierte en cliente cualquier formulario. |
| `Separator` | `role="separator"` escrito a mano; sin `@radix-ui/react-separator`. |
| `KpiCard` | Sparkline en SVG propio, no Recharts. Sin `ResponsiveContainer`, sin ~90 KB y sin `useId` (que no existe en Server Components). |
| `EstadoError` | Es servidor; el botón de reintentar está aislado en `BotonReintentar` (`"use client"`), que es lo único que viaja al navegador. |

### Necesitan el NAVEGADOR (`"use client"`)

| Archivo | Motivo |
|---|---|
| `dialog` · `sheet` · `dropdown-menu` · `popover` · `tooltip` · `tabs` · `select` · `checkbox` · `radio-group` · `switch` | Radix: estado, portal, foco atrapado, navegación por teclado |
| `command` · `combobox` · `buscador-productos` | cmdk mantiene el filtrado y el ítem resaltado |
| `calendar` · `date-picker` | react-day-picker mantiene el mes visible |
| `form` | react-hook-form vive entero en el cliente |
| `sonner` | contenedor global de avisos con región `aria-live` |
| `data-table` · `usar-params-tabla` · `barra-herramientas` · `barra-lote` · `paginacion-keyset` | TanStack Table + escritura en los search params |

---

## 4. `DataTable` — cuándo y cómo

No es una tabla genérica. Está construida contra tres hechos del proyecto:

1. **2.000+ SKU** → paginación **keyset**, nunca offset.
2. **Filtro, orden y página viven en la URL** → estado compartible, botón
   "atrás" funcional, y el servidor puede cachear por search params.
3. **Willy factura y aprueba seleccionando varias filas** → selección múltiple
   con barra de acciones en lote.

La tabla **no consulta datos**: los recibe ya paginados de un Server Component.
`manualSorting`, `manualFiltering` y `manualPagination` están en `true`; ordenar
50 filas en el navegador cuando hay 2.000 en la base miente sobre el resultado.

### Ejemplo completo

```tsx
// src/modules/productos/ui/tabla.tsx
"use client";

import {
  DataTable, PaginacionKeyset, BarraHerramientas, BuscadorTabla,
  FiltroSelect, BotonLimpiarFiltros, columnaSeleccion, columnaTexto,
  columnaNumero, columnaMoneda, columnaAcciones, mapaOrden,
  type PaginaKeyset,
} from "@rodatech/ui/tabla";
import { Button, EstadoBadge } from "@rodatech/ui";

const DEF = [
  { id: "sku",         campoOrden: "sku" },
  { id: "descripcion", campoOrden: "descripcion" },
  { id: "stock",       campoOrden: "stock" },
  { id: "precio",      campoOrden: "precio_promedio" },
];

export function TablaProductos({ pagina }: { pagina: PaginaKeyset<Producto> }) {
  const columnas = [
    columnaSeleccion<Producto>(),
    columnaTexto<Producto>({
      id: "sku", cabecera: "Código", campoOrden: "sku",
      ancho: "9rem", fija: true, mono: true,
      valor: (p) => p.sku,
    }),
    columnaTexto<Producto>({
      id: "descripcion", cabecera: "Descripción", campoOrden: "descripcion",
      valor: (p) => p.descripcion,
      detalle: (p) => p.marca,          // la marca va en su propia línea (C2)
    }),
    columnaNumero<Producto>({
      id: "stock", cabecera: "Stock", campoOrden: "stock",
      valor: (p) => p.stock, sufijo: "und",
      tono: (p) => (p.stock <= 0 ? "critico" : p.stock <= p.stockMinimo ? "alerta" : "normal"),
    }),
    columnaMoneda<Producto>({
      id: "precio", cabecera: "Precio", campoOrden: "precio_promedio",
      valor: (p) => p.precioPromedio,
    }),
    columnaAcciones<Producto>((fila) => <MenuProducto producto={fila.original} />),
  ];

  return (
    <DataTable
      etiqueta="Catálogo de productos"
      columnas={columnas}
      datos={pagina.filas}
      obtenerId={(p) => p.id}
      ordenPorColumna={mapaOrden(DEF)}
      seleccionable
      accionesLote={({ ids, limpiar }) => (
        <Button size="sm" onClick={() => archivar(ids).then(limpiar)}>
          Archivar seleccionados
        </Button>
      )}
      barraHerramientas={
        <BarraHerramientas>
          <BuscadorTabla placeholder="Código, marca o descripción…" />
          <FiltroSelect param="familia" placeholder="Familia" opciones={familias} />
          <BotonLimpiarFiltros />
        </BarraHerramientas>
      }
      paginacion={
        <PaginacionKeyset
          cantidadEnPagina={pagina.filas.length}
          cursorSiguiente={pagina.cursorSiguiente}
          cursorAnterior={pagina.cursorAnterior}
          total={pagina.total}
        />
      }
      vacio={{
        titulo: "No hay productos que coincidan",
        descripcion: "Prueba a quitar algún filtro o revisa el código: el SKU no admite espacios.",
      }}
      altoMaximo="calc(100dvh - 18rem)"
    />
  );
}
```

### Search params que gobierna

| Param | Significado |
|---|---|
| `q` | término de búsqueda libre |
| `orden` | `campo:asc` \| `campo:desc` |
| `cursor` | clave de la fila frontera |
| `dir` | `sig` \| `ant` |
| `n` | filas por página |

Cualquier otro param cuenta como filtro del módulo y se conserva al paginar.
Al cambiar un filtro o el orden, el **cursor se reinicia** automáticamente: si
no, apuntaría a una fila que quizá ya no está en el resultado.

### Contrato de la consulta (keyset)

```ts
interface PaginaKeyset<T> {
  filas: T[];
  cursorSiguiente: string | null; // clave de la ÚLTIMA fila, null si no hay más
  cursorAnterior: string | null;  // clave de la PRIMERA fila, null en la primera página
  total?: number;                 // opcional: contar todo el catálogo es caro
}
```

Con keyset **no existe** "página 7 de 40". El componente no lo finge: muestra
cuántos registros hay en pantalla y, si el servidor pudo contarlos barato, el
total. A cambio, la página 40 cuesta lo mismo que la primera.

### Selección

La selección es **de la página actual** y se limpia al cambiar de página o de
filtro. Guardar ids de filas que ya no están cargadas haría que "facturar los
seleccionados" actuara sobre documentos que el operador no está viendo.

---

## 5. Componentes de dominio: cuándo usar cada uno

### `Moneda`

**Todo** importe del ERP se pinta con esto. Nunca `{total.toFixed(2)}` a mano.

```tsx
<Moneda valor={1240.5} />                        // $ 1,240.50
<Moneda valor={total} enfasis="fuerte" tamano="lg" />
<Moneda valor={saldo} sinSimbolo />              // en tablas de una sola moneda
```

Garantiza: 2 decimales siempre, `tabular-nums` siempre, negativos en rojo con
el signo delante del símbolo, y el número crudo en `<data value>` para que
copiar-pegar a Excel y las pruebas E2E vean `1240.50`.

### `EstadoBadge`

```tsx
<EstadoBadge estado="enviada_sunat" />
```

Estados soportados: `borrador`, `enviada`, `aprobada`, `rechazada`,
`facturada`, `anulada`, `vencida`, `enviada_sunat`, `aceptada_sunat`,
`rechazada_sunat`, `baja_sunat`, `pendiente`, `parcial`, `pagada`,
`por_recibir`, `recibida`, `archivado`.

El color es **semántico**: verde = terminado bien, rojo = detenido o rechazado,
ámbar = requiere acción, azul = en curso, gris = aún no ha salido de casa.
Ningún estado usa el amarillo de marca — ese color es de interfaz y no
transporta datos.

Y el color **no es el único canal**: cada estado lleva su punto de forma
distinta (relleno / hueco / rombo / raya) más el texto, porque "aprobada" y
"rechazada" no pueden distinguirse solo por verde y rojo.

Si aparece un estado nuevo en el esquema, añádelo al tipo `EstadoDocumento`:
TypeScript señalará todos los sitios donde falta tratarlo.

### `KpiCard`

```tsx
<KpiCard
  etiqueta="Venta facturada"
  valor={formatearMonedaCorta(84_300)}
  detalle="12 documentos"
  actual={84_300} previo={71_900}
  etiquetaComparacion="vs. mes anterior"
  serie={[62, 58, 70, 66, 74, 84]}
  href="/facturacion?desde=2026-08-01"
/>
```

La comparación contra el periodo anterior es obligatoria por diseño: un número
solo no dice si el mes va bien. `mejorSi="baja"` para morosidad, días de cobro
o roturas de stock, donde "subió un 12 %" es una mala noticia. Cuando el
periodo anterior es cero, **no se inventa un +100 %**: se dice que no hay base
de comparación.

### `BuscadorProductos`

El control más usado del sistema.

```tsx
<BuscadorProductos
  id="buscador-linea"
  buscar={buscarProductos}          // Server Action — referencia estable
  onSeleccionar={agregarLinea}
  excluirIds={lineas.map((l) => l.productoId)}
  onIrAlMaestro={(q) => router.push(`/productos/nuevo?sku=${q}`)}
/>
```

- Asíncrono contra el catálogo; nunca precarga los 2.000 SKU.
- Descarta respuestas tardías (número de petición + `AbortController`): si la
  de `620` vuelve después que la de `6205`, se ignora.
- Muestra stock y precio en la propia lista, con color de estado.
- Al seleccionar, se vacía y **conserva el foco** para encadenar líneas.
- **No** da de alta productos: Willy pidió que el alta se haga desde el maestro
  (reunión 10:44). `onIrAlMaestro` solo ofrece el enlace cuando no hay resultados.

> El panel de resultados se posiciona en el flujo del documento, no en un
> portal — es lo que permite que el teclado funcione sin sacar el foco del
> campo. El ancestro inmediato no puede tener `overflow: hidden`.

### `PaginacionKeyset`

Ver §4. Se usa dentro de `DataTable`, pero también sirve suelta para listas que
no son tablas (movimientos de kardex en tarjetas, por ejemplo).

### `EstadoVacio` y `EstadoError`

Un listado vacío nunca se queda en blanco. Y son **dos textos distintos**:

- *"Todavía no hay cotizaciones"* → invita a crear la primera.
- *"Ningún resultado con estos filtros"* → invita a quitar el filtro.

Confundirlos hace que el operador crea que perdió datos.

`EstadoError` dice tres cosas siempre: qué se intentaba, que **no se perdió ni
se modificó nada**, y cómo reintentar. El detalle técnico va en un `<details>`
plegado porque es lo que se copia al reportar la incidencia.

---

## 6. Formularios: cuál de los dos caminos

| Caso | Qué usar |
|---|---|
| 2-5 campos, POST a una Server Action | `<form action={accion}>` + `Campo` + `Input` + `Button`. **Cero JavaScript**, se renderiza en el servidor. |
| Formulario largo, validación cruzada, borrador | `Form` (react-hook-form + zod) con `FormField` / `FormControl` / `FormMessage`. |

`FormResumenErrores` junta los errores al principio: en un formulario de 30
campos, ver el error solo junto al campo obliga a buscarlo a ojo.

### `Select` vs `SelectNativo`

Conviven a propósito.

- **`SelectNativo`** para lo denso y frecuente: unidad de medida, moneda, tipo
  de documento. Se opera más rápido con teclado, no necesita JavaScript y
  funciona dentro de un `<form action>`.
- **`Select`** (Radix) cuando las opciones llevan contenido rico (icono, dos
  líneas, precio a la derecha) o grupos con encabezado.

### `Switch` vs `Checkbox`

`Switch` **solo** cuando el cambio se aplica al instante (activar detracción,
mostrar la columna de descuento en el PDF). Si el valor se guarda al pulsar
"Guardar", va `Checkbox`: el switch promete inmediatez y romper esa promesa
confunde.

---

## 7. Accesibilidad

No es una casilla que marcar: el ERP se opera ocho horas al día, y casi todo se
hace más rápido con el teclado.

- **Foco visible en todo lo interactivo.** Regla global `:focus-visible` en
  `tokens.css`; es más barato quitarla en un caso puntual que descubrir un
  control sin foco.
- **Labels asociados.** `FormField` + `FormControl` cablean `id`, `htmlFor`,
  `aria-describedby` y `aria-invalid` solos. `Campo` (para formularios sin
  react-hook-form) genera los ids `"{id}-ayuda"` y `"{id}-error"`; pásalos al
  control en su `aria-describedby`.
- **`aria-sort`** en las cabeceras ordenables; las filas clicables son
  tabulables y se activan con Enter.
- **Regiones vivas**: el buscador anuncia cuántos resultados hay, la barra de
  lote cuántas filas están marcadas, la paginación cuántos registros se ven.
- **El color nunca es el único canal** (`EstadoBadge`, columnas numéricas con
  tono).
- **`prefers-reduced-motion`** anula todas las animaciones, no solo las acorta.
- El tooltip **nunca** es el único sitio donde vive una información: sirve para
  desambiguar iconos, no para esconder datos.

---

## 8. Tokens

`tokens.css` es la migración literal del `globals.css` de la demo. Las escalas
`brand` / `accent` / `steel` y la paleta de visualización de datos ya estaban
validadas (contraste, banda de luminosidad, separación para daltonismo): aquí
solo cambiaron de sitio.

**Dos colisiones de vocabulario con shadcn, resueltas a propósito:**

1. En shadcn `accent` es el fondo de hover de los menús. En Rodatech `accent`
   es el **amarillo de marca**. No redefinimos `accent`: donde shadcn usaría
   `bg-accent`, aquí se usa `bg-surface-2`.
2. shadcn define `--color-muted` como una **superficie**. La demo ya usaba
   `text-muted` para el **texto** secundario. Declarar `--color-muted` habría
   hecho que `text-muted` pintara el texto del color del fondo. Por eso `muted`
   no es un color de tema: `text-muted` sigue siendo la utilidad de texto
   secundario.

### Utilidades propias

`card` · `elev-1|2|3` · `tabular` · `scroll-x` · `skeleton` · `bg-app` ·
`text-fg|muted|subtle` · `border-app|soft` · `ring-brand` · `stripe-brand` ·
`no-print` · `h-control-xs|sm|md|lg` · `w-control-xs|sm|md` ·
`anim-fade-in|fade-out|fade-up|pop-in|pop-out|in-right|out-right|…`

Las animaciones usan las propiedades **independientes** `scale` y `translate`,
nunca `transform`: el contenido del `Dialog` ya lleva un
`-translate-x-1/2 -translate-y-1/2` para centrarse, y tocar `transform` lo
borraría a mitad de la animación.

---

## 9. Qué se conservó de la demo y por qué

| Se conserva | Motivo |
|---|---|
| Todos los tokens de `globals.css` | Ya estaban validados. El encargo era moverlos, no rediseñar la marca. |
| `Card` + subcomponentes | Su densidad (padding 20 px, título de 13 px) está calibrada para el ERP; la de shadcn trae más aire del que cabe. |
| Variantes de `Button` (`primary`/`accent`/`outline`/`ghost`/`subtle`/`danger`/`success`/`link`) | Describen la intención mejor que `default`/`destructive` y ya están cableadas en 30 pantallas. |
| `SelectNativo` | Más rápido de operar y funciona sin JavaScript. |
| Primitivas de `<table>`, esqueletos, `EstadoVacio` | Sirven tal cual. |
| Paleta `--viz-*` | Validada para claro y oscuro; `charts/graficos.tsx` sigue apoyándose en ella. |

| Se sustituye | Motivo |
|---|---|
| `Modal` a mano → `Dialog` (Radix) | El de la demo no atrapaba el foco ni lo devolvía al cerrar, y bloqueaba el scroll escribiendo `document.body.style.overflow`, que se pisa con dos diálogos abiertos —justo lo que pasa al facturar desde el listado. |
| `Tooltip` CSS → Radix | El de la demo solo aparecía con `:hover`: invisible para quien navega con teclado. |
| `Tabs` con `useState` → Radix | Faltaba `role="tablist"` y la navegación con flechas. |
| `Paginacion` por offset → `PaginacionKeyset` | El offset se degrada linealmente con el catálogo. |
| Búsqueda y filtros sueltos → `BarraHerramientas` de la tabla | Mismo comportamiento, ya integrado con el ciclo de la DataTable. |

---

## 10. Comandos

```bash
pnpm --filter @rodatech/ui typecheck
```

El paquete **no se compila**: exporta TypeScript y lo transpila la app que lo
consume (`transpilePackages`). Un paso de build aquí solo añadiría latencia al
ciclo de desarrollo sin resolver nada.
