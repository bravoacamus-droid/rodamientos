/*
 * Service worker del ERP Rodatech (162).
 *
 * Hace DOS cosas y ninguna más: enseñar el aviso que manda el servidor y, al
 * tocarlo, abrir la pantalla a la que lleva.
 *
 * A propósito NO guarda nada en caché. Un service worker que cachea páginas
 * puede servir una pantalla de ayer —un stock, un saldo— como si fuera de
 * hoy, y en un ERP una cifra vieja que parece nueva es peor que ninguna. Sin
 * manejador de `fetch`, todas las peticiones van a la red como si este
 * archivo no existiera.
 */

self.addEventListener("install", () => {
  // La versión nueva entra sin esperar a que se cierren las pestañas viejas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : "" };
  }

  const titulo = datos.titulo || "Rodatech";
  // Solo rutas de dentro: lo que abre un aviso no puede ser otra web.
  const url =
    typeof datos.url === "string" && datos.url.startsWith("/") && !datos.url.startsWith("//")
      ? datos.url
      : "/alertas";

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || "",
      icon: "/iconos/icono-192.png",
      badge: "/iconos/insignia-96.png",
      tag: datos.etiqueta || undefined,
      renotify: Boolean(datos.etiqueta),
      // Lo urgente se queda a la vista hasta que se toque.
      requireInteraction: Boolean(datos.urgente),
      lang: "es-PE",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(
    (event.notification.data && event.notification.data.url) || "/alertas",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Si el ERP ya está abierto, se usa esa ventana en vez de abrir otra.
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          await v.focus();
          if ("navigate" in v) await v.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
