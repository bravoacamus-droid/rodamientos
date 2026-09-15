/**
 * Módulo de configuración: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

/*
  Tres pantallas y no una, desde el 15/09.

  Luis: *«que cada uno tenga su propio menú: datos de empresa, configuración de
  SUNAT con sus series y correlativos, usuarios; así tenerlo ordenado»*. Lo que
  había era una sola página con los tres bloques encadenados, y para llegar al
  de abajo —los usuarios, que es el que más se vuelve a abrir— había que pasar
  por encima de catorce series.
*/
export { default as PaginaConfigEmpresa } from "./ui/pagina-empresa";
export { default as PaginaConfigSunat } from "./ui/pagina-sunat";
export { default as PaginaConfigUsuarios } from "./ui/pagina-usuarios";

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
