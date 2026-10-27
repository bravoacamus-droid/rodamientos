import { CircleCheck, CircleDot, TriangleAlert } from "lucide-react";

import { TONO_ETAPA, textoEtapa, type DespachoDelPedido, type Etapa } from "../dominio/etapa";

const ESTILO = {
  aviso: "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--fg)]",
  info: "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--fg)]",
  ok: "border-[var(--ok)] text-[var(--ok)]",
} as const;

/**
 * La etapa del pedido con su icono: el color no puede ser la única pista
 * (quien no distingue el ámbar del verde lee el icono y la palabra).
 */
export function InsigniaEtapa({
  etapa,
  grande = false,
  despacho,
}: {
  etapa: Etapa;
  grande?: boolean;
  /** Con él, «Salió una parte: faltan 4 de 10» (161). */
  despacho?: DespachoDelPedido | null;
}) {
  const tono = TONO_ETAPA[etapa];
  const Icono = tono === "ok" ? CircleCheck : tono === "aviso" ? TriangleAlert : CircleDot;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border font-semibold ${ESTILO[tono]} ${
        grande ? "px-3 py-2 text-base" : "px-2 py-0.5 text-sm"
      }`}
    >
      <Icono className={grande ? "size-5" : "size-4"} aria-hidden="true" />
      {textoEtapa(etapa, despacho)}
    </span>
  );
}
