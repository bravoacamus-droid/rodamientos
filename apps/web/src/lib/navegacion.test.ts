import { describe, expect, it } from "vitest";

import { CONFIGURACION, NAVEGACION, TABLERO, menuPara, puedeAbrir, rutaActiva } from "./navegacion";

/** Todos los permisos de todos los módulos: lo que devuelve mis_permisos() a gerencia. */
const TODO = NAVEGACION.concat(CONFIGURACION).flatMap((g) =>
  g.items.flatMap((i) => (i.permiso ? [`${i.permiso}:ver`, `${i.permiso}:crear`] : [])),
);
/** Ventas como quedó sembrada en la 143 (lo que toca al menú). */
const VENTAS = ["cotizaciones:ver", "guias:ver", "facturacion:ver", "cobranzas:ver", "clientes:ver", "productos:ver", "equivalencias:ver", "almacen:ver", "transporte:ver", "reportes:ver"];
const ALMACEN = ["cotizaciones:ver", "guias:ver", "facturacion:ver", "clientes:ver", "productos:ver", "equivalencias:ver", "almacen:ver", "transporte:ver", "reportes:ver"];

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
describe("el tablero y la configuración", () => {
  it("el tablero lo ve todo el mundo, tenga rol o no", () => {
    // Sin `roles` = abierto a cualquiera con sesión. Si alguien se lo pone
    // algún día, el usuario recién creado se quedaría sin portada.
    expect(TABLERO.roles).toBeUndefined();
    expect(TABLERO.ruta).toBe("/dashboard");
  });

  it("la configuración solo la ve quien manda, en sus cuatro pantallas", () => {
    // Ahí se cambian el RUC, las series y los correlativos: con la lista mal,
    // un vendedor podría mover el número desde el que se factura.
    //
    // Desde el 15/09 son varias pantallas y no una, así que la comprobación va
    // por cada una: el fallo que importa es que a UNA se le olvide la lista.
    //
    // El número exacto se comprueba a propósito, aunque haya que tocarlo al
    // añadir pantallas: es lo que obliga a decidir los roles de la nueva en
    // vez de dejarla entrar sin lista. Cuatro desde el 24/09, con «Permisos».
    expect(CONFIGURACION.items.length).toBe(4);
    // Desde la 143, «Datos de la empresa» va por la matriz (configuración);
    // SUNAT, usuarios y permisos siguen siendo de quien manda, fuera de ella.
    for (const item of CONFIGURACION.items) {
      expect(item.roles ?? item.permiso).toBeTruthy();
      if (!item.permiso) expect(item.roles).toEqual(["gerencia", "admin"]);
      else expect(item.permiso).toBe("configuracion");
    }
  });

  it("la configuración se enciende cuando estás dentro", () => {
    // Hasta el 15/09 no lo hacía: `rutaActiva` solo recorría `NAVEGACION` y la
    // configuración vive fuera, así que la comparación era contra `null` y el
    // ítem no se marcaba nunca. Se veía en cuanto se abría la pantalla.
    expect(rutaActiva("/configuracion/empresa")).toBe("/configuracion/empresa");
    expect(rutaActiva("/configuracion/sunat")).toBe("/configuracion/sunat");
    expect(rutaActiva("/configuracion/usuarios")).toBe("/configuracion/usuarios");
  });

  it("el tablero y sus reportes se encienden cada uno el suyo (07/10)", () => {
    // Los reportes cuelgan de `/dashboard/…`: sin el «más específico gana»,
    // el Tablero y el reporte se encenderían a la vez.
    expect(rutaActiva("/dashboard")).toBe("/dashboard");
    expect(rutaActiva("/reportes/clientes")).toBe("/reportes/clientes");
    expect(rutaActiva("/reportes/facturacion")).toBe("/reportes/facturacion");
    expect(rutaActiva("/reportes")).toBe("/reportes");
  });

  it("el tablero no se repite dentro de un grupo", () => {
    // Salió del menú al sacarlo fuera; si alguien lo devuelve, aparecería dos
    // veces y el marcado de ruta activa encendería dos ítems.
    const enGrupos = menuPara("gerencia", TODO).flatMap((g) => g.items.map((i) => i.ruta));
    expect(enGrupos).not.toContain(TABLERO.ruta);
  });

  it("la configuración es el ÚLTIMO grupo, y solo para quien manda", () => {
    // Luis, 15/09: *«debería estar abajo de Gestión, del sidebar»*. Estuvo
    // anclada al pie, fuera de los grupos, y parecía pegada por fuera.
    const deGerencia = menuPara("gerencia", TODO);
    expect(deGerencia[deGerencia.length - 1]?.titulo).toBe("Configuración");

    // Y a quien no tiene permiso no le sale el grupo entero: `menuPara` tira
    // los grupos que se quedan sin ítems, así que no hace falta esconderla a
    // mano desde el layout.
    const deVentas = menuPara("ventas", VENTAS).map((g) => g.titulo);
    expect(deVentas).not.toContain("Configuración");
  });
});

