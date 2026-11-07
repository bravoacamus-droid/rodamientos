-- ###########################################################################
-- 199 · LA GUÍA GUARDA SU XML FIRMADO
-- ###########################################################################
--
-- El problema. Moisés, 07/11: *«las guías de remitente también deberían
-- descargar el XML y el CDR?»*. La factura los tiene desde el 02/11. La guía
-- guardaba su CDR (`sunat_respuesta.cdrXml`, 168) pero NO el XML que se firma
-- y se manda: `emitirGuia` lo devolvía y el envío solo se quedaba el ticket.
--
-- El XML firmado no se puede rehacer después: firmarlo otra vez da otra firma,
-- y ya no es el documento que recibió SUNAT. Por eso se guarda en el momento
-- de mandarlo. Las guías enviadas antes de esto se quedan sin él (las 575 de
-- SIMPLE, además, nunca lo tuvieron en el ERP).
--
-- La columna la escribe solo el servidor (service_role), como el resto de las
-- columnas de SUNAT de la guía (127).
-- ###########################################################################

alter table public.guias_remision
  add column if not exists sunat_xml_firmado text;

comment on column public.guias_remision.sunat_xml_firmado is
  'El XML firmado tal como se mandó a SUNAT (199). Se guarda al enviar; no se puede rehacer.';
