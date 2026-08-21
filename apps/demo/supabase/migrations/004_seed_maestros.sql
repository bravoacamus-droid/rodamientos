-- ============================================================================
-- ERP RODATECH · Semilla de maestros
-- ============================================================================

-- EMPRESA --------------------------------------------------------------------
insert into empresa (id, razon_social, nombre_comercial, ruc, direccion, distrito, provincia,
                     telefono, celular, email, email_ventas, web, logo_url, igv_porcentaje,
                     moneda_base, tipo_cambio, eslogan)
values (1, 'INVERSIONES RODATECH E.I.R.L.', 'Rodatech', '20601234567',
        'Jr. Los Huertos N° 2232', 'Lima 36', 'Lima',
        '01 608 5712', '981 191 487', 'wfernandez@rodatechperu.com', 'ventas@rodatechperu.com',
        'www.rodatechperu.com', '/logo.png', 18.00, 'PEN', 3.7550,
        'Su proveedor de soluciones en Rodamientos y más...')
on conflict (id) do update set
  razon_social = excluded.razon_social, nombre_comercial = excluded.nombre_comercial,
  direccion = excluded.direccion, telefono = excluded.telefono, celular = excluded.celular,
  email = excluded.email, email_ventas = excluded.email_ventas, eslogan = excluded.eslogan;

-- SERIES DE DOCUMENTO --------------------------------------------------------
insert into series_documento (tipo, serie, correlativo, descripcion) values
  ('factura','F001', 0, 'Factura electrónica · ventas a crédito y contado'),
  ('boleta','B001', 0, 'Boleta de venta electrónica'),
  ('nota_venta','NV01', 0, 'Nota de venta interna'),
  ('nota_credito','FC01', 0, 'Nota de crédito electrónica')
on conflict (tipo, serie) do nothing;

-- ALMACENES ------------------------------------------------------------------
insert into almacenes (codigo, nombre, direccion, responsable) values
  ('ALM-01','Almacén Central','Jr. Los Huertos N° 2232, Lima 36','Almacén Rodatech'),
  ('ALM-02','Tienda / Mostrador','Jr. Los Huertos N° 2232, Lima 36','Mostrador'),
  ('ALM-03','Tránsito Importación','Depósito temporal - Callao','Compras')
on conflict (codigo) do nothing;

-- MARCAS ---------------------------------------------------------------------
insert into marcas (nombre, pais, segmento, descripcion, orden) values
  ('SKF','Suecia','premium','Líder mundial en rodamientos y lubricación',1),
  ('FAG','Alemania','premium','Schaeffler Group · rodamientos de alta precisión',2),
  ('INA','Alemania','premium','Schaeffler Group · agujas y elementos lineales',3),
  ('NSK','Japón','premium','Rodamientos japoneses de alta durabilidad',4),
  ('NTN','Japón','premium','Rodamientos y chumaceras japonesas',5),
  ('TIMKEN','EE.UU.','premium','Especialista mundial en rodamientos cónicos',6),
  ('KOYO','Japón','estandar','JTEKT · excelente relación precio/calidad',7),
  ('NACHI','Japón','estandar','Rodamientos y herramientas industriales',8),
  ('THK','Japón','premium','Guías y rodamientos lineales de precisión',9),
  ('HIWIN','Taiwán','estandar','Guías lineales y husillos',10),
  ('FYH','Japón','estandar','Chumaceras y unidades de rodamiento',11),
  ('DODGE','EE.UU.','premium','Chumaceras de serie pesada y partidas',12),
  ('ASAHI','Japón','estandar','Unidades de rodamiento',13),
  ('FSQ','China','economica','Chumaceras y accesorios línea económica',14),
  ('ZWZ','China','economica','Rodamientos línea económica de alto volumen',15),
  ('LYC','China','economica','Rodamientos industriales línea económica',16),
  ('WBB','China','economica','Retenes y rodamientos línea económica',17),
  ('OPTIBELT','Alemania','premium','Fajas de transmisión y poleas',20),
  ('GATES','EE.UU.','premium','Fajas industriales y automotrices',21),
  ('MEGADYNE','Italia','estandar','Fajas sincrónicas y de transmisión',22),
  ('RINGFEDER','Alemania','premium','Bujes de fijación y acoplamientos',23),
  ('REXNORD','EE.UU.','premium','Acoplamientos y cadenas industriales',24),
  ('FALK','EE.UU.','premium','Acoplamientos de grilla y engranaje',25),
  ('KTR','Alemania','premium','Acoplamientos ROTEX y elastómeros',26),
  ('LOVEJOY','EE.UU.','estandar','Acoplamientos de mordaza y elastómeros',27),
  ('TSUBAKI','Japón','premium','Cadenas de transmisión de alta resistencia',28),
  ('CR','EE.UU.','premium','Chicago Rawhide · retenes y sellos',30),
  ('PARKER','EE.UU.','premium','Sellos, o-rings y elementos hidráulicos',31),
  ('TTO','Italia','estandar','Retenes y o-rings',32),
  ('LOCTITE','EE.UU.','premium','Adhesivos y selladores industriales',40),
  ('WD-40','EE.UU.','premium','Lubricantes y penetrantes multiuso',41),
  ('CRC','EE.UU.','premium','Químicos de mantenimiento industrial',42),
  ('WURTH','Alemania','premium','Químicos y consumibles industriales',43),
  ('STANLEY','EE.UU.','estandar','Herramientas manuales',44),
  ('GENERICO','—','economica','Ferretería y consumibles de línea general',99)
