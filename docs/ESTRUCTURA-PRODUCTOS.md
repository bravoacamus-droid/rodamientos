# Estructura del maestro de productos

Análisis del archivo `ESTRUCTURA DE BASE DE PRODUCTOS.xlsx` que mandó el
cliente el 21/08/2026, y del proceso de carga que sale de él.

---

## 1. Qué es realmente el archivo

No es un listado de productos. Es el **árbol de clasificación** de Rodatech,
con siete productos de ejemplo intercalados (las filas amarillas de la foto).

| | |
|---|---|
| Familias | 3 — RODAMIENTO, CHUMACERA, ACCESORIOS |
| Subfamilias | 17 |
| Tipos | 61 |
| Productos | 7 |

Los tres niveles se leen así:

```
FAMILIA        RODAMIENTO
  SUB-FAMILIA    RIGIDO DE BOLAS
    DESCRIPCION    RODAMIENTO RIGIDO DE BOLAS 1 HIL.   <- esto es el TIPO
      6205-2RS1/C3   SKF                               <- esto es el PRODUCTO
      6209-2RS1/C3   SKF
      6308-2Z/C3     SKF
      6208LLU/2ASU1  NTN
      6310-2Z.C3     FAG
```

La columna DESCRIPCION **no es el nombre del producto**: es el tipo. Cinco
productos distintos cuelgan de la misma descripción.

---

## 2. Lo que obligó a cambiar

### 2.1 El vocabulario

El esquema hablaba de `categorías → familias → subfamilias`. El cliente habla
de `familia → sub-familia → descripción`. Las dos jerarquías tienen tres
niveles pero **la palabra "familia" significaba cosas distintas** según se
leyera el código o su Excel.

Se renombró todo al vocabulario de él:

| antes | ahora | ejemplo |
|---|---|---|
| `categorias` | `familias` | RODAMIENTO |
| `familias` | `subfamilias` | RIGIDO DE BOLAS |
| `subfamilias` | `tipos` | RODAMIENTO RIGIDO DE BOLAS 1 HIL. |

Se hizo ahora porque la base todavía tiene **cero tablas creadas**. Después
habría costado una migración de datos.

### 2.2 El árbol tentativo se retiró

`007_seed_maestros.sql` traía un árbol deducido de la reunión (9 familias:
Transmisión, Sellos, Lubricación, Movimiento lineal…). Se retiró y lo
reemplaza `008_taxonomia_rodatech.sql`, generado del archivo del cliente.
Dejar los dos habría llenado los desplegables de familias que Rodatech no usa.

> Si el cliente vende esas otras líneas y solo no las incluyó en este archivo,
> se agregan desde configuración sin tocar código.

### 2.3 Tercera columna de precio

El archivo trae **P.C. / P.V. / P.M.**, y el esquema solo tenía dos. Se agregó
`productos.precio_minimo`.

### 2.4 El precio de venta es una fórmula

En las siete filas reales, sin una sola excepción:

```
P.V. = P.C. × 1.20
```

3.26→3.92 · 10.70→12.84 · 12.63→15.16 · 6.30→7.56 · 11.86→14.23 ·
34.43→41.32 · 32.89→39.47 (el rango medido es 1.1998–1.2025, que es solo el
redondeo a dos decimales).

Por eso `margen_objetivo_pct` arranca en **20** y la plantilla trae el P.V. ya
calculado: el dueño tipea el costo y nada más.

El **P.M. en cambio no sigue ninguna fórmula** (va entre 1.09 y 1.18 sobre el
costo, irregular). Es un valor que él pone producto por producto, y así se
trata: columna manual.

---

## 3. El hallazgo importante: códigos que se repiten de nombre

Cinco productos comparten familia, subfamilia y descripción. **Lo único que los
distingue es el código** — y el código es del fabricante:

```
6205-2RS1/C3    SKF
6208LLU/2ASU1   NTN
6310-2Z.C3      FAG
```

Descomponiendo un código de rodamiento:

