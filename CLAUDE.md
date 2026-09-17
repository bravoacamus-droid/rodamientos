# Rodatech · ERP

ERP para **Inversiones Rodatech E.I.R.L.** (RUC 20562681206), distribuidora de
rodamientos y repuestos industriales en Lima. Cliente: **Willy Fernández**.

Lee esto entero antes de tocar nada. Son cinco minutos y evitan la mitad de los
errores que ya se cometieron.

---

## 1 · Para quién es

**Willy es mayor y no ve bien.** No es un detalle de accesibilidad, es la
restricción de diseño principal, y ya obligó a rehacer pantallas enteras:

- **Nada por debajo de 14 px** (`text-sm`). Un `text-xs` en algo que hay que
  leer es un fallo, no una preferencia.
- **Un botón tiene que parecer un botón.** Luis, textual: *«una persona que no
  sabe que tiene que darle click ahí»*. Enlaces en gris, iconos sueltos y
  celdas pulsables no valen.
- **Nada de jerga.** «Piso» era mío y hubo que quitarlo: se llama *precio
  mínimo de venta*. Si una etiqueta necesita que se la expliques, está mal.

> **La frase que resume el proyecto:** una cifra que no se lee y una cifra que
> no existe valen lo mismo.

---

## 2 · Cómo se trabaja aquí

### Verifica en la pantalla, no en el typecheck

**Casi todos los defectos encontrados en este proyecto eran invisibles a
`tsc`, a `eslint` y a los 1202 tests.** Botones que no se ven, funciones sin
puerta, columnas que no existen. Si has tocado una pantalla, ábrela.

Hay servidor de desarrollo en `http://localhost:4005` y herramientas de
navegador. Úsalas.

### El patrón que más se repite: la pieza existe, el camino no

Ocurrió **seis veces el 07/09** y otras tantas el 08/09:

| Función | Estaba desde | Por qué no se veía |
|---|---|---|
| Historial de ventas | 011 | «hist.», 12 px, entre dos flechas |
| `mejor_oferta` | 011 | exigía stock justo cuando no hay |
| `mostrar_cuenta` | 029 | **nadie lo escribía**: el interruptor no existía |
| `v_precios_compra` | 042 | ninguna pantalla la leía |
| Mandar por WhatsApp | — | dentro del menú, y sin teléfonos |
| Forma de pago | siempre | viajaba y no llegaba al papel |
| Alternativas de un producto | 011 | enlace ámbar de 12 px, y **solo sin stock** |
| Ventas anteriores | 011 | enlace azul partido en dos líneas |
| Editar cotización | 069 | el séptimo botón, en gris, tras WhatsApp |
| Un pedido sin stock | — | se descartaba: no salía en ninguna pantalla |
| `DatosMensaje.enlace` | siempre | nadie se lo pasaba |

**Y siete veces más el 08/09.** Un caso vale por todos: Willy pidió el botón
de las cuentas el 07/09 (13:21), su frase se copió literal en el comentario de
la 029 **y en el del componente que lo imprime**, y el botón no se construyó.
Se documentó la intención y no se conectó el cable. Hasta la 071, las cuentas
salían siempre.

**Y seis veces más el 09/09**, en compras. La peor: los papeles del proveedor
tenían migración entera —bucket privado, tabla, RLS— y un componente escrito,
y solo se llegaba a ellos desde la ficha de la recepción, nunca al recibir.

**Y dos más el 11/09**: la política de `perfiles` decía en su comentario «el
rol solo lo cambia admin/gerencia» y dejaba a cualquier empleado ascenderse con
un PATCH, porque RLS decide filas y no columnas (§AK.3). *Ojo: resultó no ser
explotable, y por un accidente — ver §AL.3.*

**Y tres más el 10/09, en las listas**, en una variante que conviene reconocer:
aquí la puerta estaba puesta y **faltaba el cable**. El selector de filas
escribía `?n=25` y ninguna página lo leía; `cursorAnterior` se pasaba como
`null` en las diez tablas; y `EstadoBadge` tenía cuatro estados SUNAT que no
usaba nadie. Eran veintitrés al cerrar ese día.