describe("qué ve cada rol", () => {
  it("gerencia lo ve todo", () => {
    const items = menuPara("gerencia", TODO).flatMap((g) => g.items.map((i) => i.ruta));
    expect(items).toContain("/compras/por-comprar");
    expect(items).toContain("/productos/cargar");
  });

  it("almacén no ve el abastecimiento ni la bandeja", () => {
    const items = menuPara("almacen", ALMACEN).flatMap((g) => g.items.map((i) => i.ruta));
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

  it("el menú sigue a la matriz, no a una lista a mano (143)", () => {
    // El QA, 20/10: quitar un permiso no cambiaba nada en la pantalla. Ahora
    // lo que no tiene «ver» no sale, y lo que sí, sale aunque el rol sea nuevo.
    const nuevo = menuPara("vendedor_junior", ["cotizaciones:ver", "compras:ver"]).flatMap((g) => g.items.map((i) => i.ruta));
    expect(nuevo).toContain("/cotizaciones");
    expect(nuevo).toContain("/compras");
    expect(nuevo).not.toContain("/clientes");
    // «Cargar productos» pide crear, no solo ver.
    const soloVe = menuPara("x", ["productos:ver"]).flatMap((g) => g.items.map((i) => i.ruta));
    expect(soloVe).toContain("/productos");
    expect(soloVe).not.toContain("/productos/cargar");
  });
});

describe("puedeAbrir: la puerta de la pantalla (143)", () => {
  const VENTAS = ["cotizaciones:ver", "clientes:ver", "productos:ver", "reportes:ver"];
  it("lo que no ve, no lo abre aunque escriba la dirección", () => {
    expect(puedeAbrir("/proveedores", "ventas", VENTAS)).toBe(false);
    expect(puedeAbrir("/compras/9f1c", "ventas", VENTAS)).toBe(false);
    expect(puedeAbrir("/reportes", "ventas", VENTAS)).toBe(false); // informe general
  });
  it("lo que ve, sí, con sus subrutas", () => {
    expect(puedeAbrir("/clientes/9f1c/editar", "ventas", VENTAS)).toBe(true);
    expect(puedeAbrir("/reportes/clientes", "ventas", VENTAS)).toBe(true);
  });
  it("lo que no cuelga del menú se abre siempre", () => {
    expect(puedeAbrir("/dashboard", "ventas", [])).toBe(true);
    expect(puedeAbrir("/perfil", "ventas", [])).toBe(true);
  });
  it("usuarios y permisos siguen siendo de quien manda", () => {
    expect(puedeAbrir("/configuracion/usuarios", "ventas", VENTAS)).toBe(false);
    expect(puedeAbrir("/configuracion/permisos", "admin", [])).toBe(true);
  });
});
