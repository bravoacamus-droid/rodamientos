/**
 * Plantillas de mensaje: qué variables hay y cómo se sustituyen.
 *
 * Luis, 02/09: *«mensajes predeterminados que puede crear, así puede
 * enviar»*. El texto lo escribe Willy y se guarda en `plantillas_mensaje`
 * (migración 049); esto es lo único que la aplicación decide: qué se puede
 * poner entre llaves y qué pasa cuando alguien escribe algo que no existe.
 *
 * Todo puro. Lo que se prueba aquí acaba en un mensaje que se manda a un
 * proveedor con el nombre de Rodatech encima: un `{provedor}` mal escrito que
 * viajara tal cual es un mensaje que da vergüenza, y uno que se sustituyera
 * por vacío es peor, porque no se nota hasta que el proveedor pregunta.
 */

/** Una plantilla guardada, tal como se usa en toda la aplicación. */
export interface Plantilla {
  id: string;
  nombre: string;
  uso: Uso;
  canal: Canal;
  /** Solo el correo lo usa. */
  asunto: string | null;
  cuerpo: string;
  predeterminada: boolean;
  activa: boolean;
}

/** El enum `uso_plantilla` de Postgres. */
export type Uso = "pedido_precio" | "cotizacion" | "cobranza" | "general";

/** El enum `canal_mensaje`. */
export type Canal = "whatsapp" | "correo";

export const ETIQUETA_USO: Record<Uso, string> = {
  pedido_precio: "Pedir precio a un proveedor",
  cotizacion: "Mandar una cotización",
  cobranza: "Recordar un pago",
  general: "Cualquier cosa",
};

export const ETIQUETA_CANAL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  correo: "Correo",
};

export interface Variable {
  /** Sin llaves. En el texto se escribe `{clave}`. */
  clave: string;
  ayuda: string;
  ejemplo: string;
}

/**
 * Las que están disponibles en todas las plantillas.
 *
 * `{yo}` y `{empresa}` van aquí porque quien firma no cambia según a quién se
 * escriba, y sin firma un WhatsApp de un número desconocido no lo contesta
 * nadie.
 */
const COMUNES: Variable[] = [
  { clave: "empresa", ayuda: "La razón social de Rodatech.", ejemplo: "INVERSIONES RODATECH E.I.R.L." },
  { clave: "yo", ayuda: "El nombre de quien manda el mensaje.", ejemplo: "Willy Rodríguez" },
  { clave: "fecha", ayuda: "La fecha de hoy.", ejemplo: "02/09/2026" },
];

/**
 * Qué variables ofrece cada uso.
 *
 * Se separa por uso y no se ofrecen todas siempre porque una plantilla de
 * cobranza con `{items}` dentro produciría un hueco: en cobranza no hay ítems
 * que poner, y el mensaje saldría con la palabra `{items}` impresa.
 */
export const VARIABLES: Record<Uso, Variable[]> = {
  pedido_precio: [
    { clave: "proveedor", ayuda: "A quién se le pide.", ejemplo: "BEARING COMPANY S.A.C." },
    { clave: "items", ayuda: "La lista de lo que se pide, una línea por producto.", ejemplo: "· 6205-2RS SKF — 10 und" },
    ...COMUNES,
  ],
  cotizacion: [
    { clave: "cliente", ayuda: "A quién va dirigida.", ejemplo: "MINERA LOS ANDES S.A.C." },
    { clave: "numero", ayuda: "El número de la cotización.", ejemplo: "COT1-000123" },
    { clave: "total", ayuda: "El total, ya formateado.", ejemplo: "$ 1,240.50" },
    { clave: "valida_hasta", ayuda: "Hasta cuándo se respeta el precio.", ejemplo: "17/09/2026" },
    ...COMUNES,
  ],
  cobranza: [
    { clave: "cliente", ayuda: "A quién se le cobra.", ejemplo: "MINERA LOS ANDES S.A.C." },
    { clave: "documentos", ayuda: "Los comprobantes pendientes.", ejemplo: "F001-000045, F001-000052" },
    { clave: "total", ayuda: "Lo que debe, ya formateado.", ejemplo: "$ 3,480.00" },
    { clave: "dias", ayuda: "Días de atraso del más antiguo.", ejemplo: "42" },
    ...COMUNES,
  ],
  general: [...COMUNES],
};

/**
 * El tope de WhatsApp es 4.096 caracteres y **corta por el final**, que es
 * justo donde va la lista de códigos. El límite se pone antes, en 3.000, para
 * que quepa lo que crezca al sustituir las variables: `{items}` son ocho
 * caracteres en la plantilla y pueden ser trescientos en el mensaje.
 */
export const TOPE_PLANTILLA = 3000;
export const TOPE_WHATSAPP = 4096;

