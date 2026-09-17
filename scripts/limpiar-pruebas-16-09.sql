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
