# Pendientes

Estado al **02/09/2026**. Ordenado por lo que más duele. Lo ya resuelto vive
al final, con la lección, porque los tres casos se habían diagnosticado mal y
volver a caer sale caro.

> **Si retomas y solo lees una cosa, que sea esta.**
>
> El día 01/09 hubo reunión con Willy (§ «Reunión del 01/09»), salió el plan
> del flujo de compras (§G) y se construyó su primer bloque (§H). El 02/09
> se hizo la bandeja **«Por comprar»** (§I), primera pantalla del bloque 2;
> se cargó **su lista de clientes y proveedores** (§J) —la base pasó de 0 a
> 97 proveedores, así que compras y recepciones ya se pueden usar— y se
> añadió **qué vende cada proveedor** (§K), que se aprende solo de cada
> compra.
>
> **Lo siguiente, por orden:**
>
> 1. El **comparador de proveedores** (§G, paso 5). Es lo único del plan que
>    hay que inventar de cero, y ya tiene las dos piezas que necesita: la
>    bandeja (§I) y qué vende cada proveedor (§K).
> **Y ya no queda nada más que yo pueda hacer solo.** Lo del 31/08 está
> cerrado —los contadores (§0.3), la bitácora (§0.5) y el barrendero de
> SUNAT (§0.6)— y del plan de compras solo falta el comparador, que espera
> la pregunta 3 a Willy.
>
> Y lo que se cerró el 02/09 después de subir: **facturar por partes** (§L),
> que escondía dos fallos en el flujo del dinero; los **tres contadores** de
> §0.3, que llevaban desde el 31/08; y **pedir precio por WhatsApp con
> mensajes que Willy escribe** (§M), que es media pieza del comparador.
>
> **Y antes de construir nada más, enseñarle el plan a Willy**:
> https://claude.ai/code/artifact/0ce92bb6-49bc-4dbd-927f-b3ca9e4df6da
> Son cinco preguntas y una de ellas —si confirmar un pedido aparta la
> mercadería— cambia cómo se comporta la bandeja que ya está construida.

---

## Dónde estamos

| | |
|---|---|
| Rutas | **46 de 46 reales** · no queda ningún cartel |
| `pnpm typecheck` | 7/7 paquetes |
| `pnpm test` | **1.132 en verde** |
| `pnpm e2e` | **42 en verde** (navegación); falta el flujo del dinero (§2) |
| `pnpm lint` | **limpio**, 0 avisos |
| Migraciones | **hasta la 059, aplicadas** al Supabase del cliente |
| Feedback del 26/08 | **cerrado**, ver [FEEDBACK-26-08.md](FEEDBACK-26-08.md) |

`main` está en la punta de lo último. Las migraciones son idempotentes y de la
013 en adelante casi todas llevan centinela: fallan al aplicar si alguien mete
una función de escritura sin control de rol, si la valorización se desalinea
del kardex, si una nota de crédito se cuenta como venta o si «días sin
comprar» empieza a contar días que no han pasado.

**Y desde el 31/08 la cadena entera se puede reaplicar de verdad.** Hasta ese
día la frase de arriba era mentira a medias: `pnpm db:aplicar` moría en la 005
sobre cualquier base ya migrada, y por tanto ningún centinela posterior al
quinto archivo se había vuelto a ejecutar nunca. Ver R10.

**Qué hay dentro de la base, hoy.** Conviene tenerlo delante antes de enseñar
nada, porque el ERP tiene un pasado rico y un presente vacío:

| Tabla | Filas | |
|---|---|---|
| `clientes` | **97** | 37 del histórico + 60 de su lista del 02/09 (§J) |
| `productos` | 790 | su catálogo real |
| `comprobantes` | 518 | dos años de ventas |
| `ubigeo` | 1.874 | el padrón entero (037) |
| `unidades_medida` | 42 | el catálogo 03 de SUNAT (039) |
| `proveedores` | **97** | su lista del 02/09 · **ya se puede comprar** (§J) |
| `stock` | **1** | y ese uno es un dato de prueba, ver abajo |
| `movimientos_inventario` | **1** | ídem |
| cotizaciones, compras, recepciones, guías, pagos, alertas | **0** | |

**Ese 1 hay que borrarlo.** Es el ajuste `AJU-26-00001`, «Conteo de prueba»,
de 20 unidades del producto `0-230`, creado el 01/09 durante la demo en vivo
de la reunión. Si se queda, el primer inventario real de Willy arranca con 20
unidades que no existen.

Los ceros son consecuencia buscada de la carga del 28/08 —las facturas
históricas NO debían mover stock— pero tienen un efecto en la demo: los
informes salen llenos y **todas las pantallas donde se trabaja salen vacías**.
`/compras/nueva` y `/recepciones/nueva` lo dicen bien («Primero hace falta un
proveedor»), no se rompen; pero no hay forma de enseñar una operación de punta
a punta hasta que Willy mande su maestro de productos —con costo y stock— y su
lista de proveedores.

El redondeo de los importes de línea ya está arreglado en todas partes (R7).

---

## Retomar en otra máquina · lo que NO viaja en el repositorio

`main` tiene todo el código. La **base de datos también está al día**: es el
Supabase del cliente, en la nube, con sus 37 clientes, 790 productos y 518
facturas ya cargados. No hay que volver a ejecutar ninguna carga.

Lo que falta al clonar son **dos cosas**, las dos ignoradas a propósito:

### 1 · `.env.local` en la raíz

No está en git y no debe estarlo. Hay que recrearlo con estas 11 claves —
`.env.example` explica cada una y de dónde sale:

