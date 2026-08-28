# El historial de ventas de Willy · 28/08/2026

Llegó `historial de ventas.xlsx`: **dos años de facturación real** exportados
del sistema que usa hoy. Es el primero de los tres Excel que estaban pendientes
(PENDIENTES §4), y el que más cambia lo que sabemos del proyecto.

Esto es lo que trae, lo que se puede cargar tal cual, y **lo que no**.

> **Los archivos NO están en el repositorio.** Viven en `documentosrodamiento/`,
> que desde hoy está en `.gitignore`. Son datos comerciales del cliente —RUC,
> precios de venta, márgenes— y llegaron sin ignorar: un `git add .` los
> publicaba enteros. Nunca llegaron a subirse; se comprobó.

---

## Lo que hay dentro

| | |
|---|---|
| Líneas | 1.262 |
| Documentos | **518** · 482 válidos, 36 anulados, 2 pendientes en SUNAT |
| Válidos | 479 facturas + 3 notas de crédito |
| Periodo | **18/09/2024 → 26/08/2026**, casi dos años |
| Clientes | **37** |
| Productos | **790** |
| Venta neta | **USD 201.314** (facturas 201.797 · notas −483) |

Serie única `F002` para facturas y `FC02` para notas. Un solo vendedor real
—Willy— con 1.196 de las 1.262 líneas; Mary Esquivel firma 61.

---

## 1 · Lo que está limpio, y es casi todo

La exportación es mucho mejor de lo que suele llegar:

- **Ningún RUC duplicado ni mal formado.** Los 37 pasan el dígito verificador
  con la misma función que usa el alta (`revisarDocumento`), ningún RUC tiene
  dos razones sociales, y ninguna razón social tiene dos RUC. Se comprobó uno
  a uno.
- **Ningún correlativo repetido**, y ningún documento con dos cabeceras
  distintas (mismo número con otro cliente u otra fecha).
- **Ningún SKU vacío ni con espacios** — el maestro no admite espacios en el
  código, y esto habría sido el rechazo más tonto posible.
- **Una sola línea repetida** en 1.262: la factura `F002-17` del 03/10/2024 a
  OVOSUR lleva `8M-600X54` dos veces, 3 unidades a 23.98 las dos. Puede ser
  legítimo —una factura puede repetir un ítem— pero conviene preguntarlo.

## 2 · La trampa de la moneda, que casi me como

La columna `TC` **no significa lo mismo en todas las filas**:

- Moneda **USD** → los importes ya están en dólares. `TC` vale 1, salvo en las
  tres primeras facturas de 2024, donde trae el cambio del día (3.764 / 3.778)
  y **no hay que aplicarlo a nada**.
- Moneda **PEN** (31 líneas) → `TC` vale 0.267–0.298, o sea el cambio
  **inverso**. Los dólares salen de **multiplicar**: `USD = importe × TC`.

Dividir en vez de multiplicar inflaba los precios en soles unas trece veces.
En la primera pasada eso dejó productos con un rango de precio de ×33 que no
existía, y habría metido precios de venta falsos en el maestro.

Se verificó con el `H309`, que se vendió en las dos monedas la misma semana:
84.42 PEN × 0.282 = **23.81 USD**, y en dólares se vendió a **23.78**. Cuadra.

## 3 · Lo que hay que decidir antes de cargar nada

### 3.1 · Tres productos chocan con los `[DEMO]`

`7210 BEP`, `6209-2RS1/C3` y `6310-2Z.C3` ya existen en la base como productos
de prueba. **Hay que borrar los `[DEMO]` antes de cargar**, y borrarlos pasando
un ajuste de inventario primero: tienen stock y movimientos de kardex, y
borrarlos a secas deja el stock mintiendo (es la lección R2).

Nótese que el histórico escribe `6310-2Z/C3` con barra y la base lo tiene con
punto. Para el maestro son **el mismo código** —`normalizar_codigo` quita los
dos— así que no habría dos productos, habría un choque.

### 3.2 · Faltan dos unidades de medida

