import { describe, expect, it } from "vitest";

import {
  aQuienSeLeHabla,
  contactosListosParaGuardar,
  mismoNombre,
  nombreLlano,
  sinNombresRepetidos,
  unSoloPrincipal,
} from "./contactos";

/**
 * Lo que se prueba aquí es lo que impide que un alta con tres contactos acabe
 * con cero. Los contactos se insertan en UNA sentencia, así que cualquier
 * choque contra un índice único de la 035 se lleva por delante a los demás,
 * y para entonces la empresa ya está creada.
 */

const persona = (nombre: string, principal = false) => ({ nombre, principal });

describe("nombreLlano", () => {
  it("quita tildes y mayúsculas, como normalizar_texto", () => {
    expect(nombreLlano("JUAN PÉREZ")).toBe("juan perez");
  });

  it("convierte la ñ en n, igual que unaccent", () => {
    // Comprobado contra la base del cliente:
    //   select public.normalizar_texto('Íñigo Muñoz') → 'inigo munoz'
    // Si esto se desviara, el formulario dejaría pasar un nombre que el índice
    // único rechaza después, ya con la empresa creada.
    expect(nombreLlano("Íñigo Muñoz")).toBe("inigo munoz");
    expect(mismoNombre("Muñoz", "Munoz")).toBe(true);
  });

  it("recorta los extremos, que es lo único en que se aparta de Postgres", () => {
    // `normalizar_texto` NO recorta: devuelve '  maria angeles  '. Aquí sí, y
    // es seguro porque el esquema de la acción pasa todo nombre por trim antes
    // de insertar, así que en la base nunca hay uno con espacios de sobra.
    expect(nombreLlano("  María Ángeles  ")).toBe("maria angeles");
  });
});

describe("mismoNombre", () => {
  it("reconoce a la misma persona escrita de dos formas", () => {
    expect(mismoNombre("Juan Pérez", "JUAN PEREZ")).toBe(true);
    expect(mismoNombre("Juan Pérez ", "juan pérez")).toBe(true);
  });

  it("no confunde a dos personas distintas", () => {
    expect(mismoNombre("Juan Pérez", "Juan Peréz Díaz")).toBe(false);
    expect(mismoNombre("Ana", "Anna")).toBe(false);
  });
});

describe("sinNombresRepetidos", () => {
  it("conserva el primero de cada nombre", () => {
    const lista = [
      { nombre: "Juan Pérez", cargo: "Compras" },
      { nombre: "JUAN PEREZ", cargo: "Logística" },
      { nombre: "Ana Ríos", cargo: "Almacén" },
    ];
    expect(sinNombresRepetidos(lista)).toEqual([
      { nombre: "Juan Pérez", cargo: "Compras" },
      { nombre: "Ana Ríos", cargo: "Almacén" },
    ]);
  });

  it("deja en paz una lista sin repetidos", () => {
    const lista = [persona("Ana"), persona("Luis"), persona("Rosa")];
    expect(sinNombresRepetidos(lista)).toHaveLength(3);
  });

  it("aguanta la lista vacía", () => {
    expect(sinNombresRepetidos([])).toEqual([]);
  });
});

describe("unSoloPrincipal", () => {
  it("respeta al que viene marcado", () => {
    const r = unSoloPrincipal([persona("Ana"), persona("Luis", true), persona("Rosa")]);
    expect(r.map((c) => c.principal)).toEqual([false, true, false]);
  });

  it("corona al primero cuando no hay ninguno marcado", () => {
    const r = unSoloPrincipal([persona("Ana"), persona("Luis")]);
    expect(r.map((c) => c.principal)).toEqual([true, false]);
  });

  it("deja UNO cuando llegan dos marcados: el índice único solo admite uno", () => {
    const r = unSoloPrincipal([persona("Ana", true), persona("Luis", true)]);
    expect(r.filter((c) => c.principal)).toHaveLength(1);
    expect(r[0]?.principal).toBe(true);
  });

  it("no inventa un principal donde no hay contactos", () => {
    expect(unSoloPrincipal([])).toEqual([]);
  });
});

describe("contactosListosParaGuardar", () => {
  it("limpia repetidos y deja exactamente un principal", () => {
    const r = contactosListosParaGuardar([
      persona("Juan Pérez"),
      persona("Ana Ríos", true),
      persona("JUAN PEREZ"),
    ]);
    expect(r.map((c) => c.nombre)).toEqual(["Juan Pérez", "Ana Ríos"]);
    expect(r.filter((c) => c.principal)).toHaveLength(1);
    expect(r[1]?.principal).toBe(true);
  });

  it("si el repetido que se cae era el principal, corona a otro", () => {
    // El orden de las dos reglas es justo esto: limpiar primero y coronar
    // después. Al revés, la lista se quedaría sin principal y la cotización
    // saldría sin destinatario.
    const r = contactosListosParaGuardar([persona("Ana"), persona("ANA", true)]);
    expect(r).toHaveLength(1);
    expect(r[0]?.principal).toBe(true);
  });

  it("una lista vacía no se convierte en nada raro", () => {
    expect(contactosListosParaGuardar([])).toEqual([]);
  });
});

describe("aQuienSeLeHabla", () => {
  it("elige al principal", () => {
    expect(
      aQuienSeLeHabla([
        { nombre: "Rosa", principal: false, activo: true },
        { nombre: "Julio", principal: true, activo: true },
      ]),
    ).toEqual({ contacto: "Julio", contactos: 2 });
  });

  it("sin principal marcado, el primero activo", () => {
    // Pasa de verdad: al dar de baja al que era principal, el hueco queda
    // libre a propósito. Enseñar a alguien es mejor que enseñar a nadie.
    expect(
      aQuienSeLeHabla([
        { nombre: "Rosa", principal: false, activo: true },
        { nombre: "Julio", principal: false, activo: true },
      ]).contacto,
    ).toBe("Rosa");
  });

  it("ignora a los dados de baja, aunque fueran el principal", () => {
    expect(
      aQuienSeLeHabla([
        { nombre: "Julio", principal: true, activo: false },
        { nombre: "Rosa", principal: false, activo: true },
      ]),
    ).toEqual({ contacto: "Rosa", contactos: 1 });
  });

  it("un cliente sin gente no rompe nada", () => {
    // Es el caso de los 97 de Willy hasta que los llene.
    expect(aQuienSeLeHabla([])).toEqual({ contacto: null, contactos: 0 });
    expect(aQuienSeLeHabla(null)).toEqual({ contacto: null, contactos: 0 });
    expect(aQuienSeLeHabla(undefined)).toEqual({ contacto: null, contactos: 0 });
  });
});
