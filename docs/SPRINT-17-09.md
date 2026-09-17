# Sprint del 17/09 — lo que salió de la reunión con Willy

Reunión del 16/09, 56 minutos ([grabación](https://fathom.video/share/KNr7MZRaLF8Ry9zx75c4mqucXtoqdYQS)).
Aquí está el acta **cruzada con el código**, que es lo que cambia el plan: de
las diez cosas que quedaron apuntadas, **cuatro ya estaban hechas** —algunas
mientras se hablaba—, **dos están a medias** en el patrón de siempre, y hay
**un choque** que no se puede programar sin decidirlo antes.

---

## 0 · Lo que ya está, y no hay que volver a hacer

Se comprobó contra el código el 17/09. Si alguien lo cuenta como pendiente,
se paga dos veces.

| Del acta | Estado |
|---|---|
| «Fix quantity field width» | **Hecho** el 16/09. De 42 px a 77. Willy lo vio en vivo: *«ahora sí sale, ponle 50»* |
| «Move Guardar button to bottom» | **Hecho** el 16/09, y pegado al borde para no bajar el scroll |
| «Make unit price editable» | **Ya lo era.** Es un campo numérico de la fila desde siempre — ojo, ver §3 |
| Crear marca sin salir de la cotización | **Hecho** el 16/09, con búsqueda. También estaba ya en la ficha del producto |
| Editar el artículo entero (código, marca, familia, sub-familia) | **Hecho** el 16/09 |
| Roles: gerencia, administrador, ventas, almacén, compras, cobranzas | **Ya existen los seis**, exactamente esos. Lo que no hay es permisos configurables — ver §6 |

**Matiz real del «+» de la marca** (Willy, 1:23): hoy la opción de crear
aparece **al escribir** un nombre que no existe. Él pidió *«un botoncito al
costado, un más»*. Es un botón que no se ve hasta que tecleas, y en esta casa
eso ya tiene nombre. Va en §1.

---

## ✅ CERRADO el 17/09 — el bloque «Flujo de cotizaciones» del acta

Los cuatro puntos que el acta pone bajo *Flujo de cotizaciones* están hechos y
vistos en pantalla. Queda de cotización solo **§5, los kits**, que dependen de
una respuesta de Willy.

| Del acta | Cómo quedó |
|---|---|
| Botón «+» para crear marca | Al costado de Marca, Familia y Sub-familia. El campo se convierte en «Marca nueva» con su caja, «Crear» y una ✕ — sin diálogo dentro de diálogo |
| Precio unitario editable | Ya lo era; lo que cambió es que bajar del mínimo **avisa** y ya no impide guardar (§3) |
| Ojo de precios de referencia | «Ver precios» y «Ver stock» en el menú de la línea, con costo, mínimo, lista, mercado, margen y stock |
| Guardar abajo | Barra al pie, pegada, con el total al lado |

Y por el camino salieron **dos fallos que el acta no podía ver**:

1. **`buscar_productos` llevaba tres semanas sin reemplazarse** (082). La
   búsqueda por marca no encontraba nada y el precio mínimo no llegaba nunca
   al cotizador — con lo que todo el aparato de la negociación llevaba desde
   la 011 sin ejecutarse contra un producto real.
2. **El buscador no traía `ultimo_costo`** (083), así que un producto recién
   cargado con su costo salía igual que uno sin costo: sin margen posible.

Lo que sigue en este documento es lo que **queda**.

---

## 1 · Rápidos — horas, no días

*(El «+» de la marca, §1.4, ya está hecho — ver arriba.)*

### ✅ 1.1 · El interruptor de la retención · HECHO el 17/09 · **caso 30**

Estaba todo menos el interruptor, y resultó ser aún más completo de lo que
parecía: `emitir_comprobante` ya leía `p_datos -> 'retencion' ->> 'aplica'`
desde la **004**, sacaba el porcentaje de la configuración y **calculaba el
monto sola** (`round(total * pct / 100, 2)`); la tabla lo guarda desde la 002
con tres constraints —ni en boletas, ni junto a la detracción, y si aplica el
monto tiene que ser > 0—; el documento lo imprime; y **cobranzas ya admite el
medio de pago `retencion`**, que es como se cierra el 3 % que el cliente no
paga. Solo faltaba que alguien mandara `aplica: true`.

Cómo quedó: una casilla **la primera de las tres**, porque es la única que
cambia el dinero. Al marcarla dice en números lo que va a pasar —*«El cliente
retiene USD 12.45 y te paga USD 402.59»*—. En boletas ni se enseña.

Y solo viaja `aplica`: el porcentaje y el monto los pone la base, dentro de la
misma transacción que fija el total. Una Server Action es un endpoint público,
y esto es plata.

*(Texto original del plan, abajo, por si hace falta el contexto.)*

### ~~1.1 · El interruptor de la retención~~

Willy, 45:03: *«si hay detracción… digo la retención. Para mi caso es retención
porque yo vendo productos»*.

Y está casi todo puesto: `retencion_aplica` y `retencion_monto` existen en la
base y en los tipos, y `documento.tsx` **ya los imprime** —«Sujeto al régimen
de retenciones del IGV»—. Lo único que falta es el interruptor:
`antes-de-emitir.tsx` los manda en `false` y `0`, siempre, y no hay nada en la
pantalla que los escriba.

Es el caso número **30** del patrón, y el mismo perfil que el botón de las
cuentas: la intención documentada y el cable sin conectar.

**Ojo con el porcentaje:** en configuración ya hay un 3 % guardado. Willy dijo
*«8 %, 3 %»* dudando, y son cosas distintas —la detracción es del 12 % o 10 %
en servicios; la retención del IGV es del **3 %**—. El interruptor calcula
sobre el total y deja corregir el monto a mano, pero el número por defecto sale
de configuración, no del código.

### 1.2 · Quitar el correo del pie de la factura

Willy, 50:07: *«en la factura no debe aparecer el nombre del vendedor. Eso en
la cotización, sí»*. Y luego, viendo el pie: *«sale un correo, debajo del
número de cuentas»*.

Son dos cosas y solo una es del pie: el correo sale del membrete
(`hoja-documento.tsx`), junto al teléfono y la web. Hay que quitarlo **de la
factura y no de la cotización**, así que es una prop del componente compartido,
no un borrado.

El «Vendedor» de la cabecera se queda en la cotización: lo pidió él mismo el
16/09 por la mañana.

### 1.3 · El ojito de los precios de referencia

Willy, 7:30: *«puede verlos los precios como un ojito, y puede ver a cuánto lo
compró, a cuánto le costó y a cuánto lo está vendiendo. Cosas referenciales, en
un modal»*.

Un icono por línea que abre: **costo, precio mínimo, precio de mercado y precio
de lista**. Los cuatro ya viajan en la línea o están a un dato de distancia.

Y encaja con lo que ya se decidió el 11/09: el costo y el margen los ve
cualquier rol, a propósito, porque el vendedor los necesita al negociar.

### 1.4 · El «+» visible de la marca

Lo de §0: que no haya que teclear para descubrir que se puede crear.

---

## 2 · Compras: el historial que Willy ha pedido DOS veces

Willy, 33:50: *«pasan varios días y yo tengo otros códigos… ¿puedo consultar un
código en particular de lo que me han cotizado anteriormente? ¿Cómo puedo
llamar a los precios de un código en particular?»*.

Y el 07/09 (29:47) había dicho lo mismo: *«tengo que tener un módulo para hacer
la consulta: yo digito el código y me debe aparecer el historial de compras»*.

**Lo que hay:** `comprasDelProducto` existe, sale de `v_precios_compra` y **sí
tiene pantalla** — está en la ficha del producto. No es el caso de siempre.

**Lo que falta son dos cosas distintas, y conviene no confundirlas:**

1. **Llegar ahí desde donde se decide.** Hoy hay que salir de la ronda de
   precios, ir al catálogo y abrir la ficha. Willy lo quiere *«al toque, jalo
   de ahí nomás»* — un enlace o un modal desde la propia fila de la ronda.
2. **Lo COTIZADO, no solo lo pagado.** `v_precios_compra` se alimenta de
   **recepciones**: lo que de verdad entró y se pagó. Willy pregunta por *«los
   precios que me han dado antes»*, que es `v_comparativa_precios` — promesas
   de proveedor. Las dos sirven y dicen cosas distintas: una factura pesa más
   que una promesa al negociar, y eso hay que verlo en la pantalla.

Más: **resaltar el menor** (Willy, 31:40: *«debe quedarse resaltado en azul
porque es el mejor precio»*). La comparativa ya elige el menor; falta que se
vea cuál es aunque se elija otro a mano.

---

## 3 · La decisión que hay que tomar: el precio mínimo BLOQUEA

Esto no estaba en el acta y es lo más importante del cruce.

Willy, 4:29: *«a un cliente puede que le dé con 20, a otro puede que le dé con
el doble o con 50 % de margen. Eso yo lo manejo»*.

Pero hoy, en `dominio/constructor.ts`, una línea por debajo del precio mínimo
**entra en `bloqueos()`**, y con un bloqueo el botón de guardar se apaga. No
avisa: impide.

**Hoy no se nota**, y por eso nadie lo ha visto: de los 790 productos, casi
ninguno tiene precio mínimo cargado, así que el piso es 0 y nunca salta. **El
día que Willy cargue sus precios reales —que es justo lo que va a hacer esta
semana— empezará a no poder guardar cotizaciones.**

Tres salidas, y la decisión es de Luis:

| Opción | Qué pasa |
|---|---|
| **A · Avisar y dejar pasar** | La línea se pinta, se dice cuánto falta, y se guarda igual. Es lo que encaja con *«eso yo lo manejo»* |
| **B · Avisar y pedir confirmación** | Un «sé lo que hago» por cotización. Queda registro de quién bajó del mínimo |
| **C · Dejarlo como está** | Solo si el precio mínimo es un límite de verdad y no una referencia |

Mi recomendación: **A**, y que el margen en rojo del resumen haga el trabajo de
avisar. El precio mínimo se llama «precio mínimo de venta» y Willy lo trata
como una referencia, no como un tope — lo dijo con todas las letras.

---

## 4 · Facturación

### 4.1 · Una factura, varias guías

Willy, 48:10: *«a veces hay que hacer una factura de dos guías: seis o dos
guías y tienen una sola factura»*.

**Esto sí no existe:** en `facturacion/dominio/tipos.ts` no hay ninguna
relación con guías. La factura tiene `orden_compra_cliente` —ese campo ya
está— pero no sabe de guías.

Hace falta tabla de unión (`factura_guias`), la pantalla con su «+ agregar
guía», y que los números salgan impresos. Willy: *«se lo pongo acá arriba
porque pueden entrar acá arriba»*.

### 4.2 · El número de orden de compra, a mano

Ya existe el campo. Lo que pidió es que **se pueda teclear solo la parte
significativa**: *«una orden de compra es 2026-000-345 y algunos piden que le
registre solamente los últimos, el 345»*. Es texto libre, así que ya funciona
— **verificar en pantalla** que no se esté formateando ni validando de más.

### 4.3 · La guía antes del stock

Willy, 42:27: *«una vez que me confirman, me envían una orden de compra, yo
emito mi guía y salgo a recoger las compras que ya hice»*.

**✅ COMPROBADO el 17/09. Sí se puede, y no lo impide nadie.**

No se llegó a emitir una guía de verdad —eso quema un correlativo `T001` y
mueve stock real del cliente— así que se comprobó de las dos formas que sí se
podían: leyendo las cuatro capas y abriendo la pantalla con un producto que
hoy está a cero.

| Capa | Qué hace |
|---|---|
| Base | **Nada.** `emitir_guia` solo valida rol, que la guía exista y que sea borrador; luego llama a `registrar_movimientos`, que acepta el saldo negativo por diseño (002). En las 88 migraciones no aparece la palabra «insuficiente» ni una vez |
| Server Actions | **Nada.** `generar.ts` y `emitir.ts` validan sesión, rol, Zod y transporte. Cero consultas a `stock` |
| Dominio | **Nada.** `Bloqueo.campo` es `cotizacion \| lineas \| destino \| peso \| fecha \| transporte`. `LineaDespacho` ni siquiera transporta el stock |
| Pantalla | **Nada.** El botón se deshabilita por peso, destino, fecha y transporte. El `max` de «Sale ahora» es lo PEDIDO, no lo que hay |

Comprobado en `/guias/nueva` con `COT1-000007`: el `6310-2Z/C3` está a **stock
0** en el catálogo y la pantalla deja poner las 4 unidades sin decir nada. Y en
el borrador `T001-00000002`, «Emitir y despachar» está habilitado.

Los únicos topes que existen son de **cantidad confirmada**, no de existencias:
la 057 impide despachar más de lo que el cliente aprobó. Su propia cabecera ya
lo decía: *«el stock se va a negativo sin que salte nada»*, y la 057 no arregló
esa parte porque no era su problema.

#### Lo que sí falta, y no es lo que se preguntó

**La guía no avisa.** Y cotizaciones sí: ahí una línea sin stock lo dice —«sin
stock», «solo 3», «faltan 2»— sin impedir nada (`cotizaciones/dominio/
constructor.ts`). La guía, que es donde el stock sale de verdad, no tiene nada
de eso: ni columna, ni insignia, ni aviso.

Con 787 de 793 productos a cero, eso significa que hoy casi cualquier guía
deja saldo negativo y quien la prepara no se entera. El único que lo dice es el
motor de alertas (021) —`stock_negativo`, severidad crítica— y habla **después
del hecho consumado**.

No bloquear es la decisión de Willy y se respeta. **Avisar era lo que faltaba,
y se hizo el mismo 17/09** (Luis: «vale»):

- `cotizacionParaDespachar` trae el stock de cada línea.
- `LineaDespacho` lo lleva, y **solo para avisar**: no entra en ningún bloqueo
  ni en el payload.
- La tabla gana la columna **«Hay»** —esa palabra y no «Stock», que es como se
  pregunta hablando—, en ámbar cuando sale más de lo que hay.
- `avisos()` añade UNA entrada, no una por línea: con seis líneas sin stock,
  seis avisos iguales empujaban fuera de la pantalla al del peso y al del
  ubigeo, que sí piden hacer algo.

Comprobado en `/guias/nueva` con `COT1-000007`: la columna «Hay» dice 0 en las
tres, y abajo, en **«Conviene mirar»** y no en «Falta para guardar», sale
*«3 líneas salen con más de lo que hay en almacén: 6310-2Z/C3 (salen 4, hay 0)
· … El saldo quedará en negativo al emitir»*. Al poner una línea en cero, el
aviso baja a dos solo. Cinco tests nuevos en el dominio vigilan las dos
mitades: que avise, y que no bloquee.

---

## 5 · Kits — el módulo nuevo, y la pregunta que hay que hacerle a Willy

Willy, 8:58: *«cotízame esta lista de productos, unos 5 ítems. Pero al final
todo eso entra como entra una sola máquina: me lo vas a presentar como un kit,
kit de reparación para motorreductor de tal máquina»*. Y hoy lo hace a mano:
cotiza cinco ítems, mira el total, y **escribe otra cotización** de un solo
ítem con ese precio.

**Lo que está claro:**

- El kit tiene **código propio** —*«ese kit debe tener un código interno; él me
  pide, me envía el código nomás»*—, descripción, y una lista de componentes.
- Se cotiza y se **factura como UN ítem con UN precio**. Los componentes
  pueden salir listados debajo, **sin precios**: *«no se debe mostrar el precio
  individual de cada parte»*.
- El precio total se **calcula** de los componentes, pero lo que se enseña es
  el total.
- Sigue teniendo entrega: *«tal vez hay algo que importar, tendría que ponerle
  parte inmediata o parte importación»*.
- Son recurrentes: tiene tres y *«se van a ir generando más según las
  máquinas»*.

**La pregunta que decide el diseño entero, y que no está contestada:**

> ¿El kit **se arma en el almacén** o es solo una forma de presentarlo?

Porque Willy dice las dos cosas. En 11:50: *«es mejor tenerlo ya por kit listo
en mi almacén, en una bolsa, en un estuche, cada kit; una sola compra de cada
parte y lo distribuye. Me armo cinco kits, seis kits y lo tengo listo»*. Eso es
**ensamblaje**: al armar cinco kits salen del stock cinco rodamientos, cinco
retenes, cinco o-rings, y entran cinco kits.

Pero para cotizar y facturar le vale con que sea una **agrupación**: un ítem
con su precio y su lista.

| Si es… | Entonces |
|---|---|
| **Agrupación** (más simple) | El kit no tiene stock propio. Al despachar, la guía saca los componentes. Se puede hacer esta semana |
| **Ensamblaje** (lo que describe) | El kit es un producto con stock propio, y hace falta un movimiento de «armar kit» que consuma componentes y produzca kits. Toca kardex |

**Se le pregunta así, en una línea:** *«Cuando arma el kit en la bolsa, ¿quiere
que el sistema le descuente las piezas del stock y le cuente los kits armados?
¿O prefiere que el kit sea solo para cotizar y facturar, y el stock siga siendo
de las piezas sueltas?»*

Él ya quedó en mandar los campos por WhatsApp (14:34). Esta pregunta va con
esos campos.

**Cuidado con SUNAT:** una factura con un ítem «kit» y su precio es válida. La
lista de componentes va como descripción del ítem o leyenda, **nunca como
líneas con importe 0** — eso sí lo rechazan.

---

### Lo que se decidió y lo que quedó construido (17/09, tarde)

Luis contestó la pregunta de arriba: **agrupación**, no ensamblaje. El kit no
tiene stock propio; lo que se sabe de él es **cuántos se pueden armar hoy**,
que es una cuenta sobre el stock de las piezas (`stock_armable`).

Eso trae una consecuencia que había que resolver y está resuelta: la **guía
despacha las PIEZAS**, no el kit (086, un disparador sobre `guia_items`). Si
no, el stock se movería en un producto que no existe en el almacén.

Queda construido:

| Pieza | Dónde |
|---|---|
| `productos.es_kit`, `kit_componentes`, `stock_armable()`, `kit_suma()` | 085 |
| La guía explota el kit en sus piezas | 086 |
| El precio de cada pieza DENTRO del kit | 087 |
| El descuento de cada pieza, con su interruptor | 088 |
| Lista con indicadores, filtros, paginación y columna de acciones | `productos/ui/kits/` |
| El papel dice qué lleva el kit, **sin precios** | `cotizaciones/dominio/impresion.ts` |

**El precio de cada pieza dentro del kit** (087) salió de que Luis intentó
armar uno: *«¿por qué no me sale el precio? Recuerda que él puede variar el
precio, igual como hacer una cotización es hacer un kit, nomás que van a hacer
un kit»*. Armar un kit **es** cotizar. `kit_componentes.precio_unitario` es
nullable a propósito: `null` = usa el de lista del producto —y así el kit sigue
al maestro cuando ese precio suba—, `0` = va sin cargo dentro del kit, que es
una decisión distinta de no haberlo puesto.

**El descuento** (088) cierra lo del precio. Luis: *«falta poner esto, si va a
haber descuento o no»*. Es la otra mitad de la 087: en una cotización el precio
de una línea son DOS campos, el unitario y el descuento, y aquí faltaba el
segundo.

Se guarda el **porcentaje**, no el precio ya rebajado, y esa es toda la
decisión. Un 20 % y un «23.17» no dicen lo mismo dentro de seis meses: con el
porcentaje el kit sigue al precio de lista **sin perder lo negociado**; con el
número final se queda congelado en el precio de hoy y hay que rehacer la cuenta
a mano cada vez que suba algo. Un kit es recurrente —*«se van a ir generando
más según las máquinas»*— así que se vuelve a abrir, y es ahí donde se nota.

El interruptor **no se guarda en ninguna columna**: «sin descuento» y
«descuento del 0 %» son la misma cosa, así que el estado se deduce de los datos
—si alguna pieza trae descuento, la columna sale— y no hay dos sitios que
puedan discrepar.

Y con el descuento aparece el aviso que faltaba: si una pieza queda **por
debajo de su precio mínimo de venta**, se dice cuál y cuánto, y se deja
guardar. Es lo que se decidió el 17/09 para la cotización, y aquí con más
motivo: lo que el cliente paga es el precio del kit, y dentro de un kit una
pieza puede ir a pérdida mientras el conjunto gane. Pero sin el aviso, un kit
entero bajo mínimo se arma pieza a pieza sin que nadie lo vea.

Lo que **no** llega todavía: la lista de componentes **no sale en el enlace
público** `/ver/<token>`. Eso lo lee `cotizacion_por_token`, que es
`security definer` y tiene su propio centinela (§AH.7); añadirle el contenido
del kit es tocar esa función, y se hace aparte y con cuidado.

Y sigue pendiente de Willy: los campos del kit que quedó en mandar por
WhatsApp (14:34).

---

## 6 · Lo que NO va en este sprint, y por qué

- **Línea de detalles por ítem** (poleas maquinadas, canal chavetero, buje).
  Willy lo planteó largo en 18:06 y **él mismo lo aplazó** en 21:12: *«yo los
  he creado, esas poleas, ya con todo su detalle. Vamos a manejarlo así nomás.
  En caso de que sea necesario incluir una línea para colocar más detalles, yo
  te avisaría»*. Se queda esperando su aviso.
- **Permisos configurables por rol.** Los seis roles existen; lo que pidió es
  poder elegir qué hace cada uno. Pero quedó en probar primero los que hay:
  *«usted solamente pruebe todo lo que tiene y usted me pasa»*. Sin saber qué
  le sobra o le falta, un editor de permisos es adivinar.
- **Mandar la cotización por correo.** Sigue bloqueado por lo de siempre: uno
  de los 97 clientes tiene correo.

---

## ✅ Estado al cerrar el 17/09

Del sprint no queda nada por hacer. Lo de los kits lo desbloqueó Luis el mismo 17/09 —agrupación, no ensamblaje— y está construido (§5). La mejora que salió al comprobar §4.3 —que la guía no avisaba de la falta de stock— también quedó hecha.

| | Estado |
|---|---|
| **§1.1** Retención del IGV | ✅ Caso 30: estaba todo menos el interruptor |
| **§1.2** El pie de la factura | ✅ Fuera «Atendido por» y el correo repetido |
| **§1.3** El ojo de los precios | ✅ «Ver precios» y «Ver stock» en el menú de la línea |
| **§1.4** El «+» de la marca | ✅ |
| **§2** Historial y mejor precio | ✅ El historial ya estaba; ahora el ganador conserva su fondo y se dice cuánto cuesta no elegirlo |
| **§3** El precio mínimo | ✅ Avisa y no impide (decisión de Luis) |
| **§4.1** Factura con varias guías | ✅ Migración 084. Y salió que NINGUNA factura tenía guía |
| **§4.2** La O/C a mano | ✅ No estaba: se heredaba de la cotización y no se podía teclear |
| **§4.3** La guía antes del stock | ✅ Comprobado: no lo impide ninguna de las cuatro capas. Salió que tampoco avisaba, y eso sí se arregló: columna «Hay» y aviso que no bloquea |
| **§5** Kits | ✅ Luis decidió agrupación, no ensamblaje. Construido: 085-088, la guía explota el kit en sus piezas, y precio y descuento por pieza. Falta que Willy mande los campos que quedó en mandar por WhatsApp (14:34) |

Y dos fallos que el acta no podía ver, encontrados por el camino:

- **`buscar_productos` llevaba tres semanas sin reemplazarse** (082): la
  búsqueda por marca no encontraba nada y el precio mínimo no llegaba al
  cotizador.
- **El buscador no traía `ultimo_costo`** (083): un producto recién cargado
  con su costo salía sin margen posible.

---

## 7 · Orden propuesto

1. **§3 — decidir lo del precio mínimo.** Es una conversación, no código, y
   bloquea la carga de precios reales de Willy.
2. **§1 — los cuatro rápidos.** Retención, correo del pie, ojito de precios,
   «+» de marca.
3. **§4 — facturación.** Multi-guía es lo único con migración; lo demás es
   verificar.
4. **§2 — historial de precios desde la ronda.**
5. **§5 — kits**, en cuanto Willy conteste lo del almacén.

Lo de Willy, en paralelo: terminar la lista de productos, el stock y los
precios, los campos del kit, y **desde qué número van `T002` y `CT02`**.
