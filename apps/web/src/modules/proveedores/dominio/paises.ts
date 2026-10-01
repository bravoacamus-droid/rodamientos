/**
 * Los países de los que se compra, para el buscador del alta de proveedor.
 *
 * Luis, 01/10: *«el país puede ser un select inteligente, con un buscador
 * inteligente»*. Lo que se guarda es el nombre en castellano —`proveedores.pais`
 * es texto—; las claves en inglés están porque así viene en las proformas
 * («SHANGHAI, CHINA», «Germany»), y quien la tiene delante escribe lo que lee.
 *
 * Primero los que más se usan en rodamientos (China, Alemania, Japón…), el
 * resto por orden alfabético. Perú no está: un proveedor de Perú se da de alta
 * con RUC.
 */
export interface Pais {
  nombre: string;
  claves: string;
}

const FRECUENTES: Pais[] = [
  { nombre: "China", claves: "china prc shanghai cn" },
  { nombre: "Estados Unidos", claves: "usa united states eeuu us america" },
  { nombre: "Alemania", claves: "germany deutschland de" },
  { nombre: "Japón", claves: "japan jp" },
  { nombre: "Italia", claves: "italy it" },
  { nombre: "Suecia", claves: "sweden se" },
  { nombre: "India", claves: "india in" },
  { nombre: "Corea del Sur", claves: "south korea korea kr" },
  { nombre: "Taiwán", claves: "taiwan tw" },
];

const RESTO: Pais[] = [
  { nombre: "Argentina", claves: "argentina ar" },
  { nombre: "Austria", claves: "austria at" },
  { nombre: "Bélgica", claves: "belgium be" },
  { nombre: "Bolivia", claves: "bolivia bo" },
  { nombre: "Brasil", claves: "brazil br" },
  { nombre: "Canadá", claves: "canada ca" },
  { nombre: "Chile", claves: "chile cl" },
  { nombre: "Colombia", claves: "colombia co" },
  { nombre: "Dinamarca", claves: "denmark dk" },
  { nombre: "Ecuador", claves: "ecuador ec" },
  { nombre: "Emiratos Árabes Unidos", claves: "uae united arab emirates dubai ae" },
  { nombre: "Eslovaquia", claves: "slovakia sk" },
  { nombre: "España", claves: "spain es" },
  { nombre: "Francia", claves: "france fr" },
  { nombre: "Hong Kong", claves: "hong kong hk" },
  { nombre: "Hungría", claves: "hungary hu" },
  { nombre: "Indonesia", claves: "indonesia id" },
  { nombre: "Malasia", claves: "malaysia my" },
  { nombre: "México", claves: "mexico mx" },
  { nombre: "Países Bajos", claves: "netherlands holland holanda nl" },
  { nombre: "Polonia", claves: "poland pl" },
  { nombre: "Reino Unido", claves: "united kingdom uk england inglaterra gb" },
  { nombre: "República Checa", claves: "czech republic czechia cz" },
  { nombre: "Rumania", claves: "romania ro" },
  { nombre: "Singapur", claves: "singapore sg" },
  { nombre: "Suiza", claves: "switzerland ch" },
  { nombre: "Tailandia", claves: "thailand th" },
  { nombre: "Turquía", claves: "turkey turkiye tr" },
  { nombre: "Vietnam", claves: "vietnam viet nam vn" },
];

export const PAISES: readonly Pais[] = [...FRECUENTES, ...RESTO];
