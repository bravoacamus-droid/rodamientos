import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rodatech ERP · Distribución de rodamientos y repuestos industriales",
    template: "%s · Rodatech ERP",
  },
  description:
    "ERP comercial de Inversiones Rodatech E.I.R.L.: catálogo con equivalencias entre marcas, " +
    "cotización inteligente, inventario con trazabilidad, facturación, landed cost de importación, " +
    "crédito y cobranzas, y tableros de proyección.",
  applicationName: "Rodatech ERP",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Rodatech ERP", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0E4C73" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1016" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('rodatech-theme')==='dark'?'dark':'light'}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
