/**
 * Módulo de inventario: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaInventario } from "./ui/pagina";
export { default as PaginaKardex } from "./ui/pagina-kardex";
export { default as PaginaAjusteInventario } from "./ui/pagina-ajuste";

// La hoja de conteo es un reducer PURO: se puede probar sin React, y el
// impacto valorizado lo va a querer el módulo de reportes.
export {
  aPayload,
  bloqueos,
  diferenciaDe,
  estadoInicial,
  impactoDe,
  reducir,
  type Accion,
  type EstadoConteo,
  type ImpactoConteo,
  type LineaConteo,
} from "./dominio/ajuste";

export {
  ETIQUETA_MOVIMIENTO,
  TIPOS_AJUSTE,
  type EstadoStock,
  type FilaKardex,
  type FilaReposicion,
  type FilaValorizacion,
  type FiltrosConteo,
  type FiltrosKardex,
  type ProductoContable,
  type ResumenInventario,
  type TipoAjuste,
  type TipoMovimiento,
} from "./dominio/tipos";
