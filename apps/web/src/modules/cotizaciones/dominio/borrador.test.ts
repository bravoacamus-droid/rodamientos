import { describe, expect, it } from "vitest";

import { armarBorrador, claveBorrador, esDistinto, leerBorrador, valeLaPena } from "./borrador";
import { estadoInicial, reducir } from "./constructor";

const ahora = new Date("2026-10-12T15:00:00Z");
const conLinea = reducir(estadoInicial("cli-1"), {
  tipo: "agregar",
  producto: { id: "p1", codigo: "6308", descripcion: "Rodamiento", marca: "SKF", precio_venta: 16.75 },
});

describe("el borrador de la cotización", () => {
  it("una clave para la nueva y otra por cada cotización que se edita", () => {
    expect(claveBorrador(null)).toBe("rodatech:cotizacion:nueva");
    expect(claveBorrador("abc")).toBe("rodatech:cotizacion:editar:abc");
  });

  it("vacía no vale la pena guardarla", () => {
    expect(valeLaPena(estadoInicial())).toBe(false);
    expect(valeLaPena(conLinea)).toBe(true);
  });

  it("se guarda y se lee igual", () => {
    const b = leerBorrador(JSON.stringify(armarBorrador(conLinea, null, ahora)), ahora);
    expect(b?.estado.lineas[0]?.codigo).toBe("6308");
  });

  it("uno de antes de las notas y los proveedores se completa", () => {
    const viejo = armarBorrador(conLinea, null, ahora);
    const linea = viejo.estado.lineas[0] as unknown as Record<string, unknown>;
    delete linea.proveedores;
    delete linea.nota;
    const b = leerBorrador(JSON.stringify(viejo), ahora);
    expect(b?.estado.lineas[0]?.proveedores).toEqual([]);
    expect(b?.estado.lineas[0]?.nota).toBe("");
  });

  it("roto, de otra versión o de hace más de dos semanas, no se ofrece", () => {
    expect(leerBorrador("{no es json", ahora)).toBeNull();
    expect(leerBorrador(JSON.stringify({ ...armarBorrador(conLinea, null, ahora), version: 99 }), ahora)).toBeNull();
    const viejo = armarBorrador(conLinea, null, new Date("2026-09-20T10:00:00Z"));
    expect(leerBorrador(JSON.stringify(viejo), ahora)).toBeNull();
  });

  it("si dice lo mismo que la pantalla, no hace falta el aviso", () => {
    const b = armarBorrador(conLinea, null, ahora);
    expect(esDistinto(b, conLinea)).toBe(false);
    expect(esDistinto(b, reducir(conLinea, { tipo: "cantidad", key: conLinea.lineas[0]?.key ?? "", valor: 9 }))).toBe(true);
  });
});