**Y tres más el 15/09** (§AL): «Configuración» no se encendía nunca en el menú;
las **cuentas para cobrar** llevaban desde la 064 imprimiéndose en cada
cotización **sin pantalla donde darlas de alta**; y el menú de usuario solo
sabía cerrar sesión, sin sitio donde editar el propio perfil.

**Y dos más el 16/09**: `crearMarca`, `crearFamilia` y `crearSubfamilia`
estaban desde la **033** —con su RPC, su candado de rol y su normalización— y
**ninguna pantalla las llamaba** (§AM.7b); y `lucide-react` estaba en el
`package.json`, dentro del sistema de diseño y en uso en otras diez pantallas,
mientras cotizaciones dibujaba **18 iconos a mano** y dos flechas de texto
(§AM.13). Y **uno más el 17/09**: la RETENCIÓN del IGV tenía sus tres columnas
desde la 002, `emitir_comprobante` la leía y calculaba el monto desde la 004,
el documento la imprimía y cobranzas admitía el medio de pago `retencion` —y
`antes-de-emitir` la mandaba en `false` siempre, porque no había interruptor.
Van **treinta casos**.

Los tres del 15/09 se habrían encontrado con un `grep`: un prop que siempre
vale `null`, un search param que se escribe y no se lee, un export sin quien lo
importe. Los del 16/09, también.

**Antes de construir algo, busca si ya está.** Construir la función y abrirle la
puerta son dos trabajos, y solo el segundo se nota.

### Los datos reales mandan sobre la lógica bonita

Este catálogo entró de un Excel y está a medias. Cualquier regla que suponga
datos completos no se ve nunca:

- **790 productos**, la mayoría sin costo, sin peso y sin precio mínimo.
- **394 tienen código básico; 396 no** (o-rings, pines, fajas).
- **97 clientes**: cero con teléfono, uno con correo, todos a «crédito 0 días».
- **97 proveedores** sin un solo teléfono.

Comprueba contra la base antes de dar una función por hecha.

### Di la verdad de lo que probaste

Si algo quedó sin verificar, dilo. Ya se rompió la facturación entera durante
dos commits por dar por hecho que la factura se comportaría como la cotización.

---

## 3 · Reglas que no se rompen

| Regla | Por qué |
|---|---|
| `documentosrodamiento/` y `.env.local` **fuera de git** | Datos comerciales reales y credenciales vivas |
| Los datos del cliente **no van en migraciones** | Las migraciones se versionan. Cárgalos por SQL directo |
| **No regenerar** `SUNAT_ENCRYPTION_KEY` | Descifra lo ya guardado |
| `RODATECH_ATAJOS` **se queda** por ahora | Decisión de Luis |
| Los tests e2e **nunca** contra la base del cliente | Escriben: mueven stock y consumen correlativos |

**Al entregar:** rotar credenciales de `.env.local` (por USB o gestor de
contraseñas, nunca por chat ni correo) y quitar `RODATECH_ATAJOS`.

---

## 4 · Comandos

```bash
pnpm dev                     # servidor en :4005
pnpm test                    # 1202 tests
pnpm lint
npx tsc -p apps/web/tsconfig.json --noEmit

node scripts/aplicar-migraciones.mjs 070_lo_que_sea.sql   # UNA migración
pnpm db:tipos                # regenerar tipos tras migrar
```

**No corras `aplicar-migraciones.mjs` sin argumento**: reaplica las 81 desde
cero y la 005 falla por vistas dependientes.

---

## 5 · Convenciones del código

- **Todo en español**: nombres, comentarios, mensajes de error.
- Los comentarios explican **por qué**, no qué. Si citas a Willy o a Luis, pon
  la frase textual y el minuto de la reunión — es lo que permite discutir una
  decisión meses después.
