# Feedback de la reunión con Willy · 26/08/2026

Primera demo. Grabación: `fathom.video/share/Kb7ifqgazxYA3Vmeas1JnxDEGVV--8Kz`
Próxima revisión: **viernes 28/08 por la mañana**.

Cada punto está contrastado contra el código, no contra la memoria. Lo que
dice «ya está» está verificado en el esquema y en la pantalla.

---

## Guion para el viernes 28/08

Todo lo que se pidió el 26/08 está hecho. Lo que queda es lo que **solo él
puede contestar**, y una parte frena trabajo de verdad.

### Lo primero, antes de nada · la pregunta que puede costar 3.000 correcciones

> **«En su Excel, ¿la columna P.M. es el precio MÍNIMO por debajo del cual no
> vende, o el precio al que ve que está el mercado?»**

Se pregunta al EMPEZAR, no al final. El 21/08 dijo que era el mínimo y con eso
se cargó como **piso duro**: hay una restricción en la base que rechaza cotizar
por debajo. El 26/08 dijo que para él P.M. es el precio de mercado, «con ese
precio le agrego un 20 %». No pueden ser las dos.

Si era el precio de mercado, cada producto tiene hoy un suelo de venta que él
nunca fijó — y están a punto de entrar 3.000 más. Detalle en §2.1.

### Lo segundo · la pregunta que desbloquea 629 productos

Llegó su historial de ventas y está limpio, pero destapó esto:

> **«De lo que no son rodamientos —los retenes, las fajas, las cadenas, las
> ruedas— ¿cómo los agrupa usted? ¿Qué familias usaría?»**

Su catálogo real es **790 productos y solo 161 caben** en las familias que
tenemos, que salieron de una muestra que era toda de rodamientos. Los
rodamientos son el 16 % de sus productos y el 24 % de su facturación: el resto
del negocio no tiene dónde entrar.

Llevar la tabla de [HISTORIAL-VENTAS.md](HISTORIAL-VENTAS.md) §4 impresa: con
ella delante son diez minutos. Crear las familias después son minutos más,
porque `/configuracion` ya las da de alta desde el navegador.

De paso, cuatro códigos suyos tienen DOS productos distintos debajo
(§3.3) — un `RET-42174382` que es un retén en una factura y un resorte en
otra— y tres cadenas se venden por metro y por unidad a la vez. Eso también lo
tiene que resolver él.

### Lo que hay que pedirle

| Qué | Por qué corre prisa |
|---|---|
| **Los dos Excel que faltan** | Ya mandó el historial de ventas (28/08). Faltan el **maestro de productos** —que es el que trae costo, stock, peso y P.M.— y el de proveedores. Sin costo no hay margen, y el margen es media pantalla. |
| **Los correlativos de partida** | El último número de cotización, factura y guía de su sistema actual, **por serie**. Ya hay dónde meterlos: `/configuracion`. |
| **Su cuenta bancaria** | Banco, cuenta corriente y CCI. Sin eso, el campo que pidió sale en blanco en cotizaciones y facturas. |
| **Sus 2-3 agencias** | Vienen precargadas Shalom, Cruz del Sur y Olva. Si usa otras, que las diga y se cambian. |

### Lo que hay que preguntarle

1. **¿Por dónde quiere que le lleguen las alertas: WhatsApp o correo?** Es lo
   único de la PRIMERA reunión que sigue igual que entonces («no te llega como
   una alerta, tú tienes que entrar y ver», 25:21). La bandeja ya existe; falta
   el envío, y sin saber el canal no se puede escribir.

2. **Cuatro campos de la ficha de cliente, por nombre.** El 28/08 se auditaron
   los nuestros contra sus dos años de facturas, así que ya no hace falta
   comparar pantallas: se le pregunta directamente.

   > «¿Usa **sector**, **referencia de dirección**, **cargo del contacto** y
   > **días de gracia**? En sus dos años de facturas no hay ninguno relleno.»

   No los pide SUNAT, no salen en ningún PDF y no gobiernan ninguna regla. Si
   dice que no a los cuatro, la ficha baja de 22 campos a 18 — que son
   exactamente los de Defontana. Y de paso, que enseñe la suya para cerrar §5.

   El dato que más habla: de sus 37 clientes reales, **uno solo tiene correo**.
   Es «a las justas me dan correo», medido.

3. **El peso de los productos.** Sin peso NO se puede emitir una guía —la base
   la rechaza— y hoy no hay un solo producto con peso. La plantilla ya trae la
   columna; hace falta que la llene, aunque sea después.