| Clave | De dónde |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_PROJECT_REF` | Supabase → Project Settings → API |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens (cuenta **dueña** del proyecto) |
| `SUNAT_ENCRYPTION_KEY` | **NO se regenera.** Tiene que ser la MISMA o las credenciales SUNAT guardadas no se pueden descifrar y hay que reescribirlas a mano |
| `DECOLECTA_TOKEN` | decolecta.pe → cuenta → API |
| `RODATECH_DEV_PASSWORD` · `RODATECH_ATAJOS=1` | la clave de las cuentas sembradas; los atajos del login |
| `E2E_PERMITIR_ESCRITURA=0` | **en cero mientras apunte al Supabase del cliente** |

La forma más rápida y segura: **copiarlo tal cual desde esta máquina** por USB
o gestor de contraseñas. Nunca por chat ni por correo.

> Ojo con el nombre: **con el punto delante**. El `.gitignore` tapa
> `.env*.local`, así que un archivo llamado `env.local` a secas NO está
> protegido y se sube al primer `git add .`.

### 2 · La carpeta `documentosrodamiento/` — 464 KB

Ignorada desde el 28/08 porque son datos comerciales del cliente. Contiene:

- `historial de ventas.xlsx` — **el original que mandó Willy**
- Los tres archivos separados (clientes, productos, ventas y decisiones)
- `respaldo-2026-08-28/` — el respaldo de los datos `[DEMO]` antes de borrarlos

**Se copia a mano.** No hace falta para programar ni para que la aplicación
funcione —los datos ya están en la base—; hace falta si se quiere volver a
mirar el Excel o deshacer la carga.

### Y ya está

```
pnpm install
pnpm dev          # puerto 4005
```

Lo demás se regenera solo: `e2e/.auth/` en la primera pasada de Playwright, y
`next-env.d.ts` al arrancar.

**Comprobación de que quedó bien**, en este orden:

```
pnpm typecheck    # 7/7
pnpm test         # 846
pnpm lint         # limpio
pnpm e2e          # 40 pasan, 2 se saltan (no hay compras ni guías)
```

Si `pnpm e2e` se queja de la guardia, es que `E2E_PERMITIR_ESCRITURA` está en 1
apuntando al Supabase del cliente. Tiene que estar en 0.

---


## Qué falta · el resumen

Lo de abajo está desarrollado en las secciones §1 a §7. Esto es para verlo de
un vistazo sin leerse el documento entero.

### Lo que depende de ti (detalle en §4)

Nada de esto se desbloquea escribiendo código, y todo puede frenar el final
del proyecto.

1. **Un proyecto Supabase de pruebas.** Es lo que bloquea lo más importante que
   queda: las pruebas del **flujo del dinero** de punta a punta (cotizar →
   aprobar → guía → facturar → cobrar, y compra → recepción). Hoy las 41
   pruebas comprueban que las pantallas abren sin error, que no es poco, pero
   **no comprueban que el dinero cuadre**. No se pueden correr contra la base
   del cliente porque esas pruebas ESCRIBEN: mueven stock, gastan correlativos
   y emiten documentos. Son cuatro pasos: crear el proyecto, `pnpm db:aplicar`,
   apuntar ahí el `.env.local` y poner `E2E_PERMITIR_ESCRITURA=1`.

2. **Las credenciales de SUNAT y lo que va con ellas** (§4): el certificado
   `.pfx` con su clave, el usuario SOL secundario, los tres Excel de productos
   / clientes / proveedores, y los correlativos de arranque por serie. El
   código está entero, cifrado y esperando; solo falta enchufarlo.

   **Cambió el 26/08:** Willy va a comprar un certificado NUEVO para no chocar
   con su ERP actual, que sigue en producción hasta la migración. Hay que
   **avisarle con unas dos semanas** — él dijo «me avisa nomás cuando se llegue
   a ese punto». Ya no hace falta comprobar la caducidad del viejo.

   Los correlativos **ya tienen dónde meterse**: `/configuracion` → «Series y
   correlativos», columna «desde».

3. **Los tres Excel** (§4). Sin ellos el sistema funciona con datos ficticios,
   pero los informes de ventas, el top de productos y la trazabilidad salen
   vacíos: son pantallas que solo dicen algo con historia detrás.

   **Antes de que suba el de productos**, preguntarle lo de la columna P.M.
   (FEEDBACK-26-08 §2.1). La plantilla ya tiene las dos columnas y el
   importador avisa por pantalla, pero es mejor saberlo que corregir 3.000
   pisos después.

   **Llegó el primero el 28/08: el HISTORIAL DE VENTAS.** Dos años, 518
   facturas, 37 clientes, 790 productos, USD 201.314. Analizado y separado en
   [HISTORIAL-VENTAS.md](HISTORIAL-VENTAS.md). Los datos son limpios —ningún
   RUC duplicado, ningún correlativo repetido, una sola línea repetida en
   1.262—, pero destapó **lo que ahora es el mayor bloqueo del catálogo**:

   > **Solo el 20 % de lo que Willy vende cabe en la taxonomía que tenemos.**
   > FAMILIA, SUB-FAMILIA y DESCRIPCION son listas cerradas y las nuestras son
   > solo de rodamientos. Retenes (24 % del catálogo), fajas (17 %), transporte
   > (8 %), cadenas (4 %)… no tienen dónde entrar, y son la mayoría del
   > negocio: los rodamientos son el 16 % de sus productos.

   **Cargado esa misma tarde.** Se borraron los datos `[DEMO]` —con respaldo a
   JSON antes— y entró la cartera real: **37 clientes y 790 productos**. La
   taxonomía se amplió de 3 familias a 9 (SELLADO, TRANSMISION, TRANSPORTE,
   FERRETERIA, LUBRICANTES, OTROS) y los 790 quedan clasificados, cero en «por
   clasificar». Stock y kardex quedan **en cero a propósito**: el historial no
   dice qué hay en el almacén, y eso entra con el cuadre inicial.

   **Y las 518 facturas también entraron.** Yo había supuesto que cargarlas
   movería stock de dos años; era falso — en este esquema el kardex solo lo
   toca `emitir_comprobante()`, no un disparador, así que un INSERT directo
   carga la historia sin inventar un movimiento de almacén. Con eso funcionan
   ya los informes, el tablero, la trazabilidad por ítem y el historial de
   precios del cotizador: USD 201.796 en 479 documentos, cuadrado contra el
   Excel al céntimo.

   **Dos cosas que Willy tiene que confirmar el viernes:**

   1. **La taxonomía es una PROPUESTA.** Cómo agrupa sus retenes y sus fajas es
      decisión suya y gobierna sus informes durante años; las familias llevan
      escrito que están pendientes de que él las confirme. Renombrar o
      reagrupar son minutos desde `/configuracion`.
   2. **El histórico entró como PAGADO.** El Excel marcaba 450 facturas como
      pendientes —USD 191.936, algunas de hace dos años— porque su sistema no
      lleva bien el cobro. Cargarlas así habría puesto deuda falsa en
      `/cobranzas` el primer día. Si tiene deuda viva de verdad, que diga
      cuáles y se marcan.

   Y de paso: **las 3 notas de crédito no decían a qué factura apuntan** (el
   Excel no trae la columna) y se dedujeron por cliente, SKU y fecha. Los tres
   empates son inequívocos, pero es lo único de toda la carga que no se leyó
   sino que se infirió. Detalle en [HISTORIAL-VENTAS.md](HISTORIAL-VENTAS.md)
   §10.3.

### Lo que puedo hacer yo sin esperar a nadie

Del 28/08 al 31/08 esto estaba casi vacío. **Desde la reunión del 01/09 ya
no**: el plan de compras (§G) abrió trabajo para semanas que no depende de
que nadie conteste nada.

Por orden de lo que más vale:

1. ~~**La bandeja «Por comprar»**~~ · **hecha el 02/09**, ver §I.
2. ~~**El comparador de proveedores** (§G paso 5)~~ · **hecho el 02/09**,
   §Q. Era lo único del plan entero que había que inventar de cero, y con
   él **esta lista se queda vacía**: lo que falta del plan de compras
   depende de las cinco preguntas a Willy.
3. ~~**Los tres contadores que dan cifras falsas**~~ · **hechos el 02/09**
   (§0.3, migración 048).
4. ~~**El aviso de cambio de costo** (§G paso 7)~~ · **hecho el 02/09**, §P:
   al recibir se dice si el costo se comió el margen, o el piso.
5. ~~**Una factura parcial saca la cotización entera de la bandeja.**~~ ·
   **arreglado el 02/09** (§L), y resultó ser dos fallos: la factura además
   cobraba lo cotizado en vez de lo que el cliente confirmó.
6. ~~**La bitácora `actividad`** (§0.5) y el **reintento de envíos a SUNAT**
   (§0.6)~~ · **hechos el 02/09**, migraciones 051 y 052.
7. ~~**Que un fallo de servidor muera en la pantalla del operador**~~ (§0.2)
   · **hecho el 02/09**, migración 054: se apuntan, se apilan y salen en
   «Qué ha pasado».

Lo anterior de esta sección se cerró el 28/08: el refresco de alertas
(migración 032), la auditoría de campos contra Defontana (§5) y los enlaces
del kardex (§6). Queda el envío GRE, y ese está bloqueado.

---

## Reunión del 01/09 · 34 min con Willy, y su maestro de productos

Grabación en el grupo. Fue la primera en la que él conduce la revisión pantalla
por pantalla, y salieron tres cosas: retoques de diseño (hechos), decisiones de
producto (aquí abajo) y **un maestro de 2.230 productos que no entra tal cual en
el esquema actual**.

### A · Lo que se hizo el mismo día

| Lo que pidió | Dónde |
|---|---|
| Buscador en todo desplegable con lista larga | Producto (marca, familia, sub-familia, unidad, proveedor) y barra de filtros del catálogo |
| Crear marca sin salir del alta | Migración 039 · `crear_marca` |
| Crear proveedor desde el producto | Botón «+ Nuevo», el mismo diálogo del maestro |
| «La descripción, tipo, es la descripción impresa: solo deja el input» | Un campo, con sugerencias de la sub-familia |
| «Si los inputs los hacemos más pequeños entran los 4 en una línea» | Precios y Almacén, cuatro por fila |

### B · La unidad de medida NO se puede crear, y hay que saber por qué

Él la pidió junto con la marca, como si fueran lo mismo. No lo son.

`unidades_medida` es el **catálogo 03 de SUNAT**, y su código es el que viaja
dentro del XML de la factura:

```xml
<cbc:InvoicedQuantity unitCode="NIU">2</cbc:InvoicedQuantity>
```

Un código inventado —«UND», «PZA»— no lo rechaza nuestra pantalla: lo rechaza
SUNAT, con la factura ya emitida y el cliente esperando. Así que en vez de
abrir un «crear unidad» se cargó **el catálogo entero**: había 6 unidades de
las 42 que un almacén industrial puede necesitar. Con el buscador, 42 no
estorban. Si alguna vez falta una, se añade a la migración; no la teclea un
usuario.

### C · El maestro que mandó · `ESTRUCTURA DE BASE DE PRODUCTOS.xlsx`

**2.230 productos**, y la estructura por fin es consistente — que era justo lo
que él dijo que quería arreglar:

- **1 familia** (RODAMIENTO), **10 sub-familias**, **32 descripciones**
- **6 marcas**: SKF 951, FAG 496, NTN 381, NSK 166, INA 140, TIMKEN 96
- De 1 a 6 descripciones por sub-familia, sin las variantes sueltas del archivo
  viejo. Confirmado lo que dijo: *«en este nuevo maestro cada familia ya está
  definida, tiene una única descripción»*.

**Lo que NO trae, y hay que pedírselo:**

- **Cero precios.** Las columnas `P.C. $`, `P.V. $` y `P.M. $` están vacías en
  las 2.230 filas.
- **Cero stock.** `STOCK ACTUAL` y `STOCK MINIMO`, vacías.

O sea que se puede cargar el catálogo —códigos, marcas, jerarquía y
descripciones— pero **no se podrá cotizar con él hasta que lleguen los
precios**. Conviene decírselo antes de que lo dé por hecho.

### D · El problema de verdad: 6205 es de SKF y también de FAG

En el archivo hay **35 códigos repetidos**, y son dos casos distintos:

- **17 son el mismo código en DOS marcas.** `6205` aparece bajo SKF y bajo FAG.
  Y es correcto: `6205` es una designación ISO que fabrican todas las marcas.
- **18 son la misma fila dos veces** dentro de la misma marca. Esos se
  deduplican solos.

Los 17 primeros son el problema, porque el esquema dice:

```sql
create unique index ux_productos_codigo_norm on productos (codigo_norm);
```

**Único en TODA la tabla, no por marca.** Con eso, cargar el maestro mete el
`6205` de SKF y **rechaza el de FAG**, y Willy se queda sin poder vender un
rodamiento que sí tiene.

Hay tres salidas y **la decisión es suya, no nuestra**:

1. **Único por (marca, código).** Es lo que dice la realidad del negocio. Es
   una migración pequeña, pero cambia lo que significa «el código 6205» en el
   buscador de la cotización: pasarían a salir dos resultados y habría que
   elegir marca. Es lo que hace cualquier distribuidor multimarca.
2. **Código compuesto** al cargar: `6205-SKF`, `6205-FAG`. No toca el esquema,
   pero ensucia lo que se teclea y lo que se imprime.
3. **Una sola marca por código**, la que él vende de verdad. Es lo que hay hoy
   de facto, y es perder catálogo.

**Mi recomendación es la 1**, y hay que preguntárselo antes de cargar nada: es
la única de las tres que no obliga a rehacer la carga después.

### E · Lo que quedó comprometido y NO está hecho

Por orden de lo que él espera:

1. **El flujo de compras.** Le prometí un diseño en dos días. Su flujo real,
   dicho por él (29:05): cotiza a varios clientes → confirman a los dos o tres
   días → cotiza el mismo ítem a 3 o 4 proveedores locales → compra al mejor →
   recibe → **ajusta stock a mano** → factura. Y compra de más a propósito para
   dejar saldo. Lo que pide es que eso no sea engorroso: *«hago de frente con
   un solo botón, hago una orden de compras, relleno, compré, cambio el stock
   y ya»*.
2. **Columna «Disponibilidad» por ítem en la cotización**: `Inmediata` (por
   defecto), `Exterior` (15 días por defecto, editable) y `Fabricación` (2–4
   días). Y que la columna se pueda incluir o no en el formato impreso, igual
   que la de descuento.
3. **El tope de crédito, aplicado.** Él fue claro (4:30): al llegar al tope
   **cotizar sí, vender no** — *«con la cotización ya se le condiciona a que se
   pongan al día»*. Y quiere aviso cuando un cliente llega al tope. Hoy el
   campo se guarda pero **no bloquea nada**.
4. **Botón de añadir contacto DENTRO de la cotización**, no solo en la ficha.
   Su razón (6:20): *«los contactos cambian frecuentemente, no duran mucho,
   van rotando»*.
5. **Log de movimientos por producto.** Ya existe kardex; lo que pide es verlo
   desde la ficha del producto: qué ajuste, qué motivo, qué día.
6. **Buscador en los maestros** de familias/sub-familias/marcas dentro de
   configuración (en el alta de producto ya está).

### F · Lo que dejó zanjado

- **P.M. = precio mínimo.** Llevaba desde el 21/08 sin cerrar, con el
  importador avisando antes de aplicar. Él, 19:37: *«yo lo había tomado como
  precio de mercado (...) está bien, podría considerarse como precio mínimo
  también»*. Aviso del importador: se queda, pero ya sabemos la respuesta.
- **Todos los precios sin IGV.** *«Yo trabajo generalmente con precios sin IGV;
  el IGV ya es aparte, no me interesa»*.
- **Stock inicial**: sigue sin ponerse a mano en el alta. Entra por recepción
  o por ajuste, que es lo que él ya hace.
- **«Stock futuro»** para importaciones: lo mencioné yo como algo que hace otro
  cliente. Él no lo pidió. **No construirlo** hasta que lo pida.

---

### G · El plan de compras · propuesta escrita, pendiente de que Willy la corrija

**https://claude.ai/code/artifact/0ce92bb6-49bc-4dbd-927f-b3ca9e4df6da**

Es lo que él pidió (32:03): *«toma tu tiempo, a ver cómo diseñamos esto; yo le
muestro y usted mira, ah sí, o me dice cámbiale mejor esto por esto»*. Está
escrito para enseñárselo en pantalla y que lo corrija ANTES de construir.

Resumen de lo que dice, para no tener que abrirlo:

**Lo que ya existe** y solo hay que coser: cotización con stock a la vista,
registro de compras con recibido por línea, recepciones, y el kardex —que ya
mueve saldo, recalcula costo promedio ponderado y guarda `ultimo_costo` en cada
entrada—. La parte sólida del sistema es justo la del final de la cadena.

**Lo que falta**, por orden del flujo:

1. Columna **Disponibilidad** por ítem (Inmediata / Exterior 15 d /
   Fabricación 2–4 d), incluible o no en el PDF. **Es la misma pieza que el
   aviso de stock**: lo que se marque como no inmediato es lo que después cae
   en la bandeja de compras.
2. **Confirmar por línea.** Hoy una cotización se aprueba entera. Él dijo que
   le confirman *«el total o parte de lo cotizado»*, y sin esto no se puede
   calcular qué comprar.
3. Bandeja **Por comprar**: lo comprometido sin stock + lo que bajó del mínimo
   (esto último ya está calculado en `v_reposicion`, solo hay que enseñarlo).
4. El **comparador** de proveedores. Es lo único que hay que inventar.
   · **Hecho el 02/09**, §Q.
5. Botón **Recibir** desde la propia compra, y **aviso cuando el costo cambia**
   respecto de la compra anterior, con el efecto en el margen. Eso es el
   *«que haya historial y mejorar los precios»*.

**Cómo NO hacer el comparador:** un módulo de solicitud de cotización formal
que emita y mande documentos. Willy pregunta por WhatsApp y le contestan por
WhatsApp; obligarlo a redactar un documento por proveedor sería MÁS trabajo del
que hace hoy. Lo que necesita es una hoja donde apuntar lo que le dijeron, ver
quién gana, y convertir eso en compras de un botón. Y guardar **las tres
respuestas**, no solo la ganadora: eso es lo que construye el historial.

#### Los dos agujeros que salieron revisando el código

**1 · La compra local viene en soles y el sistema entero está en dólares.**

No hay columna `moneda` en ninguna tabla, y es deliberado: Willy cotiza y
factura en USD (002, línea 7). Pero él compra *«compras locales, generalmente»*
y un proveedor de Lima factura en soles con IGV.

Hoy no hay dónde ponerlo. Si alguien registra `S/ 15.20` en el campo de costo,
se guarda como `$ 15.20`: el costo queda inflado ~3.7×, el margen sale negativo
y el inventario valorizado deja de significar nada. Y no salta ningún error.

`packages/consultas/src/tipo-cambio.ts` **ya existe, está probado y no lo llama
nadie** — comprobado con grep sobre `apps/web/src`. Falta añadir moneda y tipo
de cambio a `compras` y conectarlo.

**2 · Dos pedidos se pueden comer el mismo stock.**

`stock.reservado` existe en el esquema desde la 002 y `v_productos_stock` ya
calcula `disponible = cantidad - reservado`. **Nadie escribe nunca en
`reservado`.** Así que dos cotizaciones aprobadas del mismo producto ven las
mismas unidades libres.

No es un fallo a arreglar en silencio: es una decisión de Willy —*¿confirmar
un pedido aparta la mercadería?*—. La columna ya está lista para el día que
diga que sí.

#### Las cinco preguntas para él

Reserva de stock al confirmar · moneda de la compra local · si el comparador es
obligatorio u opcional · si el sistema avisa al cliente cuando llega su pedido ·
y el plazo por defecto de la compra local (dio 15 días para exterior y 2–4 para
fabricación, pero no el de local, que es la más frecuente).

#### Orden de construcción propuesto

| | Qué | Por qué ahí |
|---|---|---|
| **1** | Disponibilidad · confirmar por línea · moneda · botón Recibir | Deja la cadena entera cerrada de punta a punta |
| **2** | Bandeja Por comprar · reserva · enlace compra↔pedido · aviso de costo | Aquí deja de ser un cuaderno y empieza a avisar |
| **3** | ~~El comparador y el historial por proveedor~~ · **hecho el 02/09** (§Q) | Es lo único que no existe, y necesita la bandeja del 2 |

#### Lo que NO se construye, y por qué

- **Stock futuro** — lo mencioné yo, no lo pidió él. Cotizar contra mercadería
  que está en un barco es prometer lo que no se puede entregar.
- **Landed cost prorrateado** — sus importaciones son cajas por DHL, no
  contenedores con DUA. El registro simple de gastos que ya existe basta.
- **Aprobación de órdenes de compra** — compra él solo.

---

### H · Bloque 1 del plan de compras · HECHO el 01/09

Lo que no dependía de ninguna de las cinco preguntas a Willy. Migraciones 040
a 044.

| | Estado |
|---|---|
| Columna **Disponibilidad** por ítem (inmediata / exterior 15 d / fabricación 3 d) | ✅ con su casilla para imprimir o no |
| **Confirmar por línea** al aprobar una cotización | ✅ diálogo «¿Qué te confirmó el cliente?» |
| **Moneda y tipo de cambio** en la compra | ✅ con el tipo de cambio de SUNAT en un botón |
| Botón **Recibir** desde la compra | ✅ **ya existía** — ver abajo |

#### Lo que me había equivocado al listar

En el plan puse el botón «Recibir desde la compra» como pendiente. **No lo
estaba.** `pagina-detalle.tsx` de compras ya tenía el enlace a
`/recepciones/nueva?compra=<id>`, la pantalla de recepción ya leía ese
parámetro y el constructor ya precargaba las líneas que faltaban por llegar.
Estaba completo desde antes.

Lo que sí faltaba, y se hizo, es que la recepción **diga en qué moneda** están
los costos que precarga. La conversión la hace la base sola, así que ningún
número cambia — pero sin decirlo, quien recibe lee «15.20» en la columna de
costo, entiende dólares, y «corregiría» un número que estaba bien.

#### El tipo de cambio: un paquete que llevaba meses escrito sin usarse

`packages/consultas/src/tipo-cambio.ts` estaba construido, probado y con su
caché desde el principio del proyecto. **Cero llamadas desde la aplicación** —
comprobado con grep sobre `apps/web/src`. Se escribió para un caso que no
llegó, porque el sistema vende siempre en dólares.

Ahora lo usa el botón «SUNAT» del registro de compra. Probado en pantalla el
01/09: devolvió compra 3.357 · venta 3.367 y rellenó el campo con el de venta,
que es el que se paga al comprar dólares para pagar la factura.

#### Prueba de punta a punta contra la base del cliente

Compra en soles → recepción → kardex, que es donde estaba el agujero:

```
compra    CMP-26-00003 · 10 u a S/ 15.20 · TC 3.7520 · subtotal S/ 152.00
recepción REC-26-00001 · hereda PEN y 3.7520 de la compra
kardex    costo_unitario 4.0512   ← el arreglo. Antes habría entrado 15.2000
productos ultimo_costo 4.0512 · costo_promedio 4.0512
```

El subtotal de la compra se queda en **soles** a propósito: es la cifra que se
cuadra contra la factura del proveedor, y una factura en soles se cuadra en
soles. La conversión ocurre una sola vez, en `recepcionar_mercaderia`, que es
la única puerta por la que entra stock.

Todo borrado después. Censo: 0 compras, 0 recepciones, 0 proveedores, 790
productos, 37 clientes — como estaba.

#### Detalles que conviene recordar

- **La columna de disponibilidad se ve SIEMPRE en el constructor**, aunque no
  se imprima. La casilla decide si sale en el PDF, no si el dato existe: el
  dato es de donde va a salir la bandeja «Por comprar».
- **Prometer «inmediata» sin stock avisa pero NO bloquea.** Willy consigue en
  el día casi todo lo que no tiene; suponer «exterior» porque el almacén está
  en cero sería equivocarse casi siempre.
- **La confirmación parte de CERO** cuando llega detalle. Al revés —dejar lo no
  mencionado en su cantidad— una línea que se olvidara de listar se daría por
  vendida en silencio, que es el fallo que la 041 viene a arreglar.
- **`cantidad_aprobada` nace en null**, y null es «todavía no ha contestado».
  No se puede usar 0 para eso: 0 es una respuesta —«esta no la quiero»— y las
  dos llevan a acciones opuestas.
- **La unidad de medida NO se inventa** (039) y **la moneda tampoco se
  adivina** (042): `a_dolares` FALLA si le falta el tipo de cambio en vez de
  devolver el monto sin convertir. Devolverlo era exactamente el fallo.

#### Falta antes de dar el bloque por cerrado

- ~~La bandeja «Por comprar» no tiene pantalla~~ · **hecha el 02/09**, §I.
- La **aprobación parcial no reserva stock**: sigue pendiente de que Willy
  decida si confirmar un pedido aparta la mercadería (pregunta 1 de §G).

#### Un dato de prueba que quedó en la base del cliente

Hay un movimiento de inventario `AJU-26-00001`, «Conteo de prueba», de 20
unidades del producto `0-230`, del 01/09. **No es mío** — salió de la demo en
vivo de la reunión de ese día. Conviene borrarlo antes de que Willy empiece a
operar de verdad, o su primer inventario arrancará con 20 unidades que no
existen.

---

### I · La bandeja «Por comprar» · HECHA el 02/09

La primera pantalla del bloque 2, y la que responde a la frase con la que
Willy describió su problema (01/09): *«si no tiene, que en compras le avise
que no tiene y tiene que pedir o comprar a sus proveedores»*.

Está en **Abastecimiento → Por comprar**, antes que «Compras» a propósito: él
no abre el ERP para registrar una compra, lo abre para saber qué le falta.

#### El fallo que apareció al construirla

`v_comprometido` (041) trae un `falta` por línea, y es correcto para lo que
esa vista responde. **Pero sumarlo da un número equivocado**, porque cada
línea mira el stock entero como si fuera solo para ella:

    stock 10 · el cliente A confirmó 10 · el cliente B confirmó 10
      falta de A = 0    falta de B = 0    suma = 0
      y hay que comprar 10.

Verificado contra la base real con dos cotizaciones de prueba: la vista decía
2 y 2 sobre un producto con 4 en almacén y 12 comprometidas. Lo que hay que
comprar son **8**.

El reparto se hace ahora una sola vez por producto, en
`modules/compras/dominio/por-comprar.ts`, con 27 pruebas. **El stock que hay
se le da entero al que confirmó primero**, desempatando por número de
cotización: repartir 2 y 2 entre dos clientes deja a los dos sin poder
entregar, que es peor que servir a uno.

#### Lo que la bandeja descuenta

| | |
|---|---|
| Lo confirmado por los clientes | `v_comprometido` · 041 |
| Menos lo que hay en almacén | repartido por orden de confirmación |
| Menos **lo que ya está pedido** al proveedor | `v_pedido_pendiente` · **045, nueva** |

Sin lo tercero la bandeja repite el mismo consejo cada día hasta que llega la
mercadería, y quien lo sigue compra dos veces. `pendiente_de_recibir` (044) no
servía: responde *por compra*, y aquí hay que preguntar *por producto* y sumar
todas las compras abiertas a la vez.

#### De la bandeja a la compra, sin volver a teclear

Cada fila lleva un botón **Comprar**, y se pueden marcar varias y registrarlas
juntas. Va por la URL —`/compras/nueva?items=<producto>:<cantidad>,…`— y los
ids se resuelven contra el maestro en el servidor: nada de lo que venga en la
dirección se cree.

#### Lo que se arregló de paso: el menú encendía dos ítems

Con `/compras` y `/compras/por-comprar` en la misma lista, la barra lateral
marcaba los dos. **Ya pasaba antes** con `/inventario` contra
`/inventario/kardex` y con `/productos` contra `/productos/cargar`; se ve
raro pero nadie lo había mirado. Ahora gana el más específico
(`rutaActiva()` en `lib/navegacion.ts`, con pruebas que recorren el menú
entero y comprueban que ninguna ruta enciende a otra).

#### El agujero que queda, y no es pequeño

**Facturar parte de una cotización la saca entera de la bandeja.**
`emitir_comprobante` pone la cotización en `atendida` en cuanto se le emite un
comprobante, sin mirar cuánto se entregó. Si el cliente confirmó 6 y se le
facturan 4, las 2 que faltan **desaparecen** de «Por comprar» y de cualquier
sitio que mire lo comprometido.

Hoy no hace daño porque no hay ninguna cotización viva en la base. Arreglarlo
pide una columna `cantidad_atendida` en `cotizacion_items` y que la vista
reste contra ella en vez de contra el estado de la cabecera. **Antes de que
Willy empiece a facturar de verdad.**

#### Y lo que sigue esperando a Willy

La bandeja **no aparta mercadería**. Reparte para poder decir cuánto comprar y
a quién avisar, pero mientras `stock.reservado` siga sin usarse nada impide
facturarle antes al segundo. Es la pregunta 1 de las cinco de §G, y está
escrita al pie de la propia pantalla para que quien la use no se confunda.

#### Probado contra la base del cliente, y devuelto a como estaba

Dos clientes de prueba, dos cotizaciones aprobadas, una compra abierta. La
pantalla dio 8 y 5 donde tenía que dar 8 y 5, el traspaso a la compra llegó
con las cantidades y el stock correctos, y después se borró todo. Censo final:
37 clientes · 790 productos · 0 proveedores · 0 compras · 0 recepciones · 0
cotizaciones · 1 fila de stock (la del ajuste de la demo). **También se
devolvieron los correlativos consumidos** (CMP 8→7, COT1 4→2): si no, la
primera compra de Willy arrancaría en un número que no le corresponde.

---

### J · Su lista de clientes y proveedores · CARGADA el 02/09

Willy mandó `LISTA DE CLIENTES Y PROVEEDORES.xlsx`: dos hojas, 100 clientes y
103 proveedores, con razón social, RUC, condición y la dirección tal como la
devuelve SUNAT.

**Es lo que desbloquea el módulo de compras.** Hasta hoy `proveedores` estaba
a cero, y sin proveedor no se puede registrar una compra ni recibir nada: la
pantalla de alta enseñaba un cartel diciendo justo eso.

| | Antes | Ahora |
|---|---|---|
| `clientes` | 37 | **97** |
| `proveedores` | 0 | **97** |
| Clientes con ubigeo | **0** | 96 |
| Proveedores con ubigeo | — | 94 |

Se carga con `node scripts/importar-clientes-proveedores.mjs`. Sin
`--aplicar` solo informa; es idempotente, volver a lanzarlo no hace nada.

#### Por qué es un script y no una migración

Son 203 filas con los datos comerciales reales de Rodatech. `documentosrodamiento/`
está en `.gitignore` justo por eso, y una migración con esas filas dentro las
metería en el repositorio para siempre. El precio —que no se aplique sola al
levantar una base nueva— es el correcto.

#### El ubigeo, que es lo que más valor añadió

Las direcciones de SUNAT terminan en «… DISTRITO - PROVINCIA - DEPARTAMENTO»
y **nadie lo había resuelto nunca**: los 37 clientes que ya estaban tenían
`ubigeo_codigo` en null desde la carga del 28/08. Hace falta para la guía de
remisión electrónica, que sin el ubigeo del punto de llegada no se emite.

Se resolvieron 200 de 203 contra el padrón (037). Hicieron falta dos cosas que
no son obvias:

- **«PROV. CONST. DEL CALLAO»**, que es como lo escribe SUNAT, contra
  «Callao», que es como está en el padrón. Son 10 direcciones.
- El distrito **no se puede cortar por el último punto**: hay direcciones con
  numeración tipo «NRO. 441 - 447)» que meten puntos y guiones por medio. Se
  busca qué distrito de esa provincia termina la cadena, y gana el más largo,
  para que «SAN JUAN DE LURIGANCHO» no se lea como «SAN JUAN».

Los tres que no salieron: **RG CORPORATION** (su dirección no trae distrito),
**FORUN TRANSMISSION** (Shanghái, no tiene ubigeo peruano) y **PISCOCHI
BARRIOS JAIDER GLICERIO** (su dirección es literalmente «-. - -»).

#### Lo que el archivo traía mal, y qué se hizo

- **9 filas repetidas** (4 clientes, 5 proveedores; R & C HIDRAULICA está tres
  veces). Se queda la primera, que es la que Willy escribió antes; las otras
  suelen ser el mismo nombre peor escrito.
- **RG CORPORATION S.A.C. tiene un RUC que no valida**: `10465742185`.
  Empieza por 10 —persona natural— siendo una S.A.C., y falla el dígito
  verificador. **No se inventó nada**: entró como `SIN_DOC` con el número
  anotado en `notas`. **Hay que preguntárselo a Willy**, y hasta entonces no
  se le puede emitir ni recibir un comprobante.
- **FORUN TRANSMISSION CO., LIMITED viene sin documento.** Es correcto: es de
  Shanghái. Entró como `SIN_DOC`, tipo *importación*, país *Exterior* y
  `lead_time` de 15 días, el mismo plazo que la cotización usa para
  «exterior» (040).

#### Una cosa que conviene saber

**BEARING COMPANY S.A.C. está en las dos tablas.** Era el único cliente del
histórico que no aparece en la hoja de clientes de Willy —él lo tiene como
proveedor— pero tiene una factura emitida en enero de 2025 por $158.84. Se
queda de cliente y además se dio de alta de proveedor. No es un error: en este
rubro se compra y se vende al mismo distribuidor.

#### Lo que el Excel NO trae, y hace falta preguntarle a Willy

1. **Qué marcas trae cada proveedor.** La tabla `proveedor_marcas` existe y
   está vacía. Sin ella el comparador —el siguiente paso del plan de compras—
   no puede sugerir *a quién* pedirle un SKF.
2. **Condiciones de pago.** Los 97 quedaron en «contado» (`dias_pago` 0), que
   es el valor por defecto de la tabla. Es lo prudente, pero seguro que con
   varios tiene crédito.
3. **Teléfonos, correos y personas de contacto.** Ni de clientes ni de
   proveedores. Sin el correo del proveedor, «mandarle la solicitud a cuatro»
   sigue siendo trabajo manual.
4. **Cuál es el RUC bueno de RG CORPORATION.**

---

### K · Qué vende cada proveedor · HECHO el 02/09

Luis, 02/09: *«el proveedor no tiene qué marca o productos vende; aparte que
pueda editar también cuando va a comprar o cotizar esa compra, ahí también
pueda nutrir el sistema, o sea poner qué productos vende. La cosa es
ayudar»*.

El ERP no sabía contestar la pregunta con la que empieza cualquier compra:
**¿a quién le pido esto?** Tenía `proveedor_marcas` desde la 002 —con editor
y todo, pero vacía— y `productos.proveedor_id` (025), que es el proveedor
habitual: uno solo, y en el sentido contrario.

#### La decisión: que no haya que teclearlo

Un maestro que hay que mantener a mano no se mantiene. Sentar a Willy a
escribir qué vende cada uno de sus 97 proveedores es pedirle algo que no va a
pasar.

Pero **él ya lo dice cada vez que registra una compra**. Comprarle diez
rodamientos a Bearing Company ES la afirmación «Bearing Company vende esto, de
esta marca, y la última vez me lo dejó a tanto». Ahora lo apunta un disparador
sobre `compra_items`, por sentencia y no por fila, así que vale para
cualquier camino por el que se cree una compra —hoy y el día que haya otro.

**La marca se rellena sola** con la del producto comprado. Era la mitad del
problema: el filtro «vende la marca» del listado llevaba desde la 002 sin nada
que filtrar.

Y **la recepción corrige el costo**: lo que se pactó al comprar y lo que acaba
diciendo la factura no siempre coinciden, y para comparar proveedores manda lo
segundo. No cuenta como una compra más, es la misma.

#### Lo que se ve

| Dónde | Qué |
|---|---|
| Ficha del proveedor | **«Qué vende»** — productos, cuántas compras lleva cada uno, cuándo fue la última y a cuánto |
| Ficha del producto | **«Quién lo vende»** — proveedores del más barato al más caro, en dólares |

El costo se guarda **en las dos monedas**: en la suya porque es la cifra que
Willy reconoce cuando llama a preguntar, y en dólares porque es la única con
la que se puede comparar a dos proveedores entre sí.

#### La puerta manual, y lo que no deja hacer

Se pueden añadir productos a mano desde la ficha del proveedor, para lo que
todavía NO se le ha comprado: «me pasó su lista de precios de FAG». Eso la
base no puede saberlo.

Pero **lo comprado no se puede quitar**. La regla vive en el RPC, no en la
pantalla: quitarlo dejaría la ficha diciendo que no lo vende mientras el
kardex dice que lo trajo él. El botón ni siquiera aparece en esas filas.

Y una declaración a mano **no pisa un costo real**. Una compra sí pisa lo
declarado: es un hecho contra una intención.

#### Un fallo que esto provocó, y que se vio a tiempo

Añadir la tabla **rompió la ficha del producto**. Al haber tres caminos entre
`productos` y `proveedores` —la columna del proveedor habitual, la tabla
nueva y su vista— PostgREST se niega a elegir uno y devuelve `PGRST201`: la
pantalla entera dejaba de abrir con un error incomprensible.

Se arregla nombrando la clave foránea en el `select`
(`proveedores!productos_proveedor_id_fkey`). **Conviene recordarlo**: cada
tabla nueva que apunte a dos que ya se cruzan puede romper una consulta que
llevaba meses funcionando, y no lo dice ningún tipo ni ninguna prueba — solo
abrir la pantalla.

#### Lo siguiente que se apoya en esto

El **comparador de proveedores** (§G paso 5). Ya tiene a quién preguntar: con
esta tabla, la bandeja «Por comprar» puede decir «para este código tienes tres
proveedores, y el más barato la última vez fue este». Es el último paso del
plan de compras que queda por construir.

---

### L · Una cotización se puede facturar por partes · HECHO el 02/09

El agujero que se documentó en §I, y que resultó ser **dos**, y el primero
peor que el que iba a buscar.

#### 1 · La factura cobraba lo COTIZADO, no lo confirmado

Desde la 041 el cliente puede confirmar parte: «de las 6 me quedo con 4». La
bandeja de compras ya lo respetaba. **La emisión no**: facturaba `cantidad`,
así que al cliente que confirmó 4 se le emitía un comprobante por 6, se le
descargaban 6 del almacén y se le cobraban 6. Con un número de serie fiscal
encima, y sin que saltara nada.

#### 2 · Y la cotización se cerraba entera

`emitir_comprobante` la ponía en `atendida` con cualquier comprobante, sin
mirar cuánto se había entregado. Como la bandeja solo mira las `aprobada`, **lo
no entregado desaparecía** de «Por comprar» y de cualquier sitio donde se
pudiera ver que a ese cliente se le debe algo.

#### Cómo quedó

Una columna `cotizacion_items.cantidad_atendida` cuenta lo ya facturado, y el
cierre de la cotización pasa a ser una consecuencia —«no queda nada
pendiente»— en vez de un efecto secundario de emitir.

El techo es un **check en la base**: `cantidad_atendida <= coalesce(cantidad_
aprobada, cantidad)`. No se le puede facturar a nadie más de lo que confirmó,
aunque alguien llame al RPC por su cuenta.

Y ahora se puede facturar **una parte de lo confirmado**, que es el caso real
de Willy: el cliente confirma 6, hay 4 en almacén, se le entregan 4 ahora y 2
cuando llegue la compra. La cantidad de cada línea es editable en el emisor,
con techo en lo pendiente; **los precios siguen sin poder tocarse**, y el
servidor vuelve a recortar la cantidad contra lo que él calcula, así que desde
el navegador solo se puede pedir MENOS.

#### Probado en la pantalla, no solo en SQL

    cotiza 6 · el cliente confirma 4
    factura 1 →  2 uds · $118 · la cotización sigue «aprobada» · la bandeja ve 2
    factura 2 →  2 uds · $118 · pasa a «atendida» · sale de la bandeja
    total facturado $236 = 4 × 50 × 1.18   (antes habría sido $354, por 6)

#### Tres cosas que aparecieron por el camino

- **El cronograma de cuotas usaba el total de la COTIZACIÓN.** Con una factura
  parcial no cuadra con el comprobante, y `emitir_comprobante` aborta la
  emisión entera con un error que no le dice nada a nadie. Ahora se calcula
  sobre lo que se emite.
- **El desplegable de «qué facturar» escondía la segunda mitad.** Excluía toda
  cotización que ya tuviera un comprobante —para no facturar dos veces— así
  que las 2 unidades que quedaban vivas no había forma de emitirlas. Lo que
  impide facturar de más ahora es `cantidad_atendida`, que es exacto; el
  desplegable enseña lo PENDIENTE, y en su importe.
- **El centinela de la migración gastaba dos correlativos de F001**, que es
  una serie fiscal. Un salto ahí no es un número feo, es un hueco que SUNAT
  pregunta — y esta migración se puede reaplicar. Ahora los devuelve.

#### La técnica del parche, por si hace falta otra vez

`emitir_comprobante` tiene 195 líneas y solo cambiaban cuatro. Se reescribe
**sobre la definición que haya en la base** (`pg_get_functiondef` +
`regexp_replace`), como ya hacía la 018, en vez de copiar la función entera en
una migración nueva: copiarla la duplicaría, y a la siguiente vez que alguien
tocara la 004 las dos versiones se separarían sin que nadie lo notara.

El patrón va con `s+` y no con texto literal: el cuerpo guardado en la base
lleva los saltos de línea con los que se aplicó la 004 —CRLF— y un
`position()` con saltos simples no encuentra nada.

---

### M · Pedir precio por WhatsApp, con mensajes que él escribe · HECHO el 02/09

Luis, 02/09: *«ya teniendo los proveedores sus números de celular, ayudar a él
en compras a mandar a su WhatsApp para preguntar los precios»*, con *«mensajes
predeterminados que puede crear»*.

Es el paso 5 del plan de compras —*«manda a sus proveedores a ver cuál es más
barato»*— y la mitad que le faltaba al comparador.

#### Cómo funciona

Desde la bandeja «Por comprar» se marca lo que falta y se pulsa **Pedir
precio**. La pantalla llega con la lista puesta —el mismo `?items=` con el que
se llega al registro de compra— propone los proveedores que ya venden algo de
eso (lo aprendido en §K) y genera un mensaje por cada uno. Botón de WhatsApp,
de correo y de copiar.

**No manda nada solo, y no debería.** El envío automático es la Cloud API de
Meta: número dedicado, verificación del negocio, plantillas aprobadas por Meta
y **pago por conversación**, más el riesgo de que baneen el número por escribir
en masa a quien no ha escrito. Para pedirle precio a cuatro proveedores
conocidos no compensa. Lo que ahorra esto no es el envío: es **no teclear
quince códigos cuatro veces**, y que a los cuatro les llegue la misma lista.

#### Los mensajes los escribe él

Tabla `plantillas_mensaje` (migración 049), editable en **Configuración →
Mensajes que se mandan**. Las variables van entre llaves —`{proveedor}`,
`{items}`, `{empresa}`, `{yo}`, `{fecha}`— y se pulsan para insertarlas donde
está el cursor. Hay vista previa con datos de ejemplo.

Va en una tabla y no en el código porque **la forma de pedir precio en este
rubro no la sabe quien programa**. Dejarlo en el código convierte cada cambio
de una coma en un despliegue.

Vienen dos escritas para que no arranque en blanco, una de WhatsApp y otra de
correo. Están para que él las corrija.

#### Decisiones que conviene recordar

- **Una variable mal escrita se manda TAL CUAL, no se borra.** Un hueco en
  blanco no se ve al revisar y sí lo ve el proveedor. Así el `{provedor}` sale
  en la vista previa, que es donde tiene que verse — y además se avisa.
- **El tope de la plantilla es 3.000 y el de WhatsApp 4.096.** El margen es
  para lo que crece al sustituir: `{items}` son ocho caracteres en la plantilla
  y trescientos en el mensaje. WhatsApp corta por el FINAL, que es justo donde
  va la lista de códigos.
- **Nada de puntos después de `{proveedor}` ni de `{empresa}`.** Casi toda
  razón social peruana ya termina en uno: «BEARING COMPANY S.A.C..» salía con
  dos, y se vio en la vista previa antes de que lo viera un proveedor.

#### Lo que lo tiene a medias

**Los 97 proveedores están sin un solo teléfono ni correo.** El Excel del 02/09
no los traía (§J). La pantalla los enseña igual, con el botón de copiar y
diciendo que le falta el número, con enlace a su ficha — pero **sin contactos
esto sirve a medias, y con ellos sirve entero**. Es lo que más valor tiene de
todo lo que espera a Willy.

Dos formas de arreglarlo que valen la pena:

1. Que se **capturen solos**: al registrar una compra, si ese proveedor no
   tiene WhatsApp, pedirlo ahí. Es la misma idea de §K.
2. Que él mande la lista con los números, que es un rato de copiar y pegar.

#### Un fallo que solo se ve abriendo la pantalla

Un componente de cliente importaba `@/modules/mensajes`, y ese índice
reexporta su `api/`, que es `server-only`. Next falla al construir con
*«You're importing a component that needs server-only»*.

**No lo caza el typecheck ni el lint.** El arreglo es importar por la ruta
profunda —`@/modules/mensajes/dominio/enlaces`— que es lo que ya hacía el
constructor de compras con el buscador de proveedores. Y el TIPO tampoco puede
venir del índice: se movió `Plantilla` al dominio, que además es su sitio.

---

### N · Los costos se rellenan solos al elegir proveedor · HECHO el 02/09

Mirando el flujo entero con el pedido ya dentro, el trozo que más trabajo
manual tenía era el más tonto: **el sistema ya sabía lo que ese proveedor había
cobrado la última vez y lo enseñaba debajo del campo, pero había que teclearlo
igual.** Con cinco líneas eso son cinco números copiados de un sitio a otro de
la misma pantalla.

Ahora al elegir proveedor se rellenan.

    antes   elegir proveedor · teclear 5 costos · moneda · guardar
    ahora   elegir proveedor · moneda · guardar

#### La regla, que es lo único delicado

Cada línea sabe si su costo lo puso **el sistema** o **una persona**
(`costoPropuesto`). Al elegir proveedor se pisan solo las propuestas.

**Lo tecleado no se toca, ni aunque se cambie de proveedor.** Puede haber
escrito el precio que le acaban de dar por teléfono, y ese manda sobre
cualquier histórico. Un número propuesto es una ayuda; uno escrito es una
decisión, y una decisión no se pisa sola.

Y se dice de dónde salió: debajo del campo pone «**de** CMP-26-00008: 7.2500»
cuando lo puso el sistema, y solo «CMP-26-00008: 7.2500» cuando el número de
arriba lo escribió alguien. Un costo propuesto no es un costo pactado.

#### Comprobado en pantalla

Con una compra previa a BEARING COMPANY: al elegirlo, las dos líneas pasaron
de 0 a 7.25 y 19.90, el total se calculó solo, **desapareció el aviso de «se
está comprando a costo cero»** y el botón de guardar se encendió.

#### Lo que sigue costando trabajo, por orden

1. **Las respuestas de precio no se guardan.** Se le pide a cuatro (§M) y las
   contestaciones se comparan de memoria o en un papel. Es el comparador, y
   depende de la pregunta 3 a Willy.
2. **El proveedor todavía se elige a mano.** El sistema ya sabe quién vende
   cada cosa y a cuánto la dejó (§K): podría proponerlo, sobre todo cuando
   todas las líneas las vende el mismo.
3. **Una compra por proveedor.** Si en la bandeja marca diez productos y son de
   dos proveedores, hoy tiene que hacer dos compras eligiendo a mano cuáles van
   en cada una.
4. **La compra no lleva el porqué.** Cuando llega la mercadería, quien recibe
   no ve que esas 8 unidades son para MINERA X, prometidas el 12/09. Podría
   viajar en las observaciones desde la bandeja.

---

### Ñ · La compra se propone sola, y lleva su porqué · HECHO el 02/09

Segunda pasada sobre «hacerle la compra fácil cuando el pedido ya está
dentro». Dos cosas que el sistema ya sabía y no decía.

#### A quién comprárselo

Encima del buscador de proveedor salen ahora los que **ya venden lo que se
está comprando**, con «2 de 3» al lado. Un clic y queda elegido —y como
elegirlo dispara el relleno de costos (§N), ese mismo clic deja la compra
lista.

    de la bandeja a una compra lista:  «Comprar» + un clic

Van **encima** del buscador y no debajo. Debajo estaban primero, y el panel de
resultados los tapaba en cuanto se pulsaba el campo: el atajo desaparecía
justo cuando se iba a usar.

#### Para quién es

La compra que nace de la bandeja tiene un motivo —alguien confirmó y espera— y
ese motivo se perdía. Ahora la pantalla lo enseña (cliente, cotización, qué
códigos y para cuándo) y **lo escribe en las observaciones**, que es lo que
lee quien recibe la mercadería días después.

No hace falta pasarlo por la URL: con los productos basta, porque
`v_comprometido` sabe quién espera cada uno.

#### El fallo del día, que merece quedar escrito

Al pulsar el botón del proveedor, **la pantalla se cayó entera**:
`Cannot read properties of undefined (reading 'length')`.

Yo le había pasado al selector media ficha —solo id y razón social— con un
`as ProveedorOpcion`. El selector fue a contar las marcas del elegido y no
había ninguna lista que contar.

**El `as` no arregla nada: apaga el aviso.** Lo escribí para no tener que
traer la ficha completa, y el resultado fue una pantalla rota en el primer
clic. Se arregla con lo que había que hacer desde el principio: traer la ficha
de verdad (`proveedores_por_id`, migración 050), cuyo centinela comprueba que
devuelve **exactamente las mismas columnas** que `proveedores_sugeridos` — si
un día se separan, la migración no aplica y el selector no vuelve a recibir
media ficha.

Y si por lo que sea no se consigue la ficha, **el botón no se ofrece**. Es
mejor no proponer que proponer algo que al pulsarlo rompe la pantalla.

#### Cómo está el flujo hoy, de punta a punta

    cotiza → el cliente confirma (todo o parte)
      → la bandeja dice qué falta, para quién y para cuándo
      → «Pedir precio» manda el mismo WhatsApp a varios
      → «Comprar» llega con líneas, cantidades, proveedor propuesto,
        costos rellenos y el porqué escrito
      → recibir mueve el kardex, convierte la moneda y actualiza el inventario
      → se factura entero o en partes

#### Lo que sigue costando trabajo

1. **Las respuestas de precio no se guardan** (el comparador). Depende de la
   pregunta 3 a Willy.
2. ~~**Una compra por proveedor.**~~ · **hecho el 02/09**, §O: la bandeja
   reparte lo marcado y saca un botón por proveedor.

---

### O · La bandeja reparte la compra por proveedor · HECHO el 02/09

Lo último del bloque que no dependía de nadie. Una compra es de UN proveedor:
si en la bandeja se marcan diez productos y son de dos, había que separarlos a
mano y adivinar cuál iba en cada compra.

Ahora, al marcar, la barra dice:

    2 productos marcados · aproximadamente $ 280.00
    Son de 2 proveedores distintos, así que van en 2 compras.
    Cada botón lleva lo suyo.
    [ B.C. BEARING PERU S.R.L.  1 producto ]  [ BEARING COMPANY S.A.C.  1 producto ]

Y cada botón abre la compra **con su proveedor ya elegido**, solo con sus
productos y con los costos rellenos. De la bandeja a una compra guardable: un
clic.

#### La regla del reparto, y lo que NO hace

Cada producto va **al que lo dejó más barato la última vez**, en dólares.
Empata el que más veces lo ha vendido, y después el nombre — el orden tiene
que ser siempre el mismo, o la pantalla repartiría distinto entre dos cargas.

**No busca «el proveedor que cubra más productos».** Sería una optimización
bonita y una recomendación mala: agrupar por comodidad puede mandar a
comprarle caro a alguien para ahorrarse una llamada, y eso lo decide Willy, no
un algoritmo. Aquí solo se propone lo barato y se deja mover.

Un producto que no consta que venda nadie **no se esconde**: cae en su propio
grupo, «Sin proveedor conocido», que se compra eligiendo a mano. Es justo el
que hay que salir a buscar.

#### Comprobado con dos proveedores de verdad

    *VS-190*    BEARING $30 · B.C. $45   → va a BEARING
    1030H-T10   solo B.C. $12            → va a B.C.

Marcados los dos, salieron dos botones con un producto cada uno; el de BEARING
abrió la compra con su ficha puesta, el costo en 30 y el total en $106.20.

#### Con esto, el flujo de compras queda cerrado salvo el comparador

    cotiza → confirma (todo o parte)
      → la bandeja: qué falta, para quién, para cuándo, y ya repartido
      → «Pedir precio»: el mismo WhatsApp a varios
      → «Comprar»: un clic por proveedor, todo relleno
      → recibir: kardex, moneda y inventario
      → facturar: entero o en partes

Lo único que falta del plan es **el comparador** —guardar lo que contesta cada
proveedor para poder elegir— y sigue esperando la pregunta 3 a Willy: si es
obligatorio o va al lado. Con los teléfonos de los proveedores (§J) y esa
respuesta, se cierra.

---

### P · El aviso de cambio de costo al recibir · HECHO el 02/09

El paso 7 del plan de compras, y lo último que quedaba de él salvo el
comparador. Willy, 01/09: *«sería bueno poner el último precio que compra, así
con el precio anterior haiga historial y mejorar los precios»*.

Al recibir mercadería, el panel de la derecha dice ahora qué le hace ese costo
al negocio:

    QUÉ PASA CON EL PRECIO
    *VS-190*
    Traerlo cuesta más que el precio mínimo que tienes fijado.
    Hay que subir el precio antes de volver a venderlo.
    La vez anterior fue REC-26-00002, a $10.0000

#### No es el aviso que ya había

El constructor tenía uno que salta con un salto del 50 %, y sirve para **cazar
un decimal mal puesto**. Este contesta otra pregunta: **si el costo subió,
¿todavía gano lo mismo?** Por eso van en bloques distintos.

#### Las decisiones

- **El margen se mide sobre el COSTO**, igual que en cotizaciones y que
  `margen_objetivo_pct`. Dos definiciones de margen en el mismo sistema serían
  dos respuestas a la única pregunta que importa.
- **Se compara en dólares.** El histórico está en dólares desde la 042; una
  compra en soles comparada sin convertir daría un «subió un 275 %» que no es
  verdad. Y si falta el tipo de cambio, **no se dice nada**: callarse es mejor
  que comparar mal.
- **El umbral es del 10 %.** Un 5 % es ruido del tipo de cambio y de los
  redondeos; avisar de eso convierte el panel en algo que se ignora.
- **También avisa cuando BAJA.** Enterarse de que algo salió más barato sirve
  para bajar el precio antes que la competencia.
- **Un precio mínimo en cero NO es un piso de cero**: es que nadie lo fijó.
  Tratarlo como piso marcaría en rojo medio catálogo — el maestro de Willy
  llegó sin precios.
- **NO bloquea.** La factura ya está firmada y el costo es el que es. Lo que se
  decide después es el precio de venta, no si se recibe.

#### Probado con el ciclo entero

Compra a $10 → recepción → compra a $13 → al abrir la segunda recepción, el
panel salió en rojo diciendo que traerlo cuesta más que el piso de $11, y con
el documento y el costo de la vez anterior al lado.

---

### Q · El comparador de proveedores · HECHO el 02/09

El paso 5 del plan de compras, y lo que el propio plan llamaba **«lo único que
hay que inventar de cero»**. Con esto, el bloque 3 —y el plan entero salvo lo
que depende de las respuestas de Willy— queda cerrado.

Está en **Abastecimiento → Precios**, entre «Por comprar» y «Compras», que es
donde cae en el flujo: se ve qué falta, se pregunta el precio, y de ahí sale la
compra.

#### El ciclo completo, y dónde estaba roto

    Por comprar → Pedir precio → [WhatsApp] → Precios → una compra por proveedor

«Pedir precio» ya existía (§M) pero **no guardaba nada**: generaba los textos y
ahí se acababa. Una ronda de precios dura días —se pregunta el lunes, uno
contesta el lunes, otro el miércoles y el tercero no contesta nunca— así que lo
apuntado el lunes se perdía. Ahora hay un botón, «Anotar la consulta», que abre
la ronda y lleva a la rejilla.

Es un botón y no algo que pase solo al abrir WhatsApp, por dos motivos:
preguntar de paso —«oye, ¿cuánto el 6205?»— no merece un documento, y el envío
lo hace el navegador, así que desde el servidor no hay forma de saber si de
verdad se mandó.

#### Comparar dos precios que no se pueden comparar

Uno contesta «S/ 37.00 puesto» y otro «$ 9.00 más IGV». El primero parece
cuatro veces más caro y es el barato. Hay dos conversiones de por medio: la
moneda y el IGV, que en Perú va dentro o fuera según a quién le preguntes.

Todo se lleva a **dólares sin IGV**, que es la unidad en la que piensa el resto
del sistema (`compra_items.costo_unitario` es neto y el kardex va en dólares,
042). Las dos preguntas de la cabecera —moneda y «¿traía el IGV?»— se hacen una
vez por proveedor y valen para todas sus líneas, que es como contestan.

La conversión sale **en la misma fila, mientras se escribe**. Es lo que hace
que se note en el momento si falta el tipo de cambio o si el IGV está mal
marcado, en vez de descubrirlo tres semanas después mirando un margen negativo.

#### Las decisiones

- **Se guardan LAS TRES respuestas, no solo la ganadora.** Es lo que construye
  el historial que Willy pidió con *«que haya historial y mejorar los
  precios»*. Si solo se guardara al ganador, dentro de seis meses no habría
  forma de saber que el segundo llevaba medio año a cincuenta centavos, ni que
  a un proveedor se le pregunta siempre y nunca contesta. Por eso
  `consulta_precio_respuestas` no tiene ningún concepto de «elegida».
- **«No lo tengo» es una respuesta, y no compite.** Es la trampa de cualquier
  rejilla de precios: si un hueco se leyera como cero, el que no contestó
  ganaría siempre. Hay un check en la base —disponible y sin precio no entra—,
  un filtro en el dominio y una prueba de cada cosa.
- **«No ha contestado» y «me dijo que no lo tiene» son cosas distintas.** La
  primera versión ponía «no lo tiene» en las dos, que es acusar a alguien de
  algo que no dijo y dar por cerrada una pregunta abierta. **Solo se vio
  abriendo la pantalla**: compilaba, pasaba el lint y pasaba los tests.
- **Es OPCIONAL.** La tercera de las cinco preguntas a Willy es si comparar
  debe ser obligatorio antes de comprar, y sigue sin contestar. `/compras/nueva`
  funciona igual que siempre. Es la dirección reversible: si dice que sí,
  hacerlo obligatorio es una comprobación; al revés habría que desmontar un
  bloqueo de un flujo que ya usa todos los días.
- **Propone al más barato y deja mover la elección.** No agrupa por comodidad
  —«a este ya le compras tres cosas, pídele la cuarta»— porque eso puede mandar
  a comprarle caro a alguien para ahorrarse una llamada. Lo que sí enseña es
  **cuánto cuesta esa comodidad**: «comprándoselo todo a X son $ 10 más, en una
  sola compra». Decide Willy, pero sabiendo el número.
- **Una compra por proveedor, cada una por su cuenta.** Son documentos
  independientes con su correlativo; si la segunda falla, la primera sigue
  siendo buena y se dice cuál salió y cuál no. Meterlas en una transacción
  sería perder una compra correcta por el problema de otro proveedor.
- **La ronda se cierra sola** cuando ya produjo todas sus compras. Consecuencia,
  no botón — igual que el cierre de la cotización en la 047.

#### Y de paso, dos cosas que estaban rotas

**1 · «Pedir precio» no arrancaba en frío.** La lista de a quién preguntarle
sale de `proveedor_productos`, que se llena SOLA con cada compra (046). Con 97
proveedores cargados y cero compras hechas, **no proponía a nadie y no había
forma de preguntarle a nadie**. Ahora se busca en el maestro entero, contra el
mismo `buscar_proveedores` (033) del constructor de compras: por razón social,
por RUC y por marca.

**2 · «SIN MARCA» se estaba apuntando como si fuera una marca** (migración
056). `proveedor_marcas` existe para el filtro «¿quién me trae SKF?», y **384
de los 790 productos del maestro son «SIN MARCA»**: en unos meses casi todos
los proveedores habrían tenido esa fila y el filtro habría dejado de servir. No
habría reventado nunca — se habría degradado, que es peor.

#### Probado contra la base real, de punta a punta

Consulta a dos proveedores por dos productos. El primero contesta en soles con
IGV a 3.70; el segundo en dólares, y dice que el segundo producto no lo tiene.

- La rejilla convirtió S/ 37.00 a **$ 8.4746** —el mismo número que comprueba
  el centinela de la 055 contra `v_comparativa_precios`— y le dio la primera
  línea al de soles por $ 5.25 sobre las 10 unidades.
- La compra salió **en soles**, con tipo de cambio 3.70 y el costo neto de IGV
  (S/ 31.3559), subtotal S/ 354.24 + IGV S/ 63.76 = **S/ 418.00**, que es
  exactamente 10×37 + 4×12: el dinero que ese proveedor va a facturar.
- Quedó enlazada a la consulta, la ronda se cerró sola, y **los dos proveedores
  quedaron apuntados como que venden esos productos** — el que vendió con
  `comprado_veces` 1 y el que solo cotizó con 0. Que es lo que pidió Luis el
  02/09: *«cuando va a comprar o cotizar esa compra ahí también pueda nutrir el
  sistema»*.

Todo borrado después: 0 compras, 0 rondas, 0 filas en `proveedor_productos`,
bitácora vacía y el correlativo CMP devuelto al 7.

---

### R · La cadena entera, recorrida de un tirón · 03/09

Luis, el 03/09: *«¿todo el flujo funciona bien? ¿desde cotización, pedido, las
compras, las guías?»*.

No se sabía. Se habían probado los tramos por separado, nunca la cadena
completa seguida — y **cada trozo funcionaba; las costuras no**.

El recorrido, contra la base real y con los datos reales de Willy: cotizar a
ACEROS CHILCA 30 de un producto con 20 en almacén y 2 de otro sin stock →
confirmar 25 y 2 → bandeja → pedir precio a dos proveedores → comparar →
comprar → recibir → guía → facturar → cobranzas.

#### Lo que ya funcionaba

- La confirmación parcial llega **intacta** hasta compras: la bandeja pidió
  25, no 30, y restó las 20 del almacén para pedir 5.
- El comparador normalizó S/ 8.00 con IGV a 3.75 en $ 1.81 y le ganó a los
  $ 2.10 del otro.
- La compra salió en la moneda de cada proveedor con el costo neto, la
  recepción movió el stock de 20 a 25 y el kardex guardó el costo convertido
  a dólares ($ 1.8079).
- La facturación respetó las 25 confirmadas (§L, migración 047), dejó la
  cotización **aprobada** —no atendida— porque quedaba una línea, y el
  documento apareció en cobranzas con su vencimiento a 30 días.
- La factura **no** descarga stock: sale con la guía, y la casilla para la
  venta de mostrador está explicada y arranca desmarcada.
- La pantalla de emisión avisa de que no hay credenciales SUNAT y de que el
  documento quedará pendiente de envío. La guía avisa de que la GRE no está
  disponible. Las dos cosas, dichas donde se leen.

#### Seis fallos, y cinco solo se veían usándolo

**1 · La guía despachaba lo COTIZADO, no lo confirmado** (migración 057). El
gemelo exacto del fallo que arregló la 047 en la factura: se arregló uno y el
otro se quedó donde estaba. Proponía sacar 30 de una línea con 25 confirmadas
y 25 en el almacén, y **ni la pantalla ni la base lo impedían**. En una guía
duele distinto que en una factura: la mercadería ya salió en un camión, y
deshacerlo no es una nota de crédito, es ir a buscarla. El tope va en la
función, cuenta lo ya despachado en otras guías y va antes del correlativo.

**2 · El comparador se lo daba todo al primero que contestaba.** La pantalla
guardaba la elección entera y, al llegar una respuesta nueva, la mezclaba
dando prioridad a lo ya elegido. La intención era «lo movido a mano se
respeta»; el efecto fue que **el segundo proveedor no podía ganar aunque
llegara más barato**. Y pasa siempre, porque las respuestas no llegan a la
vez: se anota la del lunes y la del miércoles. Ahora solo se guarda lo que se
tocó a mano (`eleccionFinal`, con sus pruebas) y el resto se recalcula.

Es lo contrario de para lo que existe un comparador. No se vio el 02/09 porque
se anotó primero al que ganaba.

**3 · Las cifras grandes podían quedarse en `$ 0.00`.** `CifraAnimada` arranca
el número en cero y sube con `requestAnimationFrame`, que **no corre con la
pestaña en segundo plano**. Cobranzas decía `$ 45.81` con `$ 105.91` por
cobrar. Es el componente de todas las cifras del tablero, cobranzas y alertas.

Lo importante no es el fallo, es que **se descartó dos veces como «será la
animación»** —el 02/09 con las alertas y el 03/09 con cobranzas— y las dos
tenía razón el que dudaba. Un número que miente y se explica solo es peor que
uno que revienta. Ahora: si la pestaña está oculta no se anima, y un
temporizador deja el valor de verdad pase lo que pase.

**4 · La recepción decía «0 → 5» de un producto con veinte unidades.** La línea
que viene de una compra entraba con `stockAnterior: 0` fijo, porque el reducer
es puro y no puede consultar. Y se ponía como costo «anterior» el de la propia
compra, así que la etiqueta decía «antes 6.7797» del costo 6.7797 y la
comprobación del decimal mal puesto comparaba el número consigo mismo. Ahora
los dos llegan del almacén (`datosDeAlmacen`).

**5 · «Sin stock» cuando había stock.** Con 20 de 30 pedidas, la línea de la
cotización decía «sin stock · ver alternativas». No es lo mismo: con 20 se
vende lo que hay y se compra el resto; con 0 hay que salir a buscarlo entero.
Ahora dice «solo 20».

**6 · «Confirma la cotización entera» confirmando 25 de 30.** El resumen
contaba LÍNEAS, no cantidades, así que bajar una de 30 a 25 seguía siendo «2
de 2 líneas». El importe salía bien; la frase, no — y esa frase es lo último
que se lee antes de pulsar.

Y uno de datos: la compra que sale del comparador decidía si llevaba IGV **por
la moneda** (USD igual a exterior). Es falso: a un proveedor de Lima se le
compra en dólares y su factura lleva IGV. Ahora lo decide `proveedores.tipo`.

#### Lo que sigue sin poder probarse

- **Enviar a SUNAT.** No hay certificado ni clave SOL en el `.env.local`; la
  factura se emite y queda en `pendiente`. Es lo esperado y está avisado en
  pantalla.
- **La GRE.** SUNAT la cambió a un servicio REST con OAuth2 que hay que
  escribir aparte (§3). La guía vale como documento interno y mueve el stock.

#### Y una razón más para borrar `AJU-26-00001`

El recorrido lo dejó a la vista: las 20 unidades de ese ajuste entraron a costo
cero, así que al recibir 5 a $ 1.81 el costo promedio del producto quedó en
**$ 0.36**. Ese número es el que se usa para valorizar el inventario y para
proponer el costo de la siguiente recepción.

#### La base quedó como estaba

0 compras, 0 recepciones, 0 guías, 0 rondas, 0 comprobantes nuevos, stock del
`0-230` de vuelta en 20, kardex con solo el ajuste original, bitácora y fallos
vacíos y todos los correlativos devueltos —CMP a 7, REC a 1, F001 a 0, T001 a
0, COT1 a 4—. Las dos cotizaciones de prueba de Luis, intactas.

---

### S · Un solo formato para todo lo que se imprime · 03/09

Willy vio la cotización en papel y le gustó. Luis: *«podemos replicar para todo
— pedidos, cotización, boletas, facturas… pero tiene que ser para imprimir, que
no se rompa»*. Y con una captura del diálogo de impresión señalando arriba.

Tenía razón en las dos cosas, y había un tercer problema debajo.

#### 1 · La aplicación salía impresa

En el papel salía la barra de arriba: el botón de menú, el selector de tema y
**«Willy Rodríguez · Gerencia»**. En una cotización que se le manda a un
cliente.

El documento ya se preparaba para imprimir —lleva `print:` desde que se
hizo— pero **el layout del ERP no**. Y es donde tenía que estar: puesto ahí,
vale para la cotización, la factura, la boleta, la guía y lo que venga. Puesto
documento a documento, el siguiente nace roto.

#### 2 · Imprimir una factura o una guía daba 404

Los botones «Imprimir» de comprobantes y de guías enlazaban a
`/facturacion/[id]/imprimir` y `/guias/[id]/imprimir`. **Esas rutas no
existían.** El botón estaba, el enlace estaba, y detrás no había nada.

Lo peor es cuál de los dos: **la guía es el que más se imprime**, porque viaja
físicamente con la mercadería. Un camión parado en un control sin guía impresa
es una multa.

#### 3 · Y las reglas de impresión eran cuatro líneas

Ocultar `.no-print` y poner el fondo blanco. Faltaba lo que hace que un
documento largo salga bien:

- **`@page` con margen de 12 mm.** Antes el margen lo ponía el `padding` de la
  pantalla, que en A4 se come media columna.
- **Los fondos de color se imprimen** (`print-color-adjust: exact`). Chrome los
  quita por defecto salvo que la persona marque «Gráficos de fondo» en el
  diálogo. Sin ellos la cabecera azul de la tabla sale blanca sobre blanco y
  las columnas se quedan **sin título legible**. En un documento que se manda a
  un cliente eso no puede depender de una casilla que nadie marca.
- **La cabecera de la tabla se repite en cada hoja** (`table-header-group`).
  Una factura de treinta líneas empezaba la segunda hoja con números sueltos.
- Y las filas no se parten por la mitad entre dos páginas.

#### El formato, ahora en un solo sitio

`componentes/hoja-documento.tsx`: cabecera del emisor, recuadro del número,
bloque de datos a dos columnas, tabla de líneas, totales, importe en letras y
pie. Cada documento pone lo suyo:

| | Lo propio |
|---|---|
| **Cotización** | Las seis correcciones de columnas (C1-C6), la columna «Entrega» solo si hay algo no inmediato, y la advertencia de moneda |
| **Factura / boleta / notas** | Dice qué documento es —una boleta no es una factura—, a qué documento corrige una nota, detracción, retención y la leyenda de representación impresa |
| **Guía** | **Sin dinero**: ni precios ni totales. Lleva de dónde sale, a dónde va, qué pesa, placa, conductor, y las dos firmas |

La cotización se pasó al componente compartido y quedó **idéntica** —comprobado
contra la captura de Willy—. Se hizo así y no dejando la suya aparte porque
cuatro copias se separan: este proyecto lleva dos días arreglando fallos que
son exactamente eso (la regla del contacto duplicada, y el tope de lo
confirmado arreglado en la factura y no en la guía).

#### Comprobado en papel, no en pantalla

Copiando las reglas de `@media print` a la pantalla se ve lo que saldría
impreso: queda solo el documento. Se imprimieron una factura histórica real
(F002-00000515, MATRITECH S.A.C.) y una guía de prueba, y las dos salen con el
mismo formato que la cotización.

#### Un dato de Willy que hay que corregir

En la cabecera de todos los documentos sale, bajo el RUC, **«Hola {provedor},
soy {yo}»**. No es un fallo del código: es el campo **dirección de la empresa**,
que alguien pisó probando las plantillas de mensaje. Sale impreso en cada
cotización, boleta y factura — y en una factura electrónica la dirección del
emisor viaja al XML de SUNAT.

Se corrige en Configuración → Empresa. **Pendiente de que Luis confirme la
dirección buena**: no se toca por nuestra cuenta un dato que va a un documento
fiscal.

---

### T · Los modales estaban fuera del molde · 03/09

Luis, con una captura del diálogo de confirmar: *«he visto varios modales así,
todos rotos, sin diseño, todo apretado. Mira esa X, no tiene color ni nada»*.

#### La primera hipótesis era falsa

Que las clases de color del sistema —`text-fg`, `text-muted`, `text-subtle`—
no existieran, porque no están declaradas como colores de tema. Se comprobó en
el navegador y **sí funcionan**: están definidas aparte con `@utility`, y la X
tenía su gris correcto, `#8894a2`.

