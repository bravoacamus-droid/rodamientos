import { CircleCheck, CircleDot, TriangleAlert } from "lucide-react";

import { ETIQUETA_ETAPA, TONO_ETAPA, type Etapa } from "../dominio/etapa";

const ESTILO = {
  aviso: "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--fg)]",
  info: "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--fg)]",
  ok: "border-[var(--ok)] text-[var(--ok)]",
} as const;

/**
 * La etapa del pedido con su icono: el color no puede ser la única pista
 * (quien no distingue el ámbar del verde lee el icono y la palabra).
 */
export function InsigniaEtapa({ etapa, grande = false }: { etapa: Etapa; grande?: boolean }) {
  const tono = TONO_ETAPA[etapa];
  const Icono = tono === "ok" ? CircleCheck : tono === "aviso" ? TriangleAlert : CircleDot;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border font-semibold ${ESTILO[tono]} ${
        grande ? "px-3 py-2 text-base" : "px-2 py-0.5 text-sm"
      }`}
    >
      <Icono className={grande ? "size-5" : "size-4"} aria-hidden="true" />
      {ETIQUETA_ETAPA[etapa]}
    </span>
  );
}
