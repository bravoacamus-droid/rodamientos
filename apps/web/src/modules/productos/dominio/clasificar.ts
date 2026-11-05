/**
 * Proponer la marca, la familia y la sub-familia de un producto a partir de
 * su descripción.
 *
 * Luis, 05/11, sobre los productos que llegan de SIMPLE sin registrar: *«un
 * botón de registrar el producto nuevo, que se rellenen los datos y él ponga
 * la marca si no tiene, la familia, etc.»*. Las descripciones de SIMPLE ya
 * dicen casi todo —«NJ207-E-XL-M1.C3 RODAMIENTO DE RODILLOS CILINDRICOS
 * FAG»—: la marca va al final y el tipo en medio. Esto lo lee para que Willy
 * solo revise y complete, en vez de elegir tres listas desde cero.
 *
 * Es una PROPUESTA: la pantalla la enseña marcada como tal y se cambia con
 * un clic. Lo que no reconoce se queda vacío, que es mejor que adivinar mal.
 *
 * Lo usa también la carga del Excel de SIMPLE (05/11), para que lo que entra
 * por SQL y lo que se registra a mano se clasifiquen con la misma regla.
 */

export interface OpcionClasificacion {
  id: string;
  nombre: string;
}

export interface Clasificacion {
  marca: string | null;
  familia: string | null;
  subfamilia: string | null;
}

/** Cómo escribe SIMPLE algunas marcas, frente a su nombre en el catálogo. */
const ALIAS_MARCA: Record<string, string> = {
  OPT: "OPTIBELT",
  OPTI: "OPTIBELT",
  OPTIBEL: "OPTIBELT",
  TT0: "TTO",
  SEGGER: "SEEGER",
  MCGILL: "MC GILL",
};

/**
 * Del más concreto al más general: «RODILLOS CONICOS» antes que
 * «RODAMIENTO», y «KIT DE ORING» antes que «KIT». Los nombres son los del
 * catálogo de Willy (familia y sub-familia tal cual están en la base).
 */
const REGLAS: Array<{ si: RegExp; familia: string; subfamilia: string }> = [
  { si: /RODILLOS? CILINDRIC/, familia: "RODAMIENTO", subfamilia: "DE RODILLOS CILINDRICO" },
  { si: /RODILLOS? CONIC/, familia: "RODAMIENTO", subfamilia: "DE RODILLOS CONICOS" },
  { si: /RODILLOS? (A )?ROTULA|RODILLOS? ESFERIC/, familia: "RODAMIENTO", subfamilia: "DE RODILLOS ESFERICOS" },
  { si: /BOLAS? A ROTULA|AUTOALINEANTE/, familia: "RODAMIENTO", subfamilia: "DE BOLAS A ROTULA" },
  { si: /CONTACTO ANGULAR/, familia: "RODAMIENTO", subfamilia: "DE BOLAS DE CONTACTO ANGULAR" },
  { si: /AGUJAS?|RODILLOS? DE LEVAS?|RODAMIENTO DE LEVA/, familia: "RODAMIENTO", subfamilia: "DE AGUJAS" },
  { si: /INSERCION/, familia: "RODAMIENTO", subfamilia: "DE BOLAS DE INSERCION" },
  { si: /AXIAL/, familia: "RODAMIENTO", subfamilia: "AXIALES" },
  { si: /RIGIDOS? DE BOLAS?|RODAMIENTOS? DE BOLAS?/, familia: "RODAMIENTO", subfamilia: "RIGIDO DE BOLAS" },
  { si: /CHUMACERA PARTIDA/, familia: "CHUMACERA", subfamilia: "PARTIDA" },
  { si: /CHUMACERA DE PARED|CHUMACERA.*BRIDA/, familia: "CHUMACERA", subfamilia: "DE PARED" },
  { si: /CHUMACERA TENSORA/, familia: "CHUMACERA", subfamilia: "TENSORA" },
  { si: /CHUMACERA/, familia: "CHUMACERA", subfamilia: "DE PIE" },
  { si: /\bO-?RINGS?\b/, familia: "SELLADO", subfamilia: "ORINGS" },
  { si: /\bRETEN/, familia: "SELLADO", subfamilia: "RETENES" },
  { si: /V-?RING|SELLO MECANICO|\bSELLO\b|EMPAQUE|JUNTA/, familia: "SELLADO", subfamilia: "SELLOS Y JUNTAS" },
  { si: /\bFAJA|\bCORREA/, familia: "TRANSMISION", subfamilia: "FAJAS" },
  { si: /POLEA/, familia: "TRANSMISION", subfamilia: "POLEAS" },
  { si: /CADENA|PI[NÑ]ON|CATALINA/, familia: "TRANSMISION", subfamilia: "CADENAS Y PIÑONES" },
  { si: /ACOPLE|ACOPLAMIENTO|REJILLA/, familia: "TRANSMISION", subfamilia: "ACOPLES" },
  { si: /MANGUITO|\bBUJE/, familia: "ACCESORIOS", subfamilia: "MANGUITO" },
  { si: /ANILLO DE FIJACION|ANILLO ESPACIADOR/, familia: "ACCESORIOS", subfamilia: "ANILLOS DE FIJACION" },
  { si: /ARANDELA/, familia: "ACCESORIOS", subfamilia: "ARANDELAS" },
  { si: /OBTURADOR/, familia: "ACCESORIOS", subfamilia: "OBTURADORES" },
  { si: /SEGURO|SEEGER/, familia: "FERRETERIA", subfamilia: "ANILLOS Y SEGUROS" },
  { si: /TUERCA|PERNO/, familia: "FERRETERIA", subfamilia: "PERNOS Y TUERCAS" },
  { si: /GRASA|ACEITE|LUBRICANTE/, familia: "LUBRICANTES", subfamilia: "GRASAS Y ACEITES" },
];

