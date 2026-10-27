-- ###########################################################################
-- LIMPIEZA DE PRUEBAS PARA LA ENTREGA · 27/10/2026
-- ###########################################################################
--
-- ⚠️  YA SE APLICÓ, POR ACCIDENTE, EL 27/10 A LAS 16:30:21 (hora de Lima).
--     Al probar en seco las OPCIONES de abajo sobre una copia del fichero,
--     el regex que las descomentaba comentó también el `raise` final, y la
--     transacción se guardó: la limpieza entera Y las opciones A a F, que
--     eran decisión de Luis. Sin copia nueva antes (la última es la del
--     23/10, que sí contiene todo lo borrado).
--     Hay un guion de restauración de las opciones A-F, sacado de esa copia y
--     probado en seco (no se ha ejecutado): está fuera de git, en
--     `documentosrodamiento/respaldos/restaurar-opciones-27-10.sql`.
--     Volver a correr ESTE fichero ya no hace nada: sus cuentas no cuadran
--     (no quedan 6 cotizaciones COT1) y se para sin tocar la base.
--
-- NO es una migración: no va en la secuencia ni se aplica con
-- `aplicar-migraciones.mjs` (ese script la trataría como la 164 y, sin
-- argumento, reaplica todas). Es un SQL de una vez, que corre Luis el día de
-- la entrega (28/10), DESPUÉS de sacar la copia.
--
-- Mañana se le entrega el sistema a Willy, y la base es la SUYA: en ella están
-- sus 561 facturas F002, sus 1261 cotizaciones CT02, sus 7800 productos… y,
-- mezclado con eso, todo lo que probamos desde el 24/09 (la última limpieza).
-- Este guion se lleva lo nuestro y nada suyo.
--
-- ---------------------------------------------------------------------------
-- ¿Se corrió el del 24/09? SÍ
-- ---------------------------------------------------------------------------
-- Comprobado contra la base el 27/10: no queda ninguna cotización COT1 ni
-- compra anterior al 24/09, el kardex empieza el 25/09 y no hay rondas antes
-- de la CPR-26-00015. Lo que hay hoy es de después.
--
-- El del 16/09, en cambio, NO: «ZZ FAMILIA PRUEBA» y «ZZ SUBFAMILIA PRUEBA»
-- siguen activas y los dos kits ZZ sin archivar. Van aquí (bloque 9).
--
-- ---------------------------------------------------------------------------
-- LO QUE NO SE TOCA, Y ES LA MITAD DEL ASUNTO
-- ---------------------------------------------------------------------------
-- · `F002` (561 facturas, 1373 líneas, del 18/09/2024 al 05/10/2026) y `FC02`
--   (4 notas): el histórico de Willy, de sus Excel. No se pueden volver a
--   pedir.
-- · `CT02` (1261 cotizaciones, 4062 líneas), del sistema anterior, y los dos
--   pedidos que salen de ellas (PED-26-00013 y 00014: ver pregunta 1).
-- · Clientes (113), proveedores (97), productos (7800 menos los dos kits ZZ),
--   marcas (60), familias y subfamilias de verdad, cuentas bancarias,
--   usuarios, roles, permisos, `tipos_cambio_sunat` (783), `respaldos`,
--   `config_sunat`, `empresa`, agencias, conductor, vehículo, zonas, rubros.
-- · Los correlativos de `F002` (561), `FC02` (4) y `CT02` (1261).
-- · La bitácora (`actividad`) y `fallos`: ver preguntas 5 y 6.
--
-- Se borra por LISTA de números, no por tabla ni por fecha. Si mañana alguien
-- crea una cotización COT1, una compra o una factura F001 antes de correr
-- esto, el guion NO la borra a ciegas: se para y lo dice (las cuentas de lo
-- que se borra tienen que salir exactas, y no puede quedar nada en una serie
-- de prueba que se vaya a poner a cero).
--
-- ---------------------------------------------------------------------------
-- LO QUE SE BORRA (inventario del 27/10 y prueba en seco del mismo día)
-- ---------------------------------------------------------------------------
-- Todo lo creado probando, con la cuenta de gerencia, entre el 25/09 y el
-- 17/10. Cada número está en las listas de abajo.
--
--   Tabla                          Filas  Qué
--   ------------------------------ -----  ---------------------------------
--   comprobantes                       1  F001-00000001, REACTIVOS NACIONALES,
--                                         USD 457.83 (nunca fue a SUNAT)
--     comprobante_items                2
--     comprobante_cuotas               1
--     comprobante_guias                1
--   pagos                              0  (la tabla está vacía)
--   guias_remision                     1  T001-00000002 (emitida, de COT1-000014)
--     guia_items                       2
--   movimientos_inventario             9  6 recepciones + 1 guía (2 líneas);
--                                         son TODOS los del kardex
--   stock (a cero, no se borra)        8  KR52PPA 20, UCF208D1 10, H414249/10 20,
--                                         B-42 50, UCF209D1 10, 20X47X7TC 1,
--                                         NUTR20 −1, 729865B −3
--   recepciones                        7  REC-26-00001 … 00007
--     recepcion_items                  7
--   gastos_importacion                15  de CMP-26-00003, 00004, 00006 …
--   compras                           17  CMP-26-00001 … 00017 (entre ellas
--                                         CMP-26-00014 con «F001-PRUEBA1»)
--     compra_items                    23
--     compra_adjuntos                  1  (el ARCHIVO no: ver «Después»)
--   consultas_precio                   5  CPR-26-00015 … 00019
--     items / proveedores / respuestas / asignaciones   8 / 16 / 17 / 25
--   analisis_importacion               1  ANA-26-00001 (3 líneas)
--   pedidos                            5  PED-26-00001, 00002, 00005, 00011, 00012
--     pedido_items                     2
--   cotizaciones                       6  COT1-000012 … 000017
--     cotizacion_items                10
--     cotizacion_item_proveedores      8  (el análisis de compra)
--   proveedor_productos               67  las 67: todas salen de rondas
--                                         (CPR-26-00004 … 00019) o compras de
--                                         prueba; entre ellas MARCO PERUANA ·
--                                         50X68X8TC a $ 1.40
--   alertas                           44  las de documentos que ya no existen
--                                         (también las de la limpieza del 24/09)
--                                         y las de saldo negativo de esos productos
--   bloqueos_edicion                   1  el de la COT1-000013
--   cliente_contactos                  3  «Prueba nomnbre» (ACEROS CHILCA),
--                                         «moises prueba» (ACRICORP),
--                                         «prueba contaxto» (GRUPO KLAUS)
--   subfamilias / familias          1 / 1  ZZ SUBFAMILIA PRUEBA / ZZ FAMILIA PRUEBA
--   productos                          2  ZZ-KIT-PRUEBA y ZZ-KIT-PRUEBA1
--     kit_componentes                  4
--   cambios_precio                     0  (vacía: no hay nada que limpiar)
--
-- Y los correlativos de prueba vuelven a 0: F001 (iba por 1), T001 (2) y
-- COT1 (17). Las demás series de prueba (FC01, FD01, B001, BC01, BD01) ya
-- están en 0. COT1 no lleva `es_prueba` en la base, pero es la serie con la
-- que se probó: sus seis cotizaciones se borran y vuelve a empezar en 1.
--
-- Los pedidos no tienen serie: la 157 los numera con el mayor que existe + 1.
-- Quedando PED-26-00013 y 00014, el siguiente es PED-26-00015 (o el 00001 si
-- se aplica la opción B).
--
-- ---------------------------------------------------------------------------
-- EL STOCK: por qué a cero y no «recalculado»
-- ---------------------------------------------------------------------------
-- `stock` es un saldo que escribe `registrar_movimientos()`; borrar el
-- movimiento no lo devuelve a su sitio. Hay dos maneras de deshacerlo y se
-- eligió la que se puede comprobar:
--
--   1. Antes de borrar, se exige que el saldo de cada producto tocado sea
--      EXACTAMENTE el que dejó su último movimiento de prueba. Si no cuadra
--      (alguien movió ese producto por otro lado), se para.
--   2. Después de borrar, se exige que a esos productos no les quede ningún
--      movimiento. Entonces cero es su saldo verdadero —el stock se cargó
--      vacío a propósito (§9.3) y el de Willy entra con el cuadre inicial—, y
--      se pone a cero.
--
-- Recalcular «saldo = suma de lo que queda» daría lo mismo hoy, pero
-- escondería el caso raro en vez de pararlo.
--
-- ---------------------------------------------------------------------------
-- CENTINELAS (al final, dentro de la misma transacción)
-- ---------------------------------------------------------------------------
-- 1. Antes de borrar se toma una foto de lo real (F002, FC02 y CT02 con sus
--    líneas y sus totales, los pedidos de CT02, clientes, contactos que no son
--    de prueba, proveedores, productos, marcas, catálogo, cuentas, usuarios,
--    roles, permisos, tipos de cambio, respaldos, configuración, transporte,
--    zonas, rubros y los correlativos de las series reales). Al final se
--    vuelve a tomar: si UNA cifra cambió, revienta y no se guarda nada.
-- 2. La foto de antes tiene que llegar, como mínimo, a lo contado en el
--    inventario (561 F002, 1373 líneas, 4 FC02, 1261 CT02, 4062 líneas, 113
--    clientes, 97 proveedores, 7798 productos, 783 tipos de cambio). Si hay
--    menos, la base no es la que se inventarió: se para.
-- 3. Lo que se borra tiene que salir con las cuentas exactas de arriba
--    (documentos, no alertas). Si no, se para.
-- 4. Al final, ni un documento en F001/T001/COT1 ni en las series `es_prueba`
--    —que se acaban de poner a cero—, kardex sin movimientos de prueba y
--    ningún stock distinto de cero en los productos tocados.
--
-- ---------------------------------------------------------------------------
-- ANTES DE CORRERLO
-- ---------------------------------------------------------------------------
-- El proyecto está en plan FREE: no hay copias en el servidor. Primero:
--
--     node scripts/respaldar.mjs
--
-- y comprobar que termina en «ok» (la última es del 23/10: 71 tablas, 28 467
-- filas, 1 archivo). Sin esa copia, NO se corre.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE CORRE
-- ---------------------------------------------------------------------------
-- Opción 1, la más simple: el SQL Editor de Supabase. Pegar el fichero
-- ENTERO y «Run». Los avisos (`raise notice`) salen abajo, con el resumen de
-- lo borrado.
--
-- Opción 2, desde la terminal, con la Management API y las credenciales de
-- `.env.local` (no las imprime; contesta «201 []» si fue bien o «400 …» con
-- el motivo si un centinela lo paró):
--
--     node -e "process.argv.push('', require('fs').readFileSync('scripts/limpiar-pruebas-27-10.sql','utf8')); import('./scripts/consultar.mjs')"
--
--   Por esta vía los avisos no se ven; el resumen se comprueba después con
--   las consultas del final.
--
-- PRUEBA EN SECO: lo mismo, pero con `set limpieza.seco = si;` delante. El
-- bloque hace todo, y al final, en vez de guardar, revienta con
-- «__LIMPIEZA_SECO__» y las cuentas de lo que habría borrado. No queda nada.
--
--     node -e "process.argv.push('', 'set limpieza.seco = si; ' + require('fs').readFileSync('scripts/limpiar-pruebas-27-10.sql','utf8')); import('./scripts/consultar.mjs')"
--
-- Hecha el 27/10 contra la base del cliente: ver «PRUEBA EN SECO» al final de
-- esta cabecera.
--
-- ---------------------------------------------------------------------------
-- PREGUNTAS PARA LUIS (nada de esto se borra si no se descomenta)
-- ---------------------------------------------------------------------------
-- 1. PED-26-00013 y PED-26-00014. Salen de CT02-001259 (MOLINO EL TRIUNFO,
--    USD 119.94) y CT02-001258 (EXANDAL, USD 1086.54), cotizaciones REALES del
--    sistema anterior. Alguien las aprobó en el ERP con la cuenta de gerencia
--    —el sábado 17/10 a las 06:14 y el martes 20/10 a las 21:03—, la 001259
--    con cantidades parciales (5 de 8 y 6 de 8). No tienen guía, compra ni
--    factura. Willy factura en su sistema viejo desde el 05/10, así que lo
--    más probable es que fuera una prueba; pero también pudo ser él. Si fue
--    prueba: opción B (borra los dos pedidos y devuelve las dos cotizaciones
--    a «enviada», sin aprobaciones).
-- 2. Reiniciar CMP, REC, CPR y ANA. Todas las compras (17), recepciones (7),
--    rondas (5) y el análisis (1) que hay son de prueba y se borran; ¿la
--    primera compra de Willy es la CMP-26-00001 o la 00018? Opción A. No son
--    series fiscales, así que cualquiera vale; con A no queda hueco.
-- 3. Los costos de prueba que quedaron en PRODUCTOS reales. Las compras y la
--    guía de prueba (las de hoy y las que borró el 24/09) dejaron
--    `ultimo_costo` y `costo_promedio` en ~20 productos (KR52PPA a 42, GE-112
--    a 284, 6309 a 14, 1210SC3 a 15…), y el guion del 25/09 puso costo,
--    precio mínimo y precio de mercado INVENTADOS a diez (marcados
--    `prueba_25_09`). El precio mínimo es un piso duro: frena la venta. Y el
--    MB-26 (costo 7, mínimo 9) y el 20X47X7TC (mínimo 1.00) también son de
--    prueba. Opción C. No se puede saber cuáles costos trajo el Excel de
--    Willy y cuáles salieron de una prueba salvo en los dos que el guion del
--    25/09 apuntó (6207-2Z/C3 a 6.01 y 6204-2RSH a 2.88), así que C solo
--    toca lo que se puede demostrar que es nuestro.
-- 4. El 22208 (RODAMIENTO DE RODILLOS A ROTULA, marca SKF elegida por mí el
--    16/09, sin precio). El producto es real; la marca, no. ¿Se queda,
--    se corrige o se archiva? Opción D lo archiva.
-- 5. La bitácora. Tiene ~1200 filas de nuestras pruebas, y este guion añade
--    las suyas («Se borró», por «sistema»). Por defecto se QUEDA: es el
--    rastro de que se limpió. Opción E borra las filas de los documentos que
--    ya no existen, si se prefiere que Willy empiece con la bitácora limpia.
-- 6. `fallos` (73 errores, todos de cuando lo construíamos) y su aviso
--    «fallos sin revisar». Opción F los da por revisados (no los borra).
-- 7. El archivo de la compra CMP-26-00016 (un PDF de 210 KB en el bucket
--    `documentos-proveedor`). Su fila se va con la compra, pero Supabase no
--    deja borrar el archivo por SQL: hay que quitarlo a mano en Storage →
--    documentos-proveedor → compras/7c1670c8-1417-43af-ae92-1578a78704dc/.
--
-- ---------------------------------------------------------------------------
-- PRUEBA EN SECO · 27/10/2026, contra la base del cliente
-- ---------------------------------------------------------------------------
-- Con `set limpieza.seco = si;` y el fichero entero: PASARON todos los
-- centinelas y terminó en «__LIMPIEZA_SECO__». Lo que habría borrado:
--
--   pagos 0 · comprobante_items 2 · comprobante_cuotas 1 · comprobante_guias 1
--   · comprobantes 1 · movimientos_inventario 9 · stock a cero 8 · guia_items 2
--   · guias_remision 1 · recepcion_items 7 · recepciones 7 · gastos_importacion
--   15 · compra_items 23 · compra_adjuntos 1 · proveedor_productos 67 · compras
--   17 · consulta_precio_items 8 · consulta_precio_proveedores 16 ·
--   consulta_precio_respuestas 17 · consulta_precio_asignaciones 25 ·
--   consultas_precio 5 · analisis_importacion_items 3 · analisis_importacion 1
--   · pedido_items 2 · pedidos 5 · cotizacion_item_proveedores 8 ·
--   cotizacion_items 10 · cotizaciones 6 · alertas 44 · bloqueos_edicion 1 ·
--   cliente_contactos 3 · subfamilias 1 · familias 1 · kit_componentes 4 ·
--   productos 2 · series a cero 3 (F001, T001, COT1)
--
-- Comprobado después con un select: compras 17, cotizaciones 1267,
-- comprobantes 566, kárdex 9, stock distinto de cero 8, proveedor_productos 67,
-- alertas 193, F001:1 T001:2 COT1:17, sin la vista temporal y con el
-- disparador de gastos encendido. No quedó nada.
-- ###########################################################################

