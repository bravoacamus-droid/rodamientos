/**
 * Módulo de transporte: superficie pública.
 *
 * El maestro de con quién y con qué se despacha. Lo que no esté aquí es
 * privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaTransporte } from "./ui/pagina";

// Las lee la guía para ofrecer el atajo del transporte privado.
export {
  transportePropioActivo,
  type ConductorMaestro,
  type VehiculoMaestro,
} from "./api/consultas";
