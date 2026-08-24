<div align="center">

<img src="apps/demo/logo.png" alt="Inversiones Rodatech E.I.R.L." height="90" />

# Rodatech ERP

**ERP Comercial a medida para distribución de rodamientos y repuestos de mantenimiento industrial**

Inversiones Rodatech E.I.R.L. · Jr. Los Huertos N° 2232, Lima 36 · Perú

Next.js 15 · React 19 · TypeScript · Tailwind v4 · Supabase · pnpm + Turborepo

</div>

---

## Estado

Reconstrucción **v2** en curso, sobre la rama `v2/monorepo`.

La v1 (la demo que se le mostró al cliente) sigue completa y ejecutable en
`apps/demo/`, como referencia. Se elimina en la fase 7, no antes.

El plan completo —auditoría de la v1, requisitos de la reunión con el cliente
y el orden de trabajo— está en **[`docs/PLAN-V2.md`](docs/PLAN-V2.md)**.

## Qué falta

Lo pendiente vive en **[docs/PENDIENTES.md](docs/PENDIENTES.md)**, ordenado por
lo que más duele. Lo primero de esa lista bloquea al resto: ningún desplegable
de Radix llega a abrirse, y hay funciones construidas encima de ese componente.

## Estructura

```
apps/
  web/          la aplicación v2
  demo/         la v1 intacta, como referencia
packages/
  config/       constantes del negocio, tsconfig base
  db/           clientes de Supabase y tipos generados
  ui/           design system: shadcn/ui + tokens de marca Rodatech
  sunat/        facturación electrónica (UBL 2.1, firma, SOAP, CDR)
  consultas/    RUC/DNI vía Decolecta, con control de cuota
supabase/
  migrations/   esquema v2
e2e/            Playwright
docs/           plan, investigación
scripts/        aplicar migraciones, generar tipos
```

Cada módulo del ERP vive en `apps/web/src/modules/<modulo>/` y publica su
superficie por un único `index.ts`. La ruta de Next es una línea:

```tsx
// apps/web/src/app/(erp)/cotizaciones/page.tsx
export { PaginaCotizaciones as default } from "@/modules/cotizaciones";
```

La convención completa está en
[`apps/web/src/modules/README.md`](apps/web/src/modules/README.md).

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local      # completar con las credenciales del proyecto
pnpm db:aplicar                 # aplica supabase/migrations en orden
pnpm db:tipos                   # regenera los tipos desde el esquema real
pnpm dev                        # http://localhost:4005
```

La aplicación corre en el **puerto 4005**, en desarrollo y en `start`. Las
pruebas de punta a punta apuntan ahí salvo que se fije `E2E_BASE_URL`.

`pnpm db:aplicar` y `pnpm db:tipos` aceptan dos formas de conectarse y usan la
que esté configurada en `.env.local`:

| Variable | Cómo obtenerla |
|---|---|
| `SUPABASE_DB_URL` *(preferida)* | Dashboard → Project Settings → Database → Connection string (URI) |
| `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` | Dashboard → Account → Access Tokens |

La primera permite transacciones reales, así que una migración que falla a
mitad no deja el esquema a medias.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | levanta la app en desarrollo |
| `pnpm build` | build de producción de todo el workspace |
| `pnpm typecheck` | `tsc --noEmit` en cada paquete |
| `pnpm test` | tests unitarios (vitest) |
| `pnpm e2e` | pruebas de punta a punta (Playwright) |
| `pnpm verificar` | typecheck + tests, lo que corre CI |
| `pnpm db:aplicar` | aplica las migraciones |
| `pnpm db:tipos` | regenera `packages/db/src/tipos.generados.ts` |

## Despliegue

Es un monorepo, así que **la raíz del proyecto en Vercel tiene que ser
`apps/web`**, no la raíz del repositorio. Sin eso el build falla con:

> Error: No Next.js version detected.

y tiene sentido: en la raíz solo vive el `package.json` del workspace, que no
depende de `next`.

**Settings → Build and Deployment**

| Ajuste | Valor |
|---|---|
| Root Directory | `apps/web` |
| Include files outside of the Root Directory | activado *(viene por defecto)* |
| Framework Preset | Next.js *(se detecta solo con lo anterior)* |
| Install / Build Command | los que trae por defecto |

El `packageManager` está fijado en el `package.json` de la raíz y el
`pnpm-lock.yaml` está versionado, así que la instalación es reproducible.

### Variables de entorno

Sin ellas el middleware **falla cerrado** y todo redirige a `/login`. No es un
fallo: es lo que queremos si faltan credenciales.

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | llega al navegador |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | llega al navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor · **nunca** con prefijo `NEXT_PUBLIC_` |

Las dos primeras van declaradas en `env` de `next.config.ts` porque las
cargamos nosotros desde el `.env.local` de la raíz, y ese cargador corre
DESPUÉS del de Next. En Vercel no hay `.env.local`: se leen del panel, y el
cargador sale sin hacer nada si el archivo no existe.

### Atajos de acceso en el despliegue de pruebas

Vercel compila con `NODE_ENV=production` aunque sea un preview, así que el
panel de acceso rápido del login desaparecía justo donde más falta hace:
enseñándole el sistema al cliente.

Se activa con una variable **explícita**:

    RODATECH_ATAJOS=1
    RODATECH_DEV_PASSWORD=...

En local no hace falta: fuera de producción se activan solos. La contraseña es
de servidor y nunca viaja al navegador — el botón solo manda qué cuenta quiere.

**Se borra el día de la entrega.** Mientras esté puesta, cualquiera con la URL
entra con un clic.

### Antes de dar una URL pública

Nueve funciones de negocio (`crear_cotizacion`, `emitir_comprobante`,
`importar_productos`, `recepcionar_mercaderia`, `registrar_pagos`,
`emitir_guia`, `anular_guia`, `aprobar_cotizacion`,
`generar_guia_desde_cotizacion`) todavía **no comprueban el rol dentro del
cuerpo**. Son `security definer`, así que se saltan RLS: cualquiera con una
sesión válida puede llamarlas por la API directa sin pasar por la aplicación.

Para un preview privado no pasa nada. Antes de exponerlo de verdad hay que
cerrarlas, como ya hacen `registrar_ajuste_inventario` y
`anular_comprobante`.

## Credenciales

`.env.local` no se versiona. La `SUPABASE_SERVICE_ROLE_KEY` **salta RLS por
completo**: solo la usan Server Actions que ya verificaron el rol de quien
llama, y los scripts locales. Si se carga en Vercel debe ser como variable de
**servidor**, nunca con el prefijo `NEXT_PUBLIC_`.

Las credenciales de desarrollo se **rotan antes de la entrega**.
