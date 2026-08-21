-- ###########################################################################
-- 008 · TAXONOMÍA REAL DE RODATECH
-- ###########################################################################
--
-- GENERADO por scripts/importar-estructura.mjs a partir de
-- docs/ESTRUCTURA DE BASE DE PRODUCTOS.xlsx, el archivo que mandó el cliente el 21/08/2026.
-- No editar a mano: volver a correr el script.
--
-- 3 familias · 17 subfamilias · 61 tipos
--
-- Sustituye al árbol tentativo de 007_seed_maestros, que se dedujo de la
-- reunión. Este sale del propio cliente, así que manda este.

set local search_path = public, extensions;

insert into familias (codigo, nombre, orden) values
  ('ROD', 'RODAMIENTO', 1),
  ('CHU', 'CHUMACERA', 2),
  ('ACC', 'ACCESORIOS', 3)
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

insert into subfamilias (familia_id, codigo, nombre, orden)
select f.id, v.codigo, v.nombre, v.orden
from (values
  ('ROD', 'ROD-RIGBOL', 'RIGIDO DE BOLAS', 1),
  ('ROD', 'ROD-BOLINS', 'DE BOLAS DE INSERCION', 2),
  ('ROD', 'ROD-BOLROT', 'DE BOLAS A ROTULA', 3),
  ('ROD', 'ROD-BOLCON', 'DE BOLAS DE CONTACTO ANGULAR', 4),
  ('ROD', 'ROD-RODCIL', 'DE RODILLOS CILINDRICO', 5),
  ('ROD', 'ROD-RODESF', 'DE RODILLOS ESFERICOS', 6),
  ('ROD', 'ROD-RODCON', 'DE RODILLOS CONICOS', 7),
  ('ROD', 'ROD-AGUJAS', 'DE AGUJAS', 8),
  ('ROD', 'ROD-ROLDAN', 'ROLDANAS', 9),
  ('ROD', 'ROD-AXIALE', 'AXIALES', 10),
  ('CHU', 'CHU-PIE', 'DE PIE', 1),
  ('CHU', 'CHU-PARED', 'DE PARED', 2),
  ('CHU', 'CHU-TENSOR', 'TENSORA', 3),
  ('CHU', 'CHU-PARTID', 'PARTIDA', 4),
  ('ACC', 'ACC-MANGUI', 'MANGUITO', 1),
  ('ACC', 'ACC-OBTURA', 'OBTURADORES', 2),
  ('ACC', 'ACC-ANIFIJ', 'ANILLOS DE FIJACION', 3)
) as v(fam, codigo, nombre, orden)
join familias f on f.codigo = v.fam
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

