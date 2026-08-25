import { expect, test } from "@playwright/test";

/**
 * Que TODAS las pantallas abren y ninguna esconde un error.
 *
 * No mueve un solo dato, así que corre contra cualquier base sin ensuciarla —
 * por eso no llama a `exigirBaseDePruebas()`.
 *
 * Parece la prueba más tonta del proyecto y es la que más habría ahorrado. El
 * 25/08 la ficha de producto llevaba días rota por una relación inexistente
 * entre `productos` y `familias`; la pantalla enseñaba «No se pudo cargar el
 * producto · [object Object]» y nadie se enteró hasta que el cliente dijo «no
 * abre nada». Esta prueba lo habría cazado en el mismo commit.
 *
 * Por eso no comprueba solo que responda 200: comprueba que **no aparezca
 * ningún cartel de error**, que es distinto. Una página que devuelve 200 y
 * pinta «no se pudo cargar» está rota igual.
 */

/** Los textos con los que la aplicación avisa de que algo falló. */
const SEÑALES_DE_ERROR = [
  "No se pudo cargar",
  "No se pudieron cargar",
  "[object Object]",
  "Error desconocido",
  "Application error",
  "Unhandled Runtime Error",
];

const PANTALLAS: { ruta: string; titulo: RegExp }[] = [
  { ruta: "/dashboard", titulo: /Tablero|Resumen/i },
  { ruta: "/cotizaciones", titulo: /Cotizaciones/i },
  { ruta: "/cotizaciones/nueva", titulo: /cotización/i },
  { ruta: "/productos", titulo: /Productos/i },
  { ruta: "/productos/nuevo", titulo: /producto/i },
  { ruta: "/clientes", titulo: /Clientes/i },
  { ruta: "/clientes/nuevo", titulo: /cliente/i },
  { ruta: "/proveedores", titulo: /Proveedores/i },
  { ruta: "/proveedores/nuevo", titulo: /proveedor/i },
  { ruta: "/compras", titulo: /Compras/i },
  { ruta: "/recepciones", titulo: /Recepciones/i },
  { ruta: "/inventario", titulo: /Inventario|Valorización/i },
  { ruta: "/inventario/kardex", titulo: /Kardex/i },
  { ruta: "/inventario/ajuste", titulo: /Cuadrar|Ajuste/i },
  { ruta: "/facturacion", titulo: /Facturación/i },
  { ruta: "/facturacion/configuracion", titulo: /Configuración/i },
  { ruta: "/guias", titulo: /Guías/i },
  { ruta: "/cobranzas", titulo: /Cobranzas/i },
  { ruta: "/reportes", titulo: /Informes|Reportes/i },
];

for (const { ruta, titulo } of PANTALLAS) {
  test(`${ruta} abre sin errores`, async ({ page }) => {
    const fallosDeConsola: string[] = [];
    page.on("pageerror", (e) => fallosDeConsola.push(e.message));

    const respuesta = await page.goto(ruta);
    expect(respuesta?.status(), `${ruta} respondió ${respuesta?.status()}`).toBeLessThan(400);

    // El encabezado confirma que se renderizó la pantalla que toca y no un
    // redirección al login o a otra parte.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);

    const cuerpo = await page.locator("body").innerText();
    for (const señal of SEÑALES_DE_ERROR) {
      expect(cuerpo, `${ruta} enseña «${señal}»`).not.toContain(señal);
    }

    expect(fallosDeConsola, `${ruta} lanzó errores de JavaScript`).toEqual([]);
  });
}

/**
 * Las fichas de detalle, que es donde vivía el fallo de la ficha de producto.
 *
 * Se navega desde el listado en vez de con una URL fija: así la prueba no
 * depende de que exista un id concreto, y de paso comprueba que el ENLACE
 * funciona — que era la otra mitad del problema aquel día.
 */
const FICHAS: { listado: string; patronEnlace: RegExp; nombre: string }[] = [
  { listado: "/productos", patronEnlace: /^\/productos\/[0-9a-f-]{36}$/, nombre: "producto" },
  { listado: "/clientes", patronEnlace: /^\/clientes\/[0-9a-f-]{36}$/, nombre: "cliente" },
  { listado: "/compras", patronEnlace: /^\/compras\/[0-9a-f-]{36}$/, nombre: "compra" },
  { listado: "/guias", patronEnlace: /^\/guias\/[0-9a-f-]{36}$/, nombre: "guía" },
  { listado: "/facturacion", patronEnlace: /^\/facturacion\/[0-9a-f-]{36}$/, nombre: "comprobante" },
];

for (const { listado, patronEnlace, nombre } of FICHAS) {
  test(`la ficha de ${nombre} abre desde su listado`, async ({ page }) => {
    await page.goto(listado);

    const enlaces = page.locator("a").filter({ hasNotText: "" });
    const hrefs = await enlaces.evaluateAll((nodos) =>
      nodos.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    const primero = hrefs.find((h) => patronEnlace.test(h));

    // Sin datos no hay ficha que abrir, y eso NO es un fallo: la prueba
    // informa y sigue. Fallar aquí obligaría a sembrar datos para poder
    // ejecutar la suite, que es justo lo que la vuelve frágil.
    test.skip(!primero, `No hay ninguna ${nombre} en ${listado} para abrir.`);

    await page.goto(primero!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const cuerpo = await page.locator("body").innerText();
    for (const señal of SEÑALES_DE_ERROR) {
      expect(cuerpo, `La ficha de ${nombre} enseña «${señal}»`).not.toContain(señal);
    }
  });
}