El histórico usa `PK` (paquete, en un papel A4) y `CEN` (ciento, en unos
pernos). El maestro solo tiene `BX`, `MTR`, `NIU` y `SET`. O se dan de alta, o
esas dos líneas se convierten a unidades.

### 3.3 · Veintiséis productos con el dato en discusión

Están todos en la hoja **Decisiones** del archivo 3, con la opción propuesta
marcada. Se reparten en tres clases muy distintas:

**Ruido tipográfico** (la mayoría) — el mismo producto escrito de dos formas:
`6309-2Z/C3` / `6309-2Z.C3` / `6309.2Z/C3`, o `(ITALY)` y `(BULGARIA)` como
nota de origen. Se resuelve solo tomando la variante más repetida.

**Marca en discusión** — `FRB12.5/130` aparece como FSQ y como SKF;
`ASA50-1` como SWK y SWF (probable errata). Aquí sí hay que preguntar: la
marca es campo propio en el maestro.

**Dos productos distintos bajo un mismo código** — y estos son los que
importan de verdad:

| Código | Una factura dice | Otra dice |
|---|---|---|
| `RET-13934096` | RETEN EN X de **84×94×5 mm** | RETEN EN X de **83×95×5.5 mm** |
| `RET-42174382` | RETEN METALICO de viton, eje 84 mm | **RESORTE DE ALAMBRE** 36.5×47×L90 |
| `SR120X10` | ANILLO GUIADOR | ANILLO ESPACIADOR para chumacera SNK |
| `HK1412` | CASQUILLO DE AGUJAS **INA** | CASQUILLO DE AGUJAS **NTN** |

No se pueden fusionar: cargarlos como uno solo mezcla dos artículos en un mismo
kardex y en un mismo precio.

### 3.4 · Tres productos vendidos por metro Y por unidad

`CA-ASA60-1`, `CA-12B2` y `ZRL-AT-10/50-POLY` —cadenas y una faja sincrónica—
aparecen unas veces en `MTR` y otras en `NIU`. **Un producto tiene una sola
unidad.** O se elige una, o son dos productos (la cadena a granel y el tramo
cortado), que es lo que probablemente sean.

---

## 4 · Lo que NO se puede cargar todavía, y es lo gordo

**Solo 161 de los 790 productos (20 %) caben en la taxonomía que existe.**

El importador de productos exige `FAMILIA`, `SUB-FAMILIA` y `DESCRIPCION`, y
las tres tienen que existir ya en el catálogo y ser coherentes entre sí —la
columna `DESCRIPCION` no es texto libre: se mapea a `tipos`, que es una lista
cerrada de 61 valores—. Sin ellas, el importador rechaza la fila con «Falta la
familia».

Y la taxonomía que tenemos, sacada de la muestra del catálogo, es **solo de
rodamientos**: RODAMIENTO, CHUMACERA y ACCESORIOS. Lo que Willy vende de verdad
es mucho más ancho:

| Qué es | Productos | % | Venta USD | ¿Cabe hoy? |
|---|---:|---:|---:|---|
| Retenes, o-rings, juntas, empaquetaduras | 193 | 24 % | 21.853 | **no** |
| Fajas y poleas | 134 | 17 % | 20.872 | **no** |
| Rodamientos | 123 | 16 % | 47.809 | sí |
| Transporte (ruedas, polines, bandas) | 61 | 8 % | 33.939 | **no** |
| Accesorios (manguitos, obturadores) | 33 | 4 % | 2.286 | sí |
| Cadenas y candados | 31 | 4 % | 21.371 | **no** |
| Acoples y elementos flexibles | 18 | 2 % | 9.364 | **no** |
| Pernos y ferretería | 18 | 2 % | 1.592 | **no** |
| Material (planchas, barras, tubos) | 17 | 2 % | 5.976 | **no** |
| Chumaceras | 5 | 1 % | 1.006 | sí |
| Lubricantes | 3 | — | 2.040 | **no** |
| Sin clasificar | 151 | 19 % | 33.771 | **no** |

**Los rodamientos son el 16 % de su catálogo y el 24 % de su facturación.** El
resto —retenes, fajas, cadenas, transporte— es la mayoría del negocio y no
tiene dónde entrar.

