-- ============================================================================
-- RODATECH ERP v2 · 006 · Semilla de maestros
-- ----------------------------------------------------------------------------
-- Solo data de configuración y catálogos oficiales. Los tres Excel de Willy
-- (productos, clientes, proveedores) entran por `importar_productos()` y sus
-- equivalentes, NO por aquí.
-- ============================================================================

set search_path = public, extensions;

-- ###########################################################################
-- 1. UNIDADES DE MEDIDA · catálogo 03 de SUNAT
-- ###########################################################################
-- Willy nombró exactamente estas cuatro (11:56). Coinciden con la constante
-- UNIDADES de packages/config/src/index.ts: si se agrega una aquí, hay que
-- agregarla allá.
insert into unidades_medida (codigo, etiqueta, abreviatura, orden) values
  ('NIU', 'Unidad',    'und',  1),
  ('MTR', 'Metro',     'm',    2),
  ('BX',  'Caja',      'caja', 3),
  ('SET', 'Kit / Set', 'kit',  4)
on conflict (codigo) do update set
  etiqueta = excluded.etiqueta, abreviatura = excluded.abreviatura, orden = excluded.orden;

-- ###########################################################################
-- 2. CATÁLOGOS SUNAT DE DOCUMENTOS
-- ###########################################################################

-- Catálogo 20 · motivo de traslado de la guía de remisión.
insert into motivos_traslado (codigo, descripcion, orden) values
  ('01', 'Venta', 1),
  ('02', 'Compra', 2),
  ('04', 'Traslado entre establecimientos de la misma empresa', 4),
  ('08', 'Importación', 8),
  ('09', 'Exportación', 9),
  ('13', 'Otros', 13),
  ('14', 'Venta sujeta a confirmación del comprador', 14),
  ('18', 'Traslado emisor itinerante de comprobantes', 18),
  ('19', 'Traslado a zona primaria', 19)
on conflict (codigo) do update set descripcion = excluded.descripcion;

-- Catálogo 09 · motivos de nota de crédito.
insert into motivos_nota (tipo, codigo, descripcion) values
  ('nota_credito','01','Anulación de la operación'),
  ('nota_credito','02','Anulación por error en el RUC'),
  ('nota_credito','03','Corrección por error en la descripción'),
  ('nota_credito','04','Descuento global'),
  ('nota_credito','05','Descuento por ítem'),
  ('nota_credito','06','Devolución total'),
  ('nota_credito','07','Devolución por ítem'),
  ('nota_credito','09','Disminución en el valor'),
  ('nota_credito','10','Otros conceptos'),
  ('nota_debito','01','Intereses por mora'),
  ('nota_debito','02','Aumento en el valor'),
  ('nota_debito','03','Penalidades / otros conceptos'),
  ('nota_debito','11','Ajustes de operaciones de exportación')
on conflict (tipo, codigo) do update set descripcion = excluded.descripcion;

-- ###########################################################################
-- 3. EMPRESA
-- ###########################################################################
-- Los datos fiscales reales los confirma Willy antes de producción; el RUC de
-- aquí es el de la demo y HAY QUE VALIDARLO contra su ficha RUC.
insert into empresa (
  id, razon_social, nombre_comercial, ruc, direccion, ubigeo_codigo,
  telefono, celular, email, email_ventas, web, logo_url, eslogan,
  igv_porcentaje, moneda, detraccion_monto_minimo, detraccion_porcentaje, retencion_porcentaje
) values (
  1,
  'INVERSIONES RODATECH E.I.R.L.',
  'Rodatech',
  '20601234567',
  'Jr. Los Huertos N° 2232',
  null,                            -- se completa cuando cargue el seed de ubigeo
  '01 608 5712',
  '981 191 487',
  'wfernandez@rodatechperu.com',
  'ventas@rodatechperu.com',
  'www.rodatechperu.com',
  '/logo.png',
  'Su proveedor de soluciones en Rodamientos y más...',
  18.00, 'USD', 700.00, 12.00, 3.00
)
on conflict (id) do update set
  razon_social = excluded.razon_social,
  nombre_comercial = excluded.nombre_comercial,
  direccion = excluded.direccion,
  telefono = excluded.telefono,
  celular = excluded.celular,
  email = excluded.email,
  email_ventas = excluded.email_ventas,
  eslogan = excluded.eslogan;

