-- ###########################################################################
-- 118 · EL CLIENTE QUE ES AGENTE DE RETENCIÓN
-- ###########################################################################
--
-- Desde §BX la retención del 3 % se enciende sola en la factura cuando el
-- total llega a S/ 700. Pero eso solo es verdad si el CLIENTE retiene: solo
-- retienen los que SUNAT designó agentes de retención. Luis, 15/10: *«solo es
-- si el cliente es agente de retención; si no lo es, así haya pasado [los
-- 700], lo voy a poder desactivar»*.
--
-- Hasta hoy el ERP no sabía quién lo es. Se guarda en el cliente: se marca en
-- su ficha (y «Traer datos» lo propone si la consulta del RUC lo trae). La
-- factura se enciende sola solo si es agente Y llega a S/ 700; si no, sale
-- apagada y se puede encender a mano.
--
-- Nace en false para los 97: nadie está marcado, y marcar de más le haría
-- cobrar un 3 % menos sin que nadie lo pida.
-- ###########################################################################

alter table clientes
  add column if not exists agente_retencion boolean not null default false;

comment on column clientes.agente_retencion is
  'SUNAT lo designó agente de retención: en sus facturas desde S/ 700 la retención del 3 % se enciende sola (118).';