Vale la pena dejarlo escrito: la hipótesis encajaba con los síntomas y era
falsa. Lo que la descartó fue mirar el estilo computado en la pantalla, no
leer el CSS.

#### Lo que pasaba de verdad

`DialogHeader`, `DialogBody` y `DialogFooter` ponen el aire, la línea de
separación y el fondo del pie. **Eran opcionales**, y `DialogContent` es una
caja sin padding.

De los quince diálogos del ERP, **trece no los usaban**. Ponían el título, la
descripción y el contenido sueltos dentro del contenedor, así que salían
pegados a los bordes. Eso es lo que se veía como «apretado y sin diseño», y por
eso pasaba en varios a la vez: no era un modal roto, era el molde sin usar.

#### Y el molde tenía sus propias medidas cortas

- **La X: 24 px de lado.** Un icono de 16 con 4 de aire. Diminuta para el ratón
  y casi invisible para quien no ve de cerca, que es el caso de Willy. Ahora
  son 36 px, con fondo al pasar por encima y anillo de foco para el teclado.
- **El título en `text-sm`**, el mismo tamaño que una celda de tabla. Es la
  pregunta que hay que leer antes de decidir: `text-base`.
- **La descripción en `text-xs`.** A `text-sm`, con ancho de lectura limitado.
- Cabecera, cuerpo y pie, con más aire y con más margen lateral en pantallas
  medianas.

