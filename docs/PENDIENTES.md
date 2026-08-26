# Pendientes

Estado al 26/08/2026. Ordenado por lo que más duele. Lo ya resuelto vive al
final, con la lección, porque los tres casos se habían diagnosticado mal y
volver a caer sale caro.

---

## Dónde estamos

| | |
|---|---|
| Rutas | **40 reales de 41** · queda 1 cartel |
| `pnpm typecheck` | 7/7 paquetes |
| `pnpm test` | 701 en verde |
| `pnpm e2e` | **29 en verde** (navegación); falta el flujo del dinero (§2) |
| `pnpm lint` | **limpio**, 0 avisos |
| Migraciones | **hasta la 022, aplicadas** al Supabase del cliente |

`main` está en la punta de lo último. Las migraciones son idempotentes y la
013, la 015, la 016, la 017, la 018, la 019, la 020 y la 021 son centinelas: fallan al aplicar si alguien mete una función de
escritura sin control de rol, o si la valorización se desalinea del kardex.

**Para retomar:** `pnpm install && pnpm dev` (puerto 4005). Hace falta un
`.env.local` en la raíz — ojo, **con el punto delante**: el `.gitignore` tapa
`.env*.local`, así que un archivo llamado `env.local` a secas NO está
protegido y se sube al primer `git add .`.

El redondeo de los importes de línea ya está arreglado en todas partes (R7).

---

## Qué falta · el resumen

Lo de abajo está desarrollado en las secciones §1 a §7. Esto es para verlo de
un vistazo sin leerse el documento entero.

### Lo que depende de ti (detalle en §4)

Ninguna de estas dos se desbloquea escribiendo código, y las dos pueden frenar
el final del proyecto.

1. **Un proyecto Supabase de pruebas.** Es lo que bloquea lo más importante que
   queda: las pruebas del **flujo del dinero** de punta a punta (cotizar →
   aprobar → guía → facturar → cobrar, y compra → recepción). Hoy las 25
   pruebas comprueban que las pantallas abren sin error, que no es poco, pero
   **no comprueban que el dinero cuadre**. No se pueden correr contra la base
   del cliente porque esas pruebas ESCRIBEN: mueven stock, gastan correlativos
   y emiten documentos. Son cuatro pasos: crear el proyecto, `pnpm db:aplicar`,
   apuntar ahí el `.env.local` y poner `E2E_PERMITIR_ESCRITURA=1`.

2. **Las credenciales de SUNAT y lo que va con ellas** (§4): el certificado
   `.pfx` con su clave, el usuario SOL secundario, los tres Excel de productos
   / clientes / proveedores, y los correlativos de arranque por serie. El
   código está entero, cifrado y esperando; solo falta enchufarlo. Del
   certificado hay que **mirar la fecha de caducidad en cuanto llegue**: Willy
   dijo que el suyo *«ya fue el año pasado»*.

### Lo que puedo hacer yo sin esperar a nadie

- **El envío de la guía a SUNAT** (§3): el cliente REST + OAuth2. Se puede
  escribir, pero **no se puede probar de verdad** — la GRE no tiene ambiente de
  pruebas. La guía como documento interno ya funciona y ya mueve el stock.
- **El cartel** que queda de 41 rutas: importaciones (§1). Alertas,
  equivalencias y configuración ya están hechas (26/08).
- **El worker que empuja las alertas** (§1): la bandeja existe y se refresca a
  mano, pero lo que se pidió fue que la alerta LLEGUE por WhatsApp o correo.
  Falta el cron y el envío; la tabla ya lleva la marca de «todavía no salió».
- **Comparar la ficha de cliente con la de Defontana** (§5): ellos tienen 18
  campos y nosotros 32 columnas, así que probablemente sobren.
- Las cosas menores de §6.

### Dos avisos para el día de la entrega (§7)

