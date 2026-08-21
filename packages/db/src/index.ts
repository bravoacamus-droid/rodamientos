/**
 * Acceso a datos del ERP Rodatech.
 *
 * Tres clientes, con tres alcances distintos:
 *
 *   ./servidor    Server Components, Server Actions y route handlers.
 *                 Actúa como el usuario, RLS aplica. Es el que se usa siempre.
 *
 *   ./navegador   Componentes cliente. Solo lectura y realtime.
 *                 Las escrituras van por Server Actions, nunca por aquí.
 *
 *   ./admin       service_role. Salta RLS. Solo alta de usuarios,
 *                 y siempre detrás de exigirAdmin().
 *
 * Los subpaths están separados a propósito: "server-only" hace que el build
 * falle si el cliente de servidor o el de admin se cuelan en el bundle del
 * navegador. Importar desde aquí el barrel completo perdería esa garantía,
 * así que este índice solo reexporta tipos.
 */

export type * from "./tipos";
