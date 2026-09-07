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
`tsc`, a `eslint` y a los 1170 tests.** Botones que no se ven, funciones sin
puerta, columnas que no existen. Si has tocado una pantalla, ábrela.

Hay servidor de desarrollo en `http://localhost:4005` y herramientas de
navegador. Úsalas.

### El patrón que más se repite: la pieza existe, el camino no

Ocurrió **seis veces solo el 07/09**:

| Función | Estaba desde | Por qué no se veía |
|---|---|---|
| Historial de ventas | 011 | «hist.», 12 px, entre dos flechas |
| `mejor_oferta` | 011 | exigía stock justo cuando no hay |
| `mostrar_cuenta` | 029 | nada lo imprimía |
| `v_precios_compra` | 042 | ninguna pantalla la leía |
| Mandar por WhatsApp | — | dentro del menú, y sin teléfonos |
| Forma de pago | siempre | viajaba y no llegaba al papel |

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
pnpm test                    # 1170 tests
pnpm lint
npx tsc -p apps/web/tsconfig.json --noEmit

node scripts/aplicar-migraciones.mjs 070_lo_que_sea.sql   # UNA migración
pnpm db:tipos                # regenerar tipos tras migrar
```

**No corras `aplicar-migraciones.mjs` sin argumento**: reaplica las 69 desde
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

| Documento | Se edita | Hasta cuándo |
|---|---|---|
| Cotización | todo | borrador o enviada |
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
  la cita del cliente. **Empieza por §AG** (reunión del 07/09).
- `docs/PREGUNTAS-WILLY.md` — lo que se le manda, listo para copiar. Máximo
  cinco preguntas; **búscalas antes en sus archivos**, que ya ahorró cuatro de
  cinco.
- `docs/PLAN-V2.md` — alcance.

---

## 8 · Estado al 07/09

**Funciona de punta a punta**, probado en vivo: cotizar → confirmar → pedir
precios → comparar → comprar → recibir → avisar al cliente → guía → facturar →
cobrar.

### Bloqueado en Willy

1. **Sus series y desde qué correlativo siguen** — usa `CT02`, `T002`, `F002`;
   el sistema tiene otras de prueba. **Es lo más urgente**: si emite con las
   nuestras, los correlativos no cuadran con lo declarado.
2. Plazo de crédito habitual (los 97 clientes están a 0 días).
3. Plazo de entrega de un proveedor de Lima.
4. Los teléfonos de sus clientes.

### Pendiente técnico

- **Ubigeo de la empresa** (San Juan de Lurigancho). Va en cada guía.
- **Datos de prueba en la base del cliente** — sin decidir. Hay rondas de
  precios, compras, recepciones, una factura y su cobro.
- **Envío de guías a SUNAT (GRE)** — cambió a REST con OAuth2 y hay que
  escribirlo. Las guías valen como documento interno y mueven stock, pero **no
  se están declarando**.

### Escrito pero SIN probar en pantalla

- Detalle de cuotas en la factura (no hay ninguna con más de una cuota).
- La rejilla de precios con diez proveedores (no existe una ronda así).
- Dar de alta una agencia nueva (se probó el caso «ya existe»).