#### Un intento que parecía funcionar y no funcionaba

La primera idea fue que el molde se aplicara solo: una regla `:has()` que
pusiera el aire si dentro no había ninguna sección. Se escribió primero como
variante de Tailwind —`[&:not(:has([data-x]))]`— y **no se genera**: los
corchetes anidados le rompen el parseo y queda una clase que no existe.

Se pasó a CSS de verdad y entonces sí se generaba, pero **seguía sin aplicar**:
las tres secciones llevaban el mismo marcador, y doce de los trece diálogos
tienen `DialogFooter`, así que el pie desactivaba el aire del resto.

Se descartó del todo. Un arreglo que parece que funciona y no funciona es peor
que no tenerlo: los trece se envolvieron de verdad, uno a uno.

#### Cómo se hicieron los trece

Doce con un script mecánico, porque el patrón es idéntico. **Cuatro se
rompieron**: los que tienen un `<form>` envolviendo el contenido —cobrar,
anotar gestión, emitir nota y ajustar stock— porque insertar el cierre de la
cabecera partía el formulario. Se restauraron y se hicieron a mano, con el pie
DENTRO del formulario, que es donde tiene que estar: su botón es el que envía.

También se limpió el ruido: `prettier` reformateó 68 archivos y solo 14 tenían
cambio real. Los otros 54 se devolvieron a su sitio — un commit de diseño con
2.600 líneas de reformateo no se puede revisar.

#### El diálogo de la captura, aparte

El de «¿Qué te confirmó el cliente?» se rehízo entero: las filas se apilan en
móvil y se alinean desde `sm`; la cantidad y su tope van pegados —«5 de 5 NIU»
se lee de un vistazo, y esa es la única comprobación que hay que hacer ahí—; el
botón «No la quiso» pasó de fantasma a con borde, porque no parecía pulsable; y
la descripción del producto ya no se corta en una línea, que en este catálogo
se comía justo el dato que distingue un producto de otro.

---

### U · Del pedido a compras, que era el paso que faltaba · 03/09

Luis, 03/09: *«después de aceptar la cotización se pasa a pedido, y después
debería ver un botón para cotizar en compra los productos seleccionados, ¿no?»*.

Sí. Y no estaba.

#### Dónde se cortaba

Al confirmar el pedido, lo único que ofrecía la pantalla era **«Generar guía»**
— o sea, despachar. Y despachar supone que la mercadería está: si el cliente
confirmó 25 y en el almacén hay 20, lo primero es conseguir 5.

El camino existía —la bandeja «Por comprar»— pero es **general**: junta lo de
todos los clientes. Había que acordarse de ir, buscar los productos de ESE
pedido entre los de todos, y marcarlos a mano. Con el pedido recién cerrado
delante, eso es pedirle a la persona que haga de índice.

#### Lo que sale ahora

Debajo de la cabecera, en cuanto el pedido está confirmado:

    Falta comprar 2 productos de este pedido
    TMAS100-005   CHAPAS CALIBRADAS SKF DE 0.05mm…      5
    50X68X8TC     RETEN 50 X 68 X 8 TC                 10

                              [ Pedir precio de lo que falta ]
                              [ Registrar la compra          ]

Los dos botones llevan las cantidades ya puestas. **El primario es pedir
precio y no comprar**: el precio lo pone el proveedor y Willy pregunta antes de
comprar. Registrar la compra directa queda de segunda, para cuando ya se sabe a
cuánto.

Si no falta nada, el bloque no aparece — y en un borrador tampoco: todavía no
se sabe qué va a confirmar el cliente, y avisar de que falta stock de algo que
quizá no compre es ruido.

#### La cuenta sale de la bandeja, no de una propia

Restar el stock línea a línea aquí habría sido más corto y habría dado **otro
número**: el stock se reparte entre todos los que esperan el mismo producto,
por orden de confirmación. Si esta pantalla dijera «faltan 5» y la bandeja
«faltan 10», la persona deja de fiarse de las dos.

Así que `loQueFaltaDe()` filtra el reparto ya hecho en vez de rehacerlo, y
tiene sus pruebas: dos clientes esperando lo mismo, líneas repetidas del mismo
producto dentro del pedido, y lo que ya viene en camino —que se enseña pero
**no entra en el botón**, porque volver a pedirlo es comprarlo dos veces.

#### Y el vocabulario, que era un tercer nombre para lo mismo

Se pulsa «Confirmar pedido», el diálogo pregunta «¿qué te confirmó el
cliente?» y el documento quedaba en **«Aprobada»**. Tres palabras para un solo
acto. Ahora se lee **«Confirmada»** en los tres sitios.

El valor del enum en la base sigue siendo `aprobada`: cambiarlo es una
migración y no arregla nada que se vea.

#### El flujo completo, tal como queda

    Cotización → Confirmar pedido → CONFIRMADA
                                       ├── ¿falta algo? → Pedir precio → Comparar → Compra → Recepción
                                       └── Generar guía → Facturar → Cobrar

---

### V · A cada proveedor lo suyo · 03/09

Luis, viendo el bloque de «falta comprar» con dos productos: *«cada producto es
de diferente proveedor, no el mismo. Cada producto puede tener hasta 5
proveedores; se les va a enviar a los 5 un mensaje preguntando el precio y se
va a registrar para tener historial. Ver la manera de un modal que salga
cotizar junto o separado»*.

Tenía razón, y el fallo estaba en el modelo, no en la pantalla.

#### Lo que la 055 daba por supuesto

Que a todos los proveedores de una ronda se les pregunta por **todos** los
productos. `consulta_precio_proveedores` no tenía ninguna relación con los
ítems.

Con el pedido de la captura —unas chapas SKF y un retén— eso significaba
mandarle al proveedor de retenes un mensaje pidiéndole chapas que no vende. Y
su columna en la rejilla salía con un hueco que se leía como «no contestó».

#### Junto o separado, y el sistema propone

Las dos formas son legítimas:

- **Junto** — un mensaje con todo a cada proveedor. Es lo del distribuidor
  general, al que se le pide de todo aunque no lo tenga todo: menos mensajes y
  una sola conversación.
- **Separado** — a cada proveedor solo lo que vende. Es lo de los
  especialistas.

No lo decide el sistema, pero sí lo **propone**, porque el dato ya está: si
ningún proveedor cubre todos los productos, mandar la lista entera es mandar
ruido garantizado. Con las chapas y el retén propone separado, y lo dice.

En modo separado la pantalla se agrupa **por producto**, cada uno con sus
proveedores y su propio buscador para añadir más.

#### Una ronda, no varias

La alternativa era abrir una consulta por producto: más simple de programar y
parte el historial en pedazos. «¿A quién le pregunté por lo del pedido de
ACEROS CHILCA?» dejaría de tener una respuesta.

Así que la ronda sigue siendo una y la migración **058** añade
`consulta_precio_asignaciones`: qué producto le tocó a cada proveedor. El
mensaje de cada uno lleva solo lo suyo, que es exactamente lo que pidió Luis.

#### La tercera categoría que faltaba

Con el reparto, media rejilla son cruces que **nunca se preguntaron**. Eso son
tres estados, y hasta ahora se distinguían dos:

| | Qué significa | Qué se hace |
|---|---|---|
| **No se le preguntó** | No vende eso | Nada. No debe nada |
| **Preguntado, sin contestar** | Se le mandó el mensaje | Perseguirle |
| **Contestó que no lo tiene** | Cerrado | No volver a preguntarle |

La vista gana una columna `preguntado` y la rejilla deja la celda **en blanco**
donde no se preguntó, `—` donde se espera y «no tiene» donde contestó que no.

#### Y el mismo error, otra vez, en la columna de al lado

La columna «Se le compra a» decía **«Nadie lo tiene»** en cuanto no había
ganador — o sea, **antes de que nadie hubiera contestado**. Es el mismo error
que se acababa de arreglar en las celdas: dar por cerrada una pregunta abierta,
y mandar a buscar fuera algo que quizá llegue mañana.

Ahora dice «Esperando respuesta» mientras se espera, «Nadie lo tiene» solo
cuando todos los preguntados contestaron que no, y «No se le preguntó a nadie»
cuando el descuido está al armar la consulta.

#### Dos detalles que solo se vieron usándolo

- **El panel de respuesta traía todos los productos.** Quitar del mensaje lo que
  el proveedor no vende y luego pedírselo en el panel es devolverlo por la
  puerta de atrás. Ahora cada panel muestra solo lo que se le preguntó.
- **La etiqueta decía «se le compró 1 vez»** de alguien a quien no se le ha
  comprado nunca: en modo separado se estaba usando el contador de la lista
  global, que cuenta otra cosa —de cuántos productos de la lista es
  proveedor—.

#### Probado con el caso exacto

Las chapas asignadas a un proveedor y el retén a otro: la pantalla propuso
separado, generó **dos mensajes con un producto cada uno**, la ronda guardó el
reparto, y la rejilla salió con la diagonal correcta —vacío donde no se
preguntó, `—` donde se espera—.

---

### W · Un margen sin costo no es un margen · 04/09

Abriendo el tablero con el histórico entero:

    VENDIDO   USD 201,797
    MARGEN    USD 201,797   ·   0.0% sobre el costo

El margen era **la venta entera** —ganancia del 100 %— y su propia explicación
lo desmentía en la línea de abajo. Las dos cifras salían de la misma cuenta y
las dos eran falsas.

#### Por qué

Los **479** comprobantes del histórico se cargaron sin costo: `costo_total = 0`
en todos. Así que `margen = venta − 0 = venta`, y el porcentaje, que divide
entre el costo, caía al `else 0`.

Aritméticamente las dos son correctas. Y las dos le decían a Willy que gana el
100 % de lo que vende.

#### Y no se arregla solo

Es lo primero que se piensa —«cuando empiece a facturar de verdad se
arregla»— y es falso. Esos 479 documentos vinieron de su sistema anterior sin
costo y **nunca lo van a tener**. Cualquier rango que mire hacia atrás
mezclará ventas con costo y sin él mientras el ERP exista.

**El caso mixto no es transitorio: es el permanente.** Por eso no bastaba con
«si no hay costo, no digas nada»: hay que decir sobre qué parte de la venta se
calcula.

#### Estaba en tres sitios, y en un cuarto ya estaba bien

Buscando `margen` por el esquema:

| | |
|---|---|
| `serie_ventas` (tablero) | mal · margen = venta entera |
| `v_ventas_mensuales` (informes) | mal · ídem |
| `v_top_productos` (ranking) | mal · ídem, por producto |
| `v_productos_stock` | **bien** · devuelve `null` sin costo |
| `cotizaciones.margen` | otra cosa: el de la propia cotización |

Que `v_productos_stock` ya lo hiciera bien es lo que más dice: la forma
correcta estaba escrita en el proyecto desde el principio y no se aplicó en
los otros tres.

#### Lo que se ve ahora

- **Nada tiene costo** → «—· Sin costo registrado en estas ventas».
- **Todo lo tiene** → el margen, a secas.
- **Una parte** → el margen de esa parte, diciendo de cuál: «22.4 % sobre el
  costo · solo de 38 % de la venta».

La regla vive en `tablero/dominio/margen.ts` con sus siete pruebas, incluida
la que resume el fallo: *el margen nunca es la venta entera cuando falta
costo*. El caso mixto se cubre ahí y no en la pantalla porque probarlo en vivo
habría exigido alterar una factura histórica del cliente.

#### Un centinela que no comprobaba nada

Escribiendo la migración, el primer intento dejaba el margen en `NULL` —un
`sum(...) filter` sin filas devuelve null y se propaga a la resta—. El
centinela decía `if v_margen <> 0 then raise`, y **`null <> 0` no es
verdadero**: no falló, se calló.

Está arreglado con `coalesce` en los dos sitios, y anotado dentro de la
migración: un centinela que no puede fallar es peor que no tenerlo, porque da
la impresión contraria.

---

### X · Los precios se piden desde donde estés · 04/09

Luis preguntó cómo debería ser la pantalla para registrar los precios cuando
un producto tiene varios proveedores: *«sería el nombre del producto y a la
derecha cada proveedor para registrar sus precios ps no»*.

**Esa pantalla ya existe** y es exactamente esa: la comparativa de la §Q.
Producto por fila, proveedor por columna, el precio de cada uno en su celda.
Lo que faltaba no era el diseño: era **poder llegar a ella**.

#### Un precio suelto no sirve para nada

La tentación era poner una casilla de precio en la ficha del producto, junto a
cada proveedor. Es lo más corto de construir y lo que peor envejece:

- Un precio **sin fecha** no se puede comparar con otro. En rodamientos el
  mismo ítem se mueve con el dólar y con el stock del importador.
- Un precio **sin cantidad** miente: 1 unidad y 50 no se cotizan igual.
- Un precio **sin quién preguntó ni cuándo** no es historial, es un número
  pegado en una ficha.

Y el historial es literalmente lo que pidió: *«va a registrar para tener ahí
historial»*. Por eso la regla es **todo precio nace dentro de una ronda**
(`consultas_precio`) y de ahí sale con fecha, cantidad, moneda, IGV y
proveedor. Nada de precios sueltos.

#### Entonces el arreglo es abaratar la ronda, no evitarla

Si abrir una ronda cuesta ir a la bandeja y buscar el producto entre los de
todos los clientes, nadie la abre. Se cerraron las dos entradas que faltaban:

| Desde dónde | Antes | Ahora |
|---|---|---|
| Ficha del producto · «Quién lo vende» | solo de lectura, decía a cuánto te lo dejaron | botón **Pedir precio de este producto** |
| Constructor de compra · `/compras/nueva` | no había ningún camino | botón **Comparar precios antes**, con las líneas ya escritas |
| Bandeja «Por comprar» | ya estaba (§M) | igual |

Las dos llevan a la misma pantalla con `?items=id:cantidad,...`, así que la
ronda ya llega escrita.

#### Y por eso la cantidad se volvió editable

Entrando desde la ficha de un producto no hay ninguna cantidad natural —va con
1—, y preguntar por 1 unidad cuando vas a comprar 50 devuelve el precio
equivocado. La lista «Qué se pide» ahora lleva su campo de cantidad, y ese
número viaja hasta el texto del WhatsApp: *«— 12 NIU»*.

De paso volvió esa lista al modo **junto**, que se había perdido en la
reescritura del 03/09: se elegía a quién preguntarle sin ver qué se le estaba
preguntando.

#### El resumen para Willy, en una línea

Ves un producto o estás armando una compra → **pides precio** → sale la
comparativa con un proveedor por columna → apuntas lo que te diga cada uno →
el sistema marca el más barato → eso se convierte en compra. El historial se
llena solo por el camino.

---

### Y · Apuntar un precio a ciegas · 04/09

Luis, mirando la pantalla de apuntar precios: *«ni yo entendí el flujo de
compras... al registrar el precio me traiga el historial del precio, a cuánto
se compra, a cuánto se está vendiendo y el precio mínimo»*.

Tenía razón, y el problema no era de explicación: la pantalla **pedía un
número y no ponía ni uno enfrente**. Se escribía «15.20» sin nada con qué
compararlo.

#### La comparativa contestaba otra pregunta

La rejilla de la §Q responde *«¿quién de estos tres es el más barato?»*. La que
se hace quien está tecleando es otra:

    ¿esto es mejor o peor de lo que ya conseguía?
    ¿me queda margen si lo vendo a mi precio?

Y son distintas de verdad: **el más barato de tres puede ser el más caro de tu
historia**, y la rejilla lo coronaba ganador sin decir nada.

#### Lo que se ve ahora, debajo de cada producto

    vendes a $30.85
    mejor: $0.20 · IMPORTADORA INDUSTRIAL CORPUS SRL · comprado 04/09/2026

Y en cuanto se teclea, al lado del importe convertido:

| Se escribe | Sale |
|---|---|
| 35.00 | `+$34.80` · **más caro que tu venta** |
| 0.15 | `−$0.05 · 25% más barato` · margen alto |

Tres referencias y no una: lo que ya se **pagó** (una factura), lo que
**cotizaron** antes (una promesa, más floja pero más fresca) y el **P.V. y el
P.M.** del maestro, que son los que convierten «me lo dejan a 12» en «entonces
pierdo plata». La regla vive en `dominio/referencia.ts` con 27 pruebas.

Empate entre una compra y una cotización: gana la compra.

#### Y `historialDePrecios` llevaba dos días escrita sin que la llamara nadie

Estaba en `api/comparador.ts` desde el 02/09, con su comentario explicando para
qué servía. `grep` sobre `apps/web/src`: cero llamadas. La mitad del trabajo ya
estaba hecha y no se veía desde ninguna pantalla.

#### «¿Me faltó preguntarle a alguien?»

La otra mitad de lo que pidió: *«los otros proveedores que están ligados a ese
producto, así no les haya preguntado, igual puedo ver a cuánto me lo
vendieron... así los dueños se acuerdan a quién le falta cotizar»*.

Debajo de cada fila salen ahora los que constan como que lo venden y no
entraron en la ronda, con lo último que cobraron, y un clic los mete dentro:

    Falta preguntarle a  [+ IMPORTADORA INDUST…  $0.20]

Se enseñan tres como mucho. La lista completa está en la ficha del producto;
aquí hace falta acordarse, no elegir entre nueve. Los de baja no salen: no se
les puede comprar.

`anadirALaRonda` **busca antes de crear**, a propósito. El mismo proveedor
suele faltar en varias filas —vende cuatro de los seis productos— y se le añade
pulsando en una y luego en otra; si solo supiera insertar, la segunda vez daría
«ya se le preguntó» y ese producto se quedaría sin preguntar.

#### El fallo que solo se veía en vivo

Al pulsar el botón la primera vez **no pasó nada en pantalla**. En la base sí:
la fila estaba escrita. El proveedor se había añadido y la rejilla seguía
pintando los de antes.

`useState` **no se vuelve a inicializar cuando cambian las props**. La pantalla
hacía `useState(ronda.proveedores)`, así que el `router.refresh()` traía la
ronda con un proveedor más y el estado se quedaba con la copia del primer
render. Lo mismo valía para las respuestas.

Está arreglado con el patrón que **esta misma pantalla ya usaba** unas líneas
más abajo para `aMano`: lo del servidor manda, y lo local son parches encima.
El comentario que lo explicaba estaba escrito y no se había aplicado a los dos
estados de al lado.

