/**
 * Qué hacer con un rechazo de SUNAT.
 *
 * Nace de un caso real: el 4 de agosto la factura F002-00000001 salió rechazada
 * con «1033 - El comprobante fue registrado previamente con otros datos», y la
 * pantalla ofrecía el botón de reenviar. Reenviarlo era inútil: manda el MISMO
 * número, y ese número ya está ocupado en SUNAT con otro contenido, así que la
 * respuesta iba a ser 1033 para siempre. El vendedor se queda pulsando contra un
 * muro sin que nadie le diga que el camino es emitir OTRO comprobante.
 *
 * La distinción que importa no es «error sí o no», es:
 *
 *   · REINTENTABLE — el documento está bien; falló el viaje o la configuración.
 *     Se arregla eso y el mismo comprobante sale. Reenviar tiene sentido.
 *   · DEFINITIVO — SUNAT rechazó el CONTENIDO o el número. Aquí los comprobantes
 *     se congelan al emitirse (migración 0093), así que sus datos ya no se pueden
 *     corregir: el camino es anular este y emitir uno nuevo.
 *
 * Las familias de códigos salen del catálogo de SUNAT: 0100-0199 son de acceso
 * (usuario, clave, certificado), 1000-1999 rechazos del comprobante, 2000-3999
 * excepciones, 4000+ observaciones sobre algo ya aceptado.
 */

export type Rechazo = {
  /** ¿Sirve de algo volver a mandar ESTE mismo comprobante? */
  reintentable: boolean;
  /** Qué le pasó, en una frase que pueda leer quien vende. */
  motivo: string;
  /** Qué tiene que hacer ahora. Sin esto, un mensaje de error es un callejón. */
  queHacer: string;
};

/** Códigos que sabemos leer con nombre propio, por lo que se han visto en producción. */
const CONOCIDOS: Record<string, Rechazo> = {
  // El caso que motivó todo esto.
  "1033": {
    reintentable: false,
    motivo: "Ese número de comprobante ya está registrado en SUNAT con otros datos.",
    queHacer:
      "No lo reenvíes: siempre dará el mismo error. Emite un comprobante NUEVO —saldrá con el número siguiente— y comprueba en el portal de SUNAT qué tiene registrado con ese número. Si la serie viene de otro sistema, cámbiala en Configuración → Facturación electrónica por una que nadie haya usado.",
  },
  // Credenciales: el documento está bien, falta arreglar el acceso.
  "0103": {
    reintentable: true,
    motivo: "SUNAT no reconoce el usuario SOL.",
    queHacer:
      "Revisa el usuario y la clave SOL en Configuración → Facturación electrónica. Tienen que ser los del usuario SECUNDARIO con permiso de facturación, no los del principal. Luego reenvía.",
  },
  "0102": {
    reintentable: true,
    motivo: "La clave SOL no es correcta.",
    queHacer: "Corrige la clave en Configuración → Facturación electrónica y reenvía.",
  },
  "0100": {
    reintentable: true,
    motivo: "SUNAT rechazó el acceso.",
    queHacer: "Revisa usuario, clave y certificado, y reenvía.",
  },
};

/**
 * Clasifica el código que devolvió SUNAT.
 *
 * `codigo` llega tal cual viene del CDR o del SOAP: puede ser "1033",
 * "soap-env:Client.1033" o "a:Client.0103". Se busca el número dentro.
 */
export function clasificarRechazo(codigo: string | null | undefined): Rechazo {
  const texto = String(codigo ?? "").trim();

  // El número relevante es el último grupo de dígitos: en "Client.1033" es 1033.
  const encontrado = texto.match(/(\d{3,4})(?!.*\d)/);
  const num = encontrado?.[1] ?? "";

  // Se resuelve en una sola lectura: con noUncheckedIndexedAccess, comprobar
  // el índice y volver a leerlo no garantiza que TypeScript lo estreche.
  const conocido = num ? CONOCIDOS[num] : undefined;
  if (conocido) return conocido;

  const n = Number(num);
  if (!Number.isFinite(n) || !num) {
    // Sin código no se puede afirmar nada; se deja reintentar, que es lo que no
    // cierra ninguna puerta. Un fallo de red llega así.
    return {
      reintentable: true,
      motivo: "SUNAT no respondió o la respuesta no se entendió.",
      queHacer: "Vuelve a enviarlo en un rato. Si sigue igual, avisa.",
    };
  }

  if (n >= 100 && n <= 199) {
    return {
      reintentable: true,
      motivo: "SUNAT rechazó el acceso (usuario, clave o certificado).",
      queHacer:
        "Revisa los datos en Configuración → Facturación electrónica y reenvía. El comprobante está bien; el problema es el acceso.",
    };
  }

  if (n >= 4000) {
    return {
      reintentable: false,
      motivo: "SUNAT lo aceptó con observaciones.",
      queHacer: "No hace falta hacer nada con este comprobante. Revisa el detalle para no repetir la observación.",
    };
  }

  // 1000-3999: el contenido o el número no le cuadran a SUNAT. Como el
  // comprobante ya está congelado, no se puede corregir: se anula y se emite otro.
  return {
    reintentable: false,
    motivo: "SUNAT rechazó el contenido del comprobante.",
    queHacer:
      "Reenviarlo no cambiará nada: los datos de un comprobante emitido no se pueden modificar. Corrige lo que marca el detalle y emite un comprobante NUEVO.",
  };
}

/** Atajo para la interfaz: ¿tiene sentido ofrecer el botón de reenviar? */
export function sePuedeReenviar(codigo: string | null | undefined): boolean {
  return clasificarRechazo(codigo).reintentable;
}
