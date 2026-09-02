/**
 * Módulo de alertas: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaAlertas } from "./ui/pagina";

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
  TIPOS_QUE_SE_GENERAN,
  type Alerta,
  type Familia,
  type FiltrosBandeja,
  type ResumenBandeja,
  type Severidad,
  type TipoAlerta,
} from "./dominio/tipos";