begin;

do $limpieza$
declare
  v_seco    boolean := coalesce(current_setting('limpieza.seco', true), '') = 'si';
  v_resumen text := '';
  v_antes   jsonb;
  v_despues jsonb;
  v_dif     text;
  n         int;

  -- Las listas. Son las del inventario del 27/10; nada fuera de ellas se borra.
  c_cotizaciones text[] := array['COT1-000012','COT1-000013','COT1-000014',
                                 'COT1-000015','COT1-000016','COT1-000017'];
  c_comprobantes text[] := array['F001-00000001'];
  c_guias        text[] := array['T001-00000002'];
  c_compras      text[] := array['CMP-26-00001','CMP-26-00002','CMP-26-00003',
                                 'CMP-26-00004','CMP-26-00005','CMP-26-00006',
                                 'CMP-26-00007','CMP-26-00008','CMP-26-00009',
                                 'CMP-26-00010','CMP-26-00011','CMP-26-00012',
                                 'CMP-26-00013','CMP-26-00014','CMP-26-00015',
                                 'CMP-26-00016','CMP-26-00017'];
  c_consultas    text[] := array['CPR-26-00015','CPR-26-00016','CPR-26-00017',
                                 'CPR-26-00018','CPR-26-00019'];
  c_analisis     text[] := array['ANA-26-00001'];
  c_kits         text[] := array['ZZ-KIT-PRUEBA','ZZ-KIT-PRUEBA1'];
  c_contactos    uuid[] := array['214fb120-9912-4ee1-8ca9-45a3b850b78e',  -- Prueba nomnbre
                                 '011f90d5-d928-47a0-87dd-f0b7b2b0cf2b',  -- moises prueba
                                 '9d5afa85-c099-4cad-b167-69d0ed262a27']::uuid[]; -- prueba contaxto
  -- Las series cuyo correlativo vuelve a 0.
  c_series_cero  text[] := array['F001','T001','COT1'];
