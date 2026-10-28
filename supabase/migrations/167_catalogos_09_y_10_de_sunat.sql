-- ###########################################################################
-- 167 · LOS CATÁLOGOS 09 Y 10 DE SUNAT, COMPLETOS Y BIEN NUMERADOS
-- ###########################################################################
--
-- El problema (auditoría SUNAT del 28/10, M6). La tabla `motivos_nota` se
-- sembró en la 007 a mano y con dos fallos:
--
--   · Al catálogo 09 (nota de crédito) le faltaban el 11, el 12 y el 13. El
--     13 es el que SUNAT pide para corregir las cuotas o el monto neto
--     pendiente de una factura a crédito, que es el caso normal de Rodatech.
--   · En el catálogo 10 (nota de débito), el 11 decía «Ajustes de operaciones
--     de exportación». En el catálogo vigente, exportación es el 10 y el 11
--     es «Ajustes afectos al IVAP». La 007 copió la numeración del catálogo
--     09, donde exportación sí es el 11. Y el 11 se ofrecía en la pantalla:
--     una nota de débito «de exportación» habría salido a SUNAT como IVAP.
--
-- Fuentes oficiales, comprobadas el 28/10/2026:
--
--   · Catálogo 09: Anexo III de la RS 193-2020/SUNAT, «Anexo N.° 8: Catálogo
--     de códigos», https://www.sunat.gob.pe/legislacion/superin/2020/anexo3-193-2020.pdf
--     (01 a 13; el 13 es el que añadió esa resolución).
--   · Catálogo 10: Anexo V de la RS 340-2017/SUNAT, «vigente para la versión
--     UBL 2.1», publicado en El Peruano el 30/12/2017
--     (https://www.normaslegalesonline.pe/imagenes//03/01/2018/1515015746331_V.pdf):
--     01, 02, 03, 10 exportación y 11 IVAP. La 193-2020 no lo tocó.
--     Ojo: algunos proveedores (Factpro, Alanube) publican el catálogo 10 con
--     11 exportación y 12 IVAP. Es la numeración del 09 trasladada al 10; la
--     norma dice 10 y 11.
--
-- Qué se ofrece y qué no. El catálogo se guarda ENTERO, para que la tabla
-- diga lo mismo que SUNAT, pero solo se activan los motivos que el ERP sabe
-- emitir bien. La pantalla lista solo los activos (`motivosNota()`), y la
-- Server Action rechaza cualquier código fuera de `MOTIVOS_CREDITO` /
-- `MOTIVOS_DEBITO` (dominio/nota.ts), que llevan los mismos.
--
--   · 09-11 y 10-10 exportación, 09-12 y 10-11 IVAP: Rodatech no exporta ni
--     vende arroz pilado. Inactivos.
--   · 09-13: INACTIVO, porque no está soportado. Una NC 13 no mueve dinero
--     (va por importe cero) y tiene que llevar en el XML la forma de pago
--     (`cac:PaymentTerms` FormaPago = Credito con el nuevo monto neto
--     pendiente) y cada cuota (`Cuota001…` con su monto y su vencimiento).
--     Hoy la nota se arma sin `PaymentTerms` (packages/sunat/src/ubl/nota.ts)
--     y `bloqueosNota` rechaza el importe cero (error 2800 para el resto de
--     motivos). Ofrecerlo sería gastar un correlativo en un rechazo seguro.
--     Para activarlo: la pantalla de cuotas en la nota, el bloque
--     `PaymentTerms` en `generarNotaXml`, la excepción del cero en
--     `bloqueosNota` y su prueba en beta.
--
-- Ninguna nota de débito se ha emitido nunca (comprobado el 28/10: las
-- únicas notas son cuatro de crédito con motivo 06), así que reetiquetar el
-- 10-11 no cambia el sentido de ningún documento ya hecho.
--
-- Es un catálogo de SUNAT, no un dato del cliente: va en migración (como la
-- 124).
-- ###########################################################################

insert into motivos_nota (tipo, codigo, descripcion, activo) values
  ('nota_credito', '11', 'Ajustes de operaciones de exportación', false),
  ('nota_credito', '12', 'Ajustes afectos al IVAP', false),
  ('nota_credito', '13', 'Corrección del monto neto pendiente de pago y/o la(s) fecha(s) de vencimiento del pago único o de las cuotas y/o los montos correspondientes a cada cuota, de ser el caso', false),
  ('nota_debito',  '10', 'Ajustes de operaciones de exportación', false),
  ('nota_debito',  '11', 'Ajustes afectos al IVAP', false)
on conflict (tipo, codigo) do update
  set descripcion = excluded.descripcion,
      activo      = excluded.activo;

-- Centinela: el catálogo entero, código a código, con lo que se ofrece.
do $$
declare
  v_esperado text := concat_ws('|',
    'nota_credito/01/t/Anulación de la operación',
    'nota_credito/02/t/Anulación por error en el RUC',
    'nota_credito/03/t/Corrección por error en la descripción',
    'nota_credito/04/t/Descuento global',
    'nota_credito/05/t/Descuento por ítem',
    'nota_credito/06/t/Devolución total',
    'nota_credito/07/t/Devolución por ítem',
    'nota_credito/08/t/Bonificación',
    'nota_credito/09/t/Disminución en el valor',
    'nota_credito/10/t/Otros conceptos',
    'nota_credito/11/f/Ajustes de operaciones de exportación',
    'nota_credito/12/f/Ajustes afectos al IVAP',
    'nota_credito/13/f/Corrección del monto neto pendiente de pago y/o la(s) fecha(s) de vencimiento del pago único o de las cuotas y/o los montos correspondientes a cada cuota, de ser el caso',
    'nota_debito/01/t/Intereses por mora',
    'nota_debito/02/t/Aumento en el valor',
    'nota_debito/03/t/Penalidades / otros conceptos',
    'nota_debito/10/f/Ajustes de operaciones de exportación',
    'nota_debito/11/f/Ajustes afectos al IVAP');
  v_real text;
begin
  select string_agg(tipo || '/' || codigo || '/' || case when activo then 't' else 'f' end || '/' || descripcion,
                    '|' order by tipo::text, codigo)
    into v_real
    from motivos_nota;

  if v_real is distinct from v_esperado then
    raise exception E'167: los catálogos 09 y 10 no quedaron como dice SUNAT.\nEsperado: %\nHay:      %',
      v_esperado, v_real;
  end if;

  raise notice '167: catálogo 09 (01-13) y 10 (01-03, 10, 11) completos; activos solo los que el ERP emite.';
end $$;