insert into tipos (subfamilia_id, familia_id, codigo, nombre, orden)
select s.id, s.familia_id, v.codigo, v.nombre, v.orden
from (values
  ('ROD-RIGBOL', 'ROD-RIGBOL-01', 'RODAMIENTO RIGIDO DE BOLAS 1 HIL.', 1),
  ('ROD-RIGBOL', 'ROD-RIGBOL-02', 'RODAMIENTO RIGIDO DE BOLAS 2 HIL.', 2),
  ('ROD-BOLINS', 'ROD-BOLINS-01', 'RODAMIENTO DE BOLAS DE INSERCION MM.', 1),
  ('ROD-BOLINS', 'ROD-BOLINS-02', 'RODAMIENTO DE BOLAS DE INSERCION PULG.', 2),
  ('ROD-BOLROT', 'ROD-BOLROT-01', 'RODAMIENTO DE BOLAS A ROTULA AGUJ. CIL.', 1),
  ('ROD-BOLROT', 'ROD-BOLROT-02', 'RODAMIENTO DE BOLAS A ROTULA AGUJ. CONICO', 2),
  ('ROD-BOLCON', 'ROD-BOLCON-01', 'RODAMIENTO DE BOLAS DE CONTACTO ANG. DE 1 HIL.', 1),
  ('ROD-BOLCON', 'ROD-BOLCON-02', 'RODAMIENTO DE BOLAS DE CONTACTO ANG. DE 2 HIL.', 2),
  ('ROD-RODCIL', 'ROD-RODCIL-01', 'RODAMIENTO DE RODILLOS CILINDRICOS UN', 1),
  ('ROD-RODCIL', 'ROD-RODCIL-02', 'RODAMIENTO DE RODILLOS CILINDRICOS NJ', 2),
  ('ROD-RODCIL', 'ROD-RODCIL-03', 'RODAMIENTO DE RODILLOS CILINDRICOS NUP', 3),
  ('ROD-RODESF', 'ROD-RODESF-01', 'RODAMIENTO DE RODILLOS ESFERICOS AGUJ. CIL.', 1),
  ('ROD-RODESF', 'ROD-RODESF-02', 'RODAMIENTO DE RODILLOS ESFERICOS AGUJ. CONICO', 2),
  ('ROD-RODESF', 'ROD-RODESF-03', 'RODAMIENTO DE RODILLOS ESF. PARA APLIC. VIBRATORIAS', 3),
  ('ROD-RODCON', 'ROD-RODCON-01', 'RODAMIENTO DE RODILLOS CONICOS MM', 1),
  ('ROD-RODCON', 'ROD-RODCON-02', 'RODAMIENTO DE RODILLOS CONICOS CONO/PISTA', 2),
  ('ROD-RODCON', 'ROD-RODCON-03', 'CONO SOLO', 3),
  ('ROD-RODCON', 'ROD-RODCON-04', 'PISTA SOLA', 4),
  ('ROD-AGUJAS', 'ROD-AGUJAS-01', 'CORONA DE AGUJAS', 1),
  ('ROD-AGUJAS', 'ROD-AGUJAS-02', 'CASQUILLOS DE AGUJAS', 2),
  ('ROD-AGUJAS', 'ROD-AGUJAS-03', 'RODAMIENTO DE AGUJAS CON ARO INTERIOR', 3),
  ('ROD-AGUJAS', 'ROD-AGUJAS-04', 'RODAMIENTO DE AGUJAS SIN ARO INTERIOR', 4),
  ('ROD-AGUJAS', 'ROD-AGUJAS-05', 'RODAMIENTO DE AGUJAS/DE BOLAS DE CONTACTO', 5),
  ('ROD-AGUJAS', 'ROD-AGUJAS-06', 'RODAMIENTO DE AGUJAS/AXIAL DE BOLAS', 6),
  ('ROD-ROLDAN', 'ROD-ROLDAN-01', 'RODILLOS DE LEVA DE 1 HIL.', 1),
  ('ROD-ROLDAN', 'ROD-ROLDAN-02', 'RODILLOS DE LEVA DE 2 HIL.', 2),
  ('ROD-ROLDAN', 'ROD-ROLDAN-03', 'RODILLO DE APOYO SIN ARO INTERIOR', 3),
  ('ROD-ROLDAN', 'ROD-ROLDAN-04', 'RODILLO DE APOYO CON ARO INTERIOR', 4),
  ('ROD-AXIALE', 'ROD-AXIALE-01', 'RODAMIENTO AXIAL DE BOLAS SIMPLE EFECTO', 1),
  ('ROD-AXIALE', 'ROD-AXIALE-02', 'RODAMIENTO AXIAL DE BOLAS DOBLE EFECTO', 2),
  ('ROD-AXIALE', 'ROD-AXIALE-03', 'RODAMIENTO AXIAL DE RODILLOS CILINDRICOS', 3),
  ('ROD-AXIALE', 'ROD-AXIALE-04', 'RODAMIENTO AXIAL DE RODILLOS ESFERICOS', 4),
  ('ROD-AXIALE', 'ROD-AXIALE-05', 'RODAMIENTO AXIAL DE AGUJAS', 5),
  ('CHU-PIE', 'CHU-PIE-01', 'CHUMACERA DE PIE DE FE. FDDO', 1),
  ('CHU-PIE', 'CHU-PIE-02', 'CHUMACERA DE PIE TODO INOX.', 2),
  ('CHU-PIE', 'CHU-PIE-03', 'CHUMACERA DE PIE TERMOPLASTICA', 3),
  ('CHU-PIE', 'CHU-PIE-04', 'CHUMACERA DE PIE SEMI-PESADA', 4),
  ('CHU-PIE', 'CHU-PIE-05', 'CHUMACERA DE PIE SERIE PESADA', 5),
  ('CHU-PARED', 'CHU-PARED-01', 'CHUMACERA DE PARED DE BASE CUADRADA', 1),
  ('CHU-PARED', 'CHU-PARED-02', 'CHUMACERA DE PARED DE 2 AGUJEROS', 2),
  ('CHU-PARED', 'CHU-PARED-03', 'CHUMACERA DE PARED DE BASE CIRCULAR', 3),
  ('CHU-PARED', 'CHU-PARED-04', 'CHUMACERA DE PARED DE BASE TRIANGULAR', 4),
  ('CHU-PARED', 'CHU-PARED-05', 'CHUMACERA DE PARED TODO INOX.', 5),
  ('CHU-PARED', 'CHU-PARED-06', 'CHUMACERA DE PARED TERMOPLASTICA', 6),
  ('CHU-PARED', 'CHU-PARED-07', 'CHUMACERA DE PARED SEMI-PESADA', 7),
  ('CHU-PARED', 'CHU-PARED-08', 'CHUMACERA DE PARED SERIE PESADA', 8),
  ('CHU-TENSOR', 'CHU-TENSOR-01', 'CHUMACERA TENSORA DE FE. FUNDIDO', 1),
  ('CHU-TENSOR', 'CHU-TENSOR-02', 'CHUMACERA TENSORA TODO INOX.', 2),
  ('CHU-TENSOR', 'CHU-TENSOR-03', 'CHUMACERA TENSORA TERMOPLASTICA', 3),
  ('CHU-TENSOR', 'CHU-TENSOR-04', 'CHUMACERA TENSORA SEMI-PESADA', 4),
  ('CHU-TENSOR', 'CHU-TENSOR-05', 'CHUMACERA TENSORA SERIE PESADA', 5),
  ('CHU-PARTID', 'CHU-PARTID-01', 'SOPORTE PARTIDO DE FE. FDDO DE 2 AGUJ.', 1),
  ('CHU-PARTID', 'CHU-PARTID-02', 'SOPORTE PARTIDO DE FE. FDDO DE 4 AGUJ.', 2),
  ('ACC-MANGUI', 'ACC-MANGUI-01', 'MANGUITO DE MONTAJE MM.', 1),
  ('ACC-MANGUI', 'ACC-MANGUI-02', 'MANGUITO DE MONTAJE PULG.', 2),
  ('ACC-MANGUI', 'ACC-MANGUI-03', 'MANGUITO DE DESMONTAJE', 3),
  ('ACC-OBTURA', 'ACC-OBTURA-01', 'OBTURADOR DE NITRILO TIPO TSNG', 1),
  ('ACC-OBTURA', 'ACC-OBTURA-02', 'OBTURADOR DE ACERO TIPO LER', 2),
  ('ACC-OBTURA', 'ACC-OBTURA-03', 'OBTURADOR DE ACERO TACONITE', 3),
  ('ACC-ANIFIJ', 'ACC-ANIFIJ-01', 'ANILLO DE FIJACION SR', 1),
  ('ACC-ANIFIJ', 'ACC-ANIFIJ-02', 'ANILLO DE FIJACION FRB', 2)
) as v(sub, codigo, nombre, orden)
join subfamilias s on s.codigo = v.sub
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

-- Marcas vistas en las filas de ejemplo del archivo.
insert into marcas (nombre)
select v.nombre from (values
  ('FAG'),
  ('NTN'),
  ('SKF')
) as v(nombre)
on conflict (nombre_norm) do nothing;

-- ---------------------------------------------------------------------
do $$
declare v_fam int; v_sub int; v_tip int;
begin
  select count(*) into v_fam from familias;
  select count(*) into v_sub from subfamilias;
  select count(*) into v_tip from tipos;
  raise notice 'Taxonomia: % familias, % subfamilias, % tipos', v_fam, v_sub, v_tip;
  if v_fam < 3 then raise exception 'Faltan familias: % de 3', v_fam; end if;
  if v_sub < 17 then raise exception 'Faltan subfamilias: % de 17', v_sub; end if;
  if v_tip < 61 then raise exception 'Faltan tipos: % de 61', v_tip; end if;
end $$;
