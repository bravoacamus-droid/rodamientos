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
  { ruta: "/alertas", titulo: /Alertas/i },
  { ruta: "/equivalencias", titulo: /Equivalencias/i },
  { ruta: "/configuracion", titulo: /Configuración/i },
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

/**
 * El cross-reference con un producto de verdad.
 *
 * La prueba de arriba solo abre `/equivalencias` vacía, que es el camino sin
 * consultas. Lo que puede romperse es la otra mitad: `sustitutos_de()` y la
 * lectura de las declaradas, que lleva una desambiguación de claves foráneas
 * de PostgREST —dos relaciones distintas a la misma tabla— y ese es
 * exactamente el tipo de consulta que falla con un PGRST200 en tiempo de
 * ejecución sin que TypeScript diga nada. Es el fallo de R0, otra vez.
 */
test("el cross-reference abre con un producto de verdad", async ({ page }) => {
  await page.goto("/productos");

  const hrefs = await page
    .locator("a")
    .evaluateAll((nodos) =>
      nodos.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
  const ficha = hrefs.find((h) => /^\/productos\/[0-9a-f-]{36}$/.test(h));

  test.skip(!ficha, "No hay ningún producto en el catálogo.");

  const id = ficha!.split("/").pop();
  await page.goto(`/equivalencias?producto=${id}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Equivalencias/i);

  const cuerpo = await page.locator("body").innerText();
  for (const señal of SEÑALES_DE_ERROR) {
    expect(cuerpo, `El cross-reference enseña «${señal}»`).not.toContain(señal);
  }
});

/**
 * La trazabilidad de un producto de verdad.
 *
 * Es la pantalla con más consultas distintas del ERP —cuatro uniones en la
 * vista, más un RPC que devuelve JSON— y todas se cruzan con tablas que
 * pueden estar vacías. El caso que más fácil se rompe no es el producto con
 * historia, es el que no tiene ninguna: ahí la mitad de las respuestas son
 * null y el JSON llega con huecos.
 */
test("la trazabilidad de un producto abre y no esconde errores", async ({ page }) => {
  await page.goto("/productos");

  const hrefs = await page
    .locator("a")
    .evaluateAll((nodos) =>
      nodos.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
  const ficha = hrefs.find((h) => /^\/productos\/[0-9a-f-]{36}$/.test(h));

  test.skip(!ficha, "No hay ningún producto en el catálogo.");

  const fallosDeConsola: string[] = [];
  page.on("pageerror", (e) => fallosDeConsola.push(e.message));

  await page.goto(`${ficha!}/trazabilidad`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Trazabilidad/i);

  const cuerpo = await page.locator("body").innerText();
  for (const señal of SEÑALES_DE_ERROR) {
    expect(cuerpo, `La trazabilidad enseña «${señal}»`).not.toContain(señal);
  }
  expect(fallosDeConsola, "La trazabilidad lanzó errores de JavaScript").toEqual([]);
});

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

/**
 * Los informes con rango de fechas.
 *
 * Cinco RPC nuevos (027) y todos cruzan tablas que pueden estar vacías. El
 * caso que más fácil se rompe no es el rango con datos: es el vacío, donde la
 * mitad de las agregaciones dividen entre cero.
 */
for (const consulta of [
  "?atajo=hoy",
  "?atajo=anio",
  "?atajo=todo",
  "?desde=2026-08-20&hasta=2026-08-26&grano=dia",
  // Un rango en el que con seguridad no hay nada.
  "?desde=1999-01-01&hasta=1999-12-31&grano=mes",
  // Y basura en los parámetros: llegan de la URL, así que cualquiera puede
  // escribir lo que quiera en ellos.
  "?desde=ayer&hasta=mañana&grano=siglo&atajo=inventado",
]) {
  test(`/reportes${consulta} abre sin errores`, async ({ page }) => {
    const fallosDeConsola: string[] = [];
    page.on("pageerror", (e) => fallosDeConsola.push(e.message));

    const respuesta = await page.goto(`/reportes${consulta}`);
    expect(respuesta?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Informes/i);

    const cuerpo = await page.locator("body").innerText();
    for (const señal of SEÑALES_DE_ERROR) {
      expect(cuerpo, `/reportes${consulta} enseña «${señal}»`).not.toContain(señal);
    }
    expect(fallosDeConsola).toEqual([]);
  });
}

/**
 * El tablero comparte la barra de rango con los informes (26/08).
 *
 * Se prueba aparte porque no comparte las consultas: el tablero pide la serie
 * DOS veces —el periodo y el anterior, para la comparación— y esa segunda
 * llamada puede caer en fechas donde no hay nada.
 */
// Sin la cadena vacía: `/dashboard` a secas ya lo cubre la lista de PANTALLAS,
// y repetirlo aquí da dos pruebas con el mismo nombre, que Playwright rechaza.
for (const consulta of [
  "?atajo=hoy",
  "?atajo=todo",
  "?desde=2026-08-01&hasta=2026-08-26&grano=dia",
]) {
  test(`/dashboard${consulta} abre sin errores`, async ({ page }) => {
    const fallosDeConsola: string[] = [];
    page.on("pageerror", (e) => fallosDeConsola.push(e.message));

    await page.goto(`/dashboard${consulta}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Tablero/i);

    const cuerpo = await page.locator("body").innerText();
    for (const señal of SEÑALES_DE_ERROR) {
      expect(cuerpo, `/dashboard${consulta} enseña «${señal}»`).not.toContain(señal);
    }
    expect(fallosDeConsola).toEqual([]);
  });
}
