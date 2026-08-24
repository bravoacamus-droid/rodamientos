# Pendientes

Estado al 24/08/2026. Ordenado por lo que más duele.

---

## 1 · FALSA ALARMA — los desplegables SÍ funcionan

Estuvo anotado aquí como el bug que bloqueaba todo. **No lo era.** Se comprobó
en el navegador el 24/08: los menús de tres puntos abren, los diálogos abren,
el fondo es blanco sólido y la sombra es la correcta.

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

---

## 2 · Dato corrupto — costo promedio del 6205

`6205-2RS1/C3` muestra **costo promedio $93.73** con precio de venta $3.92. Su
costo real es $3.26.

Lo dejó una prueba de ajuste de stock del 24/08. El promedio ponderado se
calculó mal dentro de `registrar_ajuste_inventario` o de
`registrar_movimientos`. Hay que:

1. Revisar la fórmula del promedio ponderado en el ajuste.
2. Corregir el dato del 6205 (y comprobar si hay más).

Se ve a simple vista en `/productos`: un costo mayor que el precio de venta es
imposible.

---

## 3 · Buscar por marca devuelve cero

Escribir `SKF` no encuentra nada. La columna generada `busqueda` de `productos`
indexa código, código de fabricante y descripción — **no la marca**, que vive
en otra tabla.

Arreglo: en `buscar_productos`, añadir la marca al `where` aprovechando el join
que ya existe. No hace falta tocar la columna generada.

---

## 4 · Los demás módulos están vacíos

De 23 pantallas hay **8 reales**. Las otras 15 son carteles de «en
construcción». Es el grueso de lo que falta.

**Reales:** tablero · cotizaciones (listado, constructor, ficha) · productos
(listado, alta/edición, importador) · clientes (listado, ficha, alta/edición)

**Carteles:** guías de remisión · facturación · cobranzas · equivalencias ·
proveedores · inventario · kardex · recepciones · ajuste de inventario ·
compras · importaciones · reportes · alertas · configuración

Orden sugerido, por lo que cierra el ciclo del dinero:

1. **Guías de remisión** — la cotización aprobada ya tiene el botón «Generar
   guía» y apunta a una ruta que no existe
2. **Facturación** — cierra el ciclo comercial
3. **Recepciones y compras** — cierran el ciclo de abastecimiento
4. **Inventario y kardex** — hoy solo se ven desde el catálogo
5. El resto

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
- **Nada verificado en móvil real.** Las comprobaciones son sobre el HTML
  servido; el comportamiento táctil no lo ha probado nadie.
- **Las nueve funciones de negocio ya validan rol** (hecho el 24/08), pero
  conviene repetir la auditoría cada vez que se añada una función que escriba.
  La migración `013` lo comprueba al aplicar.

---

## 7 · Antes de entregar

- [ ] Rotar el token de Supabase y las llaves — están en texto plano en
      `.env.local` y son de la cuenta del cliente
- [ ] Borrar la variable `RODATECH_ATAJOS` de Vercel: mientras esté, cualquiera
      con la URL entra con un clic
- [ ] Borrar los dos clientes de prueba marcados `[DEMO]`
- [ ] Decidir si los 7 productos de ejemplo se quedan (son datos reales suyos)