- **Hay que rotar las credenciales.** El token y las llaves de Supabase están
  en texto plano en `.env.local` y son de la cuenta del cliente. Se trabajó así
  a propósito y quedó dicho que se cambian al entregar: este es el recordatorio.
  Con ellas va `SUNAT_ENCRYPTION_KEY` en Vercel, que tiene que ser **la misma
  que en local** o las credenciales guardadas no se pueden descifrar.
- **Los datos `[DEMO]` se borran pasando antes un ajuste de inventario.** La
  guía de prueba movió stock de verdad; si se borra el documento sin ajustar,
  el stock se queda mintiendo — que es exactamente lo que ya pasó una vez con
  el costo del 6205 (ver R2).

---

## 1 · Los demás módulos están vacíos

De **41 rutas hay 40 reales**. La otra es un cartel de «en construcción».
(El recuento sale de contar los `page.tsx`, así que incluye login y las de
alta y edición.)

**Reales:** tablero · cotizaciones (listado, constructor, ficha) · productos
(listado, alta/edición, importador) · clientes (listado, ficha, alta/edición) ·
**recepciones** e **inventario** ← el 24/08 · **proveedores** y **compras**
← el 25/08 · **facturación** (listado, emisión, ficha, configuración),
**informes** (cinco gráficos), **guías de remisión** (listado, preparación,
ficha) y **cobranzas** (cartera, cobro y gestiones) ← el 25/08 por la tarde ·
**alertas** (bandeja, filtros, leer/archivar y refresco) y **equivalencias**
(cross-reference y captura a mano) y **configuración** (empresa, series y
usuarios) ← el 26/08

**Cartel:** importaciones — pero **el fondo del asunto ya está arreglado**: la
migración 022 corrigió que los gastos de importación se cobraran ENTEROS en
cada recepción parcial (dos entregas de media compra cargaban el gasto dos
veces) y ató el detalle de gastos al total. Lo que falta es solo la pantalla
de seguimiento: qué está en tránsito, con qué courier y para cuándo.

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

Pendiente de contrastar la ficha de cliente con la de Defontana. Lo que ya se
sabe, de `MAPA-DEFONTANA.md` de Kassara:

- Su ficha son **18 campos en la primera de tres pestañas**
- Se **descartan** Fax, Casilla, Sitio Web y ZIP
- La razón, textual: *«hay muchos clientes técnicos que a las justas me dan
  correo»* → alta rápida con lo indispensable, el resto detrás de «más datos»

El esquema tiene **32 columnas** en `clientes`, así que probablemente sobren
campos antes que falten. Hay que sentarse con la ficha de Defontana delante y
comparar una por una.

---

## 6 · Cosas menores anotadas

- **Condiciones, contacto y orden de compra** en la cotización son texto libre.
  Al menos «condiciones» debería ser una lista con las opciones habituales
  (forma de pago, garantía) y permitir escribir una distinta.
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
- **`BuscadorProductos` de `@rodatech/ui` no lo usaba nadie.** Su cabecera dice
  que es «el control más usado del ERP» y lista cinco pantallas: constructor de
  cotizaciones, compra, recepción, movimiento de inventario y guía. En realidad
  ninguna lo importaba —cada módulo se había hecho el suyo— y el primer
  llamador real es la pantalla de equivalencias, del 26/08. Vale la pena
  revisar si los buscadores propios de esos cinco módulos tienen las mismas
  protecciones (descartar respuestas tardías, `shouldFilter={false}`), o
  cambiarlos por este.
- **Nada verificado en móvil real.** Las comprobaciones son sobre el HTML
  servido; el comportamiento táctil no lo ha probado nadie.
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
- **El kardex solo enlaza las referencias de recepción.** Las de comprobante,
  guía, compra y ajuste enseñan el número sin enlazar, porque esas fichas
  todavía no existen. Al crear cada módulo hay que añadir su caso en
  `enlaceReferencia()` de `inventario/ui/tabla-kardex.tsx`.

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