- **Migraciones numeradas y correlativas**, con una cabecera que explica el
  problema antes que la solución. `create or replace view` solo añade columnas
  al final.
- **Toda Server Action es un endpoint público.** Valida rol y datos aunque la
  pantalla ya lo haya hecho. La base valida otra vez: ahí es donde no se puede
  saltar.
- **El margen va sobre el COSTO** (`(venta − costo) / costo`), desde la 023.
- **El stock negativo es deliberado** (002): *preferimos un descuadre visible a
  bloquear el despacho*.

### Interfaz: dos cosas que no se copian a mano

- **Los iconos salen de `lucide-react`.** Está en el `package.json` y en el
  sistema de diseño. Un `<path>` escrito a mano no calza en trazo ni en
  tamaño con el de la pantalla de al lado, y los caracteres «↑ ↓ ✕» cambian
  de forma con la fuente. Única excepción: logotipos de marca, que lucide no
  trae (WhatsApp).
- **Un campo usa `campoBase` de `@rodatech/ui`**, no `border` + `rounded-md` +
  `bg-surface` copiados. Copiarlos dio **47 px contra 40** entre dos campos de
  la misma fila (§AM.13), y el día que cambie el token lo copiado se queda
  atrás.

### Trampas que ya mordieron

- `useState` **no** se reinicializa cuando cambia una prop. Patrón: estado del
  servidor + parches locales.
- Un `useEffect` que despacha sobre el estado del que depende **cuelga el
  navegador**. Eso va en el reducer.
- PostgREST **no ignora** una columna que no existe: tumba la consulta entera.
- Los heredocs de bash se comen backticks y `$`. Usa `Write`/`Edit` para
  código, no `cat <<EOF`.

---

## 6 · El flujo, y dónde se puede tocar cada cosa

```
Cotización → Pedido confirmado → [Compra → Recepción] → Guía → Factura → Cobro
```

**La guía va ANTES que la factura**, y es decisión de Willy: los productos
técnicos se revisan, y con la guía sellada por el almacén del cliente es con lo
que se puede facturar sin arriesgar una anulación.

Desde el 17/09 **es una regla y no una costumbre**: sin una guía *emitida* no
se emite comprobante. Lo comprueban las tres capas —`bloqueosEmision`, la
Server Action y `emitir_comprobante` (089)—, y el payload declara `guias`: si
alguien quita eso, la base rechaza TODAS las facturas. Van juntos.

Consecuencia: **el stock nunca sale con la factura**. La casilla de la venta de
mostrador se retiró, porque al llegar a facturar el stock ya salió con la guía
y marcarla solo podía restarlo dos veces. Si aparece una venta sin guía, lo que
hay que replantear es la regla, no volver a poner la casilla.

| Documento | Se edita | Hasta cuándo |
|---|---|---|
| Cotización | todo | borrador, enviada **o aprobada sin guía ni factura** (070) |
| Pedido confirmado | solo cantidades, con tres topes | mientras no se facture |
| Guía | la cabecera | mientras sea borrador |
| Recepción | nada; se le cuelgan papeles | siempre |

La regla es la misma en las cuatro: **hasta donde el documento todavía no es un
compromiso de nadie.**

---

## 7 · Dónde está cada cosa

```
apps/web/src/modules/<modulo>/
  api/         lecturas (server-only)
  acciones/    Server Actions
  dominio/     lógica pura, con tests. Sin React, sin fetch, sin reloj
  ui/          pantallas
```

Módulos: `cotizaciones`, `compras`, `guias`, `facturacion`, `recepciones`,
`productos`, `clientes`, `proveedores`, `inventario`, `cobranzas`,
`transporte`, `equivalencias`, `importaciones`, `reportes`, `alertas`.

**Documentación:**

- `docs/PENDIENTES.md` — el diario del proyecto. Cada decisión, con su porqué y
  la cita del cliente. **Empieza por §AJ** (las listas, 10/09) y **§AI**
  (compras, 09/09).
