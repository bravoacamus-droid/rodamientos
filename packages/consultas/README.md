# @rodatech/consultas

Consulta de RUC/DNI (SUNAT/RENIEC) y tipo de cambio (SUNAT) a través de
[Decolecta API](https://decolecta.com), con **control estricto de cuota**.

## Por qué existe este paquete

El cliente usa el plan gratuito de Decolecta: **100 consultas al mes**. Si el
ERP las gasta sin control, se queda sin poder dar de alta clientes a mitad de
mes. El control de cuota no es un detalle de este paquete, es su razón de ser.
Todo lo demás (caché, normalización de errores, validación local) existe para
proteger esas 100 consultas.

La especificación completa que sigue este paquete está en
`D:\Integraciones\apisunat_decolecta_api\PROMPT_INTEGRACION_DECOLECTA.md`.

## Instalación en la base de datos (paso obligatorio)

Este paquete necesita tres tablas y tres funciones de Postgres, definidas en
[`migracion.sql`](./migracion.sql). **Ese archivo no está en
`supabase/migrations/`** porque ese directorio lo administra otro agente en
paralelo. Antes de usar el paquete en producción:

1. Copia el contenido de `migracion.sql` a la siguiente migración numerada de
   `supabase/migrations/` del proyecto (o pide que lo haga quien sea dueño de
   ese directorio).
2. Aplícala con el flujo normal del monorepo (`pnpm db:aplicar` o el
   equivalente que use el proyecto).
3. Confirma que el rol con el que el backend llama a Supabase puede ejecutar
   `rpc()` sobre `consultas_reservar_cuota`, `consultas_liberar_cuota` y
   `consultas_marcar_agotado`, y leer/escribir `consultas_cache` y
   `consultas_log`.

Las tablas son:

| Tabla | Para qué |
|---|---|
| `consultas_cuota` | contador de cuota mensual, con reserva atómica |
| `consultas_log` | bitácora de observabilidad (nunca guarda el documento en claro) |
| `consultas_cache` | caché de RUC/DNI/tipo de cambio, con TTL |

## Uso

El paquete **no crea ni lee configuración por sí mismo**: recibe el cliente de
Supabase ya construido y la configuración de cuota por inyección de
dependencia. Así se puede testear sin base de datos y no se acopla a
`@rodatech/db` ni a ninguna versión concreta del SDK de Supabase.

```ts
import { createClient } from "@rodatech/db"; // o donde viva el cliente del proyecto
import { consultarRuc, consultarDni, tipoCambioSunat, type ContextoConsultas } from "@rodatech/consultas";

const contexto: ContextoConsultas = {
  cliente: createClient(), // cualquier objeto con from()/rpc() compatible, ver src/cliente.ts
  token: process.env.DECOLECTA_TOKEN, // puede ser undefined: el paquete degrada, no lanza
  cuota: {
    plan: process.env.DECOLECTA_PLAN ?? "free",
    limite: Number(process.env.DECOLECTA_QUOTA_LIMIT ?? 100),
    reservaPorcentaje: Number(process.env.DECOLECTA_QUOTA_RESERVE_PCT ?? 5),
    diaCicloReinicio: Number(process.env.DECOLECTA_QUOTA_CYCLE_DAY ?? 1),
  },
  timeoutMs: Number(process.env.DECOLECTA_TIMEOUT_MS ?? 10_000),
};

const ruc = await consultarRuc("20601030013", contexto, { prioridad: "normal" });
if (ruc.ok) {
  console.log(ruc.datos!.razonSocial, ruc.origen); // 'api' | 'cache' | 'stale_cache'
} else {
  // ruc.mensaje ya está en español y listo para mostrar. La UI debe habilitar
  // el llenado manual, nunca romper el alta de cliente.
  console.warn(ruc.mensaje);
}

const dni = await consultarDni("46027897", contexto, { prioridad: "critical" });

const tc = await tipoCambioSunat({ mes: 8, anio: 2026 }, contexto, { prioridad: "low" });
```

Variable de entorno del token: **`DECOLECTA_TOKEN`**. Nunca se imprime su
valor en ningún log de este paquete.

### La variable de entorno de la API key y el arranque de la app

La especificación general (sección 6) pide que la app **falle al arrancar**
si falta el token, no en la primera consulta. Este paquete toma la decisión
contraria a propósito: **nunca lanza** por falta de token, porque el
requisito explícito de esta integración es que el alta de cliente pueda
completarse a mano aunque Decolecta no esté configurado. Si tu aplicación sí
quiere fallar rápido en producción, hazlo en tu propio arranque con
`requerirEnv("DECOLECTA_TOKEN")` de `@rodatech/config`, y pasa igualmente el
resultado (que ya no será `undefined`) al `ContextoConsultas`. El paquete se
mantiene defensivo independientemente de esa decisión de la app.

### Prioridades

```ts
type Prioridad = "critical" | "normal" | "low";
```

Declárala en cada llamada según la regla práctica de la especificación: si el
usuario puede esperar o escribir el dato a mano, es `normal` o `low`; nunca
`critical`. En modo reserva (≥95% de la cuota consumida) solo pasan las
llamadas `critical`.

### Forma de la respuesta

Toda función pública devuelve `Resultado<T>`:

```ts
type Resultado<T> = {
  ok: boolean;
  origen: "api" | "cache" | "stale_cache" | "quota_blocked" | "sin_configurar" | "proveedor_caido" | "invalido";
  datos: T | null;
  cuota: EstadoCuota | null;   // null solo cuando ni siquiera se llegó a consultar la cuota (validación local)
  mensaje: string | null;      // en español, listo para mostrar
  errorCodigo: CodigoError | null;
  obtenidoEn: string | null;   // fecha ISO del dato mostrado; relevante en 'stale_cache'
};
```

**Nunca lanza una excepción por falta de cupo, token o caída del proveedor.**
La UI debe leer `ok`/`origen` y, si es `false`, habilitar el llenado manual
mostrando `mensaje`.

## El guardián de cuota

`src/cuota.ts` (exportado también como `@rodatech/consultas/cuota`) es el
único lugar que decide si una llamada sale a la red:

1. **Reserva atómica en Postgres.** `reservarCuota()` llama a la función SQL
   `consultas_reservar_cuota`, que hace `SELECT ... FOR UPDATE` y solo
   incrementa el contador si hay cupo para la prioridad dada. La atomicidad
   vive en la base de datos, no en memoria: el ERP corre en varias instancias
   serverless a la vez y un contador en memoria se desincroniza en el primer
   segundo.
2. **Umbrales:** 50% `INFO`, 75% `WARN`, 90% `ALERT`, 95% `CRITICAL` (modo
   reserva: solo `critical`), 100% `BLOCKED` (nadie pasa). `calcularEstado()`
   es una función pura, fácil de testear sin base de datos.
3. **Reserva optimista + liberación.** Se incrementa el contador *antes* de
   llamar al proveedor. Si la petición nunca llega a Decolecta (timeout o
   error de red), `liberarCuota()` devuelve esa unidad. Si sí llegó pero
   Decolecta respondió 429, `marcarAgotado()` sincroniza el contador local al
   100%: un 429 es una señal de que el contador se desincronizó, no un caso
   normal.
4. **Reintentos con cuota.** Cada reintento de un 5xx vuelve a pasar por el
   guardián (cada intento cuesta cupo), máximo 2 reintentos con backoff
   exponencial (2s, 4s por defecto).

## Orden de las capas (obligatorio)

```
validar (local) → caché → cuota → red → normalizar → escribir caché
```

Invertir cuota y caché es el error clásico: descuenta cupo por respuestas que
salieron de memoria. `src/proveedor.ts` (`ejecutarConsulta`) es el único
orquestador que respeta este orden; `ruc.ts`, `dni.ts` y `tipo-cambio.ts` solo
validan localmente y le delegan el resto.

## Validación local (antes de gastar cuota)

- **RUC**: 11 dígitos, empieza por `10`, `15`, `17` o `20`, y dígito
  verificador módulo 11 correcto (pesos `5,4,3,2,7,6,5,4,3,2`).
- **DNI**: exactamente 8 dígitos.

Un documento que no pasa esto **no toca ni la caché ni el guardián de cuota ni
la red**: es el ahorro de cuota más grande de todo el paquete.

## Caché

| Espacio | TTL | Motivo |
|---|---|---|
| `ruc` | 30 días | razón social y dirección cambian poco |
| `dni` | 90 días | los nombres no cambian; ver nota de datos personales abajo |
| `tipo_cambio` (fecha pasada) | permanente | dato histórico inmutable |
| `tipo_cambio` (fecha de hoy) | hasta la medianoche UTC siguiente | se publica una vez al día |
| `tipo_cambio` (mes cerrado) | permanente | ya no cambia |
| `tipo_cambio` (mes en curso) | 24 h | | 
| Errores 400/404/422 | 24 h (caché negativa) | son deterministas: reintentar es gastar cuota en el mismo error |
| Errores 429 / 5xx | nunca | son transitorios; cachearlos ocultaría que el proveedor ya se recuperó |

La caché se consulta **antes** del guardián de cuota: un acierto nunca
incrementa el contador (cubierto por tests).

### Single-flight

Si dos consultas simultáneas piden el mismo documento, `unaSolaVez()` en
`src/cache.ts` hace que solo una ejecute la llamada real; la otra espera el
mismo resultado. Es deduplicación **por instancia de proceso** (un `Map` en
memoria): evita que una ráfaga de clics duplicados en la misma instancia
dispare dos llamadas, pero no sustituye al guardián de cuota, que sí es
atómico entre instancias porque vive en Postgres.

### Caché rancia como último recurso

Si no hay cupo y existe una entrada de caché **vencida**, se devuelve con
`origen: "stale_cache"` y su fecha original en `obtenidoEn`, en vez de dejar
la pantalla vacía. La UI debe mostrar algo como "dato del 12/06/2025".

## Normalización de errores

`src/errores.ts` traduce las dos formas de error de Decolecta —`{"error":
"..."}` (400 y el resto) y `{"message": "..."}` (422 del RUC básico)— a una
sola estructura `ErrorConsulta`, y clasifica cada status:

| HTTP | `errorCodigo` | Reintentable | Cacheable en negativo |
|---|---|---|---|
| 400 | `PETICION_INVALIDA` | no | sí |
| 401/403 | `NO_AUTORIZADO` | no | no |
| 402 | `PAGO_REQUERIDO` | no | no |
| 404 | `NO_ENCONTRADO` | no | sí |
| 422 | `DOCUMENTO_INVALIDO` | no | sí |
| 429 | `CUOTA_PROVEEDOR_AGOTADA` | no | no |
| 5xx | `ERROR_PROVEEDOR` | sí (máx. 2 reintentos) | no |
| timeout / red | `TIMEOUT` / `RED` | sí | no |

Las llamadas HTTP usan `AbortSignal.timeout` (`DECOLECTA_TIMEOUT_MS`,
por defecto 10 s).

## Degradación elegante

Si no hay `token` configurado, o el proveedor está caído tras agotar
reintentos, o no queda cuota: el paquete **devuelve un `Resultado` con `ok:
false`**, nunca lanza. `mensaje` ya viene en español y listo para mostrar. El
alta de cliente (o cualquier flujo que use este paquete) debe seguir
funcionando con el usuario escribiendo los datos a mano.

## Decisiones que no estaban explícitas en la especificación

- **El token nunca se lee de `process.env` dentro del paquete.** Se recibe en
  `ContextoConsultas.token` para que el paquete sea 100% inyectable y
  testeable sin variables de entorno reales. Esto también significa que este
  paquete, a propósito, no implementa el "fallar al arrancar si falta la
  API key" de la sección 6 de la especificación general: prioriza el
  requisito explícito de esta integración (degradar, nunca lanzar). Ver la
  sección de arriba.
- **Precios del tipo de cambio como `string`**, nunca convertidos a
  `number`. El paquete no trae una librería decimal como dependencia (para
  mantenerlo con cero dependencias de runtime); en vez de arriesgar precisión
  binaria, se devuelve el string tal cual lo entrega SUNAT y se deja la
  conversión a quien consuma el dato con la librería decimal que use el
  proyecto.
- **El `ClienteSupabase` es una interfaz propia, no el tipo real de
  `@supabase/supabase-js`.** Se definió el subconjunto exacto que este
  paquete usa (`from().select().eq().maybeSingle()`, `from().upsert()`,
  `from().insert()`, `rpc()`). El cliente real de Supabase la cumple de sobra
  (tiene más métodos), y en los tests se usa un doble en memoria
  (`ClienteSupabaseFalso`, en `src/soporte-pruebas.ts`) sin red ni Postgres.
- **`consultas_log.param_hash` guarda un hash SHA-256 truncado, nunca el
  documento en claro.** El DNI es un dato personal (Ley 29733); en vez de
  bifurcar el logging entre RUC y DNI, se aplicó la misma regla a los dos por
  simplicidad y para no arriesgar una fuga si algún día se decide loguear
  también el RUC de alguien.
- **Caché negativa también para 400**, no solo 404/422. La especificación
  completa (sección 7, tabla de manejo de errores) lo pide explícitamente
  ("negative cache 24h" en la fila de 400); se siguió esa tabla en vez de la
  versión abreviada.
- **El backoff de reintentos es inyectable** (`ContextoConsultas.backoffBaseMs`,
  por defecto 2000 ms → 2s/4s). Existe solo para que los tests no esperen
  segundos reales; en producción se deja el valor por defecto.
- **`unaLlamadaHttp` no reintenta por sí sola.** Cada reintento de un 5xx debe
  volver a pasar por el guardián de cuota (la especificación dice
  explícitamente que cada reintento cuesta cupo), así que la orquestación de
  reintentos vive en `proveedor.ts`, no en el cliente HTTP.
- **No se implementó "RUC avanzado" (`/v1/sunat/ruc/full`), SBS ni AFP.** El
  encargo pedía "consulta de RUC/DNI y tipo de cambio"; el resto de endpoints
  de Decolecta que sí documenta la especificación general puede añadirse
  después reutilizando `ejecutarConsulta()` con el mismo patrón.

## Ejecutar los tests

```bash
pnpm --filter @rodatech/consultas test
# o, desde la raíz del monorepo:
pnpm test
```

Todos los tests usan `ClienteSupabaseFalso` (un doble en memoria que replica
el comportamiento de `migracion.sql`, incluida la reserva atómica) y un
`fetch` inyectado: corren sin red y sin Postgres.
