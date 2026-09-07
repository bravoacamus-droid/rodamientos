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

## Lo que le sigue faltando · para el miércoles

```
Buenos días Willy. Con sus formatos ya quedó casi todo 🙌
Me faltan 4 cositas, las 3 primeras de una palabra:

1️⃣ SUS SERIES Y DESDE QUÉ NÚMERO SIGUEN
Usted usa CT02 para cotizaciones, T002 para guías y F002
para facturas. El sistema tiene otras de prueba.
Dígame la serie y el ÚLTIMO número que emitió de cada una,
para que siga contando desde ahí y no se le repita ninguno.

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

Y sueltas, para cuando haya hueco: la columna P.M., el canal de las alertas,
las 3 notas de crédito, si hay deuda viva de verdad, y sus correlativos de
partida, cuenta bancaria y agencias.
