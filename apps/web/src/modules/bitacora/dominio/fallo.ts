/**
 * Un fallo, dicho para quien no es técnico (auditoría, 21/10).
 *
 * «Qué ha pasado › Lo que se rompió» enseñaba el error en crudo —
 * `_api_consultas__WEBPACK_IMPORTED_MODULE_4__…`, «Loading chunk app/layout
 * failed»— y quien lo abre es Willy. La frase dice qué pasó y si hay que hacer
 * algo; el texto original sigue, plegado, para quien lo arregla.
 *
 * Por patrones del mensaje y del código, del más concreto al más general.
 */
export function fraseDelFallo(f: { mensaje: string; codigo: string | null; origen: string }): string {
  const texto = `${f.codigo ?? ""} ${f.origen} ${f.mensaje}`;

  if (/chunk|ChunkLoadError/i.test(texto)) {
    return "Una pantalla no terminó de cargar, casi siempre justo después de actualizar el sistema. Se arregla recargando la página.";
  }
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|network/i.test(texto)) {
    return "No se pudo conectar con un servicio de fuera: internet, SUNAT o la consulta de RUC y DNI.";
  }
  if (/42501|permission denied|row-level security|no autorizado|sin permiso/i.test(texto)) {
    return "Alguien intentó hacer algo que su rol no le permite. El sistema lo paró.";
  }
  if (/23505|duplicate key/i.test(texto)) {
    return "Se intentó guardar algo que ya existía (un código o un número repetido).";
  }
  if (/23503|23514|23502|violates|check constraint|not-null/i.test(texto)) {
    return "La base rechazó un dato que no cumplía sus reglas, y no se guardó.";
  }
  if (/PGRST|column .* does not exist|relation .* does not exist|function .* does not exist/i.test(texto)) {
    return "Una consulta a la base falló. Hay que revisarlo: puede faltar una actualización.";
  }
  return "Algo falló en el programa. No se perdió nada que ya estuviera guardado; hay que revisarlo.";
}