Ni el typecheck ni el lint ni las 1.118 pruebas lo veían. Se vio pulsando el
botón.

#### Dos cifras que daban risa

Probando con datos reales salieron `17400% más caro` y `margen 20466.7%`. Son
correctas —el catálogo tiene precios de venta cargados contra costos de casi
cero— y las dos son ruido: el 17400 no añade nada que no dijeran ya los $34.80
al lado, y encima distrae de ellos.

`porcentajeQueDiceAlgo` se calla por encima del mil por ciento y deja solo el
dinero, que es lo que se paga. El margen, en ese caso, dice «margen alto».

---

### Z · El camino de vuelta al cliente · 04/09

Repasando el flujo entero contra el código —no de memoria— quedaba **un solo
eslabón abierto**, y era el último.

    cotización → pedido → bandeja → precios → compra → recepción → stock
                                                                     ↑
                                                        y ahí se paraba

El ERP sabía que ahora hay veinte 6205 en el estante. No decía que esos veinte
eran para el pedido de ACEROS CHILCA, que lleva desde el día 2 esperándolos y
que ya se le puede facturar. **Eso vivía en la cabeza de Willy**, que es justo
lo que este ERP viene a sacarle de ahí.

De paso, dos agujeros que estaban anotados como abiertos y ya estaban
cerrados: la compra en soles tiene moneda y tipo de cambio desde la 042, y el
botón «Recibir» desde la propia compra existe.

#### Cero migraciones: el dato ya estaba

`v_comprometido` (041/047) ya trae producto, cliente, cotización, comprometido
y stock. Lo que faltaba no era información: era enseñarla donde se decide.

#### Una sola regla de reparto, y por eso se extrajo

El reparto del stock entre los pedidos que lo esperan estaba dentro de
`agruparPorComprar`. Ahora vive suelto en `repartirStock` y lo usan las tres
pantallas.

No es limpieza: la bandeja pregunta «¿qué falta comprar?» y las nuevas
preguntan «¿a quién puedo entregarle?». Son la misma cuenta por sus dos caras,
y si cada una repartiera por su lado podrían **contradecirse —una diciendo que
sobra y la otra que falta— con la misma base delante y sin que nada fallara**.

#### Lo que se ve ahora

| Dónde | Qué dice |
|---|---|
| Ficha de la compra | «TMAS100-005 · traes 1 · esperan 5 · ⚠ **no alcanza para todos**» y quién es |
| Recepción guardada | «A quién se le puede entregar ya» — el momento de avisar |
| `/cotizaciones/listos` | Todo lo entregable, del que lleva más esperando al que menos |

El aviso de que **no alcanza** salió solo en la primera prueba real: CMP-26-00009
traía 1 unidad y ACEROS CHILCA esperaba 5, con la fecha vencida ese mismo día.
Eso antes no lo veía nadie.

#### Dice «lo esperan», nunca «es suyo»

A propósito, y escrito en tres sitios. Mientras `stock.reservado` no lo escriba
nadie —la pregunta 4 a Willy— el reparto por antigüedad es un cálculo, no una
decisión que él haya tomado. «Lo esperan» es un hecho; «es suyo» sería
prometer en su nombre.

#### El corte por líneas enteras dejaba pedidos en tierra de nadie

Primer intento: un pedido salía como listo si tenía al menos una línea
completa. Con eso, un pedido de 10 unidades con 4 en almacén **no aparecía en
ninguna pantalla**: aquí no, porque no tenía ninguna línea entera; y resuelto
en la bandeja tampoco, porque seguía faltando.

Y esas 4 se pueden entregar y facturar hoy — por partes, desde la 047. El
corte es ahora «hay algo que sacar del almacén».

#### Y `paraQuienEs` contaba de más desde el 02/09

Existía y se usaba en `/compras/nueva`, pero **no miraba el almacén**: contaba
a todo el que tuviera el producto confirmado. Con stock de sobra decía que
media cartera estaba esperando esa compra — y quien la lee la está haciendo
justamente para decidir cuánto comprar. Ahora pasa por el mismo reparto.

#### Probado de punta a punta, en vivo

Compra → «esperan 5, traes 1, no alcanza» → recibir → el pedido aparece solo en
Listos como parcial → la otra compra pasa a decir «esperan 4», no 5, porque el
reparto ya descontó lo que entró.

Dos cosas se arreglaron por verlas en pantalla y no en una prueba:

- El resumen empezaba por **«0 pedidos se pueden cerrar»**: leer primero lo que
  NO hay. Ahora, sin completos, arranca por lo que sí se puede hacer.
- La columna decía «Líneas 0 de 2» al lado de «listo para entregar», que a la
  vista se contradicen. Va en unidades —«1 de 15»—, que es lo que se saca del
  almacén.

---

## Reunión del 31/08 · lo que pidió Willy, y qué se hizo

Fue corta —le llegaron los técnicos de Claro a media reunión— pero salió lo
que hacía falta. Grabación en el grupo. **Los cuatro cambios están hechos**
(migraciones 035 y 036).

### 1 · Una empresa tiene VARIOS contactos, y la cotización elige a cuál

Lo explicó él, y la explicación es el motivo (2:36):

> *«La cotización puede ir dirigida al de compras generalmente, al de
> logística, que es el asistente o el jefe de compras, rara vez el jefe de
> compras, o en otros casos también al personal de mantenimiento, puesto que
> en algunas empresas el mismo usuario es el encargado de pedir las
> cotizaciones según su requerimiento.»*

Y después (4:02): *«Cuando hago la cotización debo tener la opción para
elegir a qué contacto de los ya creados va dirigido el presupuesto»*.

Había UNO, en una columna de texto de `clientes`. Ahora hay una tabla
(`cliente_contactos`) con nombre, cargo, área, correo y teléfono propios, uno
marcable como principal, y el constructor de cotizaciones trae un desplegable
**«A quién va dirigida»** que se rellena solo al elegir cliente y propone al
principal.

Dos decisiones que conviene saber por si él pregunta:

- **Se puede escribir un nombre suelto** («Otra persona…»). Hay clientes
  donde quien pide hoy no es quien está en la ficha, y obligar a darlo de alta
  antes de poder cotizar es poner una puerta donde hacía falta un pasillo.
- **La cotización guarda el id Y el nombre.** No es redundancia: un documento
  dice lo que decía cuando se emitió. Si el jefe de compras se va de la
  empresa, la cotización de hace seis meses sigue diciendo a quién se le mandó.

#### Lo que esta migración dejó roto dos días, y nadie vio

Luis, la noche del 02/09: creó una cotización, la guardó y le salió

    column clientes_1.contacto does not exist (42703)

al abrirla, y otra vez al llegar desde la ficha de un cliente.

La 035 **borró `clientes.contacto`** —esas dos líneas están en el propio
fichero de la migración— y dos consultas de `cotizaciones` se quedaron
pidiéndosela:

- el embed del detalle, `clientes!inner(… contacto …)`, escrito el 21/08;
- `COLUMNAS_OPCION`, el cliente preseleccionado que llega con `?cliente=`,
  escrito el 28/08.

`ClienteOpcion` SÍ se actualizó ese día —su comentario dice literalmente
*«Desde la 035 sale de `cliente_contactos`»`*— así que el tipo sabía la verdad
y la consulta no. **Dos `as` se interpusieron**: un
`as unknown as Omit<ClienteOpcion, …>` en el selector y un `as never` en el
detalle. Un `as` no comprueba nada: afirma. Es la tercera vez en este proyecto
que un cast tapa un defecto real —las otras dos, la ficha de proveedor y las
columnas de `v_valorizacion_inventario`— y las tres veces salió en pantalla, no
en el typecheck.

Y no se vio antes por una razón boba: **la base tenía cero cotizaciones**. Las
dos rutas rotas son «abrir una cotización» y «cotizarle a este cliente», y
hasta esa noche no había ninguna que abrir.

**Arreglado el 02/09.** La regla de a quién se le habla —el principal si lo
hay, si no el primero activo— vive ahora en
`clientes/dominio/contactos.ts` (`aQuienSeLeHabla`, con sus cuatro pruebas) y
la usan los DOS módulos. Tenerla dos veces era el plan y salió exactamente así:
uno de los dos no se enteró del cambio. El `as` del selector se cambió por un
mapeo campo a campo, que es lo que habría fallado a la hora de compilar.

Comprobado en la pantalla, que es lo único que lo habría cazado: la cotización
abre, el cliente preseleccionado carga con su contacto, y una cotización sin
destinatario propio cae al contacto principal del cliente.

### 2 · Departamento, provincia y distrito

*«Aquí en el ubigeo, que es el distrito, debería traer, aquí tenemos que
tener todos los distritos y provincias, departamentos»* (7:23).

Tenía razón y el problema estaba anotado desde el 28/08: `ubigeo` tiene 64
distritos de ~1.890, y el guardado DESCARTABA el que no conocía. O sea que un
cliente de Trujillo se guardaba sin distrito y nadie se enteraba.

**Lo que cambió es que el dato ya lo teníamos y lo estábamos tirando.** La
consulta de RUC devuelve las cuatro cosas, no solo el código — comprobado
contra la respuesta real que hay en caché:

```
"ubigeo": "150130", "distrito": "SAN BORJA",
"provincia": "LIMA", "departamento": "LIMA"
```

Ahora la tabla **aprende**: el distrito que no está se da de alta con lo que
respondió SUNAT, marcado con `origen = 'sunat'` para distinguirlo de los 64
revisados a mano. El formulario enseña «LIMA · LIMA · SAN BORJA» en vez del
código pelado.

Esto **no** contradice lo de «el padrón no se inventa». La diferencia es la
fuente: el código no lo deduce nadie, lo dice SUNAT sobre ese contribuyente —
la misma autoridad que después valida el documento. **El padrón completo del
INEI sigue pendiente** y sigue siendo la solución de verdad: los distritos a
los que Willy despacha pero de los que no ha consultado ningún RUC siguen sin
estar. Esto llena la tabla por uso, no de golpe.

### 3 · La ficha de cliente estaba desordenada

*«Vamos a ordenar bien cliente y nuevo cliente que está desordenado.»*

La caja se llamaba «Datos comerciales» y mezclaba dos cosas: lo que es de la
EMPRESA (nombre comercial, sector, su central) y lo que es de una PERSONA
dentro de ella. Ahora son tres secciones: **Datos de la empresa**,
**Contactos** y **Dirección**.

### 4 · La línea de crédito no se entendía

Preguntó qué significaba y se respondió a sí mismo con la lectura equivocada:
*«la línea de crédito es hasta cuánto máximo le puedo facturar en el mes»*.
**No es al mes: es cuánto puede DEBER a la vez.**

Que el usuario principal tenga que preguntarlo significa que la pantalla no lo
decía. Los tres campos ahora se explican solos:

| Campo | Lo que dice ahora |
|---|---|
| Línea de crédito | Cuánto puede DEBER a la vez, sumando todas sus facturas sin pagar. No es un tope mensual. 0 = sin tope. |
| Días de crédito | Desde que se emite la factura hasta que vence. 30 es lo habitual. |
| Días de gracia | Lo que se le aguanta DESPUÉS de vencer antes de perseguirlo. |

> ⚠️ **Y hay un dato que hay que preguntarle.** De los 37 clientes cargados,
> **30 están «a crédito» con 0 días, 0 de gracia y 0 de línea**. Con 0 días la
> factura nace vencida el mismo día que se emite. Salió así de la carga del
> 28/08 —su histórico decía crédito pero no decía cuántos días— y no me lo
> invento. Hace falta que diga su plazo estándar; si es 30, se corrige en una
> sentencia.

### 5 · Y lo que se pidió después: «el relleno es largo»

Fuera de la reunión, mirando la pantalla: *«mejora el proceso de relleno que
es largo, cómo podríamos hacerlo más interactivo»*.

El diagnóstico salió de contar. La ficha pedía **22 campos**. Y de sus 37
clientes reales, en dos años del sistema anterior:

| Campo | Llenos |
|---|---|
| `direccion` | 37 de 37 |
| `email` | 1 de 37 |
| `sector`, `telefono`, `whatsapp`, `referencia_direccion`, `linea_credito`, `dias_credito`, `dias_gracia` | **0 de 37** |

**Le pedíamos 22 cosas y llenaba 2.** Eso no se arregla con mejor maquetación:
se arregla dejando de preguntar. Lo que se hizo:

1. **Lo que trae SUNAT se pliega en una tarjeta.** Razón social, dirección,
   distrito y referencia eran cuatro cajas abiertas; ahora son dos líneas de
   resumen con un «Corregir» al lado. En el 95 % de las altas no se tocan.
2. **Las decisiones son clics, no cajas.** «¿Cómo paga?» son dos tarjetas en
   vez de un desplegable —un desplegable para elegir entre DOS cosas es un
   clic de más— y los días de crédito son botones **15 / 30 / 45 / 60** más
   «Otro…». Esto además ataca el problema de los 30 clientes con 0 días: un
   campo numérico vacío se queda en cero y nadie lo nota; un botón hay que
   pulsarlo, y si no se pulsa ninguno sale el aviso en amarillo.
3. **El tope de deuda, detrás de un clic.** Ninguno de los 37 lo tiene puesto.
4. **El contacto, detrás de un botón**, y con dos campos (nombre y cargo); su
   correo, teléfono y área detrás de otro clic. *(Superado el 01/09: ahora es
   una lista de varios contactos con «Guardar y añadir otro» — ver §7.c.)*
5. **Los siete campos que nadie llenó nunca**, detrás de «Más datos · N de 7»
   —con contador, para no tener que abrirlo a comprobar si hay algo dentro—.
   **No se borró ninguno**: puede que le sirvan, y esa decisión es suya.

El resultado es que **el alta entera cabe en una pantalla sin desplazarse**,
de las cuatro que ocupaba antes.

Y de regalo, la pantalla ahora **enseña los dos problemas de la carga** en vez
de esconderlos. Abriendo AICACOLOR S.A.C. (Quillabamba, Cusco) se lee:

> **Sin distrito.** Hace falta para la guía de remisión; se puede poner después.
>
> **Con 0 días la factura nace vencida el mismo día que se emite.** Elige un plazo.

### 6 · La cascada de ubigeo, y lo que había escondido debajo

*«¿La idea es ponerlo por select que traiga los datos, no? O sea provincia,
distrito, aparte de la dirección que trae.»* — sí, y eso es lo que había
pedido Willy. La 036 solo había dejado escritas las funciones del servidor.

**No se podía cablear todavía, y ese era el problema de fondo.** Con 64
distritos de 1.874, una cascada se ve rota: elegir Cusco y que solo salga la
provincia «Cusco» —con el cliente real de La Convención sin aparecer— es peor
que no tener cascada. Así que primero el padrón.

#### De dónde salió

De dos fuentes públicas cruzadas, porque ninguna sirve sola:

| Fuente | Para qué | Por qué no sola |
|---|---|---|
| **CONCYTEC** · concordancia de ubigeos | Los códigos de INEI, RENIEC y SUNAT en la misma fila | Nombres en MAYÚSCULA y sin tildes |
| **ernestorivero/Ubigeo-Peru** · padrón 2016 | Los nombres bien escritos: «Áncash», «Junín», «Daniel Hernández» | Numera Tayacaja como SUNAT y Putumayo como INEI: sus códigos no son un sistema |

Se cruzaron **comprobando el nombre**, no por orden de preferencia. No es un
detalle: al cruzar por orden, Ñahuimpuquio se llevó el nombre de Huaribamba,
que es su vecino en la otra numeración. Se vio porque salieron dos
«Huaribamba».

**La validación fue contra los 64 que ya teníamos**, que estaban revisados a
mano: **64 de 64 coinciden**, y en dos casos los nuestros están mejor escritos
(«Lurín», «Pachacámac»), así que no se pisan. Y contra las cinco respuestas
reales que hay en la caché de consultas de RUC: las cinco cuadran.

#### Lo que apareció debajo, que era lo importante

**INEI y SUNAT no usan el mismo código en 11 distritos**, y no por poco:

```
Tayacaja (Huancavelica)   INEI 090708 Huaribamba  →  SUNAT 090709
                          INEI 090712 Salcabamba  →  SUNAT 090714
