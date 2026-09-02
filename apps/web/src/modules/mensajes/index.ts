/**
 * Módulo de mensajes: superficie pública.
 *
 * El texto que sale de Rodatech hacia fuera —a un proveedor por WhatsApp, a un
 * cliente por correo— y las plantillas con las que se escribe.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { EditorPlantillas } from "./ui/editor-plantillas";

// Las reglas del texto son puras y están probadas. Las usan el editor, la
// pantalla de pedir precio y —cuando toque— cotizaciones y cobranzas.
export {
  ETIQUETA_CANAL,
  ETIQUETA_USO,
  TOPE_PLANTILLA,
  TOPE_WHATSAPP,
  VARIABLES,
  listaDeItems,
  renderizar,
  revisarPlantilla,
  sePuede,
  variablesDesconocidas,
  variablesUsadas,
  type Aviso,
  type Canal,
  type LineaPedido,
  type Plantilla,
  type Uso,
  type Variable,
} from "./dominio/plantillas";

export {
  canalesDisponibles,
  enlaceCorreo,
  enlaceWhatsapp,
} from "./dominio/enlaces";

export { plantillas, plantillasParaMandar } from "./api/consultas";
