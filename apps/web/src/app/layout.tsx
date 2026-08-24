import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@rodatech/ui";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="es-PE" suppressHydrationWarning className={inter.variable}>
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