4. **El certificado digital: confirmar cuándo.** No es para ahora. Hay que
   avisarle con unas dos semanas, y él dijo «me avisa nomás cuando se llegue a
   ese punto».

### Lo que hay que ENSEÑARLE, porque lo dio por faltante y ya existía

Esto no es una lista de tareas: es media reunión que se puede ahorrar. Ver §1.

- El campo de **contacto**, en el cliente Y en la cotización.
- El **descuento por ítem**, con su casilla para ocultarlo en el PDF.
- El **aviso de piso** al bajar el precio, y que el unitario sí es editable.
- El **historial de ventas** del cliente para ese producto, dentro del
  constructor.

Que dijera «falta contacto» cuando el campo existe significa que la pantalla no
lo estaba enseñando bien. Vale la pena mirar juntos por qué no lo vio.

Del mismo caso salió lo del **28/08**: el alta rápida de cliente estaba ahí
desde el principio —era pedido suyo, 34:12— pero como enlace de 12 px encima de
un desplegable, y en la demo no la vio. Ahora es un botón al lado de la caja de
búsqueda, llega con el RUC ya puesto y consulta SUNAT sola. Conviene enseñarlo:
es de las cosas que va a usar todos los días.

Y de paso el **selector de cliente** dejó de ser un desplegable: busca por
nombre, RUC o código mientras se teclea, enseña de cada uno cuándo se le cotizó
por última vez, y ofrece los últimos cotizados antes de escribir nada. Con dos
clientes de prueba daba igual; con su cartera, no.

### Y una cosa que decirle

Los **accesos rápidos** del login siguen puestos para que pueda entrar sin
pelearse con la contraseña. Él ya preguntó por ellos («si no, cualquier persona
puede entrar»). Conviene decirle que son de desarrollo y que se quitan antes de
entregar, para que no lo vuelva a ver y se preocupe.

### Lo que NO depende de él, y sigue siendo lo más grande que falta

Un **proyecto Supabase de pruebas**. Las 41 pruebas de hoy dicen que las
pantallas abren; ninguna dice que el kardex cuadre después de cotizar →
facturar → cobrar. Son cuatro pasos y media hora, y no se puede hacer contra la
base del cliente porque esas pruebas ESCRIBEN. Detalle en PENDIENTES §2.


---

## Lo primero, antes de mandarle la URL

**`RODATECH_ATAJOS` se queda POR AHORA** — decisión de Luis del 26/08, para que
Willy pueda entrar a revisar sin pelearse con la contraseña. Pero él ya
preguntó por ello a los dos minutos —*«¿siempre va a estar así, con accesos
rápidos? Porque si no, cualquier persona puede entrar»*—, así que conviene
decírselo antes de que lo vuelva a ver: es de desarrollo y se quita. Sigue
anotado para la entrega en §7 de PENDIENTES.

**~~La letra~~ · HECHA el 26/08.** *«Yo soy medio corto de vista, las letras
las tengo que detenerme un poco»* (0:50). No era un capricho de diseño: es el
usuario principal diciendo que no lee cómodo.

Lo que costaba leer no era el cuerpo del texto sino las etiquetas secundarias:
había OCHO tamaños sueltos por debajo de `text-xs` —de 10 a 12 px— en 60
archivos, y la mitad en píxeles fijos, así que ni siquiera crecían al subir la
base. Ahora hay un suelo: nada por debajo de `text-xs`, y la escala del ERP son
cuatro tamaños en vez de doce. La base sube a 17 px desde `html`, que arrastra
también alturas de control y espaciado porque todo está en `rem`.

---

## 1 · Lo que Willy pidió y YA existe

Esto no hay que construirlo. Hay que **enseñárselo el viernes**, porque en la
demo no se vio y él lo dio por faltante.

