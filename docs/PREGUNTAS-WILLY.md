# Preguntas a Willy

Lo que se le manda, tal cual, para copiar y pegar. El porqué de cada una y lo
que destraba está en [PENDIENTES.md](PENDIENTES.md) § «Lo que espera a WILLY».

**La regla:** cinco como mucho, ordenadas de la que le cuesta tres segundos a
la que le cuesta trabajo, y cada una con el porqué en una línea. Un WhatsApp
con quince preguntas se contesta con cero.

Y antes de añadir una a la lista, buscarla en sus archivos. Tres de las de más
abajo se comprobaron primero en `documentosrodamiento/` para no hacerle perder
el tiempo.

---

## 07/09 · lo que respondieron SUS FORMATOS

Mandó la cotización, la guía y la factura reales. Antes de volver a
preguntarle nada, se miraron — y contestaron cuatro de las que estaban en
esta lista. **Buscar primero en lo que ya mandó**: es la regla de arriba y
esta vez ahorró cuatro preguntas de cinco.

| Pregunta | Respuesta, sacada de sus papeles |
|---|---|
| **1 · El RUC** | `20562681206`. Teníamos `20601234567` de relleno, y con el dígito verificador mal. **Cargado.** |
| Dirección | `JR. LOS HUERTOS 2232, URB. SAN HILARION 1RA ETAPA, SAN JUAN DE LURIGANCHO, LIMA - LIMA`. Tel. 366-9012. **Cargada.** |
| Correo y web | `wfernandez@rodatechperu.com` · `www.rodatechperu.com`. **Cargados.** |
| **5 · Cuentas bancarias** | BCP dólares y BCP soles, con sus CCI. **Cargadas**, y ya salen al pie de cotizaciones y facturas. |
| Vehículo y conductor | Placa `AUE169`; Willy con su DNI y su licencia. **Cargados** en el maestro de transporte. |
| RUC del transportista | No hay que quitarlo del impreso: su guía es PRIVADA y por eso ese campo no sale. Cuando dijo «está de más» miraba ese papel. |

Los números de cuenta **no están en git**: se cargaron por SQL directo, y la
migración 064 solo lleva la estructura.

---

## 24/09 · LAS CINCO PARA ENTREGAR

Estas cinco son las que separan el sistema de estar funcionando de verdad.
Ordenadas como manda la regla: de la que le cuesta tres segundos a la que le
cuesta trabajo.

**Dos cosas que se comprobaron antes de escribirlas**, para no hacerle perder
el tiempo:

- **Ya tiene certificado digital.** Sus 515 facturas del histórico se emitieron
  electrónicamente, así que no hay que pedirle que lo saque — hay que pedirle
  el que usa. La pregunta cambia entera.
- **No se le pregunta desde qué número va su factura.** Ya está dentro:
  `F002-00000515` del 26/08, y `FC02` por 3. Preguntar lo que el sistema ya
  sabe es justo lo que gasta las cinco preguntas.

```
Buenos días Willy 🙌
Ya estamos en la recta final. Me quedan 5 cositas y con eso
el sistema queda listo para trabajar de verdad.
Las 2 primeras son de una palabra.

1️⃣ ¿POR QUÉ NÚMERO VA SU GUÍA Y SU COTIZACIÓN?
Sus FACTURAS ya están: el sistema tiene sus F002 hasta la
515 del 26 de agosto, y sigue desde la 516 sin repetir
ninguna. Sus notas de crédito FC02 igual.
Me faltan solo esas dos: el último número de su GUÍA y el
de su COTIZACIÓN, y sigo desde ahí.

2️⃣ ¿A CUÁNTOS DÍAS VENDE AL CRÉDITO, NORMALMENTE?
¿30, 45, 60?
Sus 97 clientes están hoy en "crédito a 0 días", o sea que
la factura le aparece vencida el mismo día que la emite.

3️⃣ SU CERTIFICADO DIGITAL Y SU CLAVE SOL 🔐
Esta es la que hace que sus facturas lleguen a SUNAT.

Usted ya factura electrónicamente, así que esto ya lo tiene
(se lo dio SUNAT o se lo maneja su contador). Necesito:

• El archivo del certificado, el que termina en .pfx
• La clave de ese archivo
• Su usuario SOL secundario y su clave
  (el secundario, no el principal — SUNAT no acepta el
   principal para facturar)

Hoy el sistema le emite la factura, se la imprime y le
lleva la cobranza, pero NO la manda a SUNAT. Con esto sí.

⚠️ Esto NO me lo mande por WhatsApp ni por correo. Se lo
paso a Luis en una USB o por gestor de contraseñas
cuando nos veamos. Son las llaves de su facturación.

4️⃣ LOS TELÉFONOS DE SUS CLIENTES Y PROVEEDORES 📱
De sus 97 clientes no tengo ni un teléfono, y solo uno
tiene correo. De sus 97 proveedores, tampoco ninguno.

Sin eso no le funcionan dos cosas que ya están hechas:
• Mandarle la cotización al cliente por WhatsApp
• Pedirle precio a 4 o 5 proveedores de una sola vez

Si los tiene en un Excel, mándemelo y los subo todos juntos.
Y si le da roche mandar los 97, mándeme los 15 o 20 con los
que más trabaja y con eso arranco.

5️⃣ EL CONTEO DE SU ALMACÉN 📦
Esta es la que más trabajo le da, y le explico por qué se
la pido así.

Su archivo de ventas me dice todo lo que VENDIÓ estos dos
años, pero no me dice qué TIENE hoy en el almacén. Y yo no
me lo puedo inventar: si le pongo un número inventado, el
sistema le va a mentir desde el primer día — le va a decir
que tiene 10 de algo que no tiene, y usted lo va a vender.

Por eso el stock está hoy en CERO a propósito.

Lo que necesito es un conteo: código y cuántos tiene.
En un Excel, en papel, o como le sea más cómodo.

No tiene que ser todo de golpe. Podemos empezar por lo que
más rota — sus rodamientos más vendidos — y el resto va
entrando. Pero mientras no haya conteo, la parte de almacén
del sistema no le sirve.

Gracias Willy 🙌
```

