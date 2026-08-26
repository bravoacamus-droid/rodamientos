/**
 * Reglas puras del cross-reference.
 *
 * La que importa es `parCanonico`. Todo lo demás es presentación.
 */

import {
  ETIQUETA_ORIGEN,
  type OrigenSustituto,
  type Sustituto,
} from "./tipos";

/**
 * Una equivalencia es una relación SIN dirección, y la tabla sí la tiene.
 *
 * `producto_equivalencias` guarda `(producto_id, equivalente_id)` con un único
 * `unique (producto_id, equivalente_id)`. Esa restricción impide repetir el
 * par en el mismo sentido, pero no en el contrario: A→B y B→A entran las dos.
 * Y `sustitutos_de()` une los dos sentidos, así que el mismo producto saldría
 * dos veces.
 *
 * La solución es no depender de que nadie se acuerde: antes de guardar, el par
 * se ordena siempre igual —el uuid menor primero— y entonces la restricción
 * que ya existe sí impide el duplicado, venga por donde venga.
 *
 * Se ordena como texto porque es lo que hace Postgres con `uuid` en un
 * `order by`, y así el orden de aquí y el de allá coinciden.
 */
export function parCanonico(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/** ¿Son el mismo par, mirado desde cualquiera de los dos lados? */
export function mismoPar(
  a: readonly [string, string],
  b: readonly [string, string],
): boolean {
  const [a1, a2] = parCanonico(a[0], a[1]);
  const [b1, b2] = parCanonico(b[0], b[1]);
  return a1 === b1 && a2 === b2;
}

/** Tono de la insignia según cuánto se está suponiendo. */
export function tonoOrigen(
  origen: OrigenSustituto,
): "success" | "brand" | "warning" | "neutral" {
  switch (origen) {
    case "equivalencia":
      return "success";
    case "misma_medida":
      return "brand";
    case "tipo":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * Agrupa por origen, en el orden de la cascada.
 *
 * El orden lo fija `prioridad`, que ya viene de la base: 1 es la equivalencia
 * declarada y 4 la subfamilia. Agrupar por el nombre y ordenar por el número
 * evita que un cambio en las etiquetas reordene la pantalla.
 */
export function agruparPorOrigen(
  sustitutos: readonly Sustituto[],
): Array<{ origen: OrigenSustituto; prioridad: number; sustitutos: Sustituto[] }> {
  const mapa = new Map<OrigenSustituto, { prioridad: number; lista: Sustituto[] }>();

  for (const s of sustitutos) {
    const grupo = mapa.get(s.origen);
    if (grupo) {
      grupo.lista.push(s);
      grupo.prioridad = Math.min(grupo.prioridad, s.prioridad);
    } else {
      mapa.set(s.origen, { prioridad: s.prioridad, lista: [s] });
    }
  }

  return [...mapa.entries()]
    .map(([origen, { prioridad, lista }]) => ({ origen, prioridad, sustitutos: lista }))
    .sort((a, b) => a.prioridad - b.prioridad);
}

/**
 * Resumen de una línea: «FAG · +12 % · 40 en stock».
 *
 * El signo del porcentaje se escribe siempre, también el `+`: sin él, un
 * «12 %» se lee como si diera igual el sentido, y el sentido es lo único que
 * importa cuando se está eligiendo qué ofrecer.
 */
export function resumenSustituto(s: Sustituto): string {
  const partes = [s.marca];

  if (s.diferencia_pct !== 0) {
    const signo = s.diferencia_pct > 0 ? "+" : "";
    partes.push(`${signo}${s.diferencia_pct.toFixed(1)} %`);
  } else {
    partes.push("mismo precio");
  }

  partes.push(s.stock > 0 ? `${s.stock} en stock` : "sin stock");

  return partes.join(" · ");
}

/**
 * Cuántos hay de cada peldaño, para decirlo en una línea.
 *
 * Sirve para lo que la pantalla tiene que responder de un vistazo: si lo que
 * sale es catálogo o es una suposición.
 */
export function contarPorOrigen(
  sustitutos: readonly Sustituto[],
): string {
  const grupos = agruparPorOrigen(sustitutos);
  if (grupos.length === 0) return "sin alternativas";

  return grupos
    .map((g) => `${g.sustitutos.length} ${ETIQUETA_ORIGEN[g.origen].toLowerCase()}`)
    .join(" · ");
}
