# Pendientes

Estado al 31/08/2026. Ordenado por lo que más duele. Lo ya resuelto vive al
final, con la lección, porque los tres casos se habían diagnosticado mal y
volver a caer sale caro.

---

## Dónde estamos

| | |
|---|---|
| Rutas | **42 de 42 reales** · no queda ningún cartel |
| `pnpm typecheck` | 7/7 paquetes |
| `pnpm test` | 865 en verde |
| `pnpm e2e` | **42 en verde** (navegación); falta el flujo del dinero (§2) |
| `pnpm lint` | **limpio**, 0 avisos |
| Migraciones | **hasta la 038, aplicadas** al Supabase del cliente |
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
| `clientes` | 37 | la cartera real de Willy |
| `productos` | 790 | su catálogo real |
| `comprobantes` | 518 | dos años de ventas |
| `proveedores` | **0** | no llegaron en el Excel de ventas |
| `stock` | **0** | las 518 entraron por INSERT directo, sin tocar el kardex |
| `movimientos_inventario` | **0** | ídem |
| cotizaciones, compras, recepciones, guías, pagos, alertas | **0** | |

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

Ya casi nada, y es la primera vez en el proyecto. **El detalle actualizado
está en «Cierre del 28/08» aquí abajo**, con lo que espera a Willy, lo que
espera a Luis y lo que está bloqueado — que es donde vive la verdad desde hoy.

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
| **3** | El comparador y el historial por proveedor | Es lo único que no existe, y necesita la bandeja del 2 |

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

- La bandeja **«Por comprar»** ya tiene su vista en la base (`v_comprometido`,
  migración 041) pero **no tiene pantalla**. Es lo primero del bloque 2.
- La **aprobación parcial no reserva stock**: sigue pendiente de que Willy
  decida si confirmar un pedido aparta la mercadería (pregunta 1 de §G).

#### Un dato de prueba que quedó en la base del cliente

Hay un movimiento de inventario `AJU-26-00001`, «Conteo de prueba», de 20
unidades del producto `0-230`, del 01/09. **No es mío** — salió de la demo en
vivo de la reunión de ese día. Conviene borrarlo antes de que Willy empiece a
operar de verdad, o su primer inventario arrancará con 20 unidades que no
existen.

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
   una sentencia de arreglo en cuanto diga el número.
10. Su **lista de proveedores**. El Excel que mandó era de VENTAS, así que
   `proveedores` está a cero y las pantallas de compra y recepción no se pueden
   enseñar funcionando. Con la lista basta —RUC y razón social—; el resto de la
   ficha se completa después. Desde el 31/08 el selector busca también por
   MARCA, así que si dice qué marca trae cada uno, mejor.

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

### 0.2 · Cero observabilidad sobre un ERP que factura a SUNAT

No hay Sentry ni equivalente, ni logging de servidor, ni `global-error.tsx`.
Cuando una Server Action falla, el error se pinta en la pantalla del operador
**y muere ahí**: nadie más se entera.

Y esto ya nos pasó. `lib/errores.ts` lleva escrito en su cabecera que la ficha
de producto estuvo días rota por un `PGRST200` sin que nadie lo supiera. Se
arregló el síntoma; la causa —que no hay forma de enterarse— sigue.

En una pantalla de listado es molesto. En `facturacion/acciones/emitir.ts` es
una factura que no salió y nadie sabe por qué.

### 0.3 · Tres contadores que dan un número EQUIVOCADO en silencio

La peor clase de fallo: no revientan, mienten.

| Dónde | Tope | Qué calcula mal |
|---|---|---|
| `alertas/api/consultas.ts` · `resumenBandeja` | 2.000 | El contador de la campana. Con el cron diario (032) generando alertas, es cuestión de meses. |
| `cobranzas/api/consultas.ts` · `carteraPorCliente` | 1.000 | La deuda por cliente. El comentario de arriba dice «llamar en el orden equivocado cuesta dinero» — y a partir de 1.000 documentos abiertos la suma es falsa. |
| `equivalencias/api/consultas.ts` · `totalDeclaradas` | 2.000 | El recuento de equivalencias. |

Los tres agregan **sobre la página**, no sobre la tabla. Se arreglan contando
en Postgres (`count` exacto o una función) en vez de en JavaScript sobre un
`.limit()`.

Es exactamente la misma clase de fallo que el truncado mudo de los
desplegables de proveedor (§6), que ya mordió una vez.

### 0.4 · Consultas sin techo

Traen la tabla entera y crecen con el uso:

- `reportes/api/consultas.ts` · `embudoComercial` → `v_trazabilidad_venta`
  **completa**. Crece con cada cotización y cada venta. El más peligroso.
- `inventario/api/consultas.ts` → `v_valorizacion_inventario` con `select("*")`
  y sin límite, **leída desde cuatro sitios** (productos, reportes ×2).
- `reportes` · `agingCartera` y `resumen` → `v_cartera` completa.

### 0.5 · La bitácora existe y no la escribe nadie

La tabla `actividad` está creada, con su RLS y sus permisos… y **cero filas,
porque ningún sitio inserta en ella**. En un ERP donde seis personas comparten
roles y se emiten documentos fiscales, «quién anuló esta factura» es una
pregunta que se va a hacer.

### 0.6 · Nadie reintenta los envíos a SUNAT

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

### 0.7 · Lo que el CI no hace

`verificar.yml` corre typecheck, lint, tests y build. **No aplica migraciones,
no despliega y no corre los e2e.** Y el build depende de dos secrets, así que
puede salir en rojo por configuración y no por código — ya anotado en §6.

### 0.8 · `apps/demo` · 130 archivos que nadie usa

Una app Next.js paralela y completa, con su propio `package-lock.json` (npm
dentro de un monorepo pnpm), sus propias migraciones y scripts en Python.
Nadie la importa desde `apps/web`, pero está dentro del workspace, así que
**CI la typechequea y la construye en cada push**.

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
- **CI puede estar en rojo por los secrets, no por el código.** El workflow
  «Verificar» corre typecheck, lint, tests y `pnpm build` en cada push a `main`, y el
  build necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  configurados como *secrets* del repositorio en GitHub. Si nunca se pusieron,
  ese paso falla aunque typecheck y tests pasen. Son públicas por definición
  —viajan al navegador—, pero salen de secrets para no fijarlas en el repo.
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