```
6205 - 2RS1 / C3
 │      │     └── juego interno       (C3)
 │      └──────── tipo de sellado     (2RS1 en SKF = LLU en NTN = 2RSR en FAG)
 └─────────────── LA MEDIDA           (ISO, igual en todas las marcas)
```

El núcleo ISO es lo único que las marcas comparten. Los sufijos los escribe
cada fabricante a su manera.

De ahí salen dos decisiones:

**`productos.designacion_base`** — columna generada que extrae el núcleo
(`^[A-Z]{0,4}[0-9]{2,5}` sobre el código en crudo) e indexada junto a
`marca_id`. Con eso `6205-2RS1/C3` de SKF y `6205-2RSR-C3` de FAG dan los dos
`6205` y el sistema propone equivalentes **desde el primer día, sin que nadie
capture un solo par a mano**.

**`normalizar_codigo()` ahora se come también los separadores.** Antes solo
quitaba espacios, así que `6205 2RS` daba `62052RS` y `6205-2RS` daba
`6205-2RS`: distintos, producto duplicado. Que es literalmente lo que él
describió en la reunión (27:42) — *"basta que un carácter sea diferente al otro
y ya no hace match y se rompe todo"*.

> La designación base se extrae del código **en crudo**, no del normalizado,
> justamente porque los separadores son los que marcan dónde termina la medida.

---

## 4. El proceso de carga

### 4.1 La plantilla

`apps/web/public/plantillas/Rodatech - Maestro de productos.xlsx`, generada por
`pnpm db:plantillas` a partir del propio árbol del cliente.

Mismas diez columnas que su archivo, en su orden y con sus nombres. Cuatro
diferencias, todas para que la llene el dueño y no un capturista:

1. **Una fila por producto.** Su archivo mezcla el árbol con los productos y
   usa celdas combinadas: para leerlo hay que arrastrar la familia hacia abajo.
   Perfecto para consultar, pésimo para capturar. Aquí cada fila se explica
   sola.
2. **Los tres niveles son desplegables en cascada.** Al elegir FAMILIA, la
   SUB-FAMILIA se limita a las suyas; al elegir SUB-FAMILIA, la DESCRIPCION se
   limita a las de esa subfamilia. Es imposible tipear mal un nivel — que es de
   donde salen los catálogos con cuarenta familias fantasma.
3. **El P.V. viene calculado** (`=SI(P.C.="";"";REDONDEAR(P.C.*1,2;2))`), en
   gris para que se lea que no hay que tipearlo. Se puede escribir encima.
4. **Los códigos repetidos se pintan de rojo solos**, y el P.M. por encima del
   P.V. se pinta de ámbar.

La marca **avisa pero no bloquea**: si aparece una marca nueva, se escribe y el
importador la da de alta.

### 4.2 Regenerarla

```bash
pnpm db:plantillas    # importa la estructura y regenera la plantilla
```

Si el cliente manda una versión nueva de su archivo, se reemplaza
`docs/ESTRUCTURA DE BASE DE PRODUCTOS.xlsx`, se corre eso y quedan al día la
plantilla, `docs/taxonomia.json` y la migración `008`.

Las erratas de tipeo del original (VIVRATORIAS, RODILLO S, PAREDE,
TRIAUNGULAR) se corrigen en `ERRATAS` dentro del importador, no a mano en el
Excel, para que el archivo del cliente quede intacto y el paso sea repetible.

### 4.3 Seguro contra desplegables mudos

La validación en cascada resuelve el rango con
`INDIRECT(SUBSTITUTE(SUBSTITUTE(celda;" ";"_");".";"_"))`, o sea que Excel solo
sabe convertir **espacios y puntos**. Si algún día aparece una subfamilia con
guión o paréntesis, el nombre del rango dejaría de coincidir y el desplegable
saldría vacío **sin avisar**. El generador lo comprueba y falla antes de
escribir el archivo.

---

## 5. El piso de venta (P.M.)

**Confirmado por Willy el 21/08/2026:** *"es el precio mínimo que se puede
vender para cotizar al cliente, no puede vender menos de eso porque si no no es
rentable"*. Es un **piso duro**, no una referencia.