begin
  -- -------------------------------------------------------------------------
  -- 0 · La foto de lo real, antes de tocar nada
  -- -------------------------------------------------------------------------
  -- Una vista temporal para tomar la MISMA foto al principio y al final.
  create temp view _lo_real as
  select jsonb_build_object(
    'f002',            (select count(*) from comprobantes where serie = 'F002'),
    'f002_lineas',     (select count(*) from comprobante_items ci join comprobantes c on c.id = ci.comprobante_id where c.serie = 'F002'),
    'f002_total',      (select coalesce(sum(total), 0) from comprobantes where serie = 'F002'),
    'f002_saldo',      (select coalesce(sum(saldo), 0) from comprobantes where serie = 'F002'),
    'fc02',            (select count(*) from comprobantes where serie = 'FC02'),
    'fc02_lineas',     (select count(*) from comprobante_items ci join comprobantes c on c.id = ci.comprobante_id where c.serie = 'FC02'),
    'ct02',            (select count(*) from cotizaciones where serie = 'CT02'),
    'ct02_lineas',     (select count(*) from cotizacion_items ci join cotizaciones c on c.id = ci.cotizacion_id where c.serie = 'CT02'),
    'ct02_total',      (select coalesce(sum(total), 0) from cotizaciones where serie = 'CT02'),
    'ct02_estados',    (select string_agg(e.estado::text || ':' || e.cuantas, ',' order by e.estado::text) from (select estado, count(*) as cuantas from cotizaciones where serie = 'CT02' group by estado) e),
    'pedidos_ct02',    (select count(*) from pedidos p join cotizaciones c on c.id = p.cotizacion_id where c.serie = 'CT02'),
    'clientes',        (select count(*) from clientes),
    'contactos',       (select count(*) from cliente_contactos where id <> all (array['214fb120-9912-4ee1-8ca9-45a3b850b78e','011f90d5-d928-47a0-87dd-f0b7b2b0cf2b','9d5afa85-c099-4cad-b167-69d0ed262a27']::uuid[])),
    'proveedores',     (select count(*) from proveedores),
    'proveedor_marcas',(select count(*) from proveedor_marcas),
    'productos',       (select count(*) from productos where codigo <> all (array['ZZ-KIT-PRUEBA','ZZ-KIT-PRUEBA1'])),
    'precios',         (select coalesce(sum(precio_venta), 0) from productos where codigo <> all (array['ZZ-KIT-PRUEBA','ZZ-KIT-PRUEBA1'])),
    'marcas',          (select count(*) from marcas),
    'familias',        (select count(*) from familias where nombre <> 'ZZ FAMILIA PRUEBA'),
    'subfamilias',     (select count(*) from subfamilias where nombre <> 'ZZ SUBFAMILIA PRUEBA'),
    'tipos',           (select count(*) from tipos),
    'cuentas',         (select count(*) from cuentas_bancarias),
    'perfiles',        (select count(*) from perfiles),
    'roles',           (select count(*) from roles),
    'permisos',        (select count(*) from permisos),
    'tipos_cambio',    (select count(*) from tipos_cambio_sunat),
    'respaldos',       (select count(*) from respaldos),
    'config_sunat',    (select count(*) from config_sunat),
    'empresa',         (select count(*) from empresa),
    'condiciones',     (select count(*) from condiciones_cotizacion),
    'transporte',      (select (select count(*) from agencias_transporte) + (select count(*) from conductores) + (select count(*) from vehiculos)),
    'zonas_rubros',    (select (select count(*) from zonas) + (select count(*) from rubros)),
    'series_reales',   (select string_agg(serie || ':' || correlativo_actual, ',' order by serie)
                          from series_documento
                         where not es_prueba and serie <> all (array['F001','T001','COT1']))
  ) as v;

  select v into v_antes from _lo_real;

  -- Lo mínimo que contó el inventario. Menos que esto es otra base.
  if (v_antes->>'f002')::int < 561 or (v_antes->>'f002_lineas')::int < 1373
     or (v_antes->>'fc02')::int < 4 or (v_antes->>'ct02')::int < 1261
     or (v_antes->>'ct02_lineas')::int < 4062 or (v_antes->>'clientes')::int < 113
     or (v_antes->>'proveedores')::int < 97 or (v_antes->>'productos')::int < 7798
     or (v_antes->>'tipos_cambio')::int < 783 then
    raise exception 'Esta base tiene MENOS datos reales que en el inventario del 27/10: %. NO SE TOCA NADA.', v_antes;
  end if;

  -- -------------------------------------------------------------------------
  -- 1 · Qué se borra: las listas, comprobadas
  -- -------------------------------------------------------------------------
  create temp table _cot on commit drop as
    select id from cotizaciones where numero = any (c_cotizaciones) and serie = 'COT1';
  create temp table _comp on commit drop as
    select id from comprobantes where numero = any (c_comprobantes) and serie = 'F001';
  create temp table _guia on commit drop as
    select id from guias_remision where numero = any (c_guias) and serie = 'T001';
  create temp table _ped on commit drop as
    select id from pedidos where cotizacion_id in (select id from _cot);
  create temp table _compra on commit drop as
    select id from compras where numero = any (c_compras);
  create temp table _rec on commit drop as
    select id from recepciones where compra_id in (select id from _compra);
  create temp table _cpr on commit drop as
    select id from consultas_precio where numero = any (c_consultas);
  create temp table _ana on commit drop as
    select id from analisis_importacion where numero = any (c_analisis);
  create temp table _mov on commit drop as
    select id, producto_id from movimientos_inventario
     where referencia_id in (select id from _rec union all select id from _guia union all select id from _comp);
  create temp table _prod on commit drop as
    select distinct producto_id from _mov;

  -- Las cuentas exactas del inventario. Si no salen, la base cambió desde el
  -- 27/10 y hay que volver a mirar antes de borrar nada.
  if (select count(*) from _cot)    <> 6  then raise exception 'Cotizaciones de prueba: % y no 6. Revisar.', (select count(*) from _cot); end if;
  if (select count(*) from _comp)   <> 1  then raise exception 'Comprobantes de prueba: % y no 1. Revisar.', (select count(*) from _comp); end if;
  if (select count(*) from _guia)   <> 1  then raise exception 'Guías de prueba: % y no 1. Revisar.', (select count(*) from _guia); end if;
  if (select count(*) from _ped)    <> 5  then raise exception 'Pedidos de prueba: % y no 5. Revisar.', (select count(*) from _ped); end if;
  if (select count(*) from _compra) <> 17 then raise exception 'Compras de prueba: % y no 17. Revisar.', (select count(*) from _compra); end if;
  if (select count(*) from _rec)    <> 7  then raise exception 'Recepciones de prueba: % y no 7. Revisar.', (select count(*) from _rec); end if;
  if (select count(*) from _cpr)    <> 5  then raise exception 'Rondas de precios de prueba: % y no 5. Revisar.', (select count(*) from _cpr); end if;
  if (select count(*) from _ana)    <> 1  then raise exception 'Análisis de importación de prueba: % y no 1. Revisar.', (select count(*) from _ana); end if;
  if (select count(*) from _mov)    <> 9  then raise exception 'Movimientos de prueba: % y no 9. Revisar.', (select count(*) from _mov); end if;

  -- Nada de fuera puede colgar de lo que se borra: una factura, guía o compra
  -- que no está en la lista y apunta a una cotización de prueba sería un
  -- documento que nadie inventarió.
  if exists (select 1 from comprobantes where id not in (select id from _comp)
              and (cotizacion_id in (select id from _cot) or guia_id in (select id from _guia)
                   or pedido_id in (select id from _ped) or referencia_id in (select id from _comp)))
     or exists (select 1 from comprobante_guias where guia_id in (select id from _guia)
                 and comprobante_id not in (select id from _comp))
     or exists (select 1 from guias_remision where id not in (select id from _guia)
                 and (cotizacion_id in (select id from _cot) or pedido_id in (select id from _ped)))
     or exists (select 1 from compras where id not in (select id from _compra)
                 and (cotizacion_id in (select id from _cot) or pedido_id in (select id from _ped)
                      or consulta_precio_id in (select id from _cpr)))
     or exists (select 1 from recepciones where compra_id in (select id from _compra)
                 and id not in (select id from _rec)) then
    raise exception 'Hay un documento fuera de las listas que cuelga de una prueba. Revisar antes de borrar.';
  end if;

  -- Y en las series que se ponen a cero no puede quedar nada más: el próximo
  -- número repetiría uno que existe.
  if exists (select 1 from comprobantes
              where (serie = any (c_series_cero) or serie in (select serie from series_documento where es_prueba))
                and id not in (select id from _comp))
     or exists (select 1 from guias_remision
              where (serie = any (c_series_cero) or serie in (select serie from series_documento where es_prueba))
                and id not in (select id from _guia))
     or exists (select 1 from cotizaciones
              where (serie = any (c_series_cero) or serie in (select serie from series_documento where es_prueba))
                and id not in (select id from _cot)) then
    raise exception 'Hay documentos nuevos en F001/T001/COT1 o en una serie de prueba que no están en las listas. Añádelos o sácalos antes.';
  end if;

  -- El stock de cada producto tocado tiene que ser EXACTAMENTE el saldo de su
  -- último movimiento de prueba. Si no, otro movimiento lo tocó y poner cero
  -- se llevaría algo real.
  if exists (
    select 1
      from _prod p
      left join stock s on s.producto_id = p.producto_id
      join lateral (select m.saldo_cantidad from movimientos_inventario m
                     where m.producto_id = p.producto_id
                     order by m.fecha desc, m.id desc limit 1) u on true
     where coalesce(s.cantidad, 0) <> u.saldo_cantidad
        or exists (select 1 from movimientos_inventario m
                    where m.producto_id = p.producto_id and m.id not in (select id from _mov))
  ) then
    raise exception 'El stock de algún producto de prueba no sale solo de las pruebas (hay otros movimientos). Revisar el kárdex.';
  end if;

  -- -------------------------------------------------------------------------
  -- 2 · Los comprobantes de prueba (F001) y lo que cuelga de ellos
  -- -------------------------------------------------------------------------
  -- Las líneas, cuotas, guías unidas, retenciones, gestiones y pagos se van
  -- con el comprobante (on delete cascade); se cuentan antes para el resumen.
  select count(*) into n from pagos where comprobante_id in (select id from _comp);
  v_resumen := v_resumen || format('pagos %s · ', n);
  select count(*) into n from comprobante_items where comprobante_id in (select id from _comp);
  v_resumen := v_resumen || format('comprobante_items %s · ', n);
  select count(*) into n from comprobante_cuotas where comprobante_id in (select id from _comp);
  v_resumen := v_resumen || format('comprobante_cuotas %s · ', n);
  select count(*) into n from comprobante_guias where comprobante_id in (select id from _comp);
  v_resumen := v_resumen || format('comprobante_guias %s · ', n);

  delete from comprobantes where id in (select id from _comp);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('comprobantes %s · ', n);

  -- -------------------------------------------------------------------------
  -- 3 · El kardex y el stock
  -- -------------------------------------------------------------------------
  delete from movimientos_inventario where id in (select id from _mov);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('movimientos_inventario %s · ', n);

  if exists (select 1 from movimientos_inventario where producto_id in (select producto_id from _prod)) then
    raise exception 'A un producto de prueba le quedan movimientos: su stock no es cero. Revisar.';
  end if;

  update stock
     set cantidad = 0, reservado = 0, valorizado = 0, costo_promedio = 0, actualizado_en = now()
   where producto_id in (select producto_id from _prod)
     and (cantidad <> 0 or reservado <> 0 or valorizado <> 0 or costo_promedio <> 0);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('stock a cero %s · ', n);

  -- -------------------------------------------------------------------------
  -- 4 · La guía (después del comprobante, que la sujeta con on delete restrict)
  -- -------------------------------------------------------------------------
  select count(*) into n from guia_items where guia_id in (select id from _guia);
  v_resumen := v_resumen || format('guia_items %s · ', n);
  delete from guias_remision where id in (select id from _guia);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('guias_remision %s · ', n);

  -- -------------------------------------------------------------------------
  -- 5 · Recepciones, compras, rondas y análisis
  -- -------------------------------------------------------------------------
  -- Las recepciones van ANTES que las compras: las sujetan con restrict.
  select count(*) into n from recepcion_items where recepcion_id in (select id from _rec);
  v_resumen := v_resumen || format('recepcion_items %s · ', n);
  delete from recepciones where id in (select id from _rec);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('recepciones %s · ', n);

  -- `gastos_importacion` tiene un candado (`sincronizar_gastos_importacion`)
  -- que no deja tocar los gastos de una compra ya recibida, ni siquiera para
  -- borrarlos con ella: el borrado en cascada revienta. Se apaga SOLO ese
  -- disparador, SOLO para este borrado, y dentro de la transacción: si algo
  -- falla, vuelve a estar encendido.
  alter table gastos_importacion disable trigger trg_gastos_importacion;
  delete from gastos_importacion where compra_id in (select id from _compra);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('gastos_importacion %s · ', n);
  alter table gastos_importacion enable trigger trg_gastos_importacion;

  select count(*) into n from compra_items where compra_id in (select id from _compra);
  v_resumen := v_resumen || format('compra_items %s · ', n);
  select count(*) into n from compra_adjuntos where compra_id in (select id from _compra);
  v_resumen := v_resumen || format('compra_adjuntos %s · ', n);

  -- `proveedor_productos` se llena sola con cada respuesta de ronda (046) y
  -- con cada compra (tg_aprender_de_compra): borrar la ronda o la compra no la
  -- deshace. Se borra lo que sale de ellas: las rondas CPR-26-00001…00019 (las
  -- de antes del 24/09 ya no existen, eran todas de prueba) y los pares
  -- proveedor-producto de las compras de prueba. Solo lo anterior al 28/10.
  delete from proveedor_productos pp
   where pp.creado_en < '2026-10-28'
     and (coalesce(substring(pp.notas from 'Cotizó en CPR-26-(\d{5})')::int, 99999) <= 19
          or exists (select 1 from compra_items ci join compras c on c.id = ci.compra_id
                      where c.id in (select id from _compra)
                        and c.proveedor_id = pp.proveedor_id and ci.producto_id = pp.producto_id));
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('proveedor_productos %s · ', n);

  delete from compras where id in (select id from _compra);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('compras %s · ', n);

  select count(*) into n from consulta_precio_items where consulta_id in (select id from _cpr);
  v_resumen := v_resumen || format('consulta_precio_items %s · ', n);
  select count(*) into n from consulta_precio_proveedores where consulta_id in (select id from _cpr);
  v_resumen := v_resumen || format('consulta_precio_proveedores %s · ', n);
  select count(*) into n from consulta_precio_respuestas r
    join consulta_precio_items i on i.id = r.item_id where i.consulta_id in (select id from _cpr);
  v_resumen := v_resumen || format('consulta_precio_respuestas %s · ', n);
  select count(*) into n from consulta_precio_asignaciones a
    join consulta_precio_items i on i.id = a.item_id where i.consulta_id in (select id from _cpr);
  v_resumen := v_resumen || format('consulta_precio_asignaciones %s · ', n);
  delete from consultas_precio where id in (select id from _cpr);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('consultas_precio %s · ', n);

  select count(*) into n from analisis_importacion_items where analisis_id in (select id from _ana);
  v_resumen := v_resumen || format('analisis_importacion_items %s · ', n);
  delete from analisis_importacion where id in (select id from _ana);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('analisis_importacion %s · ', n);

  -- -------------------------------------------------------------------------
  -- 6 · Pedidos y cotizaciones COT1
  -- -------------------------------------------------------------------------
  select count(*) into n from pedido_items where pedido_id in (select id from _ped);
  v_resumen := v_resumen || format('pedido_items %s · ', n);
  delete from pedidos where id in (select id from _ped);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('pedidos %s · ', n);

  select count(*) into n from cotizacion_item_proveedores cip
    join cotizacion_items ci on ci.id = cip.cotizacion_item_id where ci.cotizacion_id in (select id from _cot);
  v_resumen := v_resumen || format('cotizacion_item_proveedores %s · ', n);
  select count(*) into n from cotizacion_items where cotizacion_id in (select id from _cot);
  v_resumen := v_resumen || format('cotizacion_items %s · ', n);
  delete from cotizaciones where id in (select id from _cot);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('cotizaciones %s · ', n);

  -- -------------------------------------------------------------------------
  -- 7 · Alertas y bloqueos que apuntan a lo que ya no existe
  -- -------------------------------------------------------------------------
  -- Incluye las que dejó huérfanas la limpieza del 24/09. Las de saldo
  -- negativo de los productos tocados, también: su saldo ya es cero. Las de
  -- resumen («cotizaciones sin cerrar», «fallos») las rehace `generar_alertas`
  -- en la siguiente hora.
  delete from alertas a
   where (a.entidad_tipo = 'comprobante' and not exists (select 1 from comprobantes x where x.id = a.entidad_id))
      or (a.entidad_tipo = 'cotizacion'  and not exists (select 1 from cotizaciones x where x.id = a.entidad_id))
      or (a.entidad_tipo = 'pedido'      and not exists (select 1 from pedidos x where x.id = a.entidad_id))
      or (a.entidad_tipo = 'compra'      and not exists (select 1 from compras x where x.id = a.entidad_id))
      or (a.entidad_tipo = 'guia'        and not exists (select 1 from guias_remision x where x.id = a.entidad_id))
      or (a.entidad_tipo = 'recepcion'   and not exists (select 1 from recepciones x where x.id = a.entidad_id))
      or (a.tipo = 'stock_negativo' and a.entidad_id in (select producto_id from _prod));
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('alertas %s · ', n);

  delete from bloqueos_edicion b
   where (b.entidad = 'cotizacion' and not exists (select 1 from cotizaciones x where x.id = b.registro_id))
      or (b.entidad = 'guia'       and not exists (select 1 from guias_remision x where x.id = b.registro_id))
      or (b.entidad = 'compra'     and not exists (select 1 from compras x where x.id = b.registro_id));
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('bloqueos_edicion %s · ', n);

  -- -------------------------------------------------------------------------
  -- 8 · Los tres contactos «prueba»
  -- -------------------------------------------------------------------------
  -- Los clientes son reales; estos tres contactos se dieron de alta probando el
  -- formulario. `cotizaciones.contacto_id` es on delete set null, y ninguna
  -- cotización los usa. El nombre se vuelve a comprobar: si alguien lo
  -- corrigió a uno de verdad, no se borra.
  delete from cliente_contactos
   where id = any (c_contactos) and nombre ilike '%prueba%';
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('cliente_contactos %s · ', n);

  -- -------------------------------------------------------------------------
  -- 9 · Lo del 16/09 que no se corrió: la familia ZZ y los kits ZZ
  -- -------------------------------------------------------------------------
  -- Se BORRAN y no se desactivan, como decía aquel guion, porque hoy no cuelga
  -- nada de ellos (comprobado: ni productos ni tipos de la familia; ni
  -- cotizaciones, guías, facturas, stock ni kárdex de los kits). Si mañana
  -- algo los usara, el «not exists» los deja en paz.
  delete from subfamilias s
   where s.nombre = 'ZZ SUBFAMILIA PRUEBA'
     and not exists (select 1 from productos p where p.subfamilia_id = s.id)
     and not exists (select 1 from tipos t where t.subfamilia_id = s.id);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('subfamilias %s · ', n);

  delete from familias f
   where f.nombre = 'ZZ FAMILIA PRUEBA'
     and not exists (select 1 from subfamilias s where s.familia_id = f.id)
     and not exists (select 1 from productos p where p.familia_id = f.id);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('familias %s · ', n);

  select count(*) into n from kit_componentes k
    join productos p on p.id = k.kit_id where p.codigo = any (c_kits);
  v_resumen := v_resumen || format('kit_componentes %s · ', n);
  delete from productos p
   where p.codigo = any (c_kits) and p.es_kit
     and not exists (select 1 from cotizacion_items x where x.producto_id = p.id)
     and not exists (select 1 from comprobante_items x where x.producto_id = p.id)
     and not exists (select 1 from guia_items x where x.producto_id = p.id)
     and not exists (select 1 from compra_items x where x.producto_id = p.id)
     and not exists (select 1 from recepcion_items x where x.producto_id = p.id)
     and not exists (select 1 from movimientos_inventario x where x.producto_id = p.id)
     and not exists (select 1 from stock x where x.producto_id = p.id)
     and not exists (select 1 from kit_componentes x where x.producto_id = p.id)
     and not exists (select 1 from proveedor_productos x where x.producto_id = p.id)
     and not exists (select 1 from consulta_precio_items x where x.producto_id = p.id)
     and not exists (select 1 from analisis_importacion_items x where x.producto_id = p.id)
     and not exists (select 1 from cambios_precio_items x where x.producto_id = p.id)
     and not exists (select 1 from ajuste_items x where x.producto_id = p.id)
     and not exists (select 1 from producto_equivalencias x where x.producto_id = p.id or x.equivalente_id = p.id);
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('productos %s · ', n);

  -- -------------------------------------------------------------------------
  -- 10 · Los correlativos de prueba, a cero
  -- -------------------------------------------------------------------------
  -- Para que la primera factura, guía o cotización de verdad no salte
  -- números. F002, FC02 y CT02 NO están aquí: son de Willy. El disparador
  -- `tg_series_lo_fiscal` lo prohíbe desde la pantalla, no a `postgres`.
  update series_documento
     set correlativo_actual = 0
   where (serie = any (c_series_cero) or es_prueba)
     and correlativo_actual <> 0;
  get diagnostics n = row_count;
  v_resumen := v_resumen || format('series a cero %s', n);

  -- -------------------------------------------------------------------------
  -- 11 · CENTINELAS
  -- -------------------------------------------------------------------------
  select v into v_despues from _lo_real;
  if v_despues is distinct from v_antes then
    select string_agg(format('%s: %s → %s', k, v_antes->>k, v_despues->>k), ' · ')
      into v_dif
      from jsonb_object_keys(v_antes) k
     where v_antes->k is distinct from v_despues->k;
    raise exception 'Se tocó algo REAL (%). NO SE GUARDA NADA.', v_dif;
  end if;

  if exists (select 1 from series_documento
              where (serie = any (c_series_cero) or es_prueba) and correlativo_actual <> 0)
     or exists (select 1 from comprobantes where serie = any (c_series_cero) or serie in (select serie from series_documento where es_prueba))
     or exists (select 1 from guias_remision where serie = any (c_series_cero) or serie in (select serie from series_documento where es_prueba))
     or exists (select 1 from cotizaciones where serie = any (c_series_cero) or serie in (select serie from series_documento where es_prueba)) then
    raise exception 'Quedan documentos o correlativos en una serie de prueba. NO SE GUARDA NADA.';
  end if;

  if exists (select 1 from stock where producto_id in (select producto_id from _prod) and cantidad <> 0)
     or exists (select 1 from movimientos_inventario where id in (select id from _mov)) then
    raise exception 'El kárdex o el stock de prueba no quedó a cero. NO SE GUARDA NADA.';
  end if;

  if (select series_documento.correlativo_actual from series_documento where serie = 'F002') < 561
     or (select series_documento.correlativo_actual from series_documento where serie = 'FC02') < 4
     or (select series_documento.correlativo_actual from series_documento where serie = 'CT02') < 1261 then
    raise exception 'Un correlativo real retrocedió. NO SE GUARDA NADA.';
  end if;

  drop view _lo_real;

  if v_seco then
    raise exception '__LIMPIEZA_SECO__ (nada se guardó) · %', v_resumen;
  end if;

  raise notice 'Limpieza hecha · %', v_resumen;
  raise notice 'Lo real, intacto: %', v_despues;