Putumayo (Loreto)         INEI 160801 Putumayo    →  SUNAT 160109
```

En Tayacaja SUNAT va corrido uno o dos desde Huaribamba. En Putumayo, que es
provincia desde 2014, el INEI le dio código propio y SUNAT dejó sus distritos
colgando de Maynas.

> ⚠️ **Y ahí había un fallo vivo desde la 036.** La consulta de RUC devuelve el
> código de **SUNAT**, y `asegurar_ubigeo` lo buscaba en `ubigeo.codigo`, que es
> el del **INEI**. Un contribuyente de Huaribamba habría quedado guardado en
> **Ñahuimpuquio**, sin un solo error por ninguna parte — y la guía habría
> salido despachada a otro sitio. Arreglado en la 038, que busca primero por
> `codigo_sunat`, con centinela que lo comprueba.

Otros **41 distritos no tienen código en SUNAT**: son los creados después de
su última actualización (Quichuas, Andaymarca, Roble, Pichos, Santiago de
Tucuma…). A esos no se les puede emitir guía electrónica.

> **REGLA PARA QUIEN ESCRIBA LA GRE:** el documento lleva **`codigo_sunat`**, no
> `codigo`. Y si es null hay que **negarse a emitir** con un mensaje que lo
> explique, no mandar el del INEI. `ubigeo_de_sunat()` (038) lo devuelve.

#### Por qué la clave sigue siendo el código del INEI

También costó un intento. Usar el de SUNAT donde exista y el del INEI donde no
**mezcla dos numeraciones y colisiona**: Surcubamba (SUNAT 090717) y Quichuas
(INEI 090717) caían en la misma clave. El INEI es biyectivo sobre los 1.874;
SUNAT tiene 41 huecos. La clave tiene que ser la completa.

---

### 7 · Repaso del 01/09 · «el lápiz no se ve» y «faltan más contactos»

Willy volvió a mirar la pantalla de cliente nuevo. Tres cosas, y las tres
tenía razón.

**a · El lápiz de «Corregir» no se veía.**

> *«Hay que poner diseño en editar, corregir con el lápiz no se ve mucho; para
> el cliente que es corto de vista no ve bien.»*

Era peor de lo que suena. El botón era `ghost` en tamaño `xs`: 24 px de alto,
texto de 12 px en gris, icono de 14 px, **sin borde**, sobre un fondo azul
claro. Eso no es un botón, es una decoración — y era el único camino para
corregir un dato oficial equivocado. Ahora es un `outline` a altura completa,
con borde, y dice **«Corregir datos»**, no «Corregir».

De paso subió el tamaño de lo que hay dentro de la tarjeta: la razón social a
16 px y la dirección a 14 px. Es el dato que se viene a comprobar; estaba en
12 px gris.

**b · «Listo, plegar» era un enlace, no un botón.**

> *«Después de corregir, el "listo plegar" debería ser un botón de listo.»*

Lo era: 12 px azul subrayado al pasar por encima. Ahora es un botón de verdad
con su marca de comprobado, y dice **«Listo, ya está bien»**.

No dice «Guardar» a propósito, aunque él usó esa palabra: ese botón **no
guarda nada**. Lo escrito ya está en el formulario y se manda con «Crear
cliente». Llamarlo «Guardar» prometería un guardado que no ocurre y dejaría a
la persona pensando que ya terminó.

**c · En el alta solo cabía UN contacto.**

> *«Recuerda que puede tener uno o varios contactos, entonces esos datos se
> guardan con la empresa; falta un botón que guarde y añada más contactos.»*

Aquí tenía razón en algo que se nos había quedado a medias el 31/08. La tabla
de contactos existía y la ficha del cliente ya dejaba meter varios — pero **el
alta aceptaba uno solo**. Para el segundo había que crear la empresa, entrar
en su ficha y volver a escribir, justo cuando se tienen los tres nombres
delante en el correo que acaba de llegar.

Ahora el alta lleva una lista: se añaden de uno en uno con **«Guardar y añadir
otro»** —que deja el bloque abierto, en blanco y con el cursor en el nombre—
y se cierra con «Listo». La lista se ve mientras se escribe, con quién es el
principal, y se puede corregir o quitar cualquiera antes de guardar. Al pulsar
«Crear cliente» viajan todos dentro del mismo envío.

Detalles que importan y no se ven:

- **Se acumulan en memoria, no se guardan de uno en uno.** No hay más remedio:
  `cliente_contactos.cliente_id` es NOT NULL con clave foránea, y el cliente
  todavía no existe. La alternativa —crear la empresa al vuelo con el primer
  contacto— dejaría un cliente a medias en el maestro si se cancela el alta.
- **El nombre repetido se avisa al escribirlo.** `ux_cliente_contactos_nombre`
  lo pararía igual, pero con la empresa YA creada y un 23505 que no significa
  nada: se vería el cliente sin ningún contacto y sin explicación. La regla
  vive en `dominio/contactos.ts` y la usan los dos lados.
- **El primero es el principal sin preguntar.** Si solo hay uno, es a él a
  quien van las cotizaciones. Y si se quita al principal, hereda el siguiente:
  una empresa con contactos y sin principal cotizaría sin destinatario.

**d · Y lo mismo en la ficha del cliente.** Los botones de la lista eran un
lápiz y una papelera sueltos, en `xs`, con el significado escondido en un
`sr-only` que solo lee un lector de pantalla. Quien ve poco no tiene forma de
saber cuál es cuál — y una de las dos da de baja al contacto. Ahora las dos
llevan texto: **«Corregir»** y **«Dar de baja»**. También se le añadió el
«Guardar y añadir otro».

**Y un fallo que salió por el camino.** Al corregir a un contacto, el botón
«Guardar» mandaba siempre `principal: false`. O sea que corregirle el teléfono
al jefe de compras **le quitaba la estrella**, y esa empresa se quedaba sin
destinatario por defecto sin que nadie lo pidiera. Ahora reenvía la marca que
tenía.

**Comprobado, no supuesto.** Se creó un cliente de prueba con dos contactos,
se verificó contra la base que llegaron los dos con el principal correcto y
que `buscar_clientes` devuelve `contactos: 2`, y se borró. Censo después:
37 clientes, 0 contactos — como estaba.

**Una diferencia que apareció al comprobarlo.** La comparación de nombres de
JavaScript recorta los espacios de los extremos y `normalizar_texto` de
Postgres no (`normalizar_texto('  María Ángeles  ')` devuelve los espacios).
Es seguro porque el esquema pasa todo nombre por `trim()` antes de insertar,
pero queda anotado en `dominio/contactos.ts` por si algún día alguien inserta
sin pasar por ahí.

---

### Lo que dijo y NO hacía falta tocar

- *«Tiene que crearse aquí una cuenta que es gratuito para hacer las consultas»*
  (5:02) — **ya está**. El token de Decolecta se configuró el 28/08 y la
  consulta funciona: 4 de 100 usadas este mes.

---

## Cierre del 28/08 · qué queda, y de qué depende cada cosa

El día fue: el selector de cliente, el historial de ventas de Willy entero
—analizado, separado y cargado—, y cuatro cosas que estaban anotadas y se
cerraron. **Ya no hay ni un dato `[DEMO]` en la base.**

### Lo que se puede hacer sin hablar con nadie

**Nada urgente.** Es la primera vez en el proyecto que la lista está así, y
conviene decirlo en vez de inventarse trabajo:

- ~~El selector de proveedor de compras y recepciones~~ · **hecho el 31/08**
  (migración 033), y de camino salió R10, que era lo gordo del día. Ver §6.
- Unificar los cuatro buscadores con el `BuscadorProductos` del design system.
  Ya comparten la LÓGICA —que era lo que dolía— y desde el 31/08 comparten
  también el resaltado (`lib/texto-busqueda.ts`); lo que falta es el marcado, y
  es cosmético.
- El truncado mudo de los desplegables de FILTRO de `/compras` y
  `/recepciones`, que se quedó fuera de la 033 a propósito (§6).
- Que «condiciones» de la cotización sea una lista en vez de texto libre (§6).
  Necesita saber cuáles usa él, así que en realidad tampoco es independiente.
- Verificar en un móvil de verdad. Nadie lo ha hecho (§6).

### Lo que espera a WILLY · el viernes

> **Actualizado el 01/09.** Cuatro de esta lista se movieron en la reunión de
> ese día, y se añadieron seis cosas nuevas. Lo que cambió:
>
> - **La columna P.M. quedó zanjada** (punto 2): es el precio MÍNIMO. Él lo
>   dijo — *«yo lo había tomado como precio de mercado, pero está bien,
>   podría considerarse como precio mínimo también»*.
> - **El maestro de productos llegó** (punto 8), pero **sin precios ni
>   stock**: las columnas P.C., P.V., P.M., STOCK ACTUAL y STOCK MINIMO están
>   vacías en las 2.230 filas. Se puede cargar el catálogo; no se podrá
>   cotizar con él. Ver «Reunión del 01/09» §C.
> - **Y el maestro trae un problema que hay que decidir antes de cargarlo**:
>   17 códigos existen en DOS marcas —`6205` es de SKF y también de FAG— y el
>   índice único actual no lo admite. Tres salidas, mi recomendación y el
>   porqué, en «Reunión del 01/09» §D.
>
> **Lo nuevo que espera a Willy son las cinco preguntas del plan de compras**
> (§G): si confirmar un pedido aparta la mercadería, en qué moneda registra la
> compra local, si el comparador es obligatorio, si el sistema le avisa cuando
> llega el pedido de un cliente, y el plazo por defecto de la compra local —
> dio 15 días para exterior y 2–4 para fabricación, pero no el de local, que
> es la más frecuente y va a salir impresa en todas sus cotizaciones.

Por orden de lo que desbloquea:

1. **Cómo agrupa lo que no son rodamientos.** La taxonomía que hay es una
   PROPUESTA mía: nueve familias inventadas desde sus propias facturas para que
   los 790 productos tuvieran dónde entrar. Las familias llevan escrito en su
   descripción que están pendientes de que él las confirme. Es la conversación
   más rentable y son diez minutos con la tabla de HISTORIAL-VENTAS §4 delante.
2. **La columna P.M.** — ¿piso duro o precio de mercado? Sigue sin contestarse
   y ahora hay 790 productos que dependen de la respuesta (§2.1 del feedback).
3. **Por dónde quiere las alertas**, WhatsApp o correo. Es lo único de la
   PRIMERA reunión que sigue exactamente igual.
4. ~~**Los cuatro campos de la ficha de cliente**~~ · **medio contestado el
   31/08.** El «cargo del contacto» resultó ser la punta de otra cosa: no era
   un campo de más, era que faltaban VARIOS contactos (035). Los «días de
   gracia» tampoco sobraban: no se entendían, y ahora la pantalla los explica.
   Siguen sin respuesta `sector` y `referencia_direccion`.
5. **Confirmar las tres notas de crédito.** Es lo único de toda la carga que se
   dedujo en vez de leerse (HISTORIAL-VENTAS §10.3).
6. **Si tiene deuda viva de verdad.** El histórico entró como pagado a
   propósito; si hay facturas por cobrar, que diga cuáles.
7. Sus **correlativos de partida**, su **cuenta bancaria** y sus **agencias**.
8. El **maestro de productos** — el que trae costo, stock, peso y P.M. Sin
   costo no hay margen, y el margen es media pantalla del ERP. Hoy el tablero
   enseña «margen 0.0% sobre el costo» con USD 19.394 vendidos, y no es un
   error de cálculo: es que el costo de los 790 productos es cero.
9. **Su plazo de crédito estándar.** 30 de sus 37 clientes quedaron «a
   crédito con 0 días», o sea con la factura vencida el día que se emite. Es
   una sentencia de arreglo en cuanto diga el número. **Desde el 02/09 son
   97 clientes**, así que la respuesta vale para el triple.
10. ~~Su **lista de proveedores**~~ · **llegó el 02/09 y está cargada** (§J).
   97 proveedores y 60 clientes nuevos. Las pantallas de compra y recepción
   ya se pueden enseñar funcionando. Lo que ese archivo NO traía, y sigue
   haciendo falta:

   a. ~~**Qué marcas trae cada proveedor.**~~ · **ya no hace falta
      preguntarlo**: desde la 046 la marca se rellena sola con cada compra
      (§K). Si él quiere adelantarlo, la ficha del proveedor lo admite a
      mano; pero no es un bloqueo.
   b. **Condiciones de pago.** Los 97 quedaron en «contado», que es el valor
      por defecto; con varios tendrá crédito.
   c. **Teléfonos, correos y personas de contacto**, ni de clientes ni de
      proveedores. **Es lo que más valor tiene ahora mismo**: desde el 02/09
      existe la pantalla que le pide precio a varios de golpe por WhatsApp
      (§M), y sin los números funciona a medias — solo deja copiar el texto.
   d. **El RUC bueno de RG CORPORATION S.A.C.** El del archivo,
      `10465742185`, no valida. Entró sin documento; así no se le puede
      emitir ni recibir un comprobante.

#### El mensaje del 04/09 · las cinco que se le pidieron

El texto tal cual, para copiar y pegar, vive en [PREGUNTAS-WILLY.md](PREGUNTAS-WILLY.md).

De los quince pendientes de arriba se le mandaron **cinco**. Un WhatsApp con
quince preguntas se contesta con cero; van ordenadas de la que le cuesta tres
segundos a la que le cuesta trabajo, y cada una con el porqué en una línea.

| | Qué se le pidió | Qué destraba |
|---|---|---|
| 1 | **El RUC** de Inversiones Rodatech · + dirección y dominio de correo | Los cuatro documentos impresos (§S). Hoy llevan `20601234567`, que es de relleno **y encima con el dígito verificador mal** |
| 2 | **Plazo de crédito estándar** | 97 clientes con la factura vencida el día que se emite |
| 3 | **Compra local: plazo y moneda** | El plazo sale impreso en cada cotización; la moneda tapa el agujero de §G.1 — hoy un `S/ 15.20` se guarda como `$ 15.20`, el costo se infla 3.7× y el margen sale negativo **sin que salte ningún error** |
| 4 | **¿Confirmar un pedido aparta la mercadería?** | Cambia el comportamiento de la bandeja «Por comprar», que ya está construida (§G.2) |
| 5 | **Los celulares de sus proveedores** | Media función de «Pedir precio» (§M, §X): los 97 están cargados y ninguno tiene número |

La 4 se le planteó con un caso concreto —tiene 10, le confirman 6, ¿quedan 4
libres o se apartan los 6?— y no con la palabra «reserva», que no significa
nada fuera de aquí.

**Lo que se dejó fuera a propósito:** P.M., canal de alertas, las 3 notas de
crédito, la deuda viva, correlativos de partida / banco / agencias, la
taxonomía de 9 familias, el código de doble marca (§D) y el maestro con
precios. Los tres últimos no son de WhatsApp: hay que enseñárselos en
pantalla, y el maestro con precios merece su propia reunión —sin costos el
tablero le sigue diciendo que gana el 100 % (§W)— no una línea perdida en un
chat.

#### Tres cosas que se buscaron antes de preguntar

Para no hacerle perder el tiempo con lo que ya estuviera en sus archivos:

- **El RUC del emisor no está en ninguna parte.** `historial de ventas.xlsx`
  trae serie, correlativo y el RUC del *cliente*, nunca el suyo. Hay que
  pedirlo sí o sí.
- **Los teléfonos tampoco.** El archivo tiene columnas `Email` y `Teléfono`:
  de 37 clientes, **2 tienen correo y ninguno tiene teléfono**. Confirmado que
  no hay de dónde sacarlos ni para clientes ni para proveedores.
- **Su dominio real es `rodatechperu.com`**, no el `rodatech.pe` que usan las
  cuentas de desarrollo. Salió de un `wfernandez@rodatechperu.com` que se
  coló en una fila de cliente. Va a confirmarlo él, porque ese correo se
  imprime en todos los documentos.

### Lo que espera a LUIS

1. **El proyecto Supabase de pruebas.** Sigue siendo lo más grande que falta y
   nadie más lo puede crear. Es lo que separa «las pantallas abren» de «el
   dinero cuadra»: hoy 40 pruebas dicen lo primero y ninguna lo segundo. Son
   cuatro pasos y media hora (§2).
2. ~~**El padrón de ubigeo completo.**~~ · **hecho el 31/08** (migraciones 037
   y 038). Ya son **1.874 distritos, 196 provincias y 25 departamentos**, con
   la concordancia INEI ↔ SUNAT. Ver §6 de la reunión del 31/08: la parte que
   importa es que los dos códigos NO son el mismo en 11 distritos, y que eso
   escondía un fallo que habría despachado mercadería al sitio equivocado.
3. El **certificado digital**, cuando toque. Avisarle con dos semanas.

### Lo que está bloqueado y no es culpa de nadie

**El envío GRE** (§3). Se escribiría a ciegas: la guía electrónica no tiene
ambiente de pruebas y encima necesita el certificado. La primera ejecución real
sería contra producción. Mejor cuando haya con qué probarlo.


### Dos avisos para el día de la entrega (§7)

- **Hay que rotar las credenciales.** El token y las llaves de Supabase están
  en texto plano en `.env.local` y son de la cuenta del cliente. Se trabajó así
  a propósito y quedó dicho que se cambian al entregar: este es el recordatorio.
  Con ellas va `SUNAT_ENCRYPTION_KEY` en Vercel, que tiene que ser **la misma
  que en local** o las credenciales guardadas no se pueden descifrar.
- ~~**Los datos `[DEMO]` se borran pasando antes un ajuste de inventario.**~~
  **HECHO el 28/08**: ya no queda ninguno. Entró la cartera real (37 clientes,
  790 productos) con respaldo previo a JSON.

  El ajuste de inventario que este aviso exigía **no hizo falta, y por un
  motivo que conviene entender**: se borró el kardex ENTERO, no solo los
  documentos. El peligro era dejar movimientos huérfanos citando documentos que
  ya no existen; sin kardex y sin stock no hay nada que pueda mentir. Si algún
  día hay que borrar solo una parte, el aviso vuelve a valer tal cual: la guía
  de prueba movió stock de verdad, y borrar el documento sin ajustar deja el
  stock mintiendo — que es lo que ya pasó con el costo del 6205 (ver R2).

---

## 0 · Auditoría de sistema · 31/08

Revisión del sistema con ojos de operación, no de funcionalidad: qué pasa
cuando esto lleve seis meses funcionando y alguien se equivoque. Ordenado por
lo que más duele.

### 0.1 · ~~No había NI UNA copia de seguridad~~ · mitigado el 31/08

Lo más grave de todo, y comprobado contra la API de gestión de Supabase:

```
GET /v1/projects/{ref}/database/backups
→ { "pitr_enabled": false, "backups": [] }

