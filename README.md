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
| `SUPABASE_MGMT_TOKEN` + `SUPABASE_PROJECT_REF` | Dashboard → Account → Access Tokens |

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

## Credenciales

`.env.local` no se versiona. La `SUPABASE_SERVICE_ROLE_KEY` **salta RLS por
completo**: solo la usan Server Actions que ya verificaron el rol de quien
llama, y los scripts locales. Si se carga en Vercel debe ser como variable de
**servidor**, nunca con el prefijo `NEXT_PUBLIC_`.

Las credenciales de desarrollo se **rotan antes de la entrega**.