end
$limpieza$;

-- ###########################################################################
-- OPCIONES · solo si Luis lo decide (preguntas 1 a 6). Van DENTRO de la misma
-- transacción: se descomentan antes de correr, no después.
-- ###########################################################################

-- --- A · Reiniciar compras, recepciones, rondas y análisis (pregunta 2) ---
-- Todo lo que había en ellas era de prueba y se acaba de borrar. Así la
-- primera compra de Willy es la CMP-26-00001.
--
-- update series_documento set correlativo_actual = 0
--  where serie in ('CMP', 'REC') and not exists (select 1 from compras) and not exists (select 1 from recepciones);
-- select setval('seq_consulta_precio', 1, false) where not exists (select 1 from consultas_precio);
-- select setval('analisis_importacion_seq', 1, false) where not exists (select 1 from analisis_importacion);

-- --- B · PED-26-00013 y 00014 eran prueba (pregunta 1) ---
-- Borra los dos pedidos y devuelve CT02-001258 y CT02-001259 a «enviada», sin
-- aprobación ni cantidades aprobadas, como llegaron del sistema anterior. Solo
-- si siguen sin guía, compra ni factura.
--
-- delete from pedidos p
--  using cotizaciones c
--  where c.id = p.cotizacion_id and c.numero in ('CT02-001258', 'CT02-001259')
--    and not exists (select 1 from guias_remision g where g.cotizacion_id = c.id)
--    and not exists (select 1 from comprobantes f where f.cotizacion_id = c.id)
--    and not exists (select 1 from compras o where o.cotizacion_id = c.id);
-- update cotizacion_items ci set cantidad_aprobada = null
--   from cotizaciones c
--  where c.id = ci.cotizacion_id and c.numero in ('CT02-001258', 'CT02-001259')
--    and not exists (select 1 from pedidos p where p.cotizacion_id = c.id);
-- update cotizaciones c set estado = 'enviada', aprobada_en = null, aprobada_por = null
--  where c.numero in ('CT02-001258', 'CT02-001259') and c.estado = 'aprobada'
--    and not exists (select 1 from pedidos p where p.cotizacion_id = c.id);