Se hace cumplir en tres capas, y a propósito:

### 5.1 En la base — es la que de verdad manda

`cotizacion_items.precio_minimo_ref` guarda una **copia** del `precio_minimo`
del producto en el momento de cotizar, y el check `cotiz_item_respeta_piso`
compara contra ella.

Va copiado y no leído por join por dos razones: el piso cambia con el tiempo y
una cotización de hace tres meses tiene que poder auditarse contra el piso que
regía **entonces**; y un CHECK no puede mirar otra tabla, así que sin la copia
haría falta un trigger, más lento y más fácil de saltarse.

> **El snapshot lo pone la base, no quien escribe.** El trigger
> `trg_cotiz_items_piso` impone `precio_minimo_ref` desde
> `productos.precio_minimo` en cada INSERT, y en los UPDATE conserva el que ya
> tenía (salvo que cambie el producto de la línea). Lo que venga en la petición
> se ignora.
>
> Hace falta un trigger y no basta con RLS: **RLS decide a qué filas se llega,
> no qué columnas se tocan dentro de una fila que ya es tuya**. Sin él, un
> `PATCH /cotizacion_items { "precio_minimo_ref": 0, "valor_unitario": 5 }`
> desactivaba la regla entera.

### 5.2 Son DOS palancas, y se miran juntas

Willy, 21/08/2026: *"si yo le doy precio de venta me está negociando y le bajo,
y aparte le doy un descuento"*. O sea que sobre el mismo precio caen dos
rebajas:

1. El vendedor **baja el valor unitario** al negociar.
2. Encima queda el **campo de descuento**, que es opcional.

Por eso el check compara el precio **neto**, con el descuento ya aplicado, y no
el valor unitario:

```
round(valor_unitario * (1 - descuento_pct/100), 4)  >=  precio_minimo_ref
```

El caso que atrapa es este — cada palanca por separado respeta el piso, y
juntas lo rompen:

```
6209-2RS1/C3     lista 12.84     piso 11.96

  negociar a 12.20, sin descuento    ->  12.20   OK
  lista 12.84 con 5 % de descuento    ->  12.20   OK
  negociar a 12.20 Y 5 % encima       ->  11.59   POR DEBAJO DEL PISO
```

El vendedor no habría notado nada: los dos movimientos le parecían válidos
porque lo eran, por separado.

### 5.3 En la app — para avisar antes, con un mensaje que se entienda

`modules/cotizaciones/dominio/piso.ts` duplica la fórmula **exactamente** (mismo
redondeo a 4 decimales) para poder avisar mientras el vendedor escribe, en vez
de dejar que la base devuelva un error de constraint al guardar.

Como son dos palancas, la pantalla necesita responder las dos preguntas:

| el vendedor está tocando… | la función | responde |
|---|---|---|
| el **descuento** | `descuentoMaximoPct(valor, piso)` | *"máximo 6.85 % en esta línea"* |
| el **precio unitario** | `valorUnitarioMinimo(piso, descuento)` | *"con ese 5 %, no puedes bajar de 12.5895"* |

Las dos describen el mismo límite desde lados opuestos, y hay una prueba que lo
verifica: a `12.5895` el descuento máximo vuelve a dar exactamente `5 %`.

El redondeo de cada una va **del lado que protege el piso**: el descuento
máximo se trunca hacia abajo, el precio mínimo se redondea hacia arriba.
Redondear al revés daría un valor un pelo fuera de rango y la línea rebotaría
justo después de que la pantalla dijo que estaba bien. Hay pruebas que
verifican, sobre los siete productos reales y siete niveles de descuento, que
el límite devuelto siempre pasa el check y que un céntimo más allá siempre lo
rompe.

Un detalle que importa en la pantalla: **el máximo se recalcula conforme se
negocia**. A precio de lista el 6209 aguanta 6.85 % de descuento; ya negociado
a 12.20, solo aguanta 1.96 %.