| Lo que pidió | Dónde está |
|---|---|
| Campo de contacto en el cliente | `clientes.contacto` + `cargo_contacto`; el formulario los tiene (`formulario.tsx:511`) |
| Contacto en la cotización, «a quién va dirigida» | `cotizaciones.contacto`; el constructor tiene su campo (`constructor/index.tsx:208`) |
| Descuento por ítem | `cotizacion_items.descuento_pct` |
| Que el descuento se pueda ocultar en el PDF | `cotizaciones.mostrar_descuento` — es una casilla, y el PDF solo imprime la columna si está activa |
| Aviso al cotizar por debajo del piso | `cotiz_item_respeta_piso`, contra el precio ya descontado |
| Valor unitario editable | Lo es; el piso solo avisa y bloquea por debajo |
| Historial de ventas del cliente para ese producto | `v_historial_precios`, y sale en el constructor |
| Productos separado de inventario | Son dos módulos distintos: `/productos` y `/inventario` |
| Módulo de proveedores aparte | `/proveedores`, `/compras`, `/recepciones` |
| Peso y ubicación en el producto | `productos.peso_kg` y `productos.ubicacion` |
| Guía: placa, conductor, licencia | `guias_remision.transportista_placa`, `conductor_nombre`, `conductor_licencia` |
| Nombre de quien entrega, aunque vaya a pie | `guias_remision.entregado_por` |
| Carga masiva de productos por Excel | `/productos/cargar` — revisa antes de aplicar y enseña qué va a pasar |

**Ojo con esto:** que él dijera «falta contacto» cuando el campo existe
significa que **la pantalla no lo está enseñando bien**, no que falte código.
Vale la pena mirar por qué no lo vio antes de añadir nada.

---

## 2 · Las dos cosas que hay que preguntarle el viernes

### 2.1 · ¿P.M. es el precio MÍNIMO o el precio de MERCADO?

Esto es lo más serio de la reunión y contradice lo que él mismo dijo hace
cinco días.

- **21/08**, sobre la columna `P.M. $` de su Excel: *«es el precio mínimo que
  se puede vender para cotizar al cliente, no puede vender menos de eso porque
  si no no es rentable»*. Con eso se cargó como `productos.precio_minimo` y se
  convirtió en un **piso duro**: hay una restricción en la base que rechaza una
  línea de cotización por debajo.
- **26/08**, hoy: *«PM, yo lo he considerado como precio de mercado… para
  tener una referencia de cómo se está vendiendo. Porque con ese precio
  rápidamente yo ya le agrego un 20%»*.

No pueden ser las dos cosas: a un piso no se le suma 20 % para cotizar. Y los
números tampoco cuadran del todo — en sus 7 filas reales, P.M. va entre 9 % y
18 % por encima del costo, mientras que P.V. es costo × 1,20 exacto.

**Importa porque:** si P.M. era «precio de mercado» y se cargó como piso, cada
producto del catálogo tiene un piso de venta que él nunca fijó, y el sistema
está bloqueando cotizaciones que debería permitir.

**Lo que se hace mientras tanto:** se añade `precio_mercado` como campo NUEVO
y separado, que es lo que la lista de acuerdos dice («cost, min, market
price»). `precio_minimo` se queda como está hasta que él confirme. La pregunta
concreta para el viernes: *«en su Excel, ¿la columna P.M. es el mínimo por
debajo del cual no vende, o el precio al que ve que está el mercado?»*.

### 2.2 · ~~El margen~~ · HECHO el 26/08 (migración 023)

Ya está cambiado en todas partes; queda solo enseñárselo. Lo dijo claro (28:35): *«ese margen creo que ustedes lo están considerando con
respecto al precio de venta… lo que me interesa saber es el margen con
respecto al costo»*. Y tiene razón: hoy todo el sistema calcula
`(venta − costo) / venta`.

Con costo 10 y venta 12:

| | Fórmula | Resultado |
|---|---|---|
| Lo que enseña hoy | (12 − 10) / 12 | **16,7 %** |
| Lo que él pide | (12 − 10) / 10 | **20,0 %** |

Su plantilla calcula P.V. = P.C. × 1,20, así que él piensa en 20 % — y la
pantalla le dice 16,7 %. **Todos los márgenes que ha visto están por debajo de
lo que él espera**, y eso explica por qué lo notó a los cinco segundos.

Y había una incoherencia de la que él no se enteró: `v_productos_stock` YA
dividía entre el costo desde el principio, así que el listado del catálogo
decía 20 % y el tablero 16,7 % **del mismo producto**. «Margen» significaba dos
cosas distintas según la pantalla.

Unificado en `v_ventas_mensuales`, `v_top_productos`, el trigger de
cotizaciones, el constructor y la ficha de producto. Comprobado contra su base:
agosto pasa de 15,52 % a 18,37 % y el top de productos sale en 20,19 / 20,01,
que es lo que ya decía el catálogo.

