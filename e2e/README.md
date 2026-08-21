# Pruebas de punta a punta

Playwright. Corren contra una instancia real de la aplicación y una base de
datos real — no contra mocks. Lo que se prueba aquí es que el negocio funciona,
no que un componente renderiza.

```bash
pnpm e2e                 # todo
pnpm e2e --ui            # modo interactivo
pnpm e2e ventas          # solo un flujo
```

## Base de datos

Estas pruebas **escriben**: mueven stock, consumen correlativos y emiten
documentos. Nunca deben apuntar al proyecto Supabase del cliente.

Usan un proyecto aparte, sembrado desde `supabase/migrations/` más un seed de
datos de prueba. `E2E_BASE_URL` permite apuntar a un despliegue de preview.

## Flujos a cubrir

Están ordenados por lo que rompería el negocio si fallara, no por facilidad.

### 1. Venta completa

El camino que Willy recorre todos los días:

`cotizar → aprobar → generar guía → facturar → cobrar`

Comprobaciones que importan en cada paso:

- **Cotizar** — el PDF sale con las columnas acordadas: código, marca en su
  propia columna, descripción sin el código repetido, cantidad, unidad, valor
  unitario, importe. **No debe aparecer ninguna columna de precio unitario con
  IGV**: es exactamente la confusión que le costó ventas.
- **Aprobar** — la cotización queda bloqueada para edición.
- **Guía** — el peso es obligatorio; el ubigeo autocompleta; el número de orden
  de compra del cliente se arrastra.
- **Facturar** — el correlativo continúa desde el configurado, no desde 1; el
  total, el IGV y la detracción cuadran; la factura arrastra los números de
  cotización, orden de compra y guía.
- **Cobrar** — un pago parcial deja el saldo correcto y mueve el aging.

### 2. Compra y recepción

`registrar compra → recibir mercadería → verificar stock y kardex`

- El stock **solo** se mueve al recibir, nunca al registrar la compra.
- El costo promedio ponderado se recalcula bien tras una recepción a precio
  distinto.
- Una recepción parcial deja el pendiente correcto.

### 3. Catálogo a escala

- Importar un Excel de 2.000+ filas: debe ser **una** operación por lotes, no
  una llamada por fila. La prueba mide el tiempo y falla si se degrada.
- Buscar por SKU, por código de fabricante y por descripción devuelve resultados
  y responde rápido.
- Archivar un producto lo saca del buscador de cotizaciones pero lo mantiene en
  el historial, y se puede reactivar.

### 4. Sustitutos

Con un producto sin stock, el constructor propone alternativas de la misma
familia con precios alineados.

### 5. Permisos

Por cada rol, que **no** pueda hacer lo que no le toca. En particular:

- El ajuste de inventario solo lo ve y ejecuta gerencia.
- Ventas no puede registrar compras; compras no puede registrar pagos.

Estas pruebas valen doble: verifican la interfaz **y** que RLS aguanta si
alguien llama a la API directamente.

### 6. Cuota de consultas RUC

Con la cuota agotada, el alta de cliente sigue funcionando pidiendo los datos a
mano. No se rompe, y no llama al proveedor.
