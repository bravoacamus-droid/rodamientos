# Feedback de la reunión con Willy · 26/08/2026

Primera demo. Grabación: `fathom.video/share/Kb7ifqgazxYA3Vmeas1JnxDEGVV--8Kz`
Próxima revisión: **viernes 28/08 por la mañana**.

Cada punto está contrastado contra el código, no contra la memoria. Lo que
dice «ya está» está verificado en el esquema y en la pantalla.

---

## Lo primero, antes de mandarle la URL

**Quitar `RODATECH_ATAJOS`.** Willy lo vio y preguntó por ello a los dos
minutos: *«¿siempre va a estar así, con accesos rápidos? Porque si no,
cualquier persona puede entrar»*. Son los botones de sesión rápida del login.
Ya estaba anotado para la entrega (§7 de PENDIENTES), pero ahora es urgente:
va a entrar él solo a revisar y es lo primero que ve.

**La letra.** *«Yo soy medio corto de vista, las letras las tengo que
detenerme un poco»* (0:50). No es un capricho de diseño: es el usuario
principal diciendo que no lee cómodo. Hay que subir el tamaño base y revisar
los `text-xs` de las tablas, que son los que más cuesta leer.

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

### 2.2 · El margen: confirmar que lo quiere sobre el costo

Lo dijo claro (28:35): *«ese margen creo que ustedes lo están considerando con
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

Solo hay que confirmar que quiere el cambio en TODAS partes (cotización,
tablero, informes, top de productos) y no solo en el tablero. Está en cinco
sitios: `v_ventas_mensuales`, `v_top_productos`, `v_productos_stock`, el
trigger de cotizaciones (`004_funciones.sql:773`) y `totales.ts` del
constructor.

---

## 3 · Lo que falta de verdad, por orden de lo que más le duele

### 3.1 · Trazabilidad por ítem, de punta a punta ← lo que le dolió HOY

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

**Estado:** las dos mitades existen por separado y ninguna está unida.
`v_historial_precios` ya da el lado de la venta (cotización y factura, con
cliente y precio). El lado de la compra está en `compra_items` y en el kardex,
sin vista. `v_trazabilidad_venta` sigue el hilo cotización → guía → factura,
pero por DOCUMENTO, no por ítem.

Falta una vista `v_trazabilidad_item` que una las dos mitades, y una pantalla
—o una pestaña en la ficha del producto— que la enseñe en una sola línea de
tiempo. **Es lo primero que haría.**

### 3.2 · Reportes con filtros de fecha

Hoy `/informes` tiene cinco gráficos sin filtro de fecha. Él pidió (28:47):

- Ventas históricas, con filtro por día / mes / año / entre fechas.
- Costo histórico, con los mismos filtros, tirando de las órdenes de compra.
- **Productos más vendidos asociados a cliente** — no solo el ranking, sino a
  quién. Su frase (9:01): *«si yo compro una mercadería, ¿para quién va
  dirigida? Puede que lo consuma uno o puede que lo consuman dos clientes»*.
- Principales clientes: cuánto compran y **cada cuánto**.

`v_top_productos` ya cuenta `clientes` pero no dice cuáles. `v_resumen_clientes`
existe. Falta el cruce producto × cliente y los filtros por fecha en todo.

El tablero también los quiere (2:00): *«de tal fecha a tal fecha cuánto he
vendido»*.

### 3.3 · Campos nuevos en el producto

- **`precio_mercado`** — ver §2.1.
- **`proveedor_id`** — *«proveedor de dónde se compró ese ítem»* (7:40). Es la
  mitad de compra de la trazabilidad de §3.1, y además sirve para saber a quién
  volver a pedirle.

### 3.4 · Crear familias y subfamilias desde la pantalla

*«¿Qué pasa si se trata de un producto nuevo… unos pernos que no están en
rodamientos? Habría que crear»* (10:40). Hoy las familias, subfamilias, tipos y
marcas se cargan por migración y **no tienen pantalla de edición** — lo dice la
propia pantalla de configuración que se hizo hoy. Hace falta el botón «+ nueva
familia» donde se elige, sin salir del alta de producto.

### 3.5 · Cuenta bancaria en los documentos

*«Últimamente hay algunos clientes que me piden indicar número de cuenta»*
(14:40). Su regla, textual: **en la cotización siempre sale; en la factura es
opcional**.

Falta el dato en la empresa —`empresa` tiene `cuenta_detraccion` pero no la
cuenta corriente ni el CCI— y el interruptor en el comprobante.

### 3.6 · Maestro de agencias de transporte

*«A veces envío pedidos por agencia a Trujillo»*, tipo Shalom (21:00). Los
campos del transportista ya están en la guía; lo que falta es la **lista** de
la que elegir, para no volver a teclear el RUC de Shalom cada vez. Él tiene
«dos o tres agencias» — se precargan.

### 3.7 · Descargar la plantilla de productos

Hoy solo se puede subir. Él pidió poder **bajar** la plantilla, editarla en
Excel y volver a subirla (13:00). El generador ya existe
(`scripts/generar-plantilla-productos.mjs`); falta el botón en
`/productos/cargar`.

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

## 5 · Orden sugerido para llegar al viernes

1. Quitar `RODATECH_ATAJOS` y subir el tamaño de letra. Es lo que él ve primero.
2. **Margen sobre costo** en los cinco sitios. Es un cambio pequeño y arregla
   cada número que mira.
3. **Trazabilidad por ítem.** Es lo que pidió con más ganas y lo que le costó
   una mañana esta semana.
4. `precio_mercado` y `proveedor_id` en el producto.
5. Filtros de fecha en informes y en el tablero; el cruce producto × cliente.
6. Familias y subfamilias desde la pantalla.
7. Cuenta bancaria, agencias de transporte, descargar plantilla.

Lo de §2 se pregunta al empezar la reunión del viernes, no al final: si P.M.
resulta ser precio de mercado, cambia la carga del catálogo entero y conviene
saberlo antes de que suba los 3.000 ítems.
