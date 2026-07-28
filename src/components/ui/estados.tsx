import { Badge } from "./primitives";

type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info" | "solid";

const COTIZACION: Record<string, { label: string; tone: Tone }> = {
  borrador:   { label: "Borrador",   tone: "neutral" },
  enviada:    { label: "Enviada",    tone: "info" },
  aceptada:   { label: "Aceptada",   tone: "success" },
  convertida: { label: "Convertida", tone: "brand" },
  rechazada:  { label: "Rechazada",  tone: "danger" },
  vencida:    { label: "Vencida",    tone: "warning" },
};

const PEDIDO: Record<string, { label: string; tone: Tone }> = {
  pendiente:   { label: "Pendiente",     tone: "warning" },
  aprobado:    { label: "Aprobado",      tone: "info" },
  preparacion: { label: "En preparación", tone: "info" },
  despachado:  { label: "Despachado",    tone: "brand" },
  facturado:   { label: "Facturado",     tone: "success" },
  anulado:     { label: "Anulado",       tone: "danger" },
};

const COMPROBANTE: Record<string, { label: string; tone: Tone }> = {
  emitido: { label: "Emitido",    tone: "info" },
  pagado:  { label: "Pagado",     tone: "success" },
  parcial: { label: "Pago parcial", tone: "warning" },
  vencido: { label: "Vencido",    tone: "danger" },
  anulado: { label: "Anulado",    tone: "neutral" },
};

const OC: Record<string, { label: string; tone: Tone }> = {
  borrador:        { label: "Borrador",         tone: "neutral" },
  enviada:         { label: "Enviada",          tone: "info" },
  confirmada:      { label: "Confirmada",       tone: "brand" },
  transito:        { label: "En tránsito",      tone: "warning" },
  recibida_parcial:{ label: "Recibida parcial", tone: "warning" },
  recibida:        { label: "Recibida",         tone: "success" },
  anulada:         { label: "Anulada",          tone: "danger" },
};

const IMPORTACION: Record<string, { label: string; tone: Tone }> = {
  registrada:    { label: "Registrada",     tone: "neutral" },
  embarcada:     { label: "Embarcada",      tone: "info" },
  en_aduana:     { label: "En aduana",      tone: "warning" },
  nacionalizada: { label: "Nacionalizada",  tone: "brand" },
  recibida:      { label: "Recibida",       tone: "success" },
};

const STOCK: Record<string, { label: string; tone: Tone }> = {
  agotado: { label: "Agotado", tone: "danger" },
  critico: { label: "Crítico", tone: "danger" },
  bajo:    { label: "Bajo",    tone: "warning" },
  normal:  { label: "Normal",  tone: "success" },
};

const SEVERIDAD: Record<string, { label: string; tone: Tone }> = {
  critica: { label: "Crítica", tone: "danger" },
  alta:    { label: "Alta",    tone: "danger" },
  media:   { label: "Media",   tone: "warning" },
  baja:    { label: "Baja",    tone: "info" },
  info:    { label: "Info",    tone: "neutral" },
};

const ROL: Record<string, { label: string; tone: Tone }> = {
  admin:     { label: "Administración", tone: "brand" },
  gerencia:  { label: "Gerencia",       tone: "solid" },
  ventas:    { label: "Ventas",         tone: "info" },
  almacen:   { label: "Almacén",        tone: "warning" },
  compras:   { label: "Compras",        tone: "accent" },
  cobranzas: { label: "Cobranzas",      tone: "success" },
};

const MAPAS = {
  cotizacion: COTIZACION,
  pedido: PEDIDO,
  comprobante: COMPROBANTE,
  oc: OC,
  importacion: IMPORTACION,
  stock: STOCK,
  severidad: SEVERIDAD,
  rol: ROL,
} as const;

export function EstadoBadge({
  tipo,
  valor,
  size = "sm",
}: {
  tipo: keyof typeof MAPAS;
  valor: string | null | undefined;
  size?: "xs" | "sm" | "md";
}) {
  const mapa = MAPAS[tipo] as Record<string, { label: string; tone: Tone }>;
  const cfg = mapa[valor ?? ""] ?? { label: valor ?? "—", tone: "neutral" as Tone };
  return (
    <Badge tone={cfg.tone} size={size}>
      {cfg.label}
    </Badge>
  );
}

export function etiquetaEstado(tipo: keyof typeof MAPAS, valor: string | null | undefined) {
  const mapa = MAPAS[tipo] as Record<string, { label: string; tone: Tone }>;
  return mapa[valor ?? ""]?.label ?? valor ?? "—";
}

export const TIPO_COMPROBANTE: Record<string, string> = {
  factura: "Factura electrónica",
  boleta: "Boleta de venta",
  nota_venta: "Nota de venta",
  nota_credito: "Nota de crédito",
};

export const TIPO_MOVIMIENTO: Record<string, { label: string; tone: Tone }> = {
  ingreso:                { label: "Ingreso",        tone: "success" },
  salida:                 { label: "Salida",         tone: "danger" },
  ajuste_positivo:        { label: "Ajuste (+)",     tone: "info" },
  ajuste_negativo:        { label: "Ajuste (−)",     tone: "warning" },
  transferencia_entrada:  { label: "Transf. entrada",tone: "info" },
  transferencia_salida:   { label: "Transf. salida", tone: "warning" },
  regularizacion:         { label: "Regularización", tone: "brand" },
};
