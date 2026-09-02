import { describe, expect, it } from "vitest";

import { NAVEGACION, menuPara, rutaActiva } from "./navegacion";

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

describe("qué ve cada rol", () => {
  it("gerencia lo ve todo", () => {
    const items = menuPara("gerencia").flatMap((g) => g.items.map((i) => i.ruta));
    expect(items).toContain("/compras/por-comprar");
    expect(items).toContain("/configuracion");
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
    expect(items).toContain("/dashboard");
    expect(items).not.toContain("/compras");
  });
});