Un producto **sin P.M. cargado** (`0`) deja pasar cualquier precio. Es lo
correcto mientras se está cargando el maestro, y la regla se va cerrando sola
conforme se llena la columna.

---

## 6. El importador

`/productos/cargar` — se sube el .xlsx, se ve qué va a pasar con cada fila, y
recién entonces se confirma. Lo pueden usar Compras, Gerencia y Admin.

### 6.1 Un solo camino para previsualizar y para aplicar

`importar_productos(p_filas jsonb, p_simular boolean)` corre en dos modos con
**el mismo código de resolución**. Con `p_simular = true` devuelve el plan sin
escribir; con `false` aplica ese mismo plan.

Que sea el mismo código es el punto: si la previsualización y la aplicación
fueran caminos distintos, la pantalla podría prometer algo que el guardado no
cumple.

Todo el lote viaja en **una** llamada con `jsonb`. Un viaje por fila haría que
cargar 200 productos fueran 200 idas y vueltas.

### 6.2 El stock solo entra en productos nuevos

Y entra como **movimiento de kardex** (`ingreso`, motivo "Carga inicial del
maestro"), nunca como escritura directa del saldo.

Para un producto que ya existe, el stock del Excel **se ignora y se avisa en
pantalla**. El saldo de almacén es la suma de sus movimientos; sobrescribirlo
desde una hoja de cálculo rompería la trazabilidad. Esa diferencia se corrige
por Ajuste de inventario, que deja constancia de quién y por qué.

Lo mismo con `costo_promedio`: se siembra al crear el producto y **no se toca
al actualizar**, porque a partir de la primera recepción lo manda el kardex y
pisarlo con el costo del Excel falsearía el margen de todo el histórico.

### 6.3 Lectura tolerante, porque la llena una persona

La plantilla va a llegar con espacios de más, con `$ 3.26`, con la cabecera dos
filas más abajo porque alguien insertó un título. Rechazar el archivo por eso
sería devolverle el problema al cliente.

- La **cabecera se busca** en las primeras filas y gana la que reconozca más
  columnas; se aceptan nombres alternativos y cualquier orden.
- Los **números** aceptan coma o punto decimal y separadores de miles. Con un
  solo separador (`1.234`) se lee como decimal: en este catálogo todo el dinero
  lleva dos decimales, y confundir 1.234 con 1234 sería un error de mil veces.
- Un **número ilegible NO se vuelve cero en silencio**: se omite la fila y se
  dice cuál y por qué. Un costo que se vuelve 0 sin avisar es un margen falso
  en cada cotización futura.
- Las **filas vacías** se saltan sin ruido —la plantilla trae 200 preparadas—,
  pero una fila con datos y sin código sí se reporta.

Los errores se reportan con el **número de fila de Excel**, para que se puedan
ubicar.

### 6.4 Un céntimo que no cuadra

De los 7 productos del cliente, 6 cumplen `ROUND(P.C. × 1.20, 2)` al céntimo.
El `6205-2RS1/C3` tiene P.V. 3.92 donde la fórmula da 3.91 (su P.C. es 3.26
exacto, sin decimales ocultos, y tampoco es un ROUNDUP: con esa regla el 14.232
daría 14.24 y él tiene 14.23). Es un precio puesto a mano.

Por eso las filas de ejemplo de la plantilla llevan el **valor literal** y no
la fórmula: si llevaran la fórmula, Excel recalcularía al abrir el archivo y le
cambiaría su propio precio sin avisar. Las filas vacías sí traen la fórmula.

El importador hace lo mismo: solo calcula el P.V. cuando viene en blanco, así
que un precio puesto a mano sobrevive a la carga.

---

## 7. Pendiente

- **¿Puede gerencia autorizar una venta bajo el piso?** Hoy **no**: el check es
  duro y no hay excepción para nadie, que es lo que se pidió. Si algún día hace
  falta una autorización explícita y auditada, es una columna en la cabecera
  más un cambio en el check.
- **Importadores de clientes y proveedores**, reusando `dominio/plantilla.ts`,
  que ya es genérico.
