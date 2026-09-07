-- ###########################################################################
-- 062 · A PIE, Y EL INICIO DEL TRASLADO
-- ###########################################################################
--
-- Willy, 07/09 (38:16), sobre el transporte privado:
--
--   *«no, nosotros por lo general voy en mi carro nomás… ¿y no hay la opción
--   peatonal?»* — *«¿cómo es la peatonal?»* — *«la que vaya a pie, pues»*.
--
-- Y qué hace falta apuntar en ese caso (38:41): *«ahí sería el nombre, el que
-- va a llegar, y su número de celular… nombre, celular y DNI»*.
--
-- ---------------------------------------------------------------------------
-- Peatonal no es una tercera modalidad
-- ---------------------------------------------------------------------------
-- El catálogo 18 de SUNAT tiene dos y solo dos: `01` público y `02` privado.
-- Inventarse un `03` haría que la guía la rechazaran.
--
-- Ir a pie ES transporte privado: lo lleva la propia empresa. Lo que cambia es
-- que no hay vehículo, así que se guarda como una marca aparte y no como una
-- modalidad nueva. Lo que viaja a SUNAT sigue siendo `02`.
--
-- ---------------------------------------------------------------------------
-- Lo que la restricción exigía y por qué no vale ya
-- ---------------------------------------------------------------------------
-- `guia_transporte_ok` pedía, para emitir en privado, una placa. Con alguien
-- que cruza la calle con una caja no hay placa que poner, y obligar a
-- inventarse una es peor que no tenerla: acaba habiendo guías emitidas con
-- «AAA111» porque el campo no dejaba pasar.
--
-- Ahora, si va a pie, lo que se exige es el DNI de quien lo lleva — que es el
-- dato que de verdad identifica a quien responde de la mercadería, y el que
-- Willy pidió apuntar.
-- ###########################################################################

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · La marca de «va a pie»
-- ---------------------------------------------------------------------------
alter table guias_remision
  add column if not exists a_pie boolean not null default false,
  -- Willy pidió el celular junto al nombre y el DNI: si el almacén del cliente
  -- no aparece, a quien se llama es a quien está en la puerta.
  add column if not exists conductor_telefono text;

comment on column guias_remision.a_pie is
  'Traslado privado SIN vehículo: alguien lo lleva a pie. Willy 07/09: «¿no hay la opción peatonal? la que vaya a pie, pues». No es una modalidad nueva —el catálogo 18 de SUNAT solo tiene 01 y 02, y esto sigue siendo 02—: es que no hay placa que declarar.';
comment on column guias_remision.conductor_telefono is
  'El celular de quien lleva la mercadería. Willy 38:41: «nombre, celular y DNI».';

-- ---------------------------------------------------------------------------
-- 2 · Qué hace falta para emitir
-- ---------------------------------------------------------------------------
-- En borrador no se exige nada: la guía se prepara cuando se cierra la venta y
-- se completa cuando ya se sabe quién la lleva. Eso no cambia.
alter table guias_remision drop constraint if exists guia_transporte_ok;

alter table guias_remision add constraint guia_transporte_ok check (
  estado = 'borrador'
  -- Público: manda la agencia, y su RUC es lo que pide un control.
  or (modalidad_traslado = '01' and transportista_documento is not null)
  -- Privado a pie: no hay placa; responde una persona con nombre y DNI.
  or (modalidad_traslado = '02' and a_pie and conductor_documento is not null)
  -- Privado con vehículo: la placa, como hasta ahora.
  or (modalidad_traslado = '02' and not a_pie and transportista_placa is not null)
);

-- Ir a pie es privado. Marcarlo en una guía pública sería decir dos cosas a la
-- vez: que la lleva una agencia y que la lleva alguien andando.
alter table guias_remision drop constraint if exists guia_a_pie_es_privada;
alter table guias_remision add constraint guia_a_pie_es_privada check (
  not a_pie or modalidad_traslado = '02'
);
