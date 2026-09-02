/**
 * Las reglas de los contactos de un cliente, sin base de datos delante.
 *
 * Están aquí y no dentro de la Server Action por dos motivos. El primero es
 * que un fichero `"use server"` no puede exportar nada que no sea una acción,
 * así que allí no se podrían probar. El segundo es que estas reglas las
 * necesitan los DOS lados: el formulario para avisar antes de enviar, y el
 * servidor para no confiar en que el formulario avisó.
 *
 * Lo que se está copiando aquí son dos índices de la migración 035:
 *
 *     ux_cliente_contactos_nombre      (cliente_id, normalizar_texto(nombre))
 *     ux_cliente_contactos_principal   (cliente_id) where principal and activo
 *
 * Postgres es quien manda: si esto se equivoca, la inserción falla y no se
 * corrompe nada. Pero como los contactos del alta se insertan TODOS EN UNA
 * SENTENCIA, un solo nombre repetido tumbaría a los demás — y la empresa ya
 * estaría creada, así que la persona vería el cliente sin ningún contacto y
 * sin ninguna explicación.
 */

/**
 * Un nombre como lo ve el índice único: minúsculas y sin tildes.
 *
 * Es `normalizar_texto` de la 001 (`unaccent(lower(...))`) traducido a
 * JavaScript. NFD separa la letra de su tilde y `\p{Mn}` se come la tilde, que
 * es lo que hace `unaccent` para el alfabeto que aquí se teclea.
 *
 * La ñ se convierte en n, igual que hace `unaccent` con sus reglas por
 * defecto: NFD la separa en «n» + tilde combinante y `\p{Mn}` se lleva la
 * tilde. O sea que «Muñoz» y «Munoz» son la misma persona para el índice, que
 * es lo que decide Postgres y por tanto lo que hay que replicar aquí.
 *
 * Se aparta de la de Postgres en UNA cosa, y a sabiendas: esta recorta los
 * espacios de los extremos y `normalizar_texto` no. Comprobado contra la base:
 *
 *     select public.normalizar_texto('  María Ángeles  ')
 *     → '  maria angeles  '      (con los espacios)
 *
 * Es seguro porque ningún nombre llega sin recortar: el esquema de la acción
 * los pasa por `z.string().trim()` antes de insertar. Y la diferencia va en la
 * dirección buena — aquí se detectan como iguales dos nombres que la base
 * también verá iguales una vez guardados.
 *
 * En el resto no es idéntica para casos raros —`unaccent` tiene su propia tabla
 * de reglas— pero sí en el que importa: «JUAN PÉREZ» y «Juan Perez» son la
 * misma persona escrita dos veces.
 */
export const nombreLlano = (s: string): string =>
  s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().trim();

/** ¿Estos dos nombres son la misma persona para el índice único? */
export function mismoNombre(a: string, b: string): boolean {
  return nombreLlano(a) === nombreLlano(b);
}

/**
 * Quita los nombres repetidos, conservando el primero de cada uno.
 *
 * El primero y no el último a propósito: en el alta, la lista está en el orden
 * en que se escribieron, y el que se escribió primero es el que la persona vio
 * en pantalla mientras seguía añadiendo.
 */
export function sinNombresRepetidos<T extends { nombre: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((c) => {
    const llave = nombreLlano(c.nombre);
    if (vistos.has(llave)) return false;
    vistos.add(llave);
    return true;
  });
}

/**
 * Deja exactamente un principal.
 *
 * `ux_cliente_contactos_principal` admite UNO activo por cliente: si llegan
 * dos marcados —dos pestañas, un payload viejo, un JSON a mano— la inserción
 * entera falla con un 23505 que no significa nada para quien lo lee.
 *
 * Manda el primero que venga marcado. Si no viene ninguno lo es el primero de
 * la lista, porque una empresa CON contactos y SIN principal hace que la
 * cotización salga sin destinatario, y eso es lo que se quería arreglar.
 *
 * Una lista vacía se queda vacía: un cliente sin contactos es perfectamente
 * válido y no hay a quién coronar.
 */
export function unSoloPrincipal<T extends { principal: boolean }>(lista: T[]): T[] {
  if (lista.length === 0) return lista;
  const marcado = lista.findIndex((c) => c.principal);
  const elegido = marcado === -1 ? 0 : marcado;
  return lista.map((c, i) => ({ ...c, principal: i === elegido }));
}

/**
 * Las dos reglas juntas, que es como se aplican siempre.
 *
 * El orden importa: primero se quitan los repetidos y DESPUÉS se corona. Al
 * revés, si el repetido que se cae era el que llevaba la marca, la lista se
 * quedaría sin principal.
 */
export function contactosListosParaGuardar<T extends { nombre: string; principal: boolean }>(
  lista: T[],
): T[] {
  return unSoloPrincipal(sinNombresRepetidos(lista));
}

/* ------------------------------------------------------- A quién se le habla */

/** Lo mínimo para saber a quién va dirigido: lo que se trae embebido. */
export interface ContactoEmbebido {
  nombre: string;
  principal: boolean;
  activo: boolean;
}

/**
 * El contacto al que se le dirige un documento, y cuántos hay.
 *
 * Vive aquí y no dentro de cada consulta porque lo necesitan **dos módulos**:
 * el listado de clientes y la cotización, que lo usa como destinatario cuando
 * la propia cotización no trae uno escrito a mano.
 *
 * Tenerlo dos veces era el plan y salió mal: `cotizaciones` no se enteró de que
 * la 035 movía `contacto` a su propia tabla, siguió pidiéndole esa columna a
 * `clientes` —dos `as` de por medio, así que ni el typecheck ni el lint dijeron
 * nada— y la cotización se rompió al abrirla. Dos días después.
 *
 * La regla: el principal si lo hay; si no, el primero activo. Una empresa puede
 * quedarse sin principal marcado —al dar de baja al que lo era, el hueco queda
 * libre a propósito— y enseñar a alguien es mejor que enseñar a nadie.
 */
export function aQuienSeLeHabla(gente: readonly ContactoEmbebido[] | null | undefined): {
  contacto: string | null;
  contactos: number;
} {
  const activos = (gente ?? []).filter((g) => g.activo);
  const principal = activos.find((g) => g.principal) ?? activos[0] ?? null;
  return { contacto: principal?.nombre ?? null, contactos: activos.length };
}