Las cotizaciones ya guardadas se recalcularon: `margen_pct` es un valor
almacenado, no calculado al leer, así que COT1-000001 habría seguido enseñando
15,51 % junto a un catálogo que dice 20 % del mismo rodamiento.

De paso, el botón «aplicar margen» proponía precios un 4 % por encima de su
Excel: hacía `costo / (1 − 20/100)` = costo × 1,25 cuando su plantilla hace
× 1,20.

---

## 3 · Lo que falta de verdad, por orden de lo que más le duele

### 3.1 · ~~Trazabilidad por ítem~~ · HECHA el 26/08

Es lo que contó con más detalle (30:29 y 32:45), y le pasó esta misma mañana:
un cliente le armó una orden con cinco ítems sacados de cotizaciones viejas
distintas, y él tuvo que *«rebuscar, rebuscar, rebuscar el celular, el
WhatsApp»*.

Lo que quiere, para un código cualquiera:

- **a quién se lo compró, a cuánto y cuándo**, y
- **en qué cotizaciones se ofreció, a qué precio y a qué cliente**.

Y el motivo, que es el que manda: *«si lo he comprado ahí es porque ya lo he
analizado y he visto que es el mejor precio del mercado. La idea es no volver
a hacer ese estudio de mercado»*.

**Cómo estaba:** las dos mitades existían por separado y ninguna estaba unida.
`v_historial_precios` daba el lado de la venta (cotización y factura, con
cliente y precio). El lado de la compra vivía en `compra_items` y en el kardex,
sin vista. `v_trazabilidad_venta` seguía el hilo cotización → guía → factura,
pero por DOCUMENTO, no por ítem.

**Hecha** (migración 024). `/productos/{id}/trazabilidad`, con botón destacado en la ficha del
producto. Arriba, las tres cifras que zanjan la duda: a quién comprarle y a
cuánto, el último precio cotizado y el margen que deja juntar las dos. Debajo,
proveedores ordenados por el mejor precio y clientes por lo más reciente. Al
final, la línea de tiempo entera agrupada por día. Ver §6.

### 3.2 · ~~Reportes con filtros de fecha~~ · HECHOS el 26/08 (migración 027)

Tenía cinco gráficos sin filtro de fecha. Él pidió (28:47):

- Ventas históricas, con filtro por día / mes / año / entre fechas.
- Costo histórico, con los mismos filtros, tirando de las órdenes de compra.
- **Productos más vendidos asociados a cliente** — no solo el ranking, sino a
  quién. Su frase (9:01): *«si yo compro una mercadería, ¿para quién va
  dirigida? Puede que lo consuma uno o puede que lo consuman dos clientes»*.
- Principales clientes: cuánto compran y **cada cuánto**.

**Hecho.** `/reportes` lleva una barra de rango con ocho atajos —hoy, esta
semana, este mes, mes pasado, tres meses, este año, doce meses, todo—, fechas a
mano, y granularidad por día / semana / mes / año. El rango vive en la URL, así
que «julio por semana» se pega en un WhatsApp y abre exactamente eso.

La granularidad se sugiere sola por la longitud del rango: tres años por día
son mil barras en un ancho de pantalla y un día por mes es una barra. Quien
quiera otra cosa la cambia a mano.

Bloques nuevos:

- **Costo de las compras**, de las órdenes, con los gastos de importación
  apilados aparte para que se vea cuánto fue flete. La pantalla dice qué mide y
  qué no: es lo que se PIDIÓ y cuándo, no lo que entró al almacén ni lo que
  costó lo vendido. Son tres preguntas distintas, y mezclarlas es lo que hace
  que un informe no cuadre con otro.
- **Lo que más se vende, y a quién**, con el cliente que más se lleva de cada
  código y su peso sobre el total. «Tres clientes» y «tres clientes de los que
  uno se lleva el 95 %» son situaciones distintas, y solo la segunda te dice
  con quién hablar antes de reponer.
- **Quién más compra**, con cada cuánto vuelven y cuántos días llevan sin
  aparecer. Una lista ordenada por importe dice quién es grande; esta dice
  además quién dejó de venir.

**Falta el mismo filtro en el TABLERO** (2:00): *«de tal fecha a tal fecha
cuánto he vendido»*. `v_dashboard` ya acepta el rango desde la 005, así que es
cablearlo, no diseñarlo.

### 3.3 · ~~Campos nuevos en el producto~~ · HECHOS el 26/08 (migraciones 025 y 026)

