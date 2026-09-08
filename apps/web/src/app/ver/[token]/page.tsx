import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cotización",
  // Fuera de Google. El enlace es para quien lo recibe, no para quien lo
  // busque: sin esto, una cotización con nombre de cliente y precios podría
  // acabar indexada y encontrarse por el buscador.
  robots: { index: false, follow: false },
};

export { PaginaCotizacionPublica as default } from "@/modules/cotizaciones";