GET /v1/organizations/{org}
→ { "plan": "free" }
```

**Cero copias.** El plan free de Supabase no las tiene. Y dentro hay dos años
del histórico de ventas de Willy, su cartera y su catálogo — datos que él no
puede volver a dar porque salieron de un Excel que se armó una vez.

Un `delete` sin `where`, una migración mal escrita o que alguien borre el
proyecto del panel, y no hay vuelta atrás.

**Mitigado, no resuelto:** `pnpm db:respaldar` vuelca las 43 tablas a JSON en
`documentosrodamiento/respaldos/` (gitignorado), con manifiesto de recuentos y
el orden de dependencias para poder restaurar. La primera copia de la historia
de este proyecto son 4.800 filas. **Correrlo antes de cada migración que borre
o reescriba datos, y una vez por semana.**

**Lo que falta de verdad:** plan Pro (~25 USD/mes) con PITR. Es decisión del
cliente y de coste, no técnica — pero hay que planteársela antes de entregar,
no después del primer susto.

> ⚠️ Y otra del plan free: **el proyecto se pausa solo tras 7 días sin
> actividad.** Si el proyecto se para dos semanas por vacaciones, Willy entra y
> se encuentra el ERP caído. Se reactiva desde el panel, pero conviene saberlo
> antes de que pase.

### 0.2 · ~~Cero observabilidad sobre un ERP que factura a SUNAT~~ · arreglado el 02/09

No había Sentry ni equivalente, ni logging de servidor, ni `global-error.tsx`.
Cuando una Server Action fallaba, el error se pintaba en la pantalla del
operador **y moría ahí**: nadie más se enteraba.

Y esto ya nos había pasado. `lib/errores.ts` lleva escrito en su cabecera que
la ficha de producto estuvo días rota por un `PGRST200` sin que nadie lo
supiera. Se arregló el síntoma; la causa —que no hay forma de enterarse—
seguía.

En una pantalla de listado es molesto. En `facturacion/acciones/emitir.ts` es
una factura que no salió y nadie sabe por qué.

**Arreglado el 02/09, migración 054.** Una tabla `fallos` y un
`registrar_fallo(origen, mensaje, codigo, ruta)`, más `anotarFallo()` en
`lib/errores.ts` conectado a **55 sitios repartidos en 7 módulos**
(facturación, compras, recepciones, cotizaciones, cobranzas, inventario). Lo
roto sale **arriba** de la bitácora en `/actividad`, con un botón de «Ya está
visto».

Cuatro decisiones que conviene recordar:

- **Se apila por huella.** `md5(origen | código | primeros 120 caracteres del
  mensaje)`. Un fallo que ocurre cien veces es un fallo, no cien; una lista de
  cien filas iguales no la mira nadie. El índice único es parcial —`where not
  revisado`— para que marcar uno como visto deje que el siguiente vuelva a
  abrir fila.
- **No guarda payloads.** Ni el cuerpo de la acción ni el de la petición: en
  este ERP eso serían RUC, direcciones y precios de clientes reales. Se guarda
  dónde pasó, qué dijo el error y quién lo vio, que es con lo que se reproduce.
- **`anotarFallo` no lanza nunca**, y escribe con `after()`. Un registro de
  fallos que rompe la pantalla que intentaba salvar, o que la hace más lenta,
  no sirve de nada.
- **No hay política de INSERT.** Se escribe solo por el RPC, que es quien
  normaliza la huella; una inserción directa rompería el apilado.

`global-error.tsx` y `app/acciones-error.ts` cubren lo que revienta en el
navegador. Son autónomos a propósito —no importan nada del proyecto—: un
`global-error` que depende del módulo que acaba de fallar no se llega a pintar.

Cuando llegue Sentry esto se apaga en un sitio. Mientras tanto, contesta la
única pregunta que importaba: *¿está fallando algo que nadie me está contando?*

### 0.3 · ~~Tres contadores que dan un número EQUIVOCADO en silencio~~ · arreglado el 02/09

La peor clase de fallo: no revientan, mienten.

| Dónde | Tope | Qué calcula mal |
|---|---|---|
| `alertas/api/consultas.ts` · `resumenBandeja` | 2.000 | El contador de la campana. Con el cron diario (032) generando alertas, es cuestión de meses. |
| `cobranzas/api/consultas.ts` · `carteraPorCliente` | 1.000 | La deuda por cliente. El comentario de arriba dice «llamar en el orden equivocado cuesta dinero» — y a partir de 1.000 documentos abiertos la suma es falsa. |
| `equivalencias/api/consultas.ts` · `totalDeclaradas` | 2.000 | El recuento de equivalencias. |

Los tres agregaban **sobre la página**, no sobre la tabla. Mientras hubiera
menos filas que el tope acertaban, así que los tres daban bien el día que se
escribió esto — y el día que se pasara el tope seguirían dando un número,
solo que otro.

Es exactamente la misma clase de fallo que el truncado mudo de los
desplegables de proveedor (§6), que ya mordió una vez.

**Arreglado el 02/09, migración 048.** Tres vistas que cuentan en Postgres:
`v_resumen_alertas`, `v_cartera_por_cliente` y `v_resumen_equivalencias`. El
centinela de la migración no comprueba que devuelvan un número, sino que
devuelven **el mismo** que la cuenta a mano sobre la tabla entera: si alguna
se separa, la migración no aplica.

Dos detalles que conviene recordar:

- **La agregación baja a la base; lo que decide algo se queda arriba.** En
  cobranzas la vista suma por cliente, pero la PRIORIDAD —a quién llamar
  primero— se sigue calculando en TypeScript, donde está probada.
- **`resumir()` de alertas se borró.** Se quedó sin llamador, y código muerto
  CON PRUEBAS parece mantenido: el día que alguien lo reutilizara volvería a
  contar sobre una página. Por eso `pnpm test` baja de 939 a 936.

Comprobado además que las tres vistas responden por PostgREST con los
nombres de columna exactos que pide la aplicación. Es lo único que la
pantalla no puede enseñar cuando la tabla está vacía: un nombre mal escrito
daría cero sin error, que es el mismo fallo otra vez.

### 0.4 · ~~Consultas sin techo~~ · arregladas el 02/09

Traían la tabla entera y crecen con el uso:

- `reportes/api/consultas.ts` · `embudoComercial` → `v_trazabilidad_venta`
  **completa**. Crece con cada cotización y cada venta. El más peligroso.
- `inventario/api/consultas.ts` → `v_valorizacion_inventario` con `select("*")`
  y sin límite, **leída desde cuatro sitios** (productos, reportes ×2).
- `reportes` · `agingCartera` y `resumen` → `v_cartera` completa.

**Arreglado el 02/09, migración 053** (`v_embudo_comercial` y
`v_aging_cartera`).

Que no llevaran `.limit()` no significaba que no tuvieran tope: **PostgREST
corta a las 1.000 filas y no lo dice**. O sea, exactamente el mismo fallo
que los tres contadores de §0.3 —agregar sobre la página en vez de sobre la
tabla— con la misma forma de morir: aciertan hoy y empiezan a mentir el día
que se pase el tope.

**Una corrección a la propia auditoría.** El tercero de la lista,
`v_valorizacion_inventario`, **no crece**: ya agrupa por subfamilia en
Postgres y devuelve 34 filas hoy y 34 dentro de tres años. Estaba junto a
los otros dos y no era el mismo caso; lo único que le hacía falta era dejar
de pedirse con `select("*")`.

Y al hacerlo, otro `as` tapó un fallo: al listar las columnas a mano se me
quedaron fuera tres que el tipo declara, y el `as unknown as
FilaValorizacion[]` lo silenció — habrían llegado `undefined` a la pantalla.
Es el segundo `as` que muerde hoy; el primero tumbó la compra (§Ñ).

En `agingCartera` había una excepción **razonada** a la regla del archivo:
«la cartera viva de esta empresa son decenas de documentos, no miles». El
razonamiento era bueno; lo que fallaba era otra cosa —el tope mudo— y una
vista más cuesta menos que el día en que se pase.

### 0.5 · ~~La bitácora existe y no la escribe nadie~~ · hecha el 02/09

La tabla `actividad` estaba creada, con su RLS y sus permisos… y **cero filas,
porque ningún sitio insertaba en ella**. En un ERP donde seis personas
comparten roles y se emiten documentos fiscales, «quién anuló esta factura»
es una pregunta que se va a hacer.

**Hecha el 02/09, migración 051**, y se lee en **Gestión → Qué ha pasado**
(solo gerencia y administración: dice quién hizo qué).

La escriben **disparadores**, no la aplicación. Una bitácora que hay que
acordarse de escribir es incompleta, y una incompleta es peor que ninguna:
da una respuesta que parece completa. Con disparadores da igual por dónde
entre el cambio — la pantalla, un RPC o alguien con SQL en la mano.

**Y no se apunta todo, que es la decisión que importa.** Un registro que lo
apunta todo entierra la respuesta el día que hace falta. Se vigila lo que
cambia **dinero, stock o permisos**, y de eso solo los campos que importan:
cambiar la dirección de un cliente no entra, cambiarle la línea de crédito
sí. Nueve tablas: comprobantes, cotizaciones, compras, recepciones, ajustes
de inventario, permisos, usuarios, clientes y productos.

Tres cosas que conviene recordar:

- **Es append-only.** Se le quitaron las políticas de UPDATE y DELETE, y el
  centinela falla si alguien se las devuelve. Una bitácora que se puede
  corregir no sirve de prueba, y el rol que borrara sus huellas sería justo
  el que hay que vigilar.
- **El nombre de quien lo hizo se COPIA**, no se deja para el join: si mañana
  ese perfil se borra, la bitácora tiene que seguir diciendo quién fue.
- **Comprobado que captura al usuario de verdad**: un cambio hecho desde la
  pantalla quedó como «Willy Rodríguez», no como «sistema».

Y un efecto secundario que valió la pena: **el centinela de la 052 se cazó a
sí mismo**. Al fabricar un envío atascado para probar el barrendero, la
bitácora apuntó las tres manipulaciones sobre una factura real. La migración
ahora las borra al terminar — una migración reaplicable que deja historia
falsa sobre un documento fiscal es peor que no tener bitácora.

### 0.6 · ~~Nadie reintenta los envíos a SUNAT~~ · hecho el 02/09

El modelo del ciclo SUNAT está bien —`estado_sunat` separado del comercial,
ticket, idempotencia si ya está aceptado— y hay un índice parcial
`ix_comprobantes_sunat_pend` sobre los pendientes, que es justo lo que
necesitaría un barrendero.

**El barrendero no existe.** La única tarea programada es la de alertas:

```
select jobname from cron.job;
→ rodatech-alertas-diarias
```

Si la red se cae después de mandar el XML, el comprobante se queda en
«enviado» para siempre salvo que alguien vuelva a pulsar el botón.

**Hecho el 02/09, migración 052**: `rescatar_envios_sunat()`, cada quince
minutos.

**No reenvía, y no debe.** No puede: el envío firma el XML con el
certificado digital, que vive en la aplicación y no en la base. Y aunque
pudiera, reenviar un comprobante fiscal sin que nadie mire es la clase de
automatismo que un día manda dos veces la misma factura.

El agujero real no era la falta de reintento: era que **un documento
atascado no se ve**. `enviar.ts` marca «enviado» ANTES de llamar a SUNAT —a
propósito, para no reenviar algo que quizá llegó— y si el proceso muere ahí,
el comprobante se queda invisible. El barrendero:

1. Devuelve a «pendiente» lo que lleva más de 15 minutos en «enviado». Un
   envío tarda segundos; quince minutos significa que el proceso murió.
2. Levanta una alerta por cada comprobante que lleva **un día** emitido sin
   respuesta de SUNAT. Un día y no diez minutos porque hoy se factura sin
   certificado, y avisar antes sería una alerta que nadie querría.

El botón lo sigue pulsando una persona. Lo que cambia es que ahora **sabe
que hay algo que pulsar**.

El centinela no se conforma con que la tarea quede programada: fabrica un
envío atascado de verdad, comprueba que vuelve a la cola y lo deja como
estaba. Sobre los 518 comprobantes reales la corrida sale a cero, que es lo
correcto — están todos en `aceptado` o `baja_aceptada`.

### 0.7 · Lo que el CI no hace · dos cosas cerradas el 02/09, la tercera bloqueada

`verificar.yml` corre typecheck, lint, tests y build. **No aplica migraciones,
no despliega y no corre los e2e.**

**Lo cerrado el 02/09:**

- **El build ya no depende de secrets.** Caía en rojo si `NEXT_PUBLIC_SUPABASE_URL`
  o `NEXT_PUBLIC_SUPABASE_ANON_KEY` no estaban configuradas en GitHub, y eso
  es un CI que miente: el paso solo mira el código. Ahora usa el secret si
  existe y valores de relleno si no — ninguna página se prerenderiza contra la
  base, así que compila igual. Rojo vuelve a significar «hay un fallo».
- **`pnpm db:revisar`** (`scripts/revisar-migraciones.mjs`), primero de todo
  porque es lo más barato y porque comprueba lo que ningún otro paso puede
  ver: **dos migraciones con el mismo número compilan, pasan el lint y pasan
  los tests**. Se aplican por nombre y una sola vez, así que una de las dos se
  quedaría fuera en silencio. En este proyecto es un riesgo real: dos hilos de
  trabajo distintos escriben «la 055» el mismo día.

**Lo que sigue abierto** —aplicar migraciones y correr los e2e en CI— necesita
un proyecto Supabase de pruebas. No puede apuntar al del cliente: los e2e
mueven stock, consumen correlativos y emiten documentos (`e2e/README.md`).
**Bloqueado en Luis.**

Y el despliegue seguirá fuera de CI a propósito: lo hace Vercel desde `main`.

### 0.8 · ~~`apps/demo` · 130 archivos que nadie usa~~ · borrada el 02/09

Una app Next.js paralela y completa, con su propio `package-lock.json` (npm
dentro de un monorepo pnpm), sus propias migraciones y scripts en Python.
Nadie la importaba desde `apps/web`, pero estaba dentro del workspace, así que
**CI la typechequeaba y la construía en cada push**.

**Borrada el 02/09.** Era la v1, la demo que se le enseñó a Willy en agosto, y
el README decía desde el principio que se eliminaba en la fase 7 — que es
donde estamos. Su último commit es `962aa77`, el mismo que la sustituyó.

Lo que más pesaba no era el tiempo de CI: era que traía **una segunda carpeta
`supabase/migrations` numerada del 001 al 015**. Dos juegos de migraciones con
los mismos números en el mismo repositorio, y solo uno que hay que aplicar. El
día que alguien —un agente, un compañero, yo mismo con prisa— abriera «la 004»
de la carpeta equivocada, el error no habría sido evidente.

Sigue entera en el historial. Se recupera con:

```bash
git checkout 962aa77^ -- apps/demo
```

### 0.9 · Lo que SÍ está bien, para no tocarlo

Conviene dejarlo escrito para que nadie lo «mejore»:

- **Los correlativos no se pisan.** `siguiente_correlativo` usa
  `update … returning`, que toma cerrojo de fila: dos usuarios emitiendo a la
  vez se serializan. No hay huecos ni duplicados.
- **Ningún N+1.** Los dos sitios que lo parecían —`cobranzas/acciones/cobrar`
  y `cotizaciones/acciones/gestionar`— resuelven con un `.in()` y un `Map`.
- **Ni un `TODO`, `FIXME`, `HACK` o `@ts-ignore`** en todo el código.
- **Los listados paginan por keyset**, no por offset, en las ocho pantallas
  que importan.

---

## 1 · Los demás módulos están vacíos

**Las 42 rutas son reales.** Ya no queda ningún cartel de «en construcción».
(El recuento sale de contar los `page.tsx`, así que incluye login y las de
alta y edición.)

**Reales:** tablero · cotizaciones (listado, constructor, ficha) · productos
(listado, alta/edición, importador) · clientes (listado, ficha, alta/edición) ·
**recepciones** e **inventario** ← el 24/08 · **proveedores** y **compras**
← el 25/08 · **facturación** (listado, emisión, ficha, configuración),
**informes** (cinco gráficos), **guías de remisión** (listado, preparación,
ficha) y **cobranzas** (cartera, cobro y gestiones) ← el 25/08 por la tarde ·
**alertas** (bandeja, filtros, leer/archivar y refresco), **equivalencias**
(cross-reference y captura a mano), **configuración** (empresa, series y
usuarios) y **trazabilidad por ítem** ← el 26/08

**La trazabilidad es la que más pidió Willy en la demo** y vive en
`/productos/{id}/trazabilidad`, con botón destacado en la ficha del producto.
Responde de un vistazo «a quién se lo compré y a cuánto» y «a quién se lo
ofrecí y a qué precio», que es lo que él resolvía rebuscando en WhatsApp.
Detalle en [FEEDBACK-26-08.md](FEEDBACK-26-08.md) §3.1.

Y **importaciones** ← el 26/08 por la tarde, que era el último cartel:
seguimiento de lo que está fuera, con courier, tracking, días de atraso y el
detalle de gastos —flete, seguro, aduana— que sustituye al total tecleado.
El fondo ya se había arreglado antes: la migración 022 corrigió que los gastos
se cobraran ENTEROS en cada recepción parcial.

### El backend de casi todos ya está escrito

Esto cambia la estimación. No son 15 módulos desde cero: `004_funciones.sql`
ya trae, con control de rol y probadas al aplicar:

| Función | Líneas | Para |
|---|---|---|
| ~~`emitir_comprobante` · `anular_comprobante` · `recalcular_comprobante`~~ | ~250 | ~~facturación, notas y anulación~~ · **cableadas 25/08** |
| ~~`generar_guia_desde_cotizacion` · `emitir_guia` · `anular_guia`~~ | ~165 | ~~guías~~ · **cableadas 25/08**; falta el envío GRE |
| ~~`recepcionar_mercaderia`~~ | ~110 | ~~recepciones~~ · **cableada 24/08** |
| ~~`registrar_ajuste_inventario`~~ | ~80 | ~~cuadre~~ · **cableada 24/08** |
| ~~`crear_compra` · `anular_compra`~~ | ~180 | ~~compras~~ · **escritas y cableadas 25/08** (migración 016) |
| ~~`registrar_pagos`~~ | ~40 | ~~cobranzas~~ · **cableada 25/08** |
| ~~`generar_alertas`~~ | ~115 | ~~alertas~~ · **cableada 26/08** (migración 021); falta el worker que las EMPUJE |
| `recalcular_precios_promedio` | ~45 | precio promedio |

La app usa **14 de ~33 RPCs**, más cuatro vistas analíticas. Para el resto de
módulos falta `acciones/` + `ui/`, no diseñar la base.

**Ojo con la excepción, que se descubrió al hacer compras:** la tabla existía
desde la 002 pero **no había ningún RPC**, y `numero` es `not null` sin
trigger de correlativo. O sea que la frase «solo falta la capa de arriba» hay
que comprobarla módulo a módulo antes de estimar: para compras hubo que
escribir 180 líneas de PL/pgSQL primero.

Orden sugerido, por lo que cierra el ciclo del dinero:

1. **El envío GRE de las guías** — el documento interno ya funciona y mueve el
   stock; falta mandarlo a SUNAT (ver §3).
2. **El worker que EMPUJA las alertas.** La bandeja ya existe y se refresca a
   mano, pero lo que Willy pidió fue que la alerta LLEGUE: *«pero no te llega
   como una alerta, tú tienes que entrar y ver»* (25:21). La tabla ya está
   preparada para ello —`alertas.notificado_en` en null significa «todavía no
   ha salido»— y falta el cron que llame a `generar_alertas()` y el envío por
   WhatsApp o correo.
3. El resto: importaciones.

**Sobre configuración, hecho el 26/08:** lo que la justifica es la columna
`series_documento.correlativo_inicial`. Hasta hoy, poner los correlativos
«desde el número que usted se quedó» (06:08) era un `update` a mano contra
producción — y equivocarse ahí significa emitir una factura con un número que
SUNAT ya tiene. Ahora la pantalla lo enseña con el próximo número calculado,
cuenta los huecos que se saltan y avisa distinto según la serie sea fiscal o
interna. También cambia los datos del emisor y el rol de cada usuario. No
crea usuarios: eso vive en Supabase Auth y el perfil lo crea el trigger.

**Sobre equivalencias, hecho el 26/08:** la cascada de `sustitutos_de()` ya
existía y la usaba el constructor de cotizaciones, pero su **primer peldaño
—la equivalencia declarada a mano— llevaba desde el principio vacío**, porque
no había ninguna pantalla desde donde capturarla. Ahora la hay, y de paso se
tapó un agujero: la tabla guarda `(producto_id, equivalente_id)` con un único
`unique` sobre esa pareja, así que A→B y B→A entraban las dos y
`sustitutos_de()` —que une los dos sentidos— habría enseñado el mismo producto
repetido. El par se guarda siempre ordenado (`parCanonico`), y así la
restricción que ya existía sí sirve.

**El ciclo de abastecimiento ya está entero y probado de punta a punta**: se
registró CMP-26-00001 (170.32 + 30.66 = 200.98), se recibió con REC-26-00001,
la compra pasó sola a `recibida`, el kardex tomó los dos ingresos y el stock
del 6205 subió de 35 a 45. La invariante `stock.valorizado = kardex` cuadra en
los siete productos.

**El ciclo comercial ya está entero salvo el cobro**: COT1-000001 aprobada →
F001-00000001 por 448.30 + 80.69 = 528.99 → T001-00000001 despachada con
18,400 kg en un bulto y placa B7X-914. El kardex tomó las tres salidas y el
stock bajó: el 6205 de 45 a 25, el 6209 de 12 a 2 y el 7210 de 12 a 6. La
invariante `stock.valorizado = kardex` cuadra en los siete productos. Y la
factura aparece en la cartera de **cobranzas** con su saldo de 528,99, lista
para cobrarse: el círculo está cerrado.

**Dónde sale el stock, que se confundió una vez y conviene no repetir:** entra
con la recepción y sale con la GUÍA DE REMISIÓN, no con la factura. Facturar
solo descarga almacén si se marca la casilla de venta de mostrador, que existe
para el cliente que se lleva la pieza sin guía previa.

---

## 2 · Pruebas de punta a punta: arrancadas, falta el flujo del dinero

**Ya no está a cero.** Hay **25 pruebas** de navegación en verde
(`e2e/navegacion.spec.ts`): las 19 pantallas reales abren, y las 5 fichas de
detalle se abren **desde su listado**, que comprueba de paso que el enlace
funciona.

No solo miran que responda 200. Miran que **no aparezca ningún cartel de
error** — «No se pudo cargar», «[object Object]»— y que no salte ningún error
de JavaScript. Una página que responde 200 y pinta «no se pudo cargar» está
rota igual, y así fue justamente como la ficha de producto pasó días rota sin
que nadie lo viera.

Corren con su propio Chromium, así que no dependen de la extensión del
navegador. Eso las hace la forma fiable de verificar pantallas.

```bash
E2E_BASE_URL=http://localhost:4005 npx playwright test
```

**Lo que falta es el flujo del dinero**, que es el que de verdad importa:
`cotizar → aprobar → guía → facturar → cobrar`, y la compra con su recepción.
Ahí está el detalle incómodo: **esas pruebas ESCRIBEN** —queman correlativos y
mueven stock— y por eso `e2e/guardia.ts` las corta si el entorno apunta al
Supabase del cliente. Para escribirlas hace falta antes **un proyecto Supabase
de pruebas**: crear uno, aplicarle `pnpm db:aplicar`, apuntar ahí el
`.env.local` y poner `E2E_PERMITIR_ESCRITURA=1`.

La guardia tiene sus propios 8 tests en vitest y no se puede engañar desde el
entorno: el `ref` del cliente va escrito en el código, porque si saliera del
mismo `.env` que comprueba se apuntaría a sí misma.

---

## 3 · La GRE necesita un cliente que no existe

**Solo bloquea el ENVÍO.** La guía como documento —prepararla, imprimirla y
sacar el stock del almacén— funciona desde el 25/08 y no depende de SUNAT.

`ConectorSunat` no tiene ningún método de guía, y el transporte REST + OAuth2
está sin escribir. La investigación está cerrada en
[`INVESTIGACION-GRE.md`](INVESTIGACION-GRE.md) y las rutas ya están anotadas en
`packages/sunat/src/transporte/endpoints.ts` (`RUTAS_GRE`).

Recordatorio de lo incómodo: **no hay ambiente de pruebas** para la GRE y **no
hay API de baja** — anular es manual desde el portal SOL.

---

## 4 · Lo que depende del cliente, no de nosotros

Nada de esto se puede desbloquear escribiendo código. Conviene pedirlo ya,
porque son las dos cosas que pueden frenar el final del proyecto.

- **Certificado `.pfx` + su clave, y usuario/clave SOL secundario** (formato
  `RUC + usuario`). Sin ellos, facturación y guías solo pueden ir contra beta.
  Willy dijo que entrega el mismo que usa hoy y que *"ya fue el año pasado"*
  (51:30), o sea que puede quedarle poco de vigencia: hay que comprobar la
  fecha de caducidad en cuanto llegue.
- **Los tres Excel**: productos (~2.000+), clientes y proveedores. No
  bloquean —se sigue con datos ficticios, como él mismo propuso (23:44)— pero
  el importador hay que ajustarlo contra el formato real. Una **muestra de 50
  filas** cuanto antes evita rehacer el mapeo.
- **Los correlativos de partida.** *"Los correlativos van a iniciar desde el
  número que usted se quedó"* (06:08). Hace falta el último número de
  cotización, factura y guía de su sistema actual, por serie. **Ya hay dónde
  meterlos:** `/configuracion` → «Series y correlativos», columna «desde». La
  pantalla enseña el próximo número antes de guardar y cuenta los huecos que
  se saltan; en una serie que ve SUNAT, cada hueco hay que poder explicarlo.

---

## 5 · Revisión de campos contra Defontana

Sigue pendiente **la mitad que solo Willy puede dar**: hay que ver su ficha de
Defontana. Está en el guion del viernes.

Lo que sí se puede saber sin él está hecho el 28/08, y cambia la conversación:
en vez de «probablemente sobren campos», ahora hay evidencia de CUÁLES.

### Primero, el recuento estaba mal

`clientes` no tiene 32 columnas: tiene **29**, y de esas **tres son generadas**
para la búsqueda (`busqueda`, `busq_razon_social`, `busq_documento`) y **cuatro
son de fontanería** (`id`, `activo`, `creado_en`, `actualizado_en`). Nadie las
teclea ni las ve.

**Campos de verdad, los que alguien podría tener que llenar: 22.** La ficha de
Defontana son 18. La diferencia real no son catorce campos, son cuatro.

### Lo que EXIGE cada consumidor

| Consumidor | Qué necesita del cliente |
|---|---|
| **SUNAT** (`Receptor`, en `packages/sunat/src/dominio`) | `tipo_documento`, `numero_documento`, `razon_social`; opcionales `direccion` y `email`. **Cinco.** |
| **El PDF de la cotización** | razón social, tipo y número de documento, dirección y **contacto** |
| **La guía de remisión** | dirección de llegada + **ubigeo** |
| **Cobranzas** | `condicion_pago`, `dias_credito`, `linea_credito` |

### Lo que su histórico REAL llenó, de los 37 clientes

| Campo | Llenos | Lectura |
|---|---:|---|
| código, tipo/número doc, razón social, dirección, condición | 37 | el núcleo, siempre |
| `notas` | 37 | lo puso la carga, no él |
| `email` | **1** | *«a las justas me dan correo»*, literalmente |
| `nombre_comercial` | 0 | |
| `ubigeo_codigo` | 0 | y hace falta para la guía (§6) |
| `referencia_direccion` | 0 | |
| `sector` | 0 | |
| `contacto` / `cargo_contacto` | 0 | y el PDF imprime el contacto |
| `telefono` / `whatsapp` | 0 | |
| `linea_credito` / `dias_credito` / `dias_gracia` | 0 | los pone él, no el histórico |
| `vendedor_id` | 0 | |

### Los cuatro candidatos a sobrar

Ninguno lo pide SUNAT, ninguno sale en un PDF, ninguno lo llenó su histórico y
ninguno gobierna una regla de negocio:

1. **`sector`** — texto libre sin lista ni uso; no filtra nada.
2. **`referencia_direccion`** — «a media cuadra del grifo». Útil para repartir,
   pero la guía usa la dirección, no esto.
3. **`cargo_contacto`** — el nombre del contacto sí sale en el PDF; su cargo no
   sale en ninguna parte.
4. **`dias_gracia`** — separado de `dias_credito` sin que nada los distinga hoy
   en cobranzas.

Y **`nombre_comercial`** es el quinto dudoso: se busca por él —entra en la
columna generada `busqueda`— así que quitarlo obliga a tocar esa columna y su
índice. No vale la pena a menos que diga que no lo usa nunca.

**Lo que NO hay que quitar aunque esté vacío:** `ubigeo_codigo` (la GRE lo
exige), `contacto` (sale en el PDF y él lo pidió el 26/08) y los tres de
crédito (los llena él, no el histórico).

### Qué preguntarle exactamente

Con esto delante son dos minutos:

> «De su ficha de cliente, ¿usa **sector**, **referencia de dirección**, **cargo
> del contacto** y **días de gracia**? En sus dos años de facturas no hay
> ninguno relleno.»

Si dice que no a los cuatro, la ficha baja de 22 a 18 campos — exactamente los
de Defontana.

## 6 · Cosas menores anotadas

- **Condiciones y orden de compra** en la cotización son texto libre. Al menos
  «condiciones» debería ser una lista con las opciones habituales (forma de
  pago, garantía) y permitir escribir una distinta. El **contacto** ya se puede
  guardar en la ficha del cliente desde el alta rápida, así que se rellena solo
  en la siguiente cotización.
- ~~`pnpm lint` no funciona~~ **Arreglado.** `next lint` quedó obsoleto en Next
  15 y abría un asistente interactivo; ahora hay un `eslint.config.mjs` en la
  raíz que mira también `packages/` y `e2e/`, y el script llama a `eslint`
  directo. De las 26 quejas que salieron a la primera, la que importaba: tres
  ganchos se llamaban `usarCampoForm`, `usarParamsTabla` y `usarAtajoPaleta`.
  El prefijo `use` no es estilo, es el contrato por el que React reconoce un
  gancho — sin él, `rules-of-hooks` no comprobaba **nada** dentro de esas
  funciones, y una llamada condicional a un hook habría pasado sin más. Se
  renombraron a `useCampoForm` / `useParamsTabla` / `useAtajoPaleta` (más
  `usePlegados`, del mismo caso, en la barra lateral). También salió que
  `BarraHerramientas` desestructuraba `children` y no lo pintaba: cualquier
  hijo se habría perdido en silencio. Nadie la usa todavía, así que no rompía
  nada; ahora funciona si alguien la usa.
- ~~**CI puede estar en rojo por los secrets, no por el código.**~~ ·
  **arreglado el 02/09.** El build necesitaba `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` como *secrets* del repositorio, así que si
  nunca se pusieron ese paso fallaba aunque typecheck y tests pasaran. Ahora
  el workflow cae a valores de relleno cuando el secret no está: ninguna
  página se prerenderiza contra la base, así que compila igual. Si el secret
  existe se usa. Un CI que puede salir en rojo por configuración miente sobre
  el código, que es lo único que ese paso mira.
- ~~**`BuscadorProductos` de `@rodatech/ui` no lo usaba nadie.**~~ · **la mitad
  que importaba, HECHA el 28/08.** Su cabecera decía que era «el control más
  usado del ERP» y listaba cinco pantallas; en realidad ninguna lo importaba
  —cada módulo se había hecho el suyo— y este aviso pedía comprobar si esas
  copias tenían sus protecciones.

  **No las tenían: ninguna de las cuatro descartaba las respuestas tardías.**
  Esperar a que dejes de teclear no basta. Con 250 ms y una red normal siguen
  saliendo dos consultas en vuelo, y nada garantiza que vuelvan en orden: si la
  de «620» tarda 400 ms y la de «6205» tarda 150, la segunda pinta y la primera
  la pisa. La caja dice «6205» y la lista enseña otra cosa — y en el
  constructor de una cotización eso es una LÍNEA EQUIVOCADA en un documento que
  se manda al cliente.

  Con 7 productos de prueba no se veía. Con los 790 reales, sí.

  Ahora las cuatro —cotizaciones (productos y clientes), compras y
  recepciones— usan `lib/usar-busqueda.ts`, y la parte delicada vive en
  `lib/busqueda.ts` como reducer puro con 11 pruebas: es el único sitio donde
  una carrera se puede probar de verdad, porque ahí las respuestas se ordenan a
  mano en vez de depender de que la red se porte mal justo cuando miras.

  Queda pendiente lo otro que decía el aviso: unificar los cuatro con el
  `BuscadorProductos` del design system. Ya comparten la lógica, que era lo
  que dolía; lo que falta es el marcado.
- **Nada verificado en móvil real.** Las comprobaciones son sobre el HTML
  servido; el comportamiento táctil no lo ha probado nadie.
- ~~**La consulta de RUC/DNI nunca funcionó**~~ · **arreglado el 28/08**
  (migración 031). Al poner por fin el `DECOLECTA_TOKEN`, «Traer» respondía
  siempre `column reference "periodo" is ambiguous`: en plpgsql los nombres de
  un `returns table` son VARIABLES de salida, y `consultas_reservar_cuota`
  devuelve `periodo`, `plan`, `consumidas` y `limite`, que son cuatro columnas
  de `consultas_cuota`. Cada `where periodo = p_periodo` tenía dos candidatos.

  **La lección es la que vale.** Dos capas lo taparon dos meses: sin token el
  paquete degrada a «escribe a mano» ANTES de pedir cuota, así que la función
  no se llamaba nunca; y plpgsql no valida el cuerpo al crearlo —la ambigüedad
  se resuelve al ejecutar—, así que la 003 se aplicó sin una queja. Existía
  rota desde el primer día y habría aparecido en producción.

  Por eso el centinela de la 031 **la llama de verdad** cinco veces (reservar,
  sumar, liberar, tope, modo reserva y agotado) en vez de comprobar que existe:
  la versión rota también existía. Regla para lo que venga: *una función
  plpgsql sin una llamada real en su centinela no está probada.*
- **`ubigeo` tiene 64 distritos, no los ~1.890 del Perú.** La 007 cargó Lima
  Metropolitana, Callao y una capital por departamento, y dejó escrito que el
  padrón INEI completo iría en un `007_seed_ubigeo.sql` que nunca se escribió.
  Eso **rompía el alta de clientes y proveedores de provincia**: `clientes.
  ubigeo_codigo` tiene clave foránea a `ubigeo`, SUNAT devuelve el código de
  cualquier distrito del país, y «Traer de SUNAT» sobre un cliente de Trujillo
  rellenaba un código legítimo que aquí no existe → el guardado moría con un
  `23503` que el usuario no podía entender ni arreglar, porque el código lo
  había puesto el botón.

  **Tapado el 28/08:** las dos acciones de guardado comprueban el distrito
  contra la tabla y descartan el desconocido en vez de rechazar el alta entera.
  La dirección —que es el dato que hace falta para la guía— sí se conserva.
  Pero es un parche: **falta cargar el padrón completo**, y hace falta de
  verdad, porque la guía de remisión electrónica exige el ubigeo del punto de
  llegada y Willy despacha a provincia. Cuando se cargue, la comprobación
  dejará de descartar nada sola.
- **El selector de cliente ya no es un `<select>`** (28/08). Busca contra la
  base mientras se teclea (`buscar_clientes`, migración 030) y ordena por
  documento completo → prefijo → razón social que empieza por lo tecleado. Los
  desactivados salen marcados y al final **a propósito**: buscar el RUC de un
  cliente dado de baja y no encontrarlo terminaba en un alta duplicada que
  `ux_clientes_documento` rechazaba después de teclear la ficha entera.

  ~~El mismo problema lo tienen todavía **los desplegables de proveedor** de
  compras y recepciones, que siguen bajando la lista entera.~~ · **hecho el
  31/08** (migración 033).

  Era peor de lo que decía este aviso. No es que bajaran la lista: es que la
  bajaban **truncada y sin decirlo**. `proveedoresActivos()` de compras traía
  `.limit(500)`; `proveedoresParaSelector()` de recepciones **no tenía límite
  ninguno**, o sea que se comía el tope por defecto de PostgREST. Un
  desplegable que se corta no avisa — el proveedor que falta parece no estar
  dado de alta, y se crea otra vez con otro código.

  Ahora los dos son la misma caja de búsqueda (`proveedores/ui/buscador.tsx`),
  contra `buscar_proveedores`. Lo que la diferencia del selector de cliente y
  la hace algo más que un copiar-pegar: **busca por MARCA**. «¿Quién me trae
  SKF?» es media de las veces que se abre este selector, y la relación estaba
  en `proveedor_marcas` desde la 002 sin que la usara nadie. Un proveedor que
  se LLAMA como la marca va por delante del que solo la vende, y el centinela
  lo comprueba.

  De paso, el alta rápida de proveedor se mudó de dentro de recepciones al
  módulo `proveedores`, porque ahora la usan las dos pantallas. Compras no la
  tenía: con el maestro vacío la página corta antes con «Primero hace falta un
  proveedor», pero para dar de alta al proveedor número 2 había que salirse.

  **Sigue pendiente el mismo truncado en los desplegables de FILTRO** de los
  listados `/compras` y `/recepciones`, que usan las consultas de antes. En un
  filtro molesta; en el constructor era una ficha duplicada. Por eso este iba
  primero.

- **El alta rápida de proveedor no consulta el RUC**, ni desde la recepción ni
  desde la compra. En la recepción es deliberado y está razonado: son 100
  consultas de Decolecta al mes y la razón social está impresa en la factura
  que el operador tiene delante. **En la compra el argumento es más flojo** —
  quien pide mercadería está en un escritorio, no en el mostrador. Cambiarlo es
  decisión de cuota, no de código: preguntarle a Willy cuántas altas de
  proveedor hace al mes.
- **Ningún producto tiene el peso registrado**, y el peso es obligatorio en la
  guía (`guia_peso_pos` lo rechaza en cero). Willy lo llamó *«lo más
  importante»* (02:46). Mientras tanto la guía deja declararlo a mano y lo
  explica en pantalla, pero conviene rellenar `productos.peso_kg` en la carga
  del catálogo real: con él, el peso bruto sale solo.
- **El 431 de localhost.** Si el navegador enseña «Esta página no funciona ·
  HTTP ERROR 431» mientras `curl` sí responde, son las cookies: **no se
  separan por puerto**, así que todos los proyectos de la máquina comparten
  bote y las sesiones de Supabase van troceadas. Se pasa de los 16 kB que Node
  acepta por defecto y falla TODO, incluso `/manifest.webmanifest`. Ya está
  resuelto: `apps/web/scripts/dev.mjs` arranca con el tope en 32 kB. Si aun así
  vuelve a pasar, es que hay demasiados proyectos abiertos: borrar cookies de
  `localhost` o subir más el tope.
- **Las nueve funciones de negocio ya validan rol** (hecho el 24/08), pero
  conviene repetir la auditoría cada vez que se añada una función que escriba.
  La migración `013` lo comprueba al aplicar.
- **`buscar_productos` se ha redefinido dos veces** (`004` y luego `011`, que
  le añadió `precio_minimo`). Antes de tocarla hay que mirar cuál es la
  vigente, o la migración falla con «cannot change return type».
- ~~**`redondear2` y `redondear4` están duplicados**~~ · **hecho el 25/08.**
  Vivían en `cotizaciones/dominio/totales.ts` y en
  `recepciones/dominio/costeo.ts`, duplicados a propósito porque el barrel de
  cotizaciones arrastra Server Components. Compras fue el tercer módulo que los
  necesitaba, que era la condición que se había puesto aquí, así que ahora
  están en `@rodatech/config` —el nivel más bajo del monorepo, sin
  dependencias— y los dos sitios los reexportan. Ningún llamador tuvo que
  cambiar.
- **La compra no se puede editar, solo anular y rehacer.** Es deliberado y es
  lo mismo que hace la recepción: un documento que se reescribe en silencio no
  sirve para cuadrar nada. Anular pide motivo y se niega si ya entró
  mercadería —eso se corrige con un ajuste de inventario, no borrando el
  documento que el kardex está citando—. Rehacerla quema un correlativo, que
  es lo normal en un ERP. Si Willy pide editar antes de recibir, se puede
  añadir; pero que sea una decisión suya, no un descuido.
- **Los gastos de importación se teclean en la compra y se reparten al
  recibir.** El constructor los enseña como «costo en almacén» para que se vea
  el efecto antes de guardar, pero el número que manda es el de la base:
  `recepcionar_mercaderia()` relee `compras.gastos_importacion` y no acepta lo
  que le llegue del navegador.
- **El alta rápida de proveedor desde la recepción no consulta el RUC**, aunque
  el maestro sí. Es deliberado: son 100 consultas de Decolecta al mes, y con la
  mercadería en el mostrador la razón social está impresa en la factura que el
  operador tiene delante. Guarda con la MISMA acción que el maestro
  (`proveedores/acciones/guardar`), así que la validación y la generación de
  código no se pueden separar.
- **La consulta de RUC/DNI vive en `apps/web/src/lib/documento-sunat.ts`**, no
  dentro de un módulo, porque la cuota es una sola para toda la empresa. Cada
  módulo pone encima su propia Server Action con SU lista de roles: ventas da
  de alta clientes, compras da de alta proveedores. Facturación y compras
  deberían reutilizar la misma pieza.
- **El ajuste rápido de stock del catálogo y el cuadre viven en dos sitios.**
  `productos/acciones/stock.ts` ajusta un producto desde el listado y
  `inventario/acciones/ajustar.ts` cuadra una hoja entera; las dos llaman a
  `registrar_ajuste_inventario`. Es razonable —son dos gestos distintos— pero
  conviene no dejar que se separen en validación o en roles.
- **La hoja de conteo tiene un tope de 400 productos.** Por encima avisa y
  recorta. Con el catálogo real de 2.000+ SKU un cuadre completo hay que
  hacerlo por familias, que es como se cuenta de verdad, pero conviene tenerlo
  presente antes del cuadre inicial.
- ~~**El kardex solo enlaza las referencias de recepción.**~~ · **cerrado el
  28/08.** Decía «al crear cada módulo hay que añadir su caso»; ya existen
  todos. Ahora enlazan **recepción, comprobante y guía**.

  Los otros dos NO enlazan, y por motivos distintos que conviene no confundir:
  el **ajuste** sí trae su id, pero `/inventario/ajuste` es el formulario para
  hacer uno nuevo —enlazar ahí llevaría a empezar otro—; y **`importacion`** ni
  siquiera trae id, y ojo con el nombre, que engaña: NO es el módulo de
  importaciones sino la carga inicial del maestro desde el Excel. Un stock que
  entró por una hoja de cálculo no tiene documento que abrir.

  El mapa está en `inventario/dominio/enlaces.ts` con centinela: su prueba lee
  las migraciones, saca los `referencia_tipo` que la base graba de verdad y
  falla si alguno no está contemplado o si una ruta no tiene su `page.tsx`.
  Es el mismo acoplamiento que la 021 dejó roto en las alertas —texto en
  PL/pgSQL, directorio en `app/(erp)`, nada que los una— y ahora lo hay.

---

## 7 · Antes de entregar

- [ ] Rotar el token de Supabase y las llaves — están en texto plano en
      `.env.local` y son de la cuenta del cliente
- [ ] Borrar la variable `RODATECH_ATAJOS` de Vercel: mientras esté, cualquiera
      con la URL entra con un clic
- [ ] **Poner `SUNAT_ENCRYPTION_KEY` en Vercel y en CI**, la MISMA que en
      local. Con otra llave, las credenciales guardadas no se pueden descifrar
      y hay que volver a escribirlas a mano: no hay forma de recuperarlas.
- [ ] Pasar el ambiente de facturación de `beta` a `produccion` — pero solo
      cuando la homologación esté terminada. En beta lo emitido NO tiene valor
      fiscal, que es lo correcto mientras se prueba.
- [ ] Borrar los dos clientes de prueba marcados `[DEMO]`, y con ellos
      COT1-000001 y F001-00000001. Ojo: el comprobante no movió stock (se emitió
      sin marcar la salida de almacén), así que borrarlo no descuadra el kardex.
- [ ] Borrar el proveedor `[DEMO] RODAMIENTOS DEL PACIFICO S.A.C.` y, con él,
      la compra `CMP-26-00001` y la recepción `REC-26-00001` que se crearon
      para probar el ciclo. **Ojo con el orden y con el stock**: la recepción
      metió 10 unidades del 6205 y 4 del 7210 al kardex. Borrarla a mano
      dejaría el stock mintiendo —es exactamente lo que pasó con el costo del
      6205, ver R2—. Lo correcto es pasar un ajuste de inventario que las
      saque, y solo después borrar los documentos.
- [ ] Decidir si los 7 productos de ejemplo se quedan (son datos reales suyos)

---

# Resueltos

## R10 · La auditoría de permisos llevaba veinte migraciones sin mirar nada

Salió el 31/08, y hacen falta **tres** fallos encadenados para contarlo. El
primero tapaba al segundo, y el segundo era el síntoma del tercero, que es el
que de verdad importaba.

### 1 · La cadena no se podía reaplicar

`pnpm db:aplicar` sobre una base ya migrada moría en el quinto archivo:

```
005_vistas.sql … ERROR
  42P16: cannot drop columns from view
