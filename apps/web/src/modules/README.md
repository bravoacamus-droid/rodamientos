# Convención de módulos

Cada módulo del ERP es una carpeta autocontenida bajo `src/modules/`. La ruta de
Next no contiene lógica: solo reexporta lo que el módulo publica.

```tsx
// src/app/(erp)/cotizaciones/page.tsx
export { PaginaCotizaciones as default } from "@/modules/cotizaciones";
```

Esa es toda la página. Si un `page.tsx` crece más allá de eso, algo se está
filtrando fuera del módulo.

## Anatomía

```
modules/cotizaciones/
├─ index.ts        ← superficie pública. Lo ÚNICO que la app puede importar.
├─ dominio/        ← lógica pura. Sin React, sin Supabase, sin I/O.
│  ├─ totales.ts
│  ├─ totales.test.ts
│  └─ tipos.ts
├─ api/            ← lectura. server-only, cacheable.
│  └─ consultas.ts
├─ acciones/       ← escritura. "use server".
│  ├─ crear.ts
│  └─ aprobar.ts
└─ ui/             ← componentes. Server por defecto.
   ├─ pagina.tsx
   ├─ tabla.tsx
   └─ constructor/
```

### `dominio/` — la capa que más importa

Funciones puras: entra un objeto, sale un objeto. Nada de fetch, de `cookies()`
ni de estado de React.

Aquí viven los cálculos que SUNAT rechaza si están mal — IGV, detracción,
retención, cuotas, redondeos. Al no depender de nada, se prueban con tests
unitarios que corren en milisegundos y sin base de datos.

En la demo esto vivía dentro de un componente cliente de 974 líneas y no se
podía probar sin montar React. Es el error que este directorio existe para
no repetir.

### `api/` — lectura

Consultas de solo lectura, siempre en el servidor. Toman el cliente de
`@rodatech/db/servidor`.

- Devuelven tipos de dominio, nunca filas crudas de Supabase.
- Paginan por **keyset**, no por offset.
- Seleccionan columnas explícitas. Nada de `select("*")` sobre tablas grandes.
- Lo que casi no cambia (marcas, familias, unidades, ubigeo) va envuelto en
  `unstable_cache` con su `tag`, y las acciones lo invalidan con `revalidateTag`.

### `acciones/` — escritura

**Todas** las mutaciones pasan por aquí, con `"use server"`. Ninguna escritura
sale del navegador.

Reglas:

1. Validar la entrada con `zod` antes de tocar nada. Una Server Action es un
   endpoint público: la entrada es hostil hasta que se demuestre lo contrario.
2. Verificar el rol. RLS es la última línea, no la única.
3. **Operar por lotes.** Si la acción toca N líneas de un documento, va **una**
   llamada con `jsonb`, no N llamadas en un bucle. Este fue el problema de
   rendimiento más caro de la demo: emitir un pedido de 20 ítems eran 20 viajes
   secuenciales al servidor.
4. Terminar con `revalidatePath` o `revalidateTag`.
5. Devolver un resultado tipado `{ ok, error? }`, no lanzar excepciones que la
   interfaz no sepa mostrar.

### `ui/` — componentes

Server Components por defecto. `"use client"` solo donde de verdad hace falta
—estado local, eventos, formularios interactivos— y con un comentario que diga
por qué.

Las primitivas visuales vienen de `@rodatech/ui`. Un módulo no define sus
propios botones ni sus propias tablas.

### `index.ts` — la frontera

Reexporta solo lo que otros módulos y las rutas necesitan: normalmente la
página, y algún componente o tipo que otro módulo reutiliza.

Lo que no está en `index.ts` es privado del módulo. Si un módulo necesita
alcanzar el interior de otro, o falta un export, o la frontera entre los dos
está mal trazada.

## Qué NO va en un módulo

- Clientes de Supabase — vienen de `@rodatech/db`.
- Primitivas visuales — vienen de `@rodatech/ui`.
- Constantes del negocio (IGV, unidades, roles) — vienen de `@rodatech/config`.
- Nada de SUNAT que no sea llamar a `@rodatech/sunat`.