- `docs/PREGUNTAS-WILLY.md` — lo que se le manda, listo para copiar. Máximo
  cinco preguntas; **búscalas antes en sus archivos**, que ya ahorró cuatro de
  cinco.
- `docs/PLAN-V2.md` — alcance.

---

## 8 · Estado al 10/09

**Funciona de punta a punta**, probado en vivo: cotizar → confirmar → pedir
precios → comparar → comprar → recibir → avisar al cliente → guía → facturar →
cobrar.

### Bloqueado en Willy

1. **Desde qué número siguen su guía (`T002`) y su cotización (`CT02`)** —
   ninguna de las dos existe todavía como serie. Ver abajo: las de facturación
   ya están resueltas.
2. Plazo de crédito habitual (los 97 clientes están a 0 días).
3. Plazo de entrega de un proveedor de Lima.
4. Los teléfonos de sus clientes.

### Numeración: qué está resuelto y qué no (16/09)

Luis, 16/09, sobre las series: *«eso ya será cuando estemos vinculados con
SUNAT; aparte él dijo que iba a seguir con los números siguientes, que ya hace
sus facturas, para que siga nomás y no empiece desde 0»*.

**La regla queda fijada: se CONTINÚA la numeración, no se reinicia.** Y el
sistema ya sabe hacerlo: cada serie tiene `correlativo_inicial` («Desde» en la
pantalla), `siguiente_correlativo()` toma `greatest(actual + 1, inicial)`, y
`avisosDelInicial` dice cuántos números se saltan antes de guardar.

Comprobado en `/configuracion/sunat` el 16/09:

| Serie | Estado | Va por |
|---|---|---|
| `F002` factura | **existe, con el histórico real cargado** | 515 |
| `FC02` nota de crédito | existe | 3 |
| `T002` guía | **no existe** | — |
| `CT02` cotización | **no existe** | — |

**El riesgo que sí es urgente, y no depende de SUNAT:** las predeterminadas
siguen siendo `F001` y `FC01`, las de prueba. Emitir hoy una factura daría
`F001-00000002` en vez de `F002-00000516`. Se arregla con el enlace «Usar por
defecto» de la fila — pero es una decisión de numeración fiscal, así que la
toma Luis, no se cambia por iniciativa propia.

### Pendiente técnico

- **Ubigeo de la empresa** — CORREGIDO el 08/09. Era `150101` (Lima Cercado)
  y ahora es `150132` (San Juan de Lurigancho). Ojo: `150118` es
  Lurigancho/Chosica, otro distrito. La guía T001-00000001, ya emitida, lleva
  el origen viejo y se deja como está.
- **Datos de prueba en la base del cliente** — `limpiar-pruebas.sql` sigue
  sin correrse; lo tiene que hacer Luis. Hay rondas de precios, compras,
  recepciones, una factura y su cobro. Y uno que no se limpia borrando filas:
  al probar el 09/09 quedó registrado que **MARCO PERUANA vende el retén
  50X68X8TC a $ 1.40** — `proveedor_productos` se llena sola con cada
  respuesta (046) y eso no lo deshace borrar la respuesta.
- **Envío de guías a SUNAT (GRE)** — cambió a REST con OAuth2 y hay que
  escribirlo. Las guías valen como documento interno y mueven stock, pero **no
  se están declarando**.

### A medias, y es lo primero que hay que terminar

Lo del 10/09 (§AJ.6) quedó cerrado el 11/09: volver atrás funciona en las
**once** tablas y el selector de filas está en todas. Cotizaciones ya usa
`EstadoBadge`.

Las tres decisiones de la auditoría se cerraron el mismo 11/09 (§AK.4): las
reglas del documento bajaron a la base (079), el atajo de desarrollo ya no
puede quedarse encendido en producción, y el centinela del enlace público
mira el resultado y no el fuente (080).

**El costo y el margen los sigue viendo cualquier rol, y es deliberado**
(Luis, 11/09): el vendedor los necesita al negociar y son seis empleados de
confianza. Se revisa el día que entre un vendedor de fuera.