const limpiar = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * La marca: la ÚLTIMA palabra de la descripción que sea una marca del
 * catálogo (SIMPLE la pone al final, a veces pegada con «-» o «_»).
 */
export function marcaDeLaDescripcion(descripcion: string, marcas: readonly string[]): string | null {
  const texto = limpiar(descripcion);
  const conocidas = new Map<string, string>();
  for (const m of marcas) {
    const n = limpiar(m);
    if (n && n !== "SIN MARCA") conocidas.set(n, m);
  }
  // Las de dos palabras («MC GILL») primero, pegadas, para poder verlas.
  let pegado = texto;
  for (const n of conocidas.keys()) {
    if (n.includes(" ")) pegado = pegado.replaceAll(n, n.replace(/ /g, "~"));
  }
  const palabras = pegado.split(/[\s,\-_.()]+/).filter(Boolean).reverse();
  for (const p of palabras) {
    const palabra = p.replace(/~/g, " ").replace(/^MM_?/, "");
    const real = ALIAS_MARCA[palabra] ?? palabra;
    const m = conocidas.get(real);
    if (m) return m;
  }
  return null;
}

/** La familia y la sub-familia, por las palabras del tipo de producto. */
export function familiaDeLaDescripcion(descripcion: string): { familia: string; subfamilia: string } | null {
  const texto = limpiar(descripcion);
  for (const r of REGLAS) {
    if (r.si.test(texto)) return { familia: r.familia, subfamilia: r.subfamilia };
  }
  return null;
}

/** Las tres, ya como ids de las listas que tiene la pantalla. */
export function proponerClasificacion(
  descripcion: string,
  catalogos: {
    marcas: readonly OpcionClasificacion[];
    familias: readonly OpcionClasificacion[];
    subfamilias: readonly (OpcionClasificacion & { familia_id: string })[];
  },
): { marcaId: string; familiaId: string; subfamiliaId: string } {
  const marca = marcaDeLaDescripcion(
    descripcion,
    catalogos.marcas.map((m) => m.nombre),
  );
  const fam = familiaDeLaDescripcion(descripcion);
  const familia = fam ? catalogos.familias.find((f) => limpiar(f.nombre) === fam.familia) : undefined;
  const subfamilia =
    fam && familia
      ? catalogos.subfamilias.find((s) => s.familia_id === familia.id && limpiar(s.nombre) === limpiar(fam.subfamilia))
      : undefined;
  return {
    marcaId: (marca && catalogos.marcas.find((m) => m.nombre === marca)?.id) || "",
    familiaId: familia?.id ?? "",
    subfamiliaId: subfamilia?.id ?? "",
  };
}