Esto no es un fallo del importador: es que **la taxonomía se construyó desde una
muestra que solo traía rodamientos**. Hay que ampliarla, y no me la puedo
inventar yo: cómo agrupa Willy sus retenes y sus fajas es una decisión suya, y
es la que va a gobernar sus informes durante años.

La pantalla `/configuracion` ya deja crear familias, sub-familias y
descripciones desde el navegador (migración 028), así que en cuanto él diga los
grupos se cargan en minutos.

---

## 5 · Lo que sí se puede cargar ya

**Los 37 clientes.** Están validados, no chocan con nada y traen dirección de
facturación. Falta contacto y teléfono —el histórico no los trae, y solo uno
tiene correo— pero eso es exactamente lo que él dijo: *«a las justas me dan
correo»*.

Van en `1 - Clientes del historial.xlsx`, con las mismas columnas que la
plantilla del importador. La columna «observaciones» lleva de cada uno cuántas
facturas tiene y cuánto compró, que es contexto útil el primer día.

**Aviso:** los clientes traen la dirección de facturación pero **no el ubigeo**,
y el ubigeo no se puede deducir del texto. Ya sabemos que la tabla `ubigeo`
solo tiene 64 distritos (PENDIENTES §6), así que esto no empeora nada — pero
sigue siendo lo que falta para poder emitir guías a provincia.

---

## 6 · Lo que este archivo NO trae, y hay que seguir pidiendo

- **El costo.** Solo 32 de 790 productos traen costo, y el resto viene en cero.
  Sin costo no hay margen, y el margen es media pantalla del ERP. Tiene que
  venir del **maestro de productos**, que sigue pendiente.
- **El stock.** Ni una columna. También del maestro.
- **El P.M.** (el precio mínimo / de mercado, la pregunta del viernes).
- **El peso**, que hace falta para la guía de remisión.
- **La familia y la sub-familia** de cada producto (§4).

O sea: **el historial de ventas no sustituye al maestro de productos**. Da el
código, la descripción de la factura, el precio al que se vendió y a quién —que
es mucho, y llena la trazabilidad y los informes— pero no la ficha del artículo.

---

## 7 · Los archivos generados

En `documentosrodamiento/`, junto al original y fuera del repositorio:

| Archivo | Qué es |
|---|---|
| `1 - Clientes del historial.xlsx` | 37 clientes con las columnas del importador. **Listo para cargar.** |
| `2 - Productos del historial.xlsx` | 790 productos. Las columnas de plantilla a la izquierda y, en gris, lo que dice la factura, la familia propuesta, el precio real y cuánto se vendió. **FAMILIA, SUB-FAMILIA y DESCRIPCION van vacías a propósito** (§4). |
| `3 - Ventas y decisiones.xlsx` | Hoja **Decisiones** con los 26 conflictos y la opción propuesta; hoja **Documentos** con las 518 facturas (las anuladas en gris); hoja **Resumen**. |

El original no se tocó.

---

## 8 · Por dónde seguir

1. **Cargar los 37 clientes.** No depende de nadie y llena media pantalla de
   informes.
2. **Preguntarle a Willy cómo agrupa lo que no son rodamientos** (§4). Es lo
   que desbloquea los 629 productos restantes, y es una conversación de diez
   minutos con la tabla de arriba delante.
3. **Resolver los cuatro códigos que son dos productos** (§3.3) y las tres
   unidades dobles (§3.4).
4. **Borrar los `[DEMO]`** con su ajuste de inventario antes de cargar
   productos (§3.1).
5. Y seguir pidiendo el **maestro de productos**, que es el que trae costo,
   stock, peso y P.M. (§6).

Cargar el histórico de ventas **como documentos emitidos** es otra conversación
y no es para ahora: quemaría 518 correlativos de la serie F002 y movería stock
de dos años. Si se quiere el histórico dentro del ERP, la vía es una tabla de
ventas históricas de solo lectura que alimente informes y trazabilidad sin
tocar el kardex ni SUNAT.