```

Porque la 023 y la 025 **ensanchan** tres vistas que la 005 declara estrechas
(`v_ventas_mensuales`, `v_top_productos`, `v_productos_stock`). En una base
virgen el orden funciona —005 las crea, 023 y 025 les añaden columnas— pero al
reaplicar, la 005 intenta volver a la versión corta y `create or replace view`
solo sabe AÑADIR columnas por el final, nunca quitarlas.

Arreglado tirando las diez vistas al empezar la 005. No cuesta nada —son
vistas, no tienen datos— y `v_reposicion` va primero porque lee de
`v_productos_stock`: es la única dependencia entre vistas del esquema.

### 2 · Detrás había una función de escritura abierta

Con la 005 pasando, la cadena llegó por fin a la 013 y **saltó su centinela**:

```
Estas funciones escriben, son security definer y las puede llamar
cualquiera con sesión, pero NO validan rol: sincronizar_gastos_importacion
```

La 006 concede `execute` sobre TODAS las funciones a `authenticated`. La 022
—treinta y tres archivos después— revoca la suya. Entre las dos queda abierta,
y ahí es donde audita la 013.

Arreglado en la 006: después del `grant` a bulto, un bloque cierra sola toda
función volátil `security definer` que no mencione guardián de rol. Es la misma
regla que la 013 verifica, escrita como acción en vez de como comprobación.
Quitarle `execute` a una función de disparador no la rompe: el disparador lo
ejecuta Postgres, que no comprueba ese permiso.

### 3 · Y esa es la parte que hay que recordar

**La auditoría corre en el puesto 13 de 34.** Cuando corre, las funciones de la
014 en adelante todavía no existen. Veinte migraciones —el constructor, el
importador, las alertas, las importaciones, la trazabilidad, los catálogos
desde pantalla— pasaron por delante de un guardián que no podía verlas.

Y la 006 tiene esto:

```sql
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
```

O sea que **toda función creada después de la 006 nace con `EXECUTE` concedido
a `authenticated`**. Es lo que se quiere para las de negocio, que validan rol
por dentro. Es exactamente lo que no se quiere para un disparador. Y dependía
de que cada archivo se acordara de cerrarse solo.

La 022 se acordó. Que se acordara es la razón por la que esto no fue un agujero
de verdad — y que dependiera de acordarse es el problema.

Arreglado con la **034**, que repite la auditoría AL FINAL de la cadena. La
duplicación es el punto: la misma regla, en dos posiciones, porque cada una ve
cosas distintas.

**La lección, que es hermana de la de la 031.** Aquella decía *«una función
plpgsql sin una llamada real en su centinela no está probada»*. Esta dice:
**un centinela solo vigila lo que existe cuando él corre.** Si comprueba una
propiedad del SISTEMA —y «ninguna función de escritura está abierta» lo es—
tiene que correr cuando el sistema está terminado, no a mitad.

Y una tercera, más incómoda: **dos fallos se estuvieron tapando meses**. Nadie
llegaba al 013 porque el 005 mataba la corrida antes; y como el 013 nunca
volvía a correr, nadie veía lo que tenía detrás. Que una cadena de migraciones
se pueda reaplicar entera no es comodidad — es lo que mantiene vivos a todos
los centinelas que vienen después del primero que falla.

---

## R9 · Las alertas llevaban meses apuntando a ninguna parte

Salió al cablear la bandeja, el 26/08. Tres cosas, y las tres son la misma:
**nadie había abierto nunca la pantalla, así que nadie había hecho clic**.

**1 · Tres de los siete enlaces daban 404.** `generar_alertas()` guardaba en
`accion_url` rutas que la aplicación no tiene:

| Guardaba | Existe |
|---|---|
| `/inventario/productos/{id}` | `/productos/{id}` |
| `/inventario/ajustes` | `/inventario/ajuste`, en singular |
| `/cobranzas/{id}` | `/facturacion/{id}` — cobranzas es una sola pantalla |

O sea que el quiebre de stock, el saldo negativo y **toda la cartera vencida**
llevaban a una página que no existe. Y no solo desde la bandeja: el panel del
tablero también enlaza `accion_url`, así que ese enlace estaba roto desde que
se hizo el tablero.

**2 · El panel «alertas prioritarias» del tablero enseñaba las menos
importantes.** Ordenaba con `.order("severidad")` a secas. Un enum de Postgres
ordena por su **orden de declaración**, y `severidad_alerta` se declaró como
`('info','baja','media','alta','critica')`: ascendente es de lo trivial a lo
grave. Con `limit(6)`, el panel recortaba justo al revés — dentro cabían
cotizaciones por vencer y fuera se quedaba un quiebre de stock.

**3 · El tablero tenía su propia lista de severidades, con cuatro de las
cinco.** Faltaba `info`, y como la consulta se afirma con `as`, el tipo decía
que era imposible que llegara. Habría pintado el texto crudo del enum.

**La lección**, que es la misma de R0: una pantalla que nadie ha abierto no
está escrita, está *supuesta*. Lo que se hizo para que no vuelva a pasar:

- `/alertas` entra en la suite de navegación (26 pruebas, antes 25).
- `apps/web/src/modules/alertas/dominio/enlaces.test.ts` lee las rutas del
  propio SQL de la migración y comprueba que cada una tiene su `page.tsx`.
  Es el único punto del proyecto donde una cadena de PL/pgSQL y un directorio
  de Next están atados: sin esa prueba, nada del compilador los une.
- Las etiquetas de severidad viven ahora en el módulo de alertas y el tablero
  las importa, en vez de tener una copia a medias.

De paso, la migración 021 añade `refrescar_alertas()`: `generar_alertas()`
sigue cerrada a `authenticated` —es trabajo programado— y la envoltura valida
rol contra `permisos_rol`, que es lo que exige el centinela de la 013.
Comprobado con una sesión real: con el usuario de almacén devuelve
`{"nuevas":1}`, la segunda llamada devuelve 0 —es idempotente por `huella`— y
llamar a `generar_alertas()` directamente sigue dando *permission denied*.

---

## R8 · Dos agujeros en las notas que la base no vigilaba

Al cablear las notas de crédito salieron dos fallos que **no se habrían visto
leyendo el código**: los dos se encontraron emitiendo contra la base de verdad.

**La serie cruzada entraba sin una queja.** SUNAT exige que la nota empiece por
la misma letra que el documento que corrige —F sobre factura, B sobre boleta—
y cruzarlas es un rechazo con el correlativo ya gastado. La base solo miraba el
formato (`^[BF][A-Z0-9]{3}$`), así que emitir `BC01` contra una factura salió
adelante y devolvió `BC01-00000001` apuntando a `F001-00000001`. La regla vivía
solo en `dominio/nota.ts`, o sea en el navegador. Migración **019**, como
trigger: no se puede con un CHECK porque la condición mira otra fila.

**Se podía acreditar el doble de lo facturado.** Reejecutar una prueba emitió
una segunda nota por el total sobre la misma factura y la base la aceptó:
**1.057,98 acreditados sobre 528,99**. Ante SUNAT eso es crédito fiscal
inventado, y no hace falta mala fe — basta con pulsar dos veces, o con que dos
personas anulen la misma factura sin saberlo. Migración **020**, también
trigger, con un céntimo de holgura para los redondeos de dos notas parciales.
Solo vigila las de crédito: una nota de débito no tiene tope, porque unos
intereses de mora pueden superar el importe original.

Las dos comprobaciones ya existían en `acciones/nota.ts`. **Y eso no bastaba:**
`emitir_comprobante` es alcanzable por PostgREST para cualquiera con sesión,
que es exactamente el agujero que se cerró en la 012 para otras funciones. Una
regla de negocio que solo vive en el navegador no es una regla, es una
sugerencia.

La 020 además comprueba al aplicarse que no haya quedado ningún documento
sobre-acreditado de antes: el trigger solo vigila lo nuevo, y lo viejo hay que
mirarlo una vez.

## R7 · El redondeo se comía medio céntimo

`redondear2(cantidad × precio)` no daba lo mismo que Postgres. En la base,
`round(3 × 1.005, 2)` es **3.02**; en JavaScript, `3 * 1.005` ya vale
3.0149999999999997 antes de redondear nada, así que salía **3.01**. El céntimo
se perdía en la multiplicación, no en el redondeo, y por eso `Number.EPSILON`
no lo salvaba: la diferencia es mil veces mayor que él.

Ahora hay un solo `importeConDescuento()` en `@rodatech/config`, réplica exacta
de la columna generada que comparten `cotizacion_items` y `comprobante_items`:

```sql
round(cantidad * valor_unitario * (1 - descuento_pct / 100.0), 2)
```

Tres decisiones que conviene no deshacer:

- **Son TRES factores, no dos.** Facturación aplicaba el descuento al precio
  unitario y luego multiplicaba por la cantidad. Postgres multiplica los tres
  con precisión completa y redondea UNA vez; en dos pasos se redondea el precio
  con descuento por el camino. Con descuentos que no son redondos —12,5 %,
  7,5 %— las cuentas se separaban.
- **Se usa `BigInt`.** El numerador exacto ronda 10^17 con valores del todo
  razonables (mil unidades a cien dólares con un 5 %), muy por encima de 2^53.
  Perder precisión en el paso que existe para no perderla sería absurdo.
- **El empate se redondea hacia arriba**, que es lo que hace `round()` sobre
  `numeric` en Postgres.

**Cuánto pasaba, medido y no estimado:** en 200.000 líneas simuladas con
valores del negocio, **14 diferían** (0,007 %), siempre por un céntimo exacto.

**Y una corrección de lo que este documento decía antes.** Estaba escrito que
era «la resta de céntimos por la que SUNAT observa una factura». Exagerado: el
documento GUARDADO siempre fue coherente, porque las líneas y la cabecera las
calcula Postgres. Lo que estaba mal era la **previsualización** — el operador
aprobaba una cotización viendo 9.651,25 y se guardaba 9.651,26. No es un
rechazo de SUNAT; es enseñar un número distinto del que se va a grabar en un
documento que el cliente firma. Malo, pero no lo mismo.

Comprobado de tres formas: 20 casos frontera contra la expresión real de la
columna, un barrido de 200.000 líneas, y las 6 líneas ya guardadas en la base,
que cuadran con la función nueva.

## R0 · La ficha de producto no abría — y el ERP entero ocultaba sus errores

Reportado como *«no abre nada»* al pulsar un producto. Eran dos cosas, y la
segunda es la que importa para todo lo demás.

**El fallo:** `productoConDetalle()` pedía `familias!inner(nombre)` colgando de
`productos`, y PostgREST respondía `PGRST200`. `productos` guarda `familia_id`,
pero **no tiene ninguna clave ajena a `familias`**: sus claves son compuestas
—`(familia_id, subfamilia_id) → subfamilias` y `(subfamilia_id, tipo_id) →
tipos`— precisamente para que un producto no pueda apuntar a una sub-familia
de otra familia. PostgREST solo anida lo que una clave ajena declara. La
familia se pide ahora anidada dentro de la sub-familia, que sí tiene su FK.

**Lo que lo hizo invisible:** los siete módulos formateaban sus errores con

```ts
e instanceof Error ? e.message : String(e)
```

y el error de PostgREST **no es un `Error`**, es un objeto plano
`{ message, details, hint, code }`. `String()` sobre él da `[object Object]`,
que es literalmente lo que salía en pantalla. El mensaje que nombraba la tabla
culpable —y que además sugería la correcta— se tiraba a la basura en cada
fallo de consulta de toda la aplicación.

Ahora hay un único `mensajeDeError()` en `apps/web/src/lib/errores.ts`, usado
por los siete módulos, que conserva `details` y `hint` y pone el código entre
paréntesis al final. Con su prueba, que fija el `PGRST200` real como caso.

**La lección:** un formateador de errores perezoso no es deuda cosmética. Este
convirtió un fallo de una línea en algo que desde la pantalla parecía que la
navegación estaba rota, y mandó a buscar el problema al sitio equivocado.

De paso, comprobado que las 14 rutas principales y las fichas de producto y
cliente —vista y edición— cargan sin error.

## R1 · FALSA ALARMA — los desplegables SÍ funcionan

Estuvo anotado como el bug que bloqueaba todo. **No lo era.** Se comprobó en el
navegador el 24/08: los menús de tres puntos abren, los diálogos abren, el
fondo es blanco sólido y la sombra es la correcta.

Lo que fallaba era la comprobación, no la aplicación:

- **Los disparadores de menú de Radix escuchan `pointerdown`, no `click`.** Sus
  props enganchadas son exactamente `onPointerDown` y `onKeyDown`. Los clics
  sintéticos de la automatización no emiten eventos de puntero, así que nunca
  lo activaban — y como no hay error, parecía que el componente estaba roto.
- **El menú «translúcido» era la animación a medias.** `rt-pop-in` dura 0.15 s
  y la captura la pilló en vuelo. Medido con el menú abierto: `opacity: 1`,
  `backgroundColor: rgb(255,255,255)`.

**Para probar un componente de Radix desde automatización**, hay que despachar
la secuencia de puntero de verdad:

```js
const o = { bubbles: true, cancelable: true, composed: true,
            pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true };
boton.dispatchEvent(new PointerEvent('pointerdown', o));
boton.dispatchEvent(new PointerEvent('pointerup', o));
boton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
```

Y esperar más de 150 ms antes de capturar, o se fotografía la animación.

De paso quedó descartado que hubiera un árbol duplicado: el DOM tiene 14
botones de acciones para 7 productos, que son los 2 esperados por fila (tabla
de escritorio + tarjeta de móvil). La herramienta los listaba dos veces.

## R2 · Costo promedio del 6205 — tampoco era la fórmula

Migración **`015_reparar_valorizacion.sql`**, aplicada el 24/08.

Aquí decía «revisar la fórmula del promedio ponderado». **No era eso.**
Consultada la base:

```
kardex  ->  1 movimiento: ingreso 35 @ 3.2600, saldo 35,
            valorizado 114.10, costo promedio 3.2600   ← perfecto
stock   ->  cantidad 35 (bien), valorizado 3374.1000,
            costo promedio 93.7250                     ← imposible
```

`registrar_movimientos` y el kardex estaban bien. Lo que estaba mal eran las
dos copias **denormalizadas** — `stock.valorizado` / `stock.costo_promedio` y
`productos.costo_promedio` — con valores que ningún movimiento vivo produce.

El rastro: 3374.10 / 36 = 93.725 exacto, y 3374.10 − 114.10 = 3260 = 1000 ×
3.26. Encaja con un ajuste de +1 unidad a costo 3260 sobre el saldo bueno.
`ajustes_inventario` está vacía y la secuencia de `movimientos_inventario`
arranca en 9 (los ids 1..8 se emitieron y se borraron), así que **la prueba se
limpió a medias**: se fueron los movimientos y se quedaron las
denormalizaciones.

**La lección:** borrar filas de `movimientos_inventario` a mano deja el stock
mintiendo, en silencio y para siempre. El kardex es la fuente de verdad; las
copias en `stock` y `productos` existen solo por rendimiento.

La migración reconstruye la valorización desde el kardex (idempotente, y solo
para productos que tienen movimientos) y deja un centinela que vuelve a
comprobar la invariante en cada `pnpm db:aplicar`. **La cantidad no se
sobrescribe a propósito**: un descuadre físico se corrige contando y pasando un
ajuste, con documento y responsable, no desde una migración.

Comprobado después: el 6205 queda en costo 3.26 y margen 16,8 %, en línea con
los otros seis.

## R3 · Buscar por marca devuelve cero

Migración **`014_busqueda_por_marca.sql`**, aplicada el 24/08.

`buscar_productos` y `productos_pagina` filtraban solo contra
`productos.busqueda`, que es una columna generada y por tanto no puede mirar
otra tabla. Las dos ya hacían `join marcas`; solo faltaba usarlo en el `where`.

El detalle que no era obvio: **los dos lados normalizan distinto**.
`productos.busqueda` usa `normalizar_texto` (minúsculas) y `marcas.nombre_norm`
usa `normalizar_codigo` (MAYÚSCULAS, sin separadores). Comparar «skf» contra
«SKF» no encuentra nada, así que el texto buscado se normaliza de las dos
formas y cada mitad del OR compara con la suya.

Comprobado contra la base: `SKF` devuelve sus 5 productos con relevancia 1, y
`6205`, `ntn`, `fag` y `rodamiento` siguen dando lo de antes.

## R4 · El test que iba a poner CI en rojo

`importacion/api/hoja.test.ts` abre con exceljs la plantilla `.xlsx` de verdad:
0,8 s con la caché de vite caliente, **7,2 s la primera vez**, contra un
`testTimeout` de 5 s. En local casi nunca falla; en CI siempre es la primera
vez. `testTimeout` subido a 20 s en `vitest.config.mts`.

## R5 · `endpointGuias()` apuntaba al servicio muerto

Devolvía el billService SOAP `ol-ti-itemision-guia-gem`, que la propia
`INVESTIGACION-GRE.md` ya había declarado sustituido por REST + OAuth2. Es una
trampa perfecta: el WSDL sigue respondiendo, así que no falla — solo pertenece
a un régimen que ya no es el vigente.

Ahora lanza una excepción explicando por qué, y las rutas REST buenas están al
lado en `RUTAS_GRE`.

## R6 · `dev.log` estaba versionado

16 KB de log del servidor de desarrollo en el repo, y sin entrada en
`.gitignore`. Fuera del índice e ignorado.
