import { expect, test as preparar } from "@playwright/test";

/**
 * Inicia sesión una vez y guarda el estado para el resto de las pruebas.
 *
 * Es el proyecto `preparacion` de `playwright.config.ts`, y del que dependen
 * los demás. Pasar por el login en cada prueba costaría unos segundos por
 * prueba y, peor, convertiría cualquier fallo del login en un fallo de todo,
 * sin decir cuál es cuál.
 *
 * Entra por el ATAJO de desarrollo, no tecleando la contraseña: así no hay
 * ninguna credencial escrita en el repositorio. El atajo solo existe fuera de
 * producción o con `RODATECH_ATAJOS=1`, y se borra en la entrega.
 */

const ESTADO = "e2e/.auth/usuario.json";

preparar("iniciar sesión como gerencia", async ({ page }) => {
  await page.goto("/login");

  const atajo = page.getByRole("button", { name: /Gerencia/i });

  // Si no hay atajos, el mensaje tiene que decir POR QUÉ. Sin esto, el fallo
  // sería «no encontré un botón» y a nadie se le ocurriría mirar el `.env`.
  await expect(
    atajo,
    "No aparecen los atajos de acceso. Hacen falta RODATECH_ATAJOS=1 y " +
      "RODATECH_DEV_PASSWORD en el entorno, y las cuentas sembradas con " +
      "`pnpm db:usuarios`.",
  ).toBeVisible();

  await atajo.click();

  // Se espera al TABLERO, no a que la URL cambie: el login redirige y la
  // sesión no está lista del todo hasta que la primera página protegida
  // renderiza. Guardar el estado antes deja una cookie a medias.
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: ESTADO });
});