-- --- C · Costos y pisos de prueba en productos reales (pregunta 3) ---
-- Solo lo que se puede demostrar que es nuestro:
--   · los diez del 25/09 (marcados `prueba_25_09`): sin piso, sin precio de
--     mercado y sin costo, salvo los dos que traían costo real del Excel;
--   · el `costo_promedio` de los productos que ya no tienen ni stock ni kárdex
--     (sin existencias, un promedio no promedia nada: era de las compras de
--     prueba de hoy y del 24/09);
--   · MB-26 (costo 7 y piso 9 del 17/09) y 20X47X7TC (piso 1.00 del 09/10).
-- El `ultimo_costo` de los demás se queda: no se distingue del de Willy.
--
-- update productos
--    set precio_minimo  = 0,
--        precio_mercado = 0,
--        ultimo_costo   = case codigo when '6207-2Z/C3' then 6.0100
--                                     when '6204-2RSH'  then 2.8800 else 0 end,
--        atributos      = atributos - 'prueba_25_09'
--  where (atributos ->> 'prueba_25_09')::boolean is true;
-- update productos p set costo_promedio = 0
--  where p.costo_promedio <> 0
--    and not exists (select 1 from movimientos_inventario m where m.producto_id = p.id)
--    and coalesce((select s.cantidad from stock s where s.producto_id = p.id), 0) = 0;
-- update productos set ultimo_costo = 0, precio_minimo = 0 where codigo = 'MB-26';
-- update productos set ultimo_costo = 0, precio_minimo = 0 where codigo = '20X47X7TC';

