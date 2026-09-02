import type { NombreIcono } from "@/lib/navegacion";

/**
 * Los iconos del menú.
 *
 * Dibujados a mano en vez de traer una librería: son diecinueve trazos y una
 * dependencia de iconos completa pesa más que toda la barra lateral. Van con
 * `currentColor` para que hereden el estado activo sin duplicar reglas.
 *
 * Cada uno intenta decir algo del oficio: el catálogo es una etiqueta de
 * producto, el inventario son cajas apiladas, el kardex es un historial. El
 * de equivalencias son dos flechas que se cruzan, que es literalmente lo que
 * hace.
 */

const T = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const TRAZOS: Record<NombreIcono, React.ReactNode> = {
  // Tablero: cuatro paneles.
  tablero: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" {...T} />
      <rect x="14" y="3" width="7" height="5" rx="1.5" {...T} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" {...T} />
      <rect x="14" y="11" width="7" height="10" rx="1.5" {...T} />
    </>
  ),
  // Cotización: hoja con líneas y una cifra al pie.
  cotizacion: (
    <>
      <path d="M6 3h8l4 4v14H6z" {...T} />
      <path d="M14 3v4h4M9 12h6M9 16h4" {...T} />
    </>
  ),
  // Guía: camión.
  guia: (
    <>
      <path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z" {...T} />
      <circle cx="6" cy="18" r="1.8" {...T} />
      <circle cx="17" cy="18" r="1.8" {...T} />
    </>
  ),
  // Factura: comprobante con el borde dentado de abajo.
  factura: (
    <>
      <path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21z" {...T} />
      <path d="M9 8h6M9 12h6" {...T} />
    </>
  ),
  // Cobranza: billete.
  cobranza: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" {...T} />
      <circle cx="12" cy="12" r="2.5" {...T} />
      <path d="M6 12h.01M18 12h.01" {...T} />
    </>
  ),
  // Producto: etiqueta con su perforación.
  producto: (
    <>
      <path d="M20.6 12.6 12 21.2 3.4 12.6V3.4h9.2z" {...T} />
      <circle cx="8" cy="8" r="1.4" {...T} />
    </>
  ),
  // Cargar: hoja con flecha hacia arriba.
  cargar: (
    <>
      <path d="M6 3h8l4 4v14H6z" {...T} />
      <path d="M14 3v4h4M12 17v-6M9.5 13.5 12 11l2.5 2.5" {...T} />
    </>
  ),
  // Equivalencias: dos flechas que se cruzan.
  equivalencia: (
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" {...T} />
    </>
  ),
  // Cliente: persona.
  cliente: (
    <>
      <circle cx="12" cy="8" r="3.5" {...T} />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...T} />
    </>
  ),
  // Proveedor: nave.
  proveedor: (
    <>
      <path d="M3 21V9l9-6 9 6v12" {...T} />
      <path d="M9 21v-6h6v6M7 12h.01M17 12h.01" {...T} />
    </>
  ),
  // Inventario: cajas apiladas.
  inventario: (
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5z" {...T} />
      <path d="M3 8.5v7L12 20l9-4.5v-7M12 13v7" {...T} />
    </>
  ),
  // Kardex: historial, un reloj sobre una lista.
  kardex: (
    <>
      <path d="M4 5h9M4 10h6M4 15h5" {...T} />
      <circle cx="16" cy="15" r="5" {...T} />
      <path d="M16 12.5V15l1.7 1.2" {...T} />
    </>
  ),
  // Recepción: caja con flecha entrando.
  recepcion: (
    <>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" {...T} />
      <path d="M12 3v9M8.5 8.5 12 12l3.5-3.5" {...T} />
    </>
  ),
  // Ajuste: dos deslizadores.
  ajuste: (
    <>
      <path d="M5 4v16M19 4v16" {...T} />
      <circle cx="5" cy="9" r="2.2" {...T} />
      <circle cx="19" cy="15" r="2.2" {...T} />
    </>
  ),
  // Compra: carrito.
  compra: (
    <>
      <path d="M2 4h2.2l2.3 11h11l2-8H6" {...T} />
      <circle cx="8.5" cy="19" r="1.5" {...T} />
      <circle cx="16.5" cy="19" r="1.5" {...T} />
    </>
  ),
  // Por comprar: una lista con lo que falta marcado. No es un carrito:
  // pegado al de Compras, dos carritos no se distinguen de un vistazo, y
  // esta pantalla no es comprar, es saber qué falta.
  porcomprar: (
    <>
      <path d="M4 6h9M4 12h9M4 18h5" {...T} />
      <path d="M17.5 14v7M14 17.5h7" {...T} />
    </>
  ),
  // Precios: dos etiquetas de precio, que es de lo que va — comparar dos
  // ofertas de lo mismo. Un símbolo de moneda solo se confundiría con
  // cobranzas.
  precios: (
    <>
      <path d="M3 11.5V5a2 2 0 0 1 2-2h6.5L20 11.5 12.5 19 3 11.5Z" {...T} />
      <circle cx="7.5" cy="7.5" r="1.2" {...T} />
    </>
  ),
  // Importación: contenedor con el mundo detrás.
  importacion: (
    <>
      <circle cx="12" cy="12" r="9" {...T} />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18-2.5-2.6-2.5-15.4 0-18" {...T} />
    </>
  ),
  // Bitácora: un reloj con la aguja hacia atrás.
  bitacora: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" {...T} />
      <path d="M3 4v4h4M12 8v4l3 2" {...T} />
    </>
  ),
  // Reporte: barras.
  reporte: (
    <>
      <path d="M4 20h16" {...T} />
      <path d="M7 20v-6M12 20V6M17 20v-9" {...T} />
    </>
  ),
  // Alerta: campana.
  alerta: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" {...T} />
      <path d="M10.5 19a1.8 1.8 0 0 0 3 0" {...T} />
    </>
  ),
  // Configuración: engranaje simplificado.
  configuracion: (
    <>
      <circle cx="12" cy="12" r="3" {...T} />
      <path d="M12 2v3M12 19v3M22 12h-3M5 12H2M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" {...T} />
    </>
  ),
};

export function IconoNav({
  nombre,
  className = "size-4",
}: {
  nombre: NombreIcono;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}
