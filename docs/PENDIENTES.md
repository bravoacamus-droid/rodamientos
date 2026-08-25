# Pendientes

Estado al 25/08/2026 (tarde). Ordenado por lo que más duele. Lo ya resuelto vive al
final, con la lección, porque los tres casos se habían diagnosticado mal y
volver a caer sale caro.

---

## Dónde estamos

| | |
|---|---|
| Rutas | **28 reales de 36** · quedan 8 carteles |
| `pnpm typecheck` | 7/7 paquetes |
| `pnpm test` | 442 en verde |
| `pnpm e2e` | configurado, **0 pruebas escritas** |
| `pnpm lint` | roto (ver §6) |
| Migraciones | **hasta la 016, aplicadas** al Supabase del cliente |

`main` está en la punta de lo último. Las migraciones son idempotentes y la
013, la 015 y la 016 son centinelas: fallan al aplicar si alguien mete una función de
escritura sin control de rol, o si la valorización se desalinea del kardex.

**Para retomar:** `pnpm install && pnpm dev` (puerto 4005). Hace falta un
`.env.local` en la raíz — ojo, **con el punto delante**: el `.gitignore` tapa
`.env*.local`, así que un archivo llamado `env.local` a secas NO está
protegido y se sube al primer `git add .`.

Lo siguiente sin bloqueos es **cobranzas** (§1). Antes de tocar facturación,
hay que arreglar el redondeo del §0.

---

## 0 · El redondeo de cotizaciones se come medio céntimo

Encontrado al escribir compras, y **no está arreglado en cotizaciones**.

`redondear2(cantidad × precio)` no da lo mismo que Postgres. En la base,
`round(3 × 1.005, 2)` es **3.02**; en JavaScript, `3 * 1.005` ya vale
3.0149999999999997 antes de redondear, así que sale **3.01**. El céntimo se
pierde en la multiplicación, no en el redondeo, y por eso el `Number.EPSILON`
que lleva la función no lo salva: la diferencia es mil veces mayor que él.

Compras usa `importeExacto()` de `@rodatech/config`, que hace la cuenta con
enteros y coincide con Postgres en los siete casos frontera comprobados.
**`cotizaciones/dominio/totales.ts` sigue con el redondeo ingenuo**, y ahí
importa más: `cotizacion_items.importe` es una columna generada y ese número
acaba en el comprobante. Es justo la resta de céntimos por la que SUNAT
observa una factura.

Hace falta cuando se toque facturación, y con cuidado: `importeLinea` de
cotizaciones multiplica TRES factores —cantidad, valor unitario y el
descuento—, así que no vale con sustituir la llamada. Merece su propio commit
y sus propias pruebas contra la base.

---

## 1 · Los demás módulos están vacíos

De **36 rutas hay 28 reales**. Las otras 8 son carteles de «en construcción».
(El recuento sale de contar los `page.tsx`, así que incluye login y las de
alta y edición; los números anteriores de este documento no las contaban todas
y no cuadraban entre sí.)

**Reales:** tablero · cotizaciones (listado, constructor, ficha) · productos
(listado, alta/edición, importador) · clientes (listado, ficha, alta/edición) ·
**recepciones** (listado, registro, ficha) e **inventario** (valorización,
kardex, cuadre) ← el 24/08 · **proveedores** (listado, ficha, alta/edición) y
**compras** (listado, registro, ficha) ← el 25/08

**Carteles:** guías de remisión · facturación · cobranzas · equivalencias ·
importaciones · reportes · alertas · configuración

### El backend de casi todos ya está escrito

Esto cambia la estimación. No son 15 módulos desde cero: `004_funciones.sql`
ya trae, con control de rol y probadas al aplicar:

| Función | Líneas | Para |
|---|---|---|
| `emitir_comprobante` · `anular_comprobante` · `recalcular_comprobante` · `siguiente_correlativo` | ~250 | facturación |
| `generar_guia_desde_cotizacion` · `emitir_guia` · `anular_guia` | ~165 | guías |
| ~~`recepcionar_mercaderia`~~ | ~110 | ~~recepciones~~ · **cableada 24/08** |
| ~~`registrar_ajuste_inventario`~~ | ~80 | ~~cuadre~~ · **cableada 24/08** |
| ~~`crear_compra` · `anular_compra`~~ | ~180 | ~~compras~~ · **escritas y cableadas 25/08** (migración 016) |
| `registrar_pagos` | ~40 | cobranzas |
| `generar_alertas` | — | alertas |
| `recalcular_precios_promedio` | ~45 | precio promedio |

La app usa **13 de ~32 RPCs**, más cuatro vistas analíticas. Para el resto de
módulos falta `acciones/` + `ui/`, no diseñar la base.

**Ojo con la excepción, que se descubrió al hacer compras:** la tabla existía
desde la 002 pero **no había ningún RPC**, y `numero` es `not null` sin
trigger de correlativo. O sea que la frase «solo falta la capa de arriba» hay
que comprobarla módulo a módulo antes de estimar: para compras hubo que
escribir 180 líneas de PL/pgSQL primero.

Orden sugerido, por lo que cierra el ciclo del dinero:

1. **Cobranzas** — `registrar_pagos` y la vista `v_cartera` con aging ya están.
2. **Guías de remisión** — la cotización aprobada ya tiene el botón «Generar
   guía» apuntando a una ruta que no existe. Bloqueada por el cliente REST
   OAuth2, que hay que escribir (ver §3).
3. **Facturación** — cierra el ciclo comercial. Bloqueada por el certificado
   del cliente; contra beta sí se puede avanzar. Antes de tocarla, arreglar el
   redondeo del §0.
4. El resto: alertas (`generar_alertas` + `v_reposicion`, que ya alimenta la
   pantalla de inventario), equivalencias, reportes, importaciones,
   configuración.

**El ciclo de abastecimiento ya está entero y probado de punta a punta**: se
registró CMP-26-00001 (170.32 + 30.66 = 200.98), se recibió con REC-26-00001,
la compra pasó sola a `recibida`, el kardex tomó los dos ingresos y el stock
del 6205 subió de 35 a 45. La invariante `stock.valorizado = kardex` cuadra en
los siete productos.

---

## 2 · Cero pruebas de punta a punta

`playwright.config.ts` está configurado y apunta al 4005, pero `e2e/` solo
tiene el README. La **fase 6 del plan está a cero**: ni un flujo completo
cubierto, justo donde se mueve el dinero.

El primero que hay que escribir es cotizar → aprobar, que es lo único que ya
funciona de extremo a extremo.

---

## 3 · La GRE necesita un cliente que no existe

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
  cotización, factura y guía de su sistema actual, por serie.

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
- **`pnpm lint` no funciona**: `next lint` quedó obsoleto y abre un asistente
  interactivo. Se migra con
  `npx @next/codemod@canary next-lint-to-eslint-cli .`
- **CI puede estar en rojo por los secrets, no por el código.** El workflow
  «Verificar» corre typecheck, tests y `pnpm build` en cada push a `main`, y el
  build necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  configurados como *secrets* del repositorio en GitHub. Si nunca se pusieron,
  ese paso falla aunque typecheck y tests pasen. Son públicas por definición
  —viajan al navegador—, pero salen de secrets para no fijarlas en el repo.
- **Nada verificado en móvil real.** Las comprobaciones son sobre el HTML
  servido; el comportamiento táctil no lo ha probado nadie.
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
- [ ] Borrar los dos clientes de prueba marcados `[DEMO]`
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
