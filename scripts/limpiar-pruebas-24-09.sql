-- ###########################################################################
-- LIMPIEZA DE PRUEBAS · 24/09/2026
-- ###########################################################################
--
-- Luis, 24/09: *«puedes borrar todas las cotizaciones, guía de esas
-- cotizaciones, sus facturas y también compras? quiero hacer pruebas de
-- todo»*. Y aclarando: *«las facturas que vas a borrar son de las
-- cotizaciones que tenemos, nada más»*.
--
-- Deja el ERP como estaba antes de que nadie probara nada, SIN tocar lo que
-- es de Willy.
--
-- ---------------------------------------------------------------------------
-- LO QUE NO SE TOCA, Y ES LA MITAD DEL ASUNTO
-- ---------------------------------------------------------------------------
-- En `comprobantes` no solo están nuestras pruebas. Están también las **515
-- facturas REALES** de Willy (serie `F002`, del 18/09/2024 al 26/08/2026) y
-- sus **3 notas de crédito** (`FC02`), cargadas de su Excel el 28/08
-- (docs/HISTORIAL-VENTAS.md). Un `delete from comprobantes` a secas se las
-- lleva por delante, y **no se pueden volver a pedir**: salieron de un archivo
-- que se armó una vez.
--
-- Por eso aquí se borra por SERIE y no por tabla, y por eso al final hay un
-- centinela que cuenta las 515 y las 3: si no están, la transacción entera se
-- deshace.
--
-- Tampoco se tocan: los 97 clientes, los 97 proveedores, los 793 productos,
-- el catálogo, las cuentas bancarias ni los usuarios.
--
-- ---------------------------------------------------------------------------
-- ANTES DE CORRERLO
-- ---------------------------------------------------------------------------
-- El proyecto del cliente está en plan FREE: **cero copias de seguridad**
-- (comprobado contra la API el 31/08). Así que primero:
--
--     node scripts/respaldar.mjs
--
-- Hecho el 24/09 antes de esta limpieza: 5348 filas en 43 tablas.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1 · Los comprobantes de PRUEBA, por serie
-- ---------------------------------------------------------------------------
delete from pagos
 where comprobante_id in (select id from comprobantes where serie = 'F001');

delete from comprobante_cuotas
 where comprobante_id in (select id from comprobantes where serie = 'F001');

delete from comprobante_items
 where comprobante_id in (select id from comprobantes where serie = 'F001');

delete from comprobante_guias
 where comprobante_id in (select id from comprobantes where serie = 'F001');

delete from comprobantes where serie = 'F001';

-- ---------------------------------------------------------------------------
-- 2 · Guías y cotizaciones
-- ---------------------------------------------------------------------------
-- Aquí sí se borra la tabla entera: las 2 guías y las 7 cotizaciones son
-- todas nuestras. El histórico de Willy no trajo ni guías ni cotizaciones —
-- solo facturas y notas—, así que no hay nada suyo que salvar.
delete from guia_items;
delete from guias_remision;

delete from cotizacion_items;
delete from cotizaciones;

-- ---------------------------------------------------------------------------
-- 3 · Compras, recepciones y rondas de precios
-- ---------------------------------------------------------------------------
-- Las recepciones van ANTES que las compras: cuelgan de ellas.
delete from recepcion_adjuntos;
delete from recepcion_items;
delete from recepciones;

delete from gastos_importacion;
delete from compra_items;
delete from compras;

delete from consulta_precio_respuestas;
delete from consulta_precio_asignaciones;
delete from consulta_precio_items;
delete from consulta_precio_proveedores;
delete from consultas_precio;

-- ---------------------------------------------------------------------------
-- 4 · El kardex, y el stock que NO se deshace solo
-- ---------------------------------------------------------------------------
-- `stock` es un saldo materializado que mantiene `registrar_movimientos()`
-- (004): borrar el movimiento **no** lo devuelve a su sitio. Es exactamente el
-- aviso de PENDIENTES §7 —«borrarla a mano dejaría el stock mintiendo»— y por
-- eso se pone a cero a mano.
--
-- Cero es el valor correcto, no un apaño: el stock se cargó vacío A PROPÓSITO
-- el 28/08 (§9.3), porque el Excel de ventas no dice qué hay en el almacén.
-- Entra con el cuadre físico inicial, que sigue pendiente de Willy.
delete from movimientos_inventario;

update stock
   set cantidad = 0, reservado = 0, valorizado = 0, costo_promedio = 0,
       actualizado_en = now();

-- Las alertas se recalculan solas y varias apuntan a documentos que ya no
-- existen.
delete from alertas;

-- ---------------------------------------------------------------------------
-- 5 · Los correlativos, a cero
-- ---------------------------------------------------------------------------
-- Para que las pruebas empiecen por el 1 y no por el 3. `F002` y `FC02` NO
-- aparecen aquí: son las series reales y su correlativo es el de Willy.
update series_documento
   set correlativo_actual = 0
 where serie in ('F001', 'T001', 'COT1', 'CMP', 'REC', 'AJU');

-- ###########################################################################
-- CENTINELA · QUE EL HISTÓRICO DE WILLY SIGA AHÍ
-- ###########################################################################
-- Si algo de arriba se llevó una fila de más, esto revienta y la transacción
-- entera se deshace. Es la única red que hay: no existe copia en el servidor.
do $$
declare v_f int; v_fc int; v_items int; v_cli int; v_prod int;
begin
  select count(*) into v_f  from comprobantes where serie = 'F002';
  select count(*) into v_fc from comprobantes where serie = 'FC02';
  select count(*) into v_items from comprobante_items ci
    join comprobantes c on c.id = ci.comprobante_id where c.serie = 'F002';
  select count(*) into v_cli  from clientes;
  select count(*) into v_prod from productos;

  if v_f <> 515 then
    raise exception 'Faltan facturas reales: quedan % de 515. NO SE GUARDA NADA.', v_f;
  end if;
  if v_fc <> 3 then
    raise exception 'Faltan notas de crédito reales: quedan % de 3. NO SE GUARDA NADA.', v_fc;
  end if;
  if v_items < 1000 then
    raise exception 'El detalle del histórico se encogió: % líneas. NO SE GUARDA NADA.', v_items;
  end if;
  if v_cli < 90 or v_prod < 700 then
    raise exception 'Se tocaron clientes (%) o productos (%). NO SE GUARDA NADA.', v_cli, v_prod;
  end if;

  raise notice 'Histórico intacto: % facturas, % notas, % líneas, % clientes, % productos.',
    v_f, v_fc, v_items, v_cli, v_prod;
end $$;