on conflict (nombre) do nothing;

-- CATEGORÍAS -----------------------------------------------------------------
insert into categorias (nombre, slug, descripcion, icono, orden) values
  ('Rodamientos','rodamientos','Rígidos de bolas, rodillos, cónicos, rótula, axiales y agujas','circle-dot',1),
  ('Rodamientos Lineales','lineales','Guías, rieles, patines y rodamientos lineales','move-horizontal',2),
  ('Chumaceras','chumaceras','Unidades completas, termoplásticas, partidas y serie pesada','box',3),
  ('Fajas y Poleas','fajas-poleas','Fajas en V, sincrónicas, acanaladas, poleas y bujes','disc-3',4),
  ('Cadenas y Piñones','cadenas-pinones','Cadenas ASA/BS, piñones, bujes y aditamentos','link',5),
  ('Acoplamientos','acoplamientos','Acoplamientos completos y elastómeros','unlink',6),
  ('Retenes y Sellos','retenes-sellos','Retenes, o-rings, anillos seeger y sellos mecánicos','circle',7),
  ('Lubricantes','lubricantes','Grasas, aceites y lubricantes industriales','droplets',8),
  ('Mantenimiento','mantenimiento','Adhesivos, selladores, penetrantes y químicos','spray-can',9),
  ('Ferretería','ferreteria','Abrazaderas, pernería, billas, soldadura y herramientas','wrench',10)
on conflict (slug) do nothing;

-- PROVEEDORES ----------------------------------------------------------------
insert into proveedores (codigo, ruc, razon_social, tipo, pais, moneda, direccion, contacto, email, telefono, dias_pago, lead_time_dias, marcas_provee) values
  ('PRV-001','20100047218','REPRESENTACIONES INDUSTRIALES DEL PACÍFICO S.A.C.','local','Perú','PEN','Av. Argentina 2085, Lima','Carlos Medina','ventas@ripacifico.com.pe','01 336 4477', 0, 2, array['SKF','FAG','INA']),
  ('PRV-002','20512334781','DISTRIBUIDORA RODASUR S.A.C.','local','Perú','PEN','Av. Nicolás Ayllón 3450, Ate','Rosa Quispe','rquispe@rodasur.pe','01 348 2200', 0, 1, array['NSK','NTN','KOYO']),
  ('PRV-003','20554478913','IMPORTACIONES TÉCNICAS ANDINAS E.I.R.L.','local','Perú','PEN','Jr. Paruro 1120, Lima','Miguel Torres','mtorres@itandinas.com','01 427 8890', 15, 3, array['TIMKEN','NACHI']),
  ('PRV-004','20601889227','TRANSMISIONES Y POTENCIA S.A.C.','local','Perú','PEN','Av. Colonial 2890, Callao','Ana Ruiz','aruiz@transpotencia.pe','01 452 1180', 0, 2, array['OPTIBELT','GATES','RINGFEDER']),
  ('PRV-005','20478112330','SELLOS Y EMPAQUETADURAS PERÚ S.A.','local','Perú','PEN','Av. Venezuela 1655, Lima','Jorge Ramos','jramos@sellosperu.com','01 425 6677', 0, 1, array['CR','PARKER','TTO']),
  ('PRV-006','20338877124','QUÍMICOS INDUSTRIALES LIMA S.A.C.','local','Perú','PEN','Av. Los Frutales 780, Ate','Patricia Vega','pvega@quimlima.pe','01 349 9010', 15, 2, array['LOCTITE','WD-40','CRC','WURTH']),
  ('PRV-007','20603341189','CADENAS Y TRANSMISIONES DEL NORTE S.A.C.','local','Perú','PEN','Av. Túpac Amaru 1290, Comas','Luis Salcedo','lsalcedo@catransnorte.pe','01 536 7712', 0, 3, array['TSUBAKI','REXNORD','KTR']),
  ('PRV-008',null,'NINGBO BEARING IMP & EXP CO., LTD.','importacion','China','USD','No. 128 Jiangnan Road, Ningbo','Wang Lei','sales@nbbearing.cn','+86 574 8765 4321', 0, 45, array['ZWZ','LYC','WBB']),
  ('PRV-009',null,'SHANGHAI PRECISION BEARINGS CO., LTD.','importacion','China','USD','Rm 1802, Pudong, Shanghai','Chen Yu','export@shprecision.cn','+86 21 5588 1200', 0, 50, array['ZWZ','FSQ']),
  ('PRV-010',null,'GLOBAL POWER TRANSMISSION PTE LTD','importacion','Singapur','USD','12 Tuas Ave 8, Singapore','Rajesh Kumar','rkumar@globalpt.sg','+65 6862 4400', 0, 35, array['FYH','ASAHI','LOVEJOY'])
