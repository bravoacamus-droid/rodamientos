-- ###########################################################################
-- 075 · FUERA LAS PLANTILLAS DE MENSAJE
-- ###########################################################################
--
-- Luis, 09/09: *«sí, quita todo eso rey, de plantillas y mensaje»*.
--
-- La 049 creó esta tabla para escribir el WhatsApp con el que se pedía precio
-- a un proveedor. Willy dijo que no lo quería el 07/09 (18:47) —*«no, creo no,
-- ya mucho ya… yo lo hago el WhatsApp así de forma rápida»*— y el bloque que
-- las consumía se quitó de la pantalla el 09/09.
--
-- Sin ese bloque, la tabla no la lee nadie: lo único que quedaba era la
-- sección de Configuración donde se editaban, o sea una pantalla para
-- mantener un dato que ya no alimenta nada. Eso es peor que no tenerla: da a
-- entender que cambiar ahí un texto cambia algo en el sistema.
--
-- ---------------------------------------------------------------------------
-- Qué se pierde
-- ---------------------------------------------------------------------------
-- Nada de Willy. La tabla tiene exactamente las **dos filas semilla** que
-- sembró la propia 049 —«Pedido de precios · correo» y «Pedido de precios ·
-- WhatsApp»— y ninguna la escribió él. Se comprobó contra la base antes de
-- escribir esto.
--
-- El módulo entero de `mensajes` se borra en el mismo commit, incluidas sus
-- funciones de dominio y sus tests. Lo que la cotización usa para mandarse por
-- WhatsApp es otra cosa —`cotizaciones/dominio/whatsapp.ts`, con el texto
-- escrito en código— y ese sí lo pidió Willy (13:00), así que se queda.
--
-- ---------------------------------------------------------------------------
-- Y si algún día vuelve
-- ---------------------------------------------------------------------------
-- La 049 sigue en el repositorio con la tabla, sus políticas y las semillas.
-- Recuperar esto es leerla, no reinventarla.
-- ###########################################################################

set local search_path = public, extensions;

drop table if exists plantillas_mensaje;

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Que se fue de verdad. Una tabla que sobrevive a su propia migración de
-- borrado es justo el tipo de cosa que reaparece en los tipos generados seis
-- meses después y hace dudar de si se usa o no.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'plantillas_mensaje'
  ) then
    raise exception 'plantillas_mensaje sigue existiendo';
  end if;
end $$;