- **`precio_mercado`** — campo NUEVO y separado del piso. Ver §2.1.
- **`proveedor_id`** — el proveedor **habitual**, editable en la ficha. El
  historial de a quién se le compró de verdad lo responde la trazabilidad
  (§3.1); esto es «a quién le pido» sin mirar la historia.

**Y de paso, la plantilla de carga**, que es lo urgente de verdad: Willy va a
subir **más de 3.000 rodamientos** y lo que no tenga columna ese día se pierde.
Tenía diez columnas y le faltaban seis:

| Columna nueva | Por qué |
|---|---|
| **PESO KG** | `guia_peso_pos` rechaza una guía con peso cero y **no hay un solo producto con peso cargado**. Willy lo llamó «lo más importante» (02:46). Sin esto, cada guía se teclea a mano. |
| P. MERCADO $ | El campo nuevo. |
| PROVEEDOR | El habitual. Si no está en el maestro, la fila entra igual y se avisa. |
| UBICACION | Existía en la tabla sin forma de llenarse salvo producto a producto. |
| STOCK MAXIMO | Igual; alimenta la alerta de sobrestock. |
| COD. FABRICANTE | Por donde busca medio mundo. |

Dos reglas que había que decidir:

- **El proveedor NO se crea solo.** Con las marcas sí —que aparezca una marca
  nueva es normal— pero un proveedor lleva RUC, condiciones de pago y plazo de
  entrega. Crear uno desde un nombre suelto llenaría el maestro de fichas
  huecas. Se avisa y se dan de alta bien.
- **Una columna vacía no borra lo que ya había.** Si sube un archivo parcial
  sin la columna de peso, los pesos ya cargados siguen ahí. Solo se pisa lo que
  el archivo trae con valor.

Y la previsualización ahora **avisa de la lectura de P.M.** antes de aplicar:
«se está cargando como precio MÍNIMO en N productos; si para ti significa
precio de mercado, dilo antes». La decisión de §2.1 se toma mirando, no por
omisión.

### 3.4 · ~~Crear familias y subfamilias desde la pantalla~~ · HECHO el 26/08 (migración 028)

*«¿Qué pasa si se trata de un producto nuevo… unos pernos que no están en
rodamientos? Habría que crear»* (10:40).

**Hecho.** Un «+ nueva familia / sub-familia / descripción» al lado de cada
nivel del alta de producto. Es un campo **en línea y no un diálogo**: esto pasa
en mitad de un formulario a medio llenar, y un modal taparía lo que se lleva
escrito justo cuando hay que decidir dónde va.

Tres decisiones que no eran obvias:

- **Crear lo que ya existe no es un error.** Si alguien teclea «PERNOS» y ya
  hay una familia PERNOS, se devuelve la que hay y se dice «ya existía, se usará
  esa». Quien está dando de alta un producto no quiere una lección sobre
  duplicados: acaba en la familia que esperaba de todos modos.
- **El código se genera en la base.** Las tres tablas tienen un `codigo` único
  en TODA la tabla, no por familia, así que hay que inventarlo, comprobar que
  esté libre e insertar sin que otra sesión gane la carrera. Eso es una
  transacción, no dos llamadas desde el navegador.
- **La descripción no pide la familia: la deduce.** La clave ajena de `tipos`
  es compuesta —(subfamilia_id, familia_id)— justamente para que no pueda
  colgar de una sub-familia de otra familia. Pedirla por separado sería abrir
  la puerta a que llegue equivocada.

Comprobado con el caso literal que puso: crear «Pernos», crearla otra vez en
mayúsculas —devuelve la misma—, colgarle una sub-familia y una descripción, y
que un rol de cobranzas sea rechazado.

Las **marcas** siguen sin pantalla, pero no hacen falta: el importador crea la
que no exista, que es como aparecen de verdad.

### 3.5 · ~~Cuenta bancaria en los documentos~~ · HECHA el 26/08 (migración 029)

*«Últimamente hay algunos clientes que me piden indicar número de cuenta»*
(14:40). Su regla, textual: **en la cotización siempre sale; en la factura es
opcional**.

**Hecho.** `empresa` gana banco, cuenta corriente y CCI, y se editan en
`/configuracion`. `comprobantes.mostrar_cuenta` arranca en **true** porque él
lo dijo así: *«es una práctica recomendable que ya lleve pre-impresa la cuenta
corriente, porque a veces se confunden»*. En la cotización no hay interruptor:
un dato que sale siempre no necesita una casilla que nadie va a desmarcar.