-- ###########################################################################
-- 4. SERIES Y CORRELATIVOS
-- ###########################################################################
-- ¡ATENCIÓN AL MIGRAR! `correlativo_inicial` es el número por el que Willy va
-- HOY en su sistema actual + 1 (06:08). Los valores de abajo son marcadores:
-- antes de emitir el primer documento real hay que ponerlos de verdad, con
--   update series_documento set correlativo_inicial = <n> where tipo=... and serie=...;
-- `correlativo_actual` en 0 es correcto: la primera emisión devolverá
-- greatest(0 + 1, correlativo_inicial) = correlativo_inicial.
insert into series_documento (tipo, serie, correlativo_inicial, correlativo_actual, longitud, predeterminada, descripcion) values
  ('cotizacion',    'COT1', 1, 0, 6, true,  'Cotizaciones · continuar numeración del sistema anterior'),
  ('guia_remision', 'T001', 1, 0, 8, true,  'Guía de remisión remitente electrónica'),
  ('factura',       'F001', 1, 0, 8, true,  'Factura electrónica'),
  ('boleta',        'B001', 1, 0, 8, true,  'Boleta de venta electrónica'),
  ('nota_credito',  'FC01', 1, 0, 8, true,  'Nota de crédito sobre factura'),
  ('nota_credito',  'BC01', 1, 0, 8, false, 'Nota de crédito sobre boleta'),
  ('nota_debito',   'FD01', 1, 0, 8, true,  'Nota de débito sobre factura'),
  ('nota_debito',   'BD01', 1, 0, 8, false, 'Nota de débito sobre boleta'),
  ('compra',        'CMP',  1, 0, 5, true,  'Registro interno de compras'),
  ('recepcion',     'REC',  1, 0, 5, true,  'Recepción de mercadería'),
  ('ajuste_inventario','AJU',1,0, 5, true,  'Ajuste / cuadre de inventario')
on conflict (tipo, serie) do nothing;

-- ###########################################################################
-- 5. MATRIZ DE PERMISOS POR ROL
-- ###########################################################################
-- Esta tabla ES la política de seguridad. Cada fila responde a "¿este rol
-- puede escribir en esta tabla?". Las políticas de 005 la consultan.

-- 5.1 · gerencia y admin escriben todo.
insert into permisos_rol (tabla, rol, nota)
select t.tabla, r.rol::rol_usuario, 'acceso total'
from (values
  ('empresa'),('series_documento'),
  ('motivos_traslado'),('motivos_nota'),('unidades_medida'),
  ('marcas'),('familias'),('subfamilias'),('tipos'),
  ('productos'),('producto_equivalencias'),
  ('clientes'),('proveedores'),('proveedor_marcas'),
  ('consultas_cache'),('consultas_cuota'),('consultas_log'),
  ('stock'),('movimientos_inventario'),
  ('compras'),('compra_items'),('gastos_importacion'),('recepciones'),('recepcion_items'),
  ('cotizaciones'),('cotizacion_items'),
  ('guias_remision'),('guia_items'),
  ('comprobantes'),('comprobante_items'),('comprobante_cuotas'),
  ('pagos'),('gestiones_cobranza'),
  ('alertas'),('actividad')
) as t(tabla)
cross join (values ('gerencia'),('admin')) as r(rol)
on conflict (tabla, rol) do nothing;

-- 5.2 · ventas: el ciclo comercial completo, sin tocar costos ni compras.
insert into permisos_rol (tabla, rol, nota)
select t.tabla, 'ventas'::rol_usuario, 'ciclo comercial'
from (values
  ('clientes'),('consultas_cache'),('consultas_cuota'),('consultas_log'),
  ('cotizaciones'),('cotizacion_items'),
  ('guias_remision'),('guia_items'),
  ('comprobantes'),('comprobante_items'),('comprobante_cuotas'),
  ('producto_equivalencias'),
  ('gestiones_cobranza'),('alertas'),('actividad')
) as t(tabla)
on conflict (tabla, rol) do nothing;

-- 5.3 · almacén: recibe, despacha y mantiene ubicaciones. NO fija precios;
-- `productos` queda fuera a propósito porque ahí viven precio_venta y márgenes.
insert into permisos_rol (tabla, rol, nota)
select t.tabla, 'almacen'::rol_usuario, 'movimiento físico'
from (values
  ('recepciones'),('recepcion_items'),
  ('stock'),('movimientos_inventario'),
  ('guias_remision'),('guia_items'),
  ('alertas'),('actividad')
) as t(tabla)
on conflict (tabla, rol) do nothing;

