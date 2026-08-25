-- ###########################################################################
-- 015 · RECONSTRUIR LA VALORIZACIÓN DESDE EL KARDEX
-- ###########################################################################
--
-- `6205-2RS1/C3` mostraba costo promedio 93.7250 con precio de venta 3.92. Un
-- costo por encima del precio es imposible y se veía a simple vista en
-- /productos.
--
-- `PENDIENTES.md` lo atribuía a la fórmula del promedio ponderado. NO ERA ESO.
-- Lo que dice la base, consultada el 24/08/2026:
--
--   kardex  -> 1 movimiento: ingreso 35 @ 3.2600, saldo 35, valorizado 114.10,
--              costo promedio 3.2600. Aritméticamente perfecto.
--   stock   -> cantidad 35 (correcta), valorizado 3374.1000, costo prom. 93.7250
--
-- O sea: la fórmula de `registrar_movimientos` está bien y el kardex está bien.
-- Lo que está mal son las DOS copias denormalizadas —`stock.valorizado` /
-- `stock.costo_promedio` y `productos.costo_promedio`— que quedaron con
-- valores que ningún movimiento vivo produce.
--
-- El rastro: 3374.10 / 36 = 93.725 exacto, y 3374.10 - 114.10 = 3260.00 =
-- 1000 x 3.26. Encaja con un ajuste de +1 unidad a un costo de 3260 sobre el
-- saldo bueno. `ajustes_inventario` está vacía y la secuencia de
-- `movimientos_inventario` arranca en 9 —los ids 1..8 se emitieron y se
-- borraron—, así que la prueba se limpió a medias: se fueron los movimientos y
-- se quedaron las denormalizaciones. Es exactamente el fallo que se esperaría
-- de borrar filas del kardex a mano.
--
-- Por eso esto NO cambia ninguna fórmula: repara el dato y deja un centinela.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Antes de tocar nada: la cantidad NO se sobrescribe
-- ---------------------------------------------------------------------------
-- El valorizado y el costo promedio son aritmética derivada: no tienen
-- significado físico propio y reconstruirlos desde el kardex no puede perder
-- información.
--
-- `cantidad` es otra cosa. Es lo que hay en el almacén, y si difiere del kardex
-- eso es un descuadre REAL que se corrige contando y pasando un ajuste —con su
-- documento, su motivo y su responsable—, no pisándolo desde una migración.
-- Así que aquí se comprueba y se avisa; no se toca.
do $$
declare v_desc int;
begin
  select count(*) into v_desc
    from stock s
    join (
      select distinct on (producto_id) producto_id, saldo_cantidad
        from movimientos_inventario
       order by producto_id, fecha desc, id desc
    ) u on u.producto_id = s.producto_id
   where s.cantidad is distinct from u.saldo_cantidad;

  if v_desc > 0 then
    raise exception
      '% producto(s) tienen cantidad distinta del último saldo del kardex. Eso es un descuadre físico: cuéntalo y pásalo por Ajuste de inventario, no por esta migración.',
      v_desc;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Reconstruir valorizado y costo promedio
-- ---------------------------------------------------------------------------
-- El kardex es la fuente de verdad: cada movimiento guarda el saldo corriente
-- que dejó, así que el último movimiento de cada producto ES el saldo bueno.
--
-- Solo se tocan los productos QUE TIENEN movimientos. Un producto dado de alta
-- por el formulario y todavía sin recibir mercadería lleva un
-- `costo_promedio` sembrado a mano desde su último costo, y no hay kardex con
-- el que contrastarlo: ponerlo a cero sería destruir el único dato que hay.
--
-- Idempotente: aplicarla dos veces no cambia nada la segunda vez.
with ultimo as (
  select distinct on (producto_id)
         producto_id, saldo_valorizado, costo_promedio
    from movimientos_inventario
   order by producto_id, fecha desc, id desc
)
update stock s
   set valorizado     = u.saldo_valorizado,
       costo_promedio = u.costo_promedio,
       actualizado_en = now()
  from ultimo u
 where u.producto_id = s.producto_id
   and (s.valorizado     is distinct from u.saldo_valorizado
     or s.costo_promedio is distinct from u.costo_promedio);

with ultimo as (
  select distinct on (producto_id)
         producto_id, costo_promedio
    from movimientos_inventario
   order by producto_id, fecha desc, id desc
)
update productos p
   set costo_promedio = u.costo_promedio,
       actualizado_en = now()
  from ultimo u
 where u.producto_id = p.id
   and p.costo_promedio is distinct from u.costo_promedio;

-- ---------------------------------------------------------------------------
-- 3. Centinela
-- ---------------------------------------------------------------------------
-- Mismo espíritu que 013: la comprobación vive en una migración para que se
-- repita en cada `pnpm db:aplicar`. Si alguien vuelve a borrar movimientos a
-- mano —o si aparece de verdad un fallo en el promedio ponderado— salta aquí,
-- al aplicar, y no meses después mirando un margen que no cuadra.
do $$
declare
  v_roto  int;
  v_caros int;
begin
  select count(*) into v_roto
    from productos p
    join stock s on s.producto_id = p.id
    join (
      select distinct on (producto_id) producto_id, saldo_valorizado, costo_promedio
        from movimientos_inventario
       order by producto_id, fecha desc, id desc
    ) u on u.producto_id = p.id
   where s.valorizado     is distinct from u.saldo_valorizado
      or s.costo_promedio is distinct from u.costo_promedio
      or p.costo_promedio is distinct from u.costo_promedio;

  if v_roto > 0 then
    raise exception '% producto(s) siguen con la valorización desalineada del kardex', v_roto;
  end if;

  -- Red de seguridad barata y con sentido de negocio: un costo por encima del
  -- precio de venta es lo que hizo visible este bug. No se convierte en un
  -- CHECK de tabla porque durante una liquidación puede ser legítimo vender
  -- por debajo del costo; como aviso al aplicar, sí vale.
  select count(*) into v_caros
    from productos
   where precio_venta > 0 and costo_promedio > precio_venta;

  if v_caros > 0 then
    raise warning '% producto(s) tienen costo promedio por ENCIMA del precio de venta. Revísalos.', v_caros;
  end if;

  raise notice '015: valorización alineada con el kardex en todos los productos con movimientos.';
end $$;
