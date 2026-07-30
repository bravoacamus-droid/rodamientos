-- ============================================================================
-- ERP RODATECH · Cotizaciones en negociación, cargos logísticos y opciones
-- de presentación del documento.
--
-- El valor nuevo del enum se agrega en su propia sentencia porque PostgreSQL
-- no permite usarlo dentro de la misma transacción en que se crea.
-- ============================================================================

alter type estado_cotizacion add value if not exists 'en_negociacion' after 'enviada';
