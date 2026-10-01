-- ###########################################################################
-- Pesos de los productos de la hoja de importación aérea de Willy (01/10)
-- ###########################################################################
--
-- `documentosrodamiento/analisis compra importacion aerea.xlsx`, columna
-- «PESO U(Kg.)». Desde la 097 el courier se reparte por kilo, y ninguno de los
-- 794 productos tenía peso (§AP).
--
-- De los 29 productos de la hoja, 12 están en el catálogo, cada uno con un
-- solo producto que coincide en código (sin espacios ni guiones) y en marca.
-- Los otros 17 no existen en el catálogo: se les apuntará el peso con la
-- primera compra en que se escriba (097 lo copia de la compra al producto).
--
-- SQL directo y no migración: son datos del cliente (CLAUDE.md §3).
-- Solo toca productos SIN peso: no pisa uno que alguien ya haya escrito.
-- Aplicado el 01/10/2026.

update productos p
   set peso_kg = h.peso
  from (values
    ('22211 EAKE4C3', 'NSK', 0.825),
    ('22211 EK/C3',   'SKF', 0.801),
    ('22217 EK/C3',   'SKF', 2.610),
    ('30209',         'SKF', 0.473),
    ('30212',         'SKF', 0.886),
    ('32005 X/Q',     'SKF', 0.112),
    ('6212 2RS1/C3',  'SKF', 0.787),
    ('6212 2Z/C3',    'SKF', 0.797),
    ('6312 2Z/C3',    'SKF', 1.730),
    ('6313 2Z/C3',    'SKF', 2.130),
    ('NK 90/25 XL',   'INA', 0.424),
    ('NKIB 5902 XL',  'INA', 0.051)
  ) as h(codigo, marca, peso),
       marcas m
 where m.id = p.marca_id
   and upper(m.nombre) = h.marca
   and regexp_replace(upper(p.codigo), '[^A-Z0-9]', '', 'g')
       = regexp_replace(upper(h.codigo), '[^A-Z0-9]', '', 'g')
   and p.peso_kg = 0;
