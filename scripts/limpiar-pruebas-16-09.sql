-- ###########################################################################
-- LIMPIEZA DE LO QUE SE CREÓ PROBANDO EL 16/09
-- ###########################################################################
--
-- NO es una migración: no se versiona en la secuencia ni se aplica con
-- `aplicar-migraciones.mjs`. Es un SQL de una vez, para correr a mano desde el
-- editor de Supabase. Los datos del cliente no van en migraciones.
--
-- ---------------------------------------------------------------------------
-- Qué se creó y por qué
-- ---------------------------------------------------------------------------
-- Probando el alta rápida de productos desde el cotizador (Willy, 16/09: *«no
-- me sale la opción para crearlo en el sistema»*) hubo que crear cosas de
-- verdad para comprobar que el camino entero funcionaba:
--
--   · el producto `22208`, con marca SKF y descripción «RODAMIENTO DE RODILLOS
--     A ROTULA». La descripción es lo que ES un 22208; **la marca la elegí yo**
--     para poder probar. Si Willy lo cotiza de otra marca, se edita en su
--     ficha en vez de borrarlo;
--   · `ZZ MARCA PRUEBA`, `ZZ FAMILIA PRUEBA` y `ZZ SUBFAMILIA PRUEBA`, para
--     comprobar que se pueden dar de alta desde el diálogo y que la
--     sub-familia cuelga de la familia recién creada.
--
-- Las tres «ZZ» son basura y hay que quitarlas. El 22208 lo decide Willy.
--
-- ---------------------------------------------------------------------------
-- Se DESACTIVAN, no se borran
-- ---------------------------------------------------------------------------
-- `productos.marca_id`, `familia_id` y `subfamilia_id` son claves ajenas con
-- `on delete restrict`. Un `delete` fallaría en cuanto algo cuelgue de ellas, y
-- desactivar es lo que el resto del sistema ya entiende: las consultas del
-- catálogo filtran por `activo`.
-- ###########################################################################

begin;

-- 1 · Las tres de prueba, fuera de los desplegables.
update subfamilias set activo = false where nombre = 'ZZ SUBFAMILIA PRUEBA';
update familias    set activo = false where nombre = 'ZZ FAMILIA PRUEBA';
update marcas      set activo = false where nombre = 'ZZ MARCA PRUEBA';

-- 2 · El 22208. Descoméntalo SOLO si Willy no lo quiere o lo quiere de otra
--     marca: archivado deja de salir en el cotizador pero no se pierde.
--
-- update productos set archivado = true where codigo = '22208';

-- 3 · El MB-26, del 17/09. Probando que «Editar artículo» ya escribe el costo
--     y el precio mínimo, se le pusieron **USD 7.00 de costo y USD 9.00 de
--     mínimo, los dos inventados**. Su precio de lista (10.96) es el bueno.
--
--     Descoméntalo para dejarlos en cero otra vez, o mejor: que Willy ponga
--     los de verdad, que es justo lo que va a hacer esta semana.
--
-- update productos set ultimo_costo = 0, precio_minimo = 0
--  where codigo = 'MB-26';

commit;

-- Para comprobar que quedó limpio:
--
--   select 'marca' as que, nombre, activo from marcas      where nombre like 'ZZ %'
--   union all
--   select 'familia',      nombre, activo from familias    where nombre like 'ZZ %'
--   union all
--   select 'subfamilia',   nombre, activo from subfamilias where nombre like 'ZZ %';

-- ###########################################################################
-- 4 · El kit de prueba del 17/09
-- ###########################################################################
--
-- Probando el módulo de kits (085) se creó `ZZ-KIT-PRUEBA`, con el 1210SC3 y
-- el retén 45X60X8TC dentro. Es basura de prueba.
--
-- Un kit es un producto con `es_kit`, así que se archiva como cualquier otro;
-- sus componentes se van solos por el `on delete cascade` solo si se BORRA la
-- fila, y no se borra: archivar deja el rastro y lo saca del cotizador.

begin;

update productos set archivado = true where codigo = 'ZZ-KIT-PRUEBA';

commit;

-- Para comprobarlo:
--
--   select codigo, descripcion, archivado from productos where es_kit;

-- ###########################################################################
-- 5 · La cotización COT1-000009, del 17/09
-- ###########################################################################
--
-- Se creó para comprobar que un kit se cotiza como UN ítem y que el papel
-- imprime debajo lo que contiene. Lleva una sola línea: ZZ-KIT-PRUEBA.
--
-- Gastó un correlativo de COT1, que NO es una serie fiscal —las cotizaciones
-- no se declaran—, así que el salto no hay que explicárselo a nadie. Se anula
-- en vez de borrarse: una cotización borrada deja el número sin rastro y al
-- revisar la lista no se entiende por qué falta.

begin;

update cotizaciones set estado = 'anulada'
 where numero = 'COT1-000009'
   and estado = 'borrador';

