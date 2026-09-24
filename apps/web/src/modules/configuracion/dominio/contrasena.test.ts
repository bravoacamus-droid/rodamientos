import { describe, expect, it } from "vitest";

import {
  ALFABETO,
  PAREJAS_QUE_SE_CONFUNDEN,
  generarContrasenaInicial,
  LARGO_CONTRASENA_GENERADA,
} from "./contrasena";

/** Bytes previsibles, para que el test no dependa del azar. */
function secuencia(...valores: number[]) {
  let i = 0;
  return (n: number) => {
    const salida = new Uint8Array(n);
    for (let k = 0; k < n; k += 1) {
      salida[k] = valores[i % valores.length] ?? 0;
      i += 1;
    }
    return salida;
  };
}

describe("generarContrasenaInicial", () => {
  it("da tres grupos de cuatro separados por guiones", () => {
    expect(generarContrasenaInicial()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("tiene el largo anunciado, sin contar los guiones", () => {
    const sinGuiones = generarContrasenaInicial().replace(/-/g, "");
    expect(sinGuiones).toHaveLength(LARGO_CONTRASENA_GENERADA);
  });

  /*
    El motivo de existir de este módulo: se dicta en voz alta a alguien que no
    ve bien. Si un día alguien "simplifica" el alfabeto a A-Z0-9, estos dos
    tests tienen que caerse.

    El invariante NO es «no salen estos caracteres» —el 8 sale, y está bien
    porque la B no está—: es que de cada pareja que se confunde quede un solo
    miembro.
  */
  it("del par que se confunde deja solo uno en el alfabeto", () => {
    for (const [letra, cifra] of PAREJAS_QUE_SE_CONFUNDEN) {
      const ambos = ALFABETO.includes(letra) && ALFABETO.includes(cifra);
      expect(ambos, `${letra} y ${cifra} están los dos`).toBe(false);
    }
  });

  it("no saca nada que no esté en el alfabeto", () => {
    for (let i = 0; i < 400; i += 1) {
      for (const c of generarContrasenaInicial().replace(/-/g, "")) {
        expect(ALFABETO).toContain(c);
      }
    }
  });

  it("descarta los bytes sesgados en vez de doblarlos con un módulo", () => {
    /*
      260 no existe en un byte, pero 250 sí y está por encima del tope
      (26 × 9 = 234). Con `% 26` habría salido una letra; aquí se descarta y se
      usa el siguiente, así que la salida es toda del byte bueno.
    */
    const clave = generarContrasenaInicial(secuencia(250, 0));
    expect(clave).toBe("AAAA-AAAA-AAAA");
  });

  it("no repite la misma contraseña dos veces seguidas", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i += 1) vistas.add(generarContrasenaInicial());
    expect(vistas.size).toBe(200);
  });
});
