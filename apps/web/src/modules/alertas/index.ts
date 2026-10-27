/**
 * Módulo de alertas: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaAlertas } from "./ui/pagina";

// 161: el recuadro del tablero con lo que se queda atrás.
export { pendientesDelDia } from "./api/consultas";
export { resumirDelDia, type FilaDelDia } from "./dominio/del-dia";

// Las reglas son puras y las va a necesitar cualquier pantalla que enseñe
// alertas: el tablero, sin ir más lejos, ya cuenta las pendientes.
export {
  PESO_SEVERIDAD,
  agruparPorFamilia,
  familiaDe,
  haceCuanto,
  ordenarBandeja,
  tonoSeveridad,
} from "./dominio/alerta";

export {
  ETIQUETA_FAMILIA,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO,
  FAMILIAS,
  TIPOS_DEL_DIA_A_DIA,
  TIPOS_QUE_SE_GENERAN,
  type Alerta,
  type Familia,
  type FiltrosBandeja,
  type ResumenBandeja,
  type Severidad,
  type TipoAlerta,
} from "./dominio/tipos";