-- --- D · Archivar el 22208 (pregunta 4) ---
-- update productos set archivado = true, archivado_en = now(),
--        motivo_archivado = 'Creado probando el alta rápida (16/09); la marca no era de Willy.'
--  where codigo = '22208' and not archivado;

-- --- E · Bitácora sin las filas de documentos que ya no existen (pregunta 5) ---
-- delete from actividad a
--  where (a.entidad = 'comprobantes'    and not exists (select 1 from comprobantes x where x.id = a.entidad_id))
--     or (a.entidad = 'cotizaciones'    and not exists (select 1 from cotizaciones x where x.id = a.entidad_id))
--     or (a.entidad = 'pedidos'         and not exists (select 1 from pedidos x where x.id = a.entidad_id))
--     or (a.entidad = 'compras'         and not exists (select 1 from compras x where x.id = a.entidad_id))
--     or (a.entidad = 'guias_remision'  and not exists (select 1 from guias_remision x where x.id = a.entidad_id))
--     or (a.entidad = 'recepciones'     and not exists (select 1 from recepciones x where x.id = a.entidad_id));

-- --- F · Dar por revisados los fallos de cuando se construía (pregunta 6) ---
-- update fallos set revisado = true where not revisado and ultima_vez < '2026-10-28';

commit;

-- ###########################################################################
-- PARA COMPROBARLO DESPUÉS (solo lectura)
-- ###########################################################################
--
--   select serie, correlativo_actual from series_documento order by serie;
--   select serie, count(*) from comprobantes group by serie;          -- F002 561, FC02 4
--   select serie, count(*) from cotizaciones group by serie;          -- CT02 1261
--   select numero from pedidos order by numero;                       -- PED-26-00013, 00014
--   select count(*) from compras;                                     -- 0
--   select count(*) from movimientos_inventario;                      -- 0
--   select count(*) from stock where cantidad <> 0;                   -- 0
--   select count(*) from proveedor_productos;                         -- 0
--   select nombre from familias where nombre like 'ZZ%';              -- nada