-- 5.4 · compras: proveedores, compras, recepciones y el maestro de productos
-- (es quien da de alta un artículo nuevo cuando llega mercadería nueva).
insert into permisos_rol (tabla, rol, nota)
select t.tabla, 'compras'::rol_usuario, 'abastecimiento'
from (values
  ('proveedores'),('proveedor_marcas'),('consultas_cache'),('consultas_cuota'),('consultas_log'),
  ('compras'),('compra_items'),('gastos_importacion'),
  ('recepciones'),('recepcion_items'),
  ('productos'),('marcas'),('familias'),('subfamilias'),('tipos'),
  ('producto_equivalencias'),
  ('alertas'),('actividad')
) as t(tabla)
on conflict (tabla, rol) do nothing;

-- 5.5 · cobranzas.
insert into permisos_rol (tabla, rol, nota)
select t.tabla, 'cobranzas'::rol_usuario, 'cartera'
from (values
  ('pagos'),('gestiones_cobranza'),('comprobantes'),
  ('clientes'),('alertas'),('actividad')
) as t(tabla)
on conflict (tabla, rol) do nothing;

-- ###########################################################################
-- 6. MARCAS
-- ###########################################################################
insert into marcas (nombre, pais, segmento, descripcion, orden) values
  ('SKF','Suecia','premium','Líder mundial en rodamientos y lubricación',1),
  ('FAG','Alemania','premium','Schaeffler Group · rodamientos de alta precisión',2),
  ('INA','Alemania','premium','Schaeffler Group · agujas y elementos lineales',3),
  ('NSK','Japón','premium','Rodamientos japoneses de alta durabilidad',4),
  ('NTN','Japón','premium','Rodamientos y chumaceras japonesas',5),
  ('TIMKEN','EE.UU.','premium','Especialista mundial en rodamientos cónicos',6),
  ('KOYO','Japón','estandar','JTEKT · relación precio/calidad',7),
  ('NACHI','Japón','estandar','Rodamientos y herramientas industriales',8),
  ('THK','Japón','premium','Guías y rodamientos lineales de precisión',9),
  ('HIWIN','Taiwán','estandar','Guías lineales y husillos',10),
  ('FYH','Japón','estandar','Chumaceras y unidades de rodamiento',11),
  ('DODGE','EE.UU.','premium','Chumaceras de serie pesada y partidas',12),
  ('ASAHI','Japón','estandar','Unidades de rodamiento',13),
  ('ZWZ','China','economica','Rodamientos línea económica de alto volumen',14),
  ('LYC','China','economica','Rodamientos industriales línea económica',15),
  ('OPTIBELT','Alemania','premium','Fajas de transmisión y poleas',20),
  ('GATES','EE.UU.','premium','Fajas industriales y automotrices',21),
  ('KTR','Alemania','premium','Acoplamientos ROTEX y elastómeros',22),
  ('RINGFEDER','Alemania','premium','Bujes de fijación y acoplamientos',23),
  ('TSUBAKI','Japón','premium','Cadenas de transmisión y transporte',24),
  ('MOBIL','EE.UU.','premium','Lubricantes y grasas industriales',30),
  ('SIN MARCA','Perú','economica','Artículos sin marca identificada',99)
on conflict (nombre_norm) do update set
  pais = excluded.pais, segmento = excluded.segmento, orden = excluded.orden;

-- ###########################################################################
-- 7. JERARQUÍA DE PRODUCTO · 3 niveles
-- ###########################################################################
-- Vive en 008_taxonomia_rodatech.sql, no aquí.
--
-- Aquí había un árbol tentativo deducido de la reunión (9 familias,
-- 20 subfamilias). El 21/08/2026 el cliente mandó el suyo completo
-- (docs/ESTRUCTURA DE BASE DE PRODUCTOS.xlsx), así que ese manda y este se
-- retiró: dejar los dos habría llenado los desplegables de familias que
-- Rodatech no usa.

