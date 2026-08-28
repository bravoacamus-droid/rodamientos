# El historial de ventas de Willy · 28/08/2026

> ## ✅ YA ESTÁ CARGADO EN LA BASE
>
> El 28/08 por la tarde se borraron los datos de prueba y entró la cartera
> real. **La base ya no tiene ni un `[DEMO]`**:
>
> | | Antes | Ahora |
> |---|---:|---:|
> | Clientes | 2 `[DEMO]` | **37 reales** |
> | Productos | 7 `[DEMO]` | **790 reales** |
> | Familias | 3 | **9** |
> | Sub-familias | 17 | **35** |
> | Unidades | 4 | 6 (`PK` y `CEN`) |
> | Stock y kardex | 14 movimientos | **0** — a propósito, ver §9.3 |
>
> Se respaldó todo a JSON antes de borrar
> (`documentosrodamiento/respaldo-2026-08-28/`, 79 filas). Comprobado en
> pantalla y con las 39 pruebas e2e en verde. El detalle de cómo, en §9.

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

---

## 9 · Cómo se cargó, el 28/08 por la tarde

### 9.1 · El borrado

Todo lo que había era de prueba: se sembró para poder enseñar pantallas. Se
respaldó a JSON —25 tablas, 79 filas, en `respaldo-2026-08-28/`— y se borró en
orden de clave foránea: primero cobranzas y documentos, después inventario,
después los maestros.

Los **correlativos vuelven a cero**. Los que se gastaron fueron pruebas, y los
de partida de verdad los da Willy por `/configuracion`.

Lo que **no** se tocó: marcas, la taxonomía, unidades, ubigeo, empresa,
perfiles, permisos y la configuración de SUNAT.

### 9.2 · La taxonomía, ampliada de 3 familias a 9

Se crearon **SELLADO, TRANSMISION, TRANSPORTE, FERRETERIA, LUBRICANTES** y
**OTROS**, con 18 sub-familias nuevas. Con eso los **790 productos quedan
clasificados: cero en «por clasificar»**.

| Familia | Productos |
|---|---:|
| RODAMIENTO | 247 |
| SELLADO | 213 |
| TRANSMISION | 176 |
| CHUMACERA | 49 |
| FERRETERIA | 47 |
| ACCESORIOS | 41 |
| OTROS | 8 |
| TRANSPORTE | 6 |
| LUBRICANTES | 3 |

Dos decisiones que conviene conocer:

- **«OTROS · SERVICIOS»** existe porque en su histórico hay líneas que no son
  artículos: «ENVIO POR AGENCIA» y «SERVICIO DE ENVIO POR MOTORIZADO». No
  tienen stock y no deberían salir en un top de productos.
- **«OTROS · ÚTILES DE OFICINA»** son seis: bolígrafos, papel A4, clips,
  grapas. Salieron en una sola factura y no son su negocio, pero están en su
  historia. En su propio cajón para que se vean y él decida.

**Todo esto es una PROPUESTA.** Las familias llevan escrito en su descripción
«Creada el 28/08/2026 desde el historial de ventas. Pendiente de que Willy
confirme el agrupamiento». Renombrarlas o reagruparlas el viernes son minutos.

### 9.3 · Lo que se cargó vacío A PROPÓSITO

- **Stock cero y ni un movimiento de kardex.** El historial de ventas no dice
  qué hay en el almacén. Un stock inventado es la forma más rápida de que el
  ERP mienta desde el primer día. Entra con el cuadre inicial de inventario,
  que es como se hace.
- **`tipo_id` nulo en los 790.** Los «tipos» son la tercera capa —«RIGIDO DE
  BOLAS 1 HIL.» frente a «2 HIL.»— y esa distinción no está en la descripción
  de una factura. Se rellena cuando llegue el maestro de productos.
- **Costo solo en 32.** Es lo que traía el archivo.

### 9.4 · Las marcas

406 productos llevan marca reconocida; **384 se quedaron en «SIN MARCA»**.

No es dejadez: los sufijos de la descripción se parecen a marcas pero no
siempre lo son. En la misma lista salían `FSQ`, `LYO`, `TTO`, `SWF` —que
pueden ser marcas o abreviaturas de proveedor— junto a `MUESTRA`, `AZUL`,
`VITON` y `LABIO`, que no son marca de nada. Crear una marca por cada sufijo
de tres letras llena el catálogo de basura que después nadie limpia.

Se creó solo lo inequívoco: **PARKER** e **IKO**, y `OPT` se mapeó a la
OPTIBELT que ya existía.

**Lo que decía la factura no se perdió:** está en
`productos.atributos->>'marca_origen'`. Cuando Willy confirme cuáles son marcas
de verdad, se arreglan en bloque con un UPDATE. Ahí van también sus ventas
históricas (`ventas_historicas`, `unidades_vendidas`, `clientes`,
`ultima_venta`), que es de donde salen los precios cargados.

### 9.5 · Comprobado

Las 39 pruebas e2e en verde contra la base ya cargada (3 se saltan: no hay
compras, guías ni comprobantes, que es lo correcto). Y a mano: el catálogo
enseña los 790 con su sub-familia, el maestro de clientes los 37, y en el
constructor de cotizaciones «cofaco» encuentra a COFACO INDUSTRIES y «6205»
devuelve los cuatro rodamientos reales con sus precios.
