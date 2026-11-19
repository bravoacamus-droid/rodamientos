import type { EstadoStock, FilaReposicion } from "./tipos";

/**
 * Los filtros de «Reposición y sobrestock» (19/11).
 *
 * Luis: *«las listas están muy largas, todo de igual»*. Eran cien filas
 * seguidas, del negativo al sobrestock, sin forma de quedarse solo con lo que
 * hay que comprar hoy. Aquí se filtra en el navegador: son unos pocos cientos
 * de filas y la respuesta tiene que ser al instante, mientras se escribe.
 */

/** El orden de los botones: de lo que más urge a lo que menos. */
export const ESTADOS_EN_ORDEN: EstadoStock[] = [
  "negativo",
  "sin_stock",
  "critico",
  "sobrestock",
  "normal",
];

export interface FiltroReposicion {
  estado: EstadoStock | "todos";
  /** Contra código, descripción y marca, sin tildes ni mayúsculas. */
  texto: string;
  /** Vacío es «todas». */
  familia: string;
}

export const FILTRO_INICIAL: FiltroReposicion = { estado: "todos", texto: "", familia: "" };

/** «Rodamiento rígido» y «RODAMIENTO RIGIDO» tienen que encontrarse igual. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filtrarReposicion(
  filas: FilaReposicion[],
  filtro: FiltroReposicion,
): FilaReposicion[] {
  // Varias palabras se buscan cada una por su lado: «6205 skf» encuentra el
  // 6205 de SKF aunque la marca vaya en otro campo.
  const palabras = normalizar(filtro.texto).split(/\s+/).filter(Boolean);
  return filas.filter((f) => {
    if (filtro.estado !== "todos" && f.estado_stock !== filtro.estado) return false;
    if (filtro.familia && f.familia !== filtro.familia) return false;
    if (palabras.length === 0) return true;
    const pajar = normalizar(`${f.codigo} ${f.descripcion} ${f.marca ?? ""}`);
    return palabras.every((p) => pajar.includes(p));
  });
}

/**
 * Cuántas hay de cada estado, con los OTROS filtros puestos.
 *
 * Sin el estado: si se cuenta con él, al pulsar «Sin stock» todos los demás
 * botones pasarían a cero y ya no se sabría a dónde ir después.
 */
export function contarPorEstado(
  filas: FilaReposicion[],
  filtro: FiltroReposicion,
): Record<EstadoStock | "todos", number> {
  const base = filtrarReposicion(filas, { ...filtro, estado: "todos" });
  const cuenta: Record<EstadoStock | "todos", number> = {
    todos: base.length,
    negativo: 0,
    sin_stock: 0,
    critico: 0,
    sobrestock: 0,
    normal: 0,
  };
  for (const f of base) cuenta[f.estado_stock] += 1;
  return cuenta;
}

/** Las familias que aparecen, en orden alfabético, para el selector. */
export function familiasDe(filas: FilaReposicion[]): string[] {
  return [...new Set(filas.map((f) => f.familia).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}