commit;

-- ###########################################################################
-- 6 · Las rondas de precios CPR-26-00011 y CPR-26-00012, del 21/09
-- ###########################################################################
--
-- La 00011 se creó para comprobar de punta a punta que una ronda se puede armar SIN
-- cotización detrás — el cambio del 21/09—. Lleva un producto
-- (`6205-2RSH/C3`) y un proveedor (MARCO PERUANA), y nadie contestó: no hay
-- precios anotados.
--
-- Se borra entera en vez de anularse. Una cotización anulada se entiende
-- mirando la lista; una ronda sin respuestas no dice nada a nadie y solo
-- ensucia la bandeja de «esperando».
--
-- OJO: esto NO deshace `proveedor_productos`. Esa tabla se llena sola con
-- cada respuesta (046) y aquí no hubo ninguna, así que en este caso no queda
-- rastro — pero si alguien anota un precio antes de correr esto, el rastro sí
-- se queda. Es el mismo caso que el retén de MARCO PERUANA del 09/09.

begin;

delete from consultas_precio c
 where c.numero in ('CPR-26-00011', 'CPR-26-00012')
   -- Con alguna respuesta anotada NO se borra: alguien la estaría usando de
   -- verdad y este script es para limpiar pruebas, no trabajo.
   and not exists (
     select 1
     from consulta_precio_respuestas r
     join consulta_precio_proveedores cp on cp.id = r.consulta_proveedor_id
     where cp.consulta_id = c.id
   );

commit;

-- La CPR-26-00012 es la del reparto: 10 unidades del 6205-2RSH/C3, AUTOLAND a
-- $8 con stock de sobra y MARCO PERUANA a $6 con solo 6. Sirvió para ver en
-- pantalla el caso que Willy planteó por chat el 21/09 —6 × $6 + 4 × $8 =
-- $6.80— y ESA SÍ tiene respuestas anotadas, así que el borrado de arriba la
-- deja en pie a propósito.
--
-- Para llevársela también, hay que quitar antes sus respuestas. Va aparte
-- porque borra trabajo anotado y eso no puede pasar por descuido:
--
--   delete from consulta_precio_respuestas r
--    using consulta_precio_proveedores cp, consultas_precio c
--    where r.consulta_proveedor_id = cp.id
--      and cp.consulta_id = c.id
--      and c.numero = 'CPR-26-00012';
--   delete from consultas_precio where numero = 'CPR-26-00012';
--
-- OJO: eso NO deshace `proveedor_productos`. Al anotar esos precios quedó
-- registrado que AUTOLAND vende el 6205-2RSH/C3 a $8 y MARCO PERUANA a $6.
-- Es el mismo caso que el retén del 09/09, y se limpia a mano si molesta.

-- ###########################################################################
-- 7 · Las compras CMP-26-00023 y CMP-26-00024, del 21/09
-- ###########################################################################
--
-- Salieron de confirmar la ronda CPR-26-00012 (bloque 6) y son la prueba de
-- que el reparto llega hasta el final: el mismo producto, 4 unidades a
-- AUTOLAND a $8 y 6 a MARCO PERUANA a $6, en DOS compras creadas de una sola
-- vez. Antes del 21/09 esto no se podía ni expresar.
--
-- No han recibido mercadería, así que NO han movido stock: las compras lo
-- mueven al recepcionarse, no al registrarse.
--
-- ---------------------------------------------------------------------------
-- Se ANULAN, no se borran
-- ---------------------------------------------------------------------------
-- Gastaron dos correlativos de CMP, que no es una serie fiscal —una compra no
-- se declara— pero sí es una secuencia que se mira. Una compra borrada deja un
-- hueco que nadie sabe explicar; una anulada se entiende leyendo su motivo.
--
-- Y se anulan por la RPC y no con un UPDATE: `anular_compra` comprueba el rol,
-- exige motivo y se niega si ya se recibió algo. Escribir el estado a mano se
-- saltaría las tres cosas.

begin;

select public.anular_compra(c.id, 'Prueba del reparto entre proveedores (21/09). No llegó mercadería.')
  from compras c
 where c.numero in ('CMP-26-00023', 'CMP-26-00024')
   and c.estado = 'registrada';

commit;

-- OJO con lo que esto NO deshace, que es lo de siempre:
--
--   · `proveedor_productos` quedó con que AUTOLAND vende el 6205-2RSH/C3 a $8
--     y MARCO PERUANA a $6. Lo escribió la ronda al anotar los precios (046),
--     no la compra, así que anularla no lo toca.
--   · Y esos dos precios salen ahora en «A quién preguntarle» de la ficha de
--     ese producto, etiquetados «lo cotizó».
--
-- Si molestan, se quitan a mano:
--
--   delete from proveedor_productos pp
--    using productos p
--    where pp.producto_id = p.id and p.codigo = '6205-2RSH/C3';
