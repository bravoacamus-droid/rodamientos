import { describe, expect, it } from "vitest";

import { CONFIGURACION, NAVEGACION, TABLERO, menuPara, rutaActiva } from "./navegacion";

/**
 * El menú es lo único que le dice a alguien dónde está dentro del ERP. Dos
 * ítems encendidos a la vez, o ninguno, se lee como que la aplicación se
 * perdió.
 */

describe("qué ítem se enciende", () => {
  it("el exacto", () => {
    expect(rutaActiva("/compras")).toBe("/compras");
    expect(rutaActiva("/clientes")).toBe("/clientes");
  });

  it("gana el más específico, no el primero que empieza igual", () => {
    // El caso que lo motivó: al añadir la bandeja se encendían «Compras» y
    // «Por comprar» a la vez.
    expect(rutaActiva("/compras/por-comprar")).toBe("/compras/por-comprar");
    expect(rutaActiva("/inventario/kardex")).toBe("/inventario/kardex");
    expect(rutaActiva("/inventario/ajuste")).toBe("/inventario/ajuste");
    expect(rutaActiva("/productos/cargar")).toBe("/productos/cargar");
  });

  it("una subruta que no está en el menú marca a su padre", () => {
    // El detalle de una compra no tiene ítem propio, pero mientras se mira
    // se sigue estando en Compras.
    expect(rutaActiva("/compras/9f1c")).toBe("/compras");
    expect(rutaActiva("/clientes/9f1c/editar")).toBe("/clientes");
  });

  it("una ruta que no es de nadie no enciende nada", () => {
    expect(rutaActiva("/login")).toBeNull();
    expect(rutaActiva("/")).toBeNull();
  });

  it("no se deja engañar por un prefijo que no es un tramo", () => {
    // `/comprasx` no está dentro de `/compras`, aunque empiece igual.
    expect(rutaActiva("/comprasx")).toBeNull();
  });

  it("nunca enciende dos: ninguna ruta del menú activa a otra", () => {
    const rutas = NAVEGACION.flatMap((g) => g.items.map((i) => i.ruta));
    for (const r of rutas) {
      expect(rutaActiva(r)).toBe(r);
    }
  });
});

/*
  El tablero y la configuración ya NO viven en los grupos (08/09).

  Salieron a `TABLERO` y `CONFIGURACION` porque en el rediseño de Luis van
  sueltos: uno arriba, como portada, y el otro anclado abajo. Los dos tests
  que los buscaban dentro de `menuPara()` fallaron, y hacían bien: eran una
  red que avisó de que la estructura había cambiado.

  Lo que garantizaban sigue garantizado, ahora donde de verdad vive la regla.
*/
describe("lo que va fuera de los grupos", () => {
  it("el tablero lo ve todo el mundo, tenga rol o no", () => {
    // Sin `roles` = abierto a cualquiera con sesión. Si alguien se lo pone
    // algún día, el usuario recién creado se quedaría sin portada.
    expect(TABLERO.roles).toBeUndefined();
    expect(TABLERO.ruta).toBe("/dashboard");
  });

  it("la configuración solo la ve quien manda", () => {
    // Ahí se cambian el RUC, las series y los correlativos: con la lista mal,
    // un vendedor podría mover el número desde el que se factura.
    expect(CONFIGURACION.roles).toEqual(["gerencia", "admin"]);
  });

  it("ninguno de los dos se repite dentro de un grupo", () => {
    // Salían del menú al sacarlos fuera; si alguien los devuelve, aparecerían
    // dos veces y el marcado de ruta activa encendería dos ítems.
    const enGrupos = menuPara("gerencia").flatMap((g) => g.items.map((i) => i.ruta));
    expect(enGrupos).not.toContain(TABLERO.ruta);
    expect(enGrupos).not.toContain(CONFIGURACION.ruta);
  });
});

describe("qué ve cada rol", () => {
  it("gerencia lo ve todo", () => {
    const items = menuPara("gerencia").flatMap((g) => g.items.map((i) => i.ruta));
    expect(items).toContain("/compras/por-comprar");
  });

  it("almacén no ve el abastecimiento ni la bandeja", () => {
    const items = menuPara("almacen").flatMap((g) => g.items.map((i) => i.ruta));
    expect(items).not.toContain("/compras/por-comprar");
    expect(items).not.toContain("/compras");
    expect(items).toContain("/recepciones");
  });

  it("sin rol conocido solo queda lo abierto a todos, y ningún grupo vacío", () => {
    const grupos = menuPara(null);
    for (const g of grupos) expect(g.items.length).toBeGreaterThan(0);
    const items = grupos.flatMap((g) => g.items.map((i) => i.ruta));
    expect(items).not.toContain("/compras");
  });
});