Ojo con la confusión que estaba servida: `empresa` ya tenía
`cuenta_detraccion`, que es **otra cosa** —la del Banco de la Nación para el
SPOT— y a la que el cliente no puede transferir. Son dos columnas distintas y
la pantalla lo dice.

### 3.6 · ~~Maestro de agencias de transporte~~ · HECHO el 26/08 (migración 029)

*«A veces envío pedidos por agencia a Trujillo»*, tipo Shalom (21:00). Los
campos del transportista ya estaban en la guía; lo que faltaba era la **lista**
de la que elegir, para no volver a teclear el RUC de Shalom cada vez.

**Hecho.** Tabla `agencias_transporte`, precargada con Shalom, Cruz del Sur y
Olva —con su RUC real— y un desplegable en la guía que rellena el RUC y la
razón social. Los dos siguen siendo editables: **la guía guarda lo que ella
diga el día que se emite**, no una referencia que pueda cambiar después.

Las agencias se **desactivan, no se borran**: no hay política de DELETE. Una
guía emitida no puede quedarse apuntando a una agencia que desapareció.

El desplegable solo aparece si hay agencias cargadas. Sin ellas, el transporte
se teclea exactamente como antes: es un atajo, no un requisito.

### 3.7 · ~~Descargar la plantilla de productos~~ · HECHO el 26/08

*«Voy a poner también que usted pueda descargar esa planilla, editarla y
subirla de nuevo»* (13:00). Hasta ahora solo se podía subir, y la plantilla
viajaba por WhatsApp.

**Hecho.** Botón en `/productos/cargar`. La plantilla se movió de `docs/` a
`apps/web/public/`, que es lo único que el servidor sirve — y es **una sola
copia**: la prueba de `hoja.test.ts` abre ese mismo archivo, así que lo que se
descarga el cliente es exactamente lo que está probado.

---

## 4 · Lo que depende de Willy

- **Los Excel.** Ventas históricas completas (factura, fecha, cliente, RUC,
  precio unitario, producto por código, IGV, cantidad) y el maestro de
  productos: **más de 3.000 rodamientos ya clasificados**. Los manda por el
  grupo de WhatsApp. Con eso se puebla el sistema y los reportes de §3.2
  dejan de estar vacíos el mismo día.
- **El certificado digital.** Va a comprar **uno nuevo** para no chocar con su
  ERP actual, que sigue en producción hasta la migración. Hay que **avisarle
  con unas dos semanas de antelación**; él ya dijo *«me avisa nomás cuando se
  llegue a ese punto»* y que calculemos «un par de semanas».
- **La URL de prueba**, para que revise por su cuenta y mande la lista de
  campos que falten. Antes hay que quitar los accesos rápidos.

---

## 5 · Orden para llegar al viernes

Hecho el 26/08:

1. ~~Tamaño de letra~~ · suelo tipográfico y base a 17 px.
2. ~~Margen sobre costo~~ · migración 023, unificado en todo el sistema.
3. ~~Trazabilidad por ítem~~ · migración 024 y `/productos/{id}/trazabilidad`.
4. ~~`precio_mercado` y `proveedor_id`~~ · migraciones 025 y 026, más las seis
   columnas nuevas de la plantilla de carga.
5. ~~Filtros de fecha en informes y el cruce producto × cliente~~ · migración
   027 y la barra de rango de `/reportes`.
6. ~~El mismo filtro en el TABLERO~~ · la MISMA barra, no una parecida. Abre en
   «este mes» y compara contra el periodo anterior de la misma longitud.

Lo que queda:

7. ~~Familias y subfamilias desde la pantalla~~ · migración 028 y el «+ nueva»
   en cada nivel del alta de producto.
8. ~~Cuenta bancaria, agencias de transporte, descargar plantilla~~ · migración
   029 y el botón de descarga en /productos/cargar.

**Con esto queda cerrado todo el feedback de la reunión.** Lo único que sigue
abierto es §2.1, que no es código: es una pregunta para Willy.

**Antes de que Willy suba los 3.000 productos** hay que preguntarle lo de §2.1.
La plantilla ya trae las dos columnas y el importador avisa, pero es mejor
saberlo antes que corregir 3.000 pisos después.

Lo de §2 se pregunta al empezar la reunión del viernes, no al final: si P.M.
resulta ser precio de mercado, cambia la carga del catálogo entero y conviene
saberlo antes de que suba los 3.000 ítems.
