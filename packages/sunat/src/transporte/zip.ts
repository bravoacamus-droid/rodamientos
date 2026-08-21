/**
 * Empaquetado ZIP que exige SUNAT.
 *
 * El comprobante firmado se envía comprimido: un ZIP que contiene un único
 * archivo `<nombre>.xml`. La respuesta (applicationResponse) es otro ZIP con el
 * CDR dentro, llamado `R-<nombre>.xml`.
 */
import JSZip from "jszip";

/** Comprime el XML firmado en un ZIP y devuelve su contenido en base64. */
export async function comprimirComprobante(
  nombre: string,
  xmlFirmado: string,
): Promise<string> {
  const zip = new JSZip();
  zip.file(`${nombre}.xml`, xmlFirmado);
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

/**
 * Extrae el XML del CDR desde el ZIP de respuesta (base64) que devuelve SUNAT.
 * El CDR viene como `R-<nombre>.xml` dentro del ZIP.
 */
export async function extraerCdr(applicationResponseB64: string): Promise<string> {
  const zip = await JSZip.loadAsync(applicationResponseB64, { base64: true });
  // El CDR es el único .xml del ZIP (nombre R-<...>.xml).
  const archivo = Object.values(zip.files).find(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".xml"),
  );
  if (!archivo) {
    throw new Error("El ZIP de respuesta de SUNAT no contiene el CDR (.xml).");
  }
  return archivo.async("string");
}