/** Las llaves que aparecen en un texto, en orden y sin repetir. */
export function variablesUsadas(cuerpo: string): string[] {
  const vistas = new Set<string>();
  // Solo letras, números y guion bajo: así `{6205}` de un código escrito entre
  // llaves por accidente no se confunde con una variable... y sí lo hace, pero
  // entonces sale en «no existe», que es lo que hay que decirle a quien edita.
  for (const m of cuerpo.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    const clave = m[1];
    if (clave) vistas.add(clave);
  }
  return [...vistas];
}

/** Las que se escribieron y no existen para ese uso. */
export function variablesDesconocidas(cuerpo: string, uso: Uso): string[] {
  const validas = new Set(VARIABLES[uso].map((v) => v.clave));
  return variablesUsadas(cuerpo).filter((c) => !validas.has(c));
}

/**
 * Sustituye las variables conocidas y deja las demás TAL CUAL.
 *
 * Dejarlas visibles es deliberado. Las otras dos opciones son peores:
 * borrarlas deja un mensaje con un hueco que nadie nota hasta que el proveedor
 * pregunta «¿de qué empresa me habla?», y fallar impediría mandar nada por una
 * errata. Así se ve el `{provedor}` en la vista previa, que es donde tiene que
 * verse.
 */
export function renderizar(
  cuerpo: string,
  valores: Readonly<Record<string, string>>,
): string {
  return cuerpo.replace(/\{([A-Za-z0-9_]+)\}/g, (entero, clave: string) => {
    const v = valores[clave];
    return v === undefined ? entero : v;
  });
}

export interface LineaPedido {
  codigo: string;
  descripcion?: string | null;
  marca?: string | null;
  cantidad: number;
  unidad?: string | null;
}

/**
 * La lista que sustituye a `{items}`.
 *
 * Un ítem por línea y con guion delante: WhatsApp no tiene tablas, y una lista
 * separada por comas de quince códigos no se lee. El código va PRIMERO porque
 * es lo que el proveedor busca en su sistema; la descripción va detrás y se
 * omite si no aporta.
 */
export function listaDeItems(lineas: readonly LineaPedido[]): string {
  return lineas
    .map((l) => {
      const cantidad = Number.isInteger(l.cantidad)
        ? String(l.cantidad)
        : l.cantidad.toFixed(2);
      const partes = [l.codigo];
      if (l.marca) partes.push(l.marca);
      if (l.descripcion) partes.push(l.descripcion);
      return `- ${partes.join(" · ")} — ${cantidad} ${l.unidad ?? "und"}`;
    })
    .join("\n");
}

export interface Aviso {
  /** `error` impide mandar; `atencion` solo se dice. */
  gravedad: "error" | "atencion";
  mensaje: string;
}

/**
 * Qué hay que decirle a quien escribe la plantilla, antes de guardarla.
 *
 * Devuelve avisos, no un booleano: «no se puede guardar» sin decir por qué es
 * el peor formulario posible.
 */
export function revisarPlantilla(
  cuerpo: string,
  uso: Uso,
  canal: Canal,
): Aviso[] {
  const avisos: Aviso[] = [];

  if (cuerpo.trim().length === 0) {
    avisos.push({ gravedad: "error", mensaje: "El mensaje está vacío." });
    return avisos;
  }

  if (cuerpo.length > TOPE_PLANTILLA) {
    avisos.push({
      gravedad: "error",
      mensaje: `El mensaje tiene ${cuerpo.length} caracteres y el tope son ${TOPE_PLANTILLA}. WhatsApp corta por el final, que es donde va la lista.`,
    });
  }

  const raras = variablesDesconocidas(cuerpo, uso);
  if (raras.length > 0) {
    avisos.push({
      gravedad: "atencion",
      mensaje: `Esto no son variables y se va a mandar tal cual: ${raras
        .map((r) => `{${r}}`)
        .join(", ")}.`,
    });
  }

  // Solo para el pedido de precios: sin la lista, el proveedor no sabe de qué
  // se le habla. No se bloquea —puede querer un mensaje de presentación— pero
  // sí se dice.
  if (uso === "pedido_precio" && !variablesUsadas(cuerpo).includes("items")) {
    avisos.push({
      gravedad: "atencion",
      mensaje: "El mensaje no lleva {items}: se mandaría sin decir qué productos son.",
    });
  }

  if (canal === "whatsapp" && !variablesUsadas(cuerpo).includes("yo")) {
    avisos.push({
      gravedad: "atencion",
      mensaje: "No lleva firma ({yo}). Un WhatsApp de un número desconocido y sin nombre no se contesta.",
    });
  }

  return avisos;
}

/** ¿Se puede guardar o mandar? */
export const sePuede = (avisos: readonly Aviso[]): boolean =>
  !avisos.some((a) => a.gravedad === "error");