**Cuando conteste**, apuntar la respuesta debajo de cada punto y marcar el
encabezado como CONTESTADA.

**La 3 y la 5 son las que bloquean la entrega.** La 3 porque sin certificado no
se declara nada, y la 5 porque sin conteo el almacén no sirve. Las otras tres
son importantes pero no paran el sistema.

**Sobre la 3, ojo con el canal:** el mensaje dice explícitamente que no la
mande por chat. Si la manda igual, hay que pedirle que cambie las claves
después — un `.pfx` con su clave en un WhatsApp es la facturación entera de la
empresa en manos de quien lea ese teléfono.

---

## Lo que le sigue faltando · para el miércoles · SUPERADA POR LA DEL 24/09

> Las cuatro de aquí siguen sin contestar, y las tres que siguen vigentes
> —guía y cotización, plazo de crédito, teléfonos— están recogidas en la tanda
> de arriba. **Mandar la de arriba, no esta.** Se deja escrita porque enseña
> cómo se le fueron pidiendo las cosas.

```
Buenos días Willy. Con sus formatos ya quedó casi todo 🙌
Me faltan 4 cositas, las 3 primeras de una palabra:

1️⃣ EL ÚLTIMO NÚMERO DE SU GUÍA Y DE SU COTIZACIÓN
Sus FACTURAS ya están: el sistema tiene sus F002 hasta la
515, del 26 de agosto, y sigue desde la 516 sin repetir
ninguna. Igual sus notas de crédito FC02.
Me faltan las otras dos: ¿por qué número va su GUÍA T002
y su COTIZACIÓN CT02? El último de cada una y sigo desde ahí.

2️⃣ ¿A CUÁNTOS DÍAS VENDE AL CRÉDITO, NORMALMENTE?
¿30, 45, 60?
Sus 97 clientes están hoy en "crédito a 0 días", o sea que
la factura le aparece vencida el mismo día que la emite.

3️⃣ CUANDO LE COMPRA A UN PROVEEDOR DE LIMA,
¿EN CUÁNTOS DÍAS SE LO ENTREGAN?
Usted me dio 15 días para el exterior y 2 a 4 para
fabricación, pero no el de local, que es el más frecuente
y sale impreso en la cotización.

4️⃣ LOS TELÉFONOS DE SUS CLIENTES
De sus 97 clientes, ninguno tiene WhatsApp cargado y solo
uno tiene correo. Sin eso no le sale el botón de mandarles
la cotización.
Si los tiene en un Excel, mándemelo y los subo todos de una.
Si no, se van apuntando solos: ahora cada cotización tiene
un botón para apuntarlo en el momento.
```

**Y una que NO se le pregunta**: el ubigeo de la empresa. Su dirección es San
Juan de Lurigancho, y el código lo sacamos del padrón nosotros — preguntárselo
sería pedirle que busque un número que no usa nunca. Va en cada guía, así que
hay que ponerlo antes de emitir en producción.

**Y otra que dejó de preguntarse el 16/09**: desde qué número sigue su
FACTURA. Ya está dentro — el histórico real llega hasta `F002-00000515` del
26/08 — y la regla la confirmó Luis: *«que siga nomás y no empiece desde 0»*.
Preguntarle algo que el sistema ya sabe es justo lo que gasta las cinco
preguntas. La de arriba se quedó solo con la guía y la cotización, que son las
dos series que de verdad faltan.