on conflict (codigo) do nothing;

-- CLIENTES -------------------------------------------------------------------
insert into clientes (codigo, ruc, razon_social, nombre_comercial, direccion, distrito, sector, contacto, cargo_contacto, email, telefono, whatsapp, lista_precio, linea_credito, dias_credito) values
  ('CLI-001','20100128056','MINERA CERRO VERDE CONTRATISTAS S.A.C.','MCV Contratistas','Km 25 Carretera Yarabamba','Arequipa','Minería','Ing. Raúl Paredes','Jefe de Mantenimiento','rparedes@mcvcont.pe','054 283 100','987 654 321','fabrica', 45000, 40),
  ('CLI-002','20331098722','PAPELERA NACIONAL S.A.','Papelnac','Av. Néstor Gambetta 3200','Callao','Papeleras','Ing. Silvia Chávez','Superintendente Mtto.','schavez@papelnac.com.pe','01 577 2200','999 112 233','fabrica', 60000, 40),
  ('CLI-003','20544120987','PLÁSTICOS INDUSTRIALES DEL SUR S.A.C.','Plasindus','Av. Separadora Industrial 2890','Ate','Ind. Plástica','Sr. Marco Villanueva','Jefe de Planta','mvillanueva@plasindus.pe','01 348 7700','986 445 112','mayorista', 25000, 30),
  ('CLI-004','20100055237','TEXTILES SAN JACINTO S.A.','San Jacinto','Av. Argentina 5050','Callao','Textiles','Ing. Teresa Loayza','Mantenimiento','tloayza@sanjacinto.com.pe','01 613 4500','988 776 554','fabrica', 38000, 40),
  ('CLI-005','20603117742','AGROINDUSTRIAL VALLE VERDE S.A.C.','Valle Verde','Panamericana Norte Km 189','Huaral','Agroindustria','Sr. Julio Ramírez','Jefe de Mantenimiento','jramirez@valleverde.pe','01 246 8800','954 332 118','mayorista', 20000, 30),
  ('CLI-006','20477012345','PESQUERA MAR AZUL S.A.','Mar Azul','Av. Buenos Aires 1200','Chimbote','Pesquera','Ing. Óscar Delgado','Mantenimiento','odelgado@marazul.com.pe','043 321 400','943 887 221','mayorista', 30000, 30),
  ('CLI-007','20100174911','CEMENTOS LIMA SUR S.A.A.','Cemsur','Carretera Panamericana Sur Km 45','Villa El Salvador','Cementera','Ing. Fernando Ríos','Planeamiento Mtto.','frios@cemsur.com.pe','01 217 5000','997 445 663','fabrica', 75000, 40),
  ('CLI-008','20512778890','METALMECÁNICA ANDINA S.A.C.','Metandina','Av. Los Andes 780','San Juan de Lurigancho','Metalmecánica','Sr. Pedro Huamán','Gerente de Operaciones','phuaman@metandina.pe','01 388 1122','965 223 447','mayorista', 18000, 30),
  ('CLI-009','20601447712','EMBOTELLADORA ANDINA PERÚ S.A.','Embandina','Av. Republica de Panamá 4050','Surquillo','Alimentos y Bebidas','Ing. Carmen Salas','Jefa de Mantenimiento','csalas@embandina.pe','01 611 8900','942 118 776','fabrica', 50000, 40),
  ('CLI-010','20554889201','SERVICIOS INDUSTRIALES DEL CENTRO E.I.R.L.','Sindicen','Jr. Junín 455','Huancayo','Servicios Industriales','Sr. Willy Mendoza','Propietario','wmendoza@sindicen.pe','064 232 118','964 552 331','mayorista', 12000, 30),
  ('CLI-011','20100966033','MOLINOS DEL PERÚ S.A.','Molperú','Av. Elmer Faucett 3350','Callao','Alimentos','Ing. Diego Ferrer','Mantenimiento','dferrer@molperu.com.pe','01 574 3300','956 887 442','fabrica', 42000, 40),
  ('CLI-012','20603772110','MINERA SANTA ROSA S.A.C.','Santa Rosa','Carretera Central Km 132','La Oroya','Minería','Ing. Alberto Núñez','Superintendente','anunez@minerasantarosa.pe','064 391 200','973 114 558','fabrica', 55000, 40),
  ('CLI-013','20478330912','INDUSTRIAS PLÁSTICAS DEL NORTE S.A.C.','Plasnorte','Av. Panamericana Norte 4500','Trujillo','Ind. Plástica','Sr. Ricardo Vega','Jefe de Planta','rvega@plasnorte.pe','044 285 600','948 663 227','mayorista', 22000, 30),
  ('CLI-014','20544001872','TEXTIL LA UNIÓN S.A.C.','La Unión','Av. Universitaria 1890','Los Olivos','Textiles','Sra. Mónica Ortiz','Mantenimiento','mortiz@textilunion.pe','01 528 4477','951 774 336','mayorista', 16000, 30),
  ('CLI-015','20601005588','CONSTRUCTORA Y MINERA HUARI S.A.C.','Huari','Av. Javier Prado Este 5620','La Molina','Construcción','Ing. Gabriel Soto','Equipos','gsoto@huari.com.pe','01 437 9900','986 221 447','mayorista', 28000, 30),
  ('CLI-016','20100338741','FUNDICIÓN METALÚRGICA LIMA S.A.','Fumelsa','Av. Óscar R. Benavides 4120','Callao','Fundición','Sr. Aldo Peña','Mantenimiento','apena@fumelsa.com.pe','01 451 2200','943 558 117','mayorista', 24000, 30),
  ('CLI-017','20603990114','FRIGORÍFICO DEL PACÍFICO S.A.C.','Frigopac','Av. Néstor Gambetta 5800','Callao','Alimentos','Ing. Lucía Campos','Jefa de Mtto.','lcampos@frigopac.pe','01 553 7788','977 442 118','mayorista', 19000, 30),
  ('CLI-018','20512004471','TRANSPORTES Y GRÚAS DEL SUR S.A.C.','Tragrusur','Av. Los Faisanes 220','Chorrillos','Transporte','Sr. Enrique Bardales','Jefe de Taller','ebardales@tragrusur.pe','01 254 3311','962 337 885','mayorista', 15000, 30),
  ('CLI-019','20477662201','AGROEXPORTADORA SOL DE ICA S.A.C.','Sol de Ica','Fundo La Esperanza, Km 302','Ica','Agroindustria','Ing. Rosa Ayala','Mantenimiento','rayala@soldeica.pe','056 228 400','958 114 663','mayorista', 21000, 30),
  ('CLI-020','20601772339','ACEROS Y PERFILES DEL PERÚ S.A.','Acerper','Av. Néstor Gambetta 2200','Callao','Siderurgia','Ing. Manuel Cabrera','Superintendente Mtto.','mcabrera@acerper.com.pe','01 577 9900','996 447 223','fabrica', 65000, 40),
  ('CLI-021','20554330128','LAVANDERÍA INDUSTRIAL CLEANTEX E.I.R.L.','Cleantex','Av. Aviación 3820','San Borja','Servicios','Sra. Nelly Quiroz','Administradora','nquiroz@cleantex.pe','01 476 2200','945 663 118','mayorista', 8000, 30),
  ('CLI-022','20100447736','CERVECERÍA DEL SUR S.A.','Cersur','Av. Parra 300','Arequipa','Alimentos y Bebidas','Ing. Hugo Zapata','Mantenimiento','hzapata@cersur.com.pe','054 215 700','954 118 447','fabrica', 48000, 40),
  ('CLI-023','20603118824','MADERAS Y TRIPLAY AMAZONAS S.A.C.','Amazonas','Carretera Federico Basadre Km 8','Pucallpa','Maderera','Sr. Iván Tello','Jefe de Planta','itello@maderasamazonas.pe','061 575 300','963 447 112','mayorista', 14000, 30),
  ('CLI-024','20512889003','TALLER INDUSTRIAL SAN MARTÍN E.I.R.L.','San Martín','Jr. Los Olivos 1145','San Juan de Lurigancho','Servicios Industriales','Sr. Percy Guevara','Propietario','pguevara@tallersanmartin.pe','01 458 7712','931 224 668','mayorista', 6000, 30),
  ('CLI-025','20478001199','AVÍCOLA SANTA ELENA S.A.C.','Santa Elena','Panamericana Sur Km 68','Cañete','Agroindustria','Ing. Sandra Ruiz','Mantenimiento','sruiz@avicolasantaelena.pe','01 284 5500','947 336 221','mayorista', 17000, 30),
  ('CLI-026',null,'CLIENTE VARIOS - MOSTRADOR','Mostrador','Jr. Los Huertos 2232','Lima 36','Mostrador','Contado','—',null,null,null,'mayorista', 0, 0)
on conflict (codigo) do nothing;
