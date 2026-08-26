/**
 * Módulo de configuración: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaConfiguracion } from "./ui/pagina";

// Las reglas de numeración las va a querer cualquier pantalla que enseñe el
// próximo número de un documento antes de emitirlo.
export {
  avisosDelInicial,
  formatearNumero,
  huecosQueDeja,
  ordenarSeries,
  proximoCorrelativo,
  proximoNumero,
  serieValida,
  type Aviso,
} from "./dominio/serie";

export {
  AYUDA_ROL,
  ETIQUETA_ROL,
  ETIQUETA_TIPO_DOCUMENTO,
  ROLES,
  TIPOS_FISCALES,
  type ConteosCatalogo,
  type Empresa,
  type Rol,
  type SerieDocumento,
  type TipoDocumento,
  type Usuario,
} from "./dominio/tipos";
