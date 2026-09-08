import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@rodatech/ui";

import "./globals.css";

/*
  Manrope, no Inter.

  Es la del rediseño de Luis (08/09), y para este proyecto es mejor elección
  que una preferencia estética: tiene la altura de x más alta y los contadores
  más abiertos, así que al mismo tamaño se lee más grande. Con un usuario que
  no ve bien, eso son milímetros que se notan.
*/
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rodatech ERP",
    template: "%s · Rodatech ERP",
  },
  description:
    "ERP comercial de Inversiones Rodatech E.I.R.L. — distribución de rodamientos y repuestos de mantenimiento industrial.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1214" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-PE" suppressHydrationWarning className={manrope.variable}>
      <body className="min-h-dvh bg-[var(--bg)] font-sans text-[var(--fg)] antialiased">
        {/*
          Arranca en CLARO y no sigue al sistema.

          Con `defaultTheme="system"` el ERP heredaba el tema de Windows: quien
          tuviera el suyo en oscuro abría la aplicación en azul sobre azul, con
          un logo pensado para fondo claro encima, y parecía una decisión de
          diseño en vez de un reflejo de su configuración.

          El oscuro sigue estando —los tokens están completos— pero ahora es
          una elección, con su interruptor en la cabecera.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
