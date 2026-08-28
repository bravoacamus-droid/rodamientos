import { describe, expect, it } from "vitest";

import {
  estadoInicialBusqueda,
  reducirBusqueda,
  valeLaPenaBuscar,
  type EstadoBusqueda,
} from "./busqueda";

/**
 * La carrera, reproducida a mano.
 *
 * Es el único sitio donde se puede probar de verdad: en el navegador depende
 * de que la red se porte mal justo cuando estás mirando, y aquí se ordenan las
 * respuestas como se quiera.
 */

/** Atajo: lanza una consulta y devuelve su número. */
function lanzar<T>(estado: EstadoBusqueda<T>): [EstadoBusqueda<T>, number] {
  const n = estado.peticion + 1;
  const nuevo = reducirBusqueda(estado, { tipo: "lanzar", peticion: n });
  return [nuevo, nuevo.peticion];
}

describe("reducirBusqueda", () => {
  it("arranca sin resultados y sin estar buscando", () => {
    const e = estadoInicialBusqueda<string>();
    expect(e.resultados).toBeNull();
    expect(e.buscando).toBe(false);
  });

  it("pinta la respuesta de la consulta vigente", () => {
    const [e1, n1] = lanzar(estadoInicialBusqueda<string>());
    const e2 = reducirBusqueda(e1, {
      tipo: "responder",
      peticion: n1,
      respuesta: { ok: true, datos: ["6205"] },
    });
    expect(e2.resultados).toEqual(["6205"]);
    expect(e2.buscando).toBe(false);
  });

  it("DESCARTA la respuesta de una consulta que ya no es la última", () => {
    // Se teclea «620» y enseguida «6205»: dos consultas en vuelo.
    const [e1] = lanzar(estadoInicialBusqueda<string>());
    const [e2, n2] = lanzar(e1);

    // Vuelve la SEGUNDA primero, que es la que corresponde a lo escrito.
    const e3 = reducirBusqueda(e2, {
      tipo: "responder",
      peticion: n2,
      respuesta: { ok: true, datos: ["6205-2RS1"] },
    });
    expect(e3.resultados).toEqual(["6205-2RS1"]);

    // Y ahora llega tarde la primera. NO puede pisar nada: la caja dice
    // «6205» y enseñar resultados de «620» es como se agrega la línea
    // equivocada a una cotización.
    const e4 = reducirBusqueda(e3, {
      tipo: "responder",
      peticion: 1,
      respuesta: { ok: true, datos: ["6200", "6201", "6202"] },
    });
    expect(e4.resultados).toEqual(["6205-2RS1"]);
    expect(e4).toBe(e3); // ni siquiera vuelve a renderizar
  });

  it("un error tardío tampoco pisa a un resultado bueno", () => {
    const [e1] = lanzar(estadoInicialBusqueda<string>());
    const [e2, n2] = lanzar(e1);
    const e3 = reducirBusqueda(e2, {
      tipo: "responder",
      peticion: n2,
      respuesta: { ok: true, datos: ["6205"] },
    });
    const e4 = reducirBusqueda(e3, {
      tipo: "responder",
      peticion: 1,
      respuesta: { ok: false, error: "Sesión expirada." },
    });
    expect(e4.error).toBeNull();
    expect(e4.resultados).toEqual(["6205"]);
  });

  it("un error de la consulta vigente sí se enseña, con la lista vacía", () => {
    const [e1, n1] = lanzar(estadoInicialBusqueda<string>());
    const e2 = reducirBusqueda(e1, {
      tipo: "responder",
      peticion: n1,
      respuesta: { ok: false, error: "No se pudo consultar." },
    });
    expect(e2.error).toBe("No se pudo consultar.");
    // `[]` y no `null`: se buscó y no hay, que es distinto de no haber buscado.
    expect(e2.resultados).toEqual([]);
    expect(e2.buscando).toBe(false);
  });

  it("limpiar invalida lo que quede en vuelo", () => {
    const [e1, n1] = lanzar(estadoInicialBusqueda<string>());
    const e2 = reducirBusqueda(e1, { tipo: "limpiar", peticion: e1.peticion + 1 });
    // La respuesta de lo que se acaba de borrar llega después. Si se pintara,
    // la lista aparecería sola con la caja vacía.
    const e3 = reducirBusqueda(e2, {
      tipo: "responder",
      peticion: n1,
      respuesta: { ok: true, datos: ["6205"] },
    });
    expect(e3.resultados).toBeNull();
  });

  it("«sin resultados» es una lista vacía, no un null", () => {
    const [e1, n1] = lanzar(estadoInicialBusqueda<string>());
    const e2 = reducirBusqueda(e1, {
      tipo: "responder",
      peticion: n1,
      respuesta: { ok: true, datos: [] },
    });
    expect(e2.resultados).toEqual([]);
    expect(e2.resultados).not.toBeNull();
  });

  it("aguanta una ráfaga de tecleo con las respuestas al revés", () => {
    // Cinco consultas seguidas y las respuestas vuelven en orden INVERSO.
    let e = estadoInicialBusqueda<string>();
    const numeros: number[] = [];
    for (let i = 0; i < 5; i++) {
      const [siguiente, n] = lanzar(e);
      e = siguiente;
      numeros.push(n);
    }
    for (const n of [...numeros].reverse()) {
      e = reducirBusqueda(e, {
        tipo: "responder",
        peticion: n,
        respuesta: { ok: true, datos: [`respuesta-${n}`] },
      });
    }
    // Solo la última puede haber pintado.
    expect(e.resultados).toEqual(["respuesta-5"]);
  });
});

describe("valeLaPenaBuscar", () => {
  it("con menos de dos caracteres no se sale a la red", () => {
    expect(valeLaPenaBuscar("")).toBe(false);
    expect(valeLaPenaBuscar("6")).toBe(false);
    expect(valeLaPenaBuscar("  6  ")).toBe(false);
  });

  it("con dos o más, sí", () => {
    expect(valeLaPenaBuscar("62")).toBe(true);
    expect(valeLaPenaBuscar("  62  ")).toBe(true);
  });

  it("el mínimo se puede subir", () => {
    expect(valeLaPenaBuscar("62", 3)).toBe(false);
    expect(valeLaPenaBuscar("620", 3)).toBe(true);
  });
});