-- ###########################################################################
-- 8. UBIGEO · CARGA PARCIAL
-- ###########################################################################
-- ATENCIÓN: esto NO es el ubigeo completo del Perú (son ~1.890 distritos).
-- Es la Lima Metropolitana + Callao + capitales de departamento, que cubre
-- >95 % de los despachos de Rodatech y deja el autocompletado usable desde el
-- primer día. El padrón INEI completo va en `007_seed_ubigeo.sql`, generado
-- desde el archivo oficial. Los códigos son INEI de 6 dígitos.
insert into ubigeo (codigo, departamento, provincia, distrito) values
  ('150101','Lima','Lima','Lima'),
  ('150102','Lima','Lima','Ancón'),
  ('150103','Lima','Lima','Ate'),
  ('150104','Lima','Lima','Barranco'),
  ('150105','Lima','Lima','Breña'),
  ('150106','Lima','Lima','Carabayllo'),
  ('150107','Lima','Lima','Chaclacayo'),
  ('150108','Lima','Lima','Chorrillos'),
  ('150109','Lima','Lima','Cieneguilla'),
  ('150110','Lima','Lima','Comas'),
  ('150111','Lima','Lima','El Agustino'),
  ('150112','Lima','Lima','Independencia'),
  ('150113','Lima','Lima','Jesús María'),
  ('150114','Lima','Lima','La Molina'),
  ('150115','Lima','Lima','La Victoria'),
  ('150116','Lima','Lima','Lince'),
  ('150117','Lima','Lima','Los Olivos'),
  ('150118','Lima','Lima','Lurigancho'),
  ('150119','Lima','Lima','Lurín'),
  ('150120','Lima','Lima','Magdalena del Mar'),
  ('150121','Lima','Lima','Pueblo Libre'),
  ('150122','Lima','Lima','Miraflores'),
  ('150123','Lima','Lima','Pachacámac'),
  ('150124','Lima','Lima','Pucusana'),
  ('150125','Lima','Lima','Puente Piedra'),
  ('150126','Lima','Lima','Punta Hermosa'),
  ('150127','Lima','Lima','Punta Negra'),
  ('150128','Lima','Lima','Rímac'),
  ('150129','Lima','Lima','San Bartolo'),
  ('150130','Lima','Lima','San Borja'),
  ('150131','Lima','Lima','San Isidro'),
  ('150132','Lima','Lima','San Juan de Lurigancho'),
  ('150133','Lima','Lima','San Juan de Miraflores'),
  ('150134','Lima','Lima','San Luis'),
  ('150135','Lima','Lima','San Martín de Porres'),
  ('150136','Lima','Lima','San Miguel'),
  ('150137','Lima','Lima','Santa Anita'),
  ('150138','Lima','Lima','Santa María del Mar'),
  ('150139','Lima','Lima','Santa Rosa'),
  ('150140','Lima','Lima','Santiago de Surco'),
  ('150141','Lima','Lima','Surquillo'),
  ('150142','Lima','Lima','Villa El Salvador'),
  ('150143','Lima','Lima','Villa María del Triunfo'),
  ('070101','Callao','Callao','Callao'),
  ('070102','Callao','Callao','Bellavista'),
  ('070103','Callao','Callao','Carmen de la Legua Reynoso'),
  ('070104','Callao','Callao','La Perla'),
  ('070105','Callao','Callao','La Punta'),
  ('070106','Callao','Callao','Ventanilla'),
  ('070107','Callao','Callao','Mi Perú'),
  ('040101','Arequipa','Arequipa','Arequipa'),
  ('130101','La Libertad','Trujillo','Trujillo'),
  ('140101','Lambayeque','Chiclayo','Chiclayo'),
  ('200101','Piura','Piura','Piura'),
  ('080101','Cusco','Cusco','Cusco'),
  ('120101','Junín','Huancayo','Huancayo'),
  ('210101','Puno','Puno','Puno'),
  ('060101','Cajamarca','Cajamarca','Cajamarca'),
  ('190101','Pasco','Pasco','Chaupimarca'),
  ('230101','Tacna','Tacna','Tacna'),
  ('180101','Moquegua','Mariscal Nieto','Moquegua'),
  ('020101','Áncash','Huaraz','Huaraz'),
  ('250101','Ucayali','Coronel Portillo','Calleria'),
  ('160101','Loreto','Maynas','Iquitos')
on conflict (codigo) do nothing;

-- Ahora que el ubigeo existe, se ancla la dirección fiscal de la empresa.
update empresa set ubigeo_codigo = '150101' where id = 1 and ubigeo_codigo is null;

-- ###########################################################################
-- 10. VERIFICACIÓN
-- ###########################################################################
do $$
declare
  v_unidades int; v_series int; v_permisos int; v_ubigeo int;
begin
  select count(*) into v_unidades from unidades_medida;
  select count(*) into v_series   from series_documento;
  select count(*) into v_permisos from permisos_rol;
  select count(*) into v_ubigeo   from ubigeo;

  raise notice 'Semilla aplicada: % unidades, % series, % permisos, % ubigeos',
    v_unidades, v_series, v_permisos, v_ubigeo;

  if v_unidades < 4 then raise exception 'Faltan unidades de medida'; end if;
  if v_series   < 8 then raise exception 'Faltan series de documento'; end if;
  if v_permisos < 30 then raise exception 'La matriz de permisos quedó incompleta'; end if;
end $$;
