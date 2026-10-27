/**
 * Módulo de avisos al celular (162): la cola de `alertas` hacia Web Push.
 *
 * Lo público es el panel de «Mi perfil», su lectura y el recordatorio del
 * tablero. El envío lo llama solo `/api/avisos/enviar`, directamente desde
 * `api/cola.ts`.
 */

export { misAvisos, type MiAparato } from "./api/consultas";
export { PanelAvisos } from "./ui/panel-avisos";
export { RecordatorioAvisos } from "./ui/recordatorio";
