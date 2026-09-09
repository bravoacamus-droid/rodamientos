-- ###########################################################################
-- 076 · EL PAPEL DEL PAGO
-- ###########################################################################
--
-- Luis, 09/09:
--
--   *«No tengo dónde subir los documentos de la guía, la factura que me hizo
--   el proveedor y EL PAGO. Puede ser opcional subirlo, es para que lleve un
--   control de todo eso»*.
--
-- La 068 dejó el bucket, la tabla y dos tipos —`guia` y `factura`—, que son
-- los dos que Willy nombró el 07/09. El tercero no lo nombró nadie entonces y
-- es el que más se pide después: la transferencia, el depósito, el voucher.
--
-- ---------------------------------------------------------------------------
-- Por qué no vale `otro`
-- ---------------------------------------------------------------------------
-- El enum ya tiene un cajón de sastre, así que técnicamente cabía ahí. Pero un
-- papel guardado como `otro` no se puede buscar: el día que el proveedor dice
-- que no le pagaron, hay que abrir los adjuntos uno a uno para encontrar el
-- voucher. Un tipo propio es lo que convierte «está subido» en «está subido y
-- lo encuentro».
--
-- Y hay una diferencia real con los otros dos: la guía y la factura las trae
-- el proveedor cuando entrega; el pago sale después, a veces semanas después.
-- Es el papel que cierra la operación por el otro lado.
--
-- ---------------------------------------------------------------------------
-- Un `alter type` y nada más
-- ---------------------------------------------------------------------------
-- Añadir un valor a un enum en PostgreSQL 12+ funciona dentro de una
-- transacción; lo que NO se puede es USARLO en la misma. Aquí solo se añade,
-- así que no hay problema — pero por eso el centinela de abajo comprueba el
-- catálogo (`pg_enum`) y no intenta insertar una fila de prueba.
-- ###########################################################################

set local search_path = public, extensions;

alter type tipo_papel_proveedor add value if not exists 'pago';

comment on type tipo_papel_proveedor is
  'Qué papel es cada adjunto de una recepción. `guia` y `factura` los trae el proveedor al entregar (068); `pago` sale después y cierra la operación por el otro lado (076). `otro` es el cajón de sastre.';

-- ---------------------------------------------------------------------------
-- Centinela
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'tipo_papel_proveedor'
       and e.enumlabel = 'pago'
  ) then
    raise exception '076: el tipo de papel «pago» no quedó en el enum';
  end if;
end $$;