### Configuración, desde el 15/09

Son **tres pantallas** y no una (§AL.1): `/configuracion/empresa`,
`/configuracion/sunat` y `/configuracion/usuarios`, con su propio grupo en el
menú detrás de «Gestión». `/configuracion` redirige a la primera.

«SUNAT y numeración» lleva **todo** lo de emitir: el estado, el certificado y
el usuario SOL —que colgaban de facturación—, y las series.
`/facturacion/configuracion` redirige allí.

Ahí se editan también las **cuentas para cobrar** (en «Datos de la empresa»),
que desde la 064 se imprimían en cada cotización y solo se podían dar de alta
por SQL.

Y hay **`/perfil`**: cada uno cambia su nombre, su cargo, su teléfono y **su
contraseña** — las seis cuentas nacieron con la misma.

### El papel de la cotización, al 16/09

Willy lo repasó y mandó cinco observaciones (§AM). Lo que conviene saber antes
de tocar `HojaDocumento` o el documento de la cotización:

- El membrete lleva la **razón social** en azul, no el nombre comercial: ese ya
  está en el logo, al lado.
- El bloque del cliente son **dos filas a lo ancho** —Señores y Dirección— y
  debajo dos columnas: el cliente a la izquierda, las fechas y plazos del
  documento a la derecha.
- La columna **«Entrega» ya no depende solo del interruptor**: si las líneas no
  prometen lo mismo, sale siempre. Sin ella, «parte inmediato, el resto hasta
  15 días» no se puede leer.
- Las cuentas van en **tabla** —BANCO · TIPO DE CUENTA · N.° DE CUENTA · CCI—,
  dólares arriba. No es estética: un número de cuenta y un CCI seguidos en la
  misma línea se confunden al copiarlos.

### Lo siguiente que pidió Luis

**Mandar la cotización por correo desde el ERP** (11/09, §AK.8), con un correo
de dominio propio. Tres piezas, y solo una es código: el envío, los registros
DNS del dominio (SPF/DKIM/DMARC, sin los cuales cae en spam) y el PDF —que hoy
no existe como archivo—. Lo sensato es mandar el enlace público que ya está
construido (072) en vez del adjunto.

Bloqueado por lo de siempre: **uno de los 97 clientes tiene correo.**

### Escrito pero SIN probar en pantalla

- **Emitir un comprobante**, desde que la 089 exige guía (17/09). Es lo más
  urgente de esta lista: la base pide `guias` en el payload y la Server Action
  lo manda, pero esa llamada no se ha ejecutado — hacerlo gasta un correlativo
  real. **Pruébalo en la serie `F001`, que es la de prueba, antes de dar la
  facturación por buena.**
- Elegir una guía en el «+» de la factura. Solo hay dos guías en la base —una
  emitida y una en borrador—, así que ningún cliente tiene una segunda que
  ofrecer.
- Detalle de cuotas en la factura (no hay ninguna con más de una cuota).
- El estado apagado de «Ya se le preguntó» al añadir un proveedor a una ronda
  (§AI.3). Cubierto por tests; no se llegó a ver con los ojos.
- La rejilla de precios con diez proveedores (no existe una ronda así).
- Dar de alta una agencia nueva (se probó el caso «ya existe»).
- El **responsive de los módulos**, salvo la página pública. El prototipo de
  Luis (readdy.cc) no se puede leer con el navegador: carga pero nunca llega a
  `document_idle`. Con capturas sí.

### El enlace público al cliente (072)

`/ver/<token>` es **la única ruta sin sesión** del ERP. Antes de tocarla, lee
§AH.7: lo que la protege es el token de 32 hex y que
`cotizacion_por_token` sea `security definer` y no devuelva costos ni margen.
La migración lleva un centinela que revienta si eso cambia.

**No sirve de verdad hasta desplegar**: el enlace se arma con la cabecera de
la petición, así que hoy apunta a `localhost`. En cuanto esté en internet
funciona solo.