---

## 04/09 · las cinco del plan de compras · DOS CONTESTADAS (por Luis, 07/09)

> **2 · Plazo de crédito** — el campo ya ofrece 15 / 30 / 45 / 60 y «a mano»,
> así que a Willy solo hay que pedirle que ELIJA, no que invente un número.
>
> **3 · Compra local** — es **en dólares**. Sigue faltando el PLAZO. El botón
> de soles con el tipo de cambio de SUNAT ya existe desde la 042, por si un
> proveedor factura en moneda nacional.
>
> **4 · Reserva** — Luis describe *avisar*, no *apartar*, y eso ya está hecho
> (§AB). La decisión de si además se aparta sigue siendo de Willy.

```
Buenos días Willy, le paso 5 cositas para avanzar esta semana.
Las 4 primeras son de una palabra 🙏

1️⃣ EL RUC DE INVERSIONES RODATECH
Es lo único que falta para que sus facturas, boletas,
cotizaciones y guías salgan impresas con sus datos.
Hoy el sistema tiene un número de relleno.

Y de paso confírmeme dos cositas:
• Dirección: Jr. Los Huertos N° 2232, Lima 36 ¿correcta?
• Su correo de empresa, ¿es @rodatechperu.com?
  (va impreso en todos los documentos)

2️⃣ ¿A CUÁNTOS DÍAS VENDE AL CRÉDITO, NORMALMENTE?
¿30, 45, 60?
Sus 97 clientes están hoy en "crédito a 0 días", o sea
la factura le aparece vencida el mismo día que la emite.

3️⃣ CUANDO LE COMPRA A UN PROVEEDOR DE LIMA:
• ¿En cuántos días se lo entregan? (usted me dio 15 días
  para el exterior y 2 a 4 para fabricación, pero no el
  de local, que es el más frecuente y sale impreso en
  todas sus cotizaciones)
• ¿La factura le llega en SOLES o en DÓLARES?

4️⃣ ESTA ES LA IMPORTANTE 👇
Digamos que tiene 10 unidades de un rodamiento en almacén.
Un cliente le confirma un pedido de 6.

¿Las otras 4 quedan libres para venderle a otro cliente,
o las 6 quedan APARTADAS y solo se le muestran 4 disponibles?

Se lo pregunto porque el sistema ya está armado y hace
falta saber cuál de las dos quiere. Sin esto, dos pedidos
se pueden comer las mismas unidades.

5️⃣ LOS CELULARES DE SUS PROVEEDORES 📱
Esta es la que más le va a servir.

Ya está lista la pantalla donde usted marca un producto,
elige a 4 o 5 proveedores, y el sistema le arma solo el
mensaje de WhatsApp a cada uno preguntando precio.
Después usted anota lo que le contestó cada uno, el
sistema le marca quién le dio más barato, y eso se
convierte en compra de un botón. Y queda el historial.

Ya tengo sus 97 proveedores cargados, pero ninguno
tiene número. Sin eso hay que copiar y pegar a mano.

Con que me pase la lista con el celular al costado del
nombre basta. Y si le da roche mandar los 97, mándeme
los 15 o 20 con los que más trabaja y con eso arranco.

Gracias Willy 🙌
```

**Cuando conteste**, apuntar la respuesta aquí debajo de cada punto y marcar
el encabezado como CONTESTADA. La 4 es la única que cambia código ya escrito.

---

## Para la próxima, en pantalla y no por chat

No son de WhatsApp. Hay que enseñárselas funcionando:

- **La taxonomía de 9 familias.** Es una propuesta inventada desde sus propias
  facturas; diez minutos con la tabla de HISTORIAL-VENTAS §4 delante.
- **El código de doble marca.** `6205` es de SKF y también de FAG, y el índice
  único no lo admite. Tres salidas en PENDIENTES §D.
- **El maestro con precios y stock.** Merece su propia reunión: sin costos el
  tablero le sigue diciendo que gana el 100 % de lo que vende (§W).
  **El conteo de almacén salió de aquí y subió a la tanda del 24/09** (pregunta
  5): estaba apuntado como «tema de reunión» y en realidad es lo que deja el
  módulo de almacén sin servir. Lo que se queda aquí es lo otro —los costos,
  que son 32 de 793— porque eso sí se ve mejor en pantalla que por WhatsApp.

Y sueltas, para cuando haya hueco: la columna P.M., el canal de las alertas,
las 3 notas de crédito, si hay deuda viva de verdad, y sus correlativos de
partida, cuenta bancaria y agencias.
