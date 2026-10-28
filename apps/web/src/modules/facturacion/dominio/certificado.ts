import {
  fechaCertificado,
  problemasCertificado,
  type DatosCertificado,
} from "@rodatech/sunat/certificado";

/**
 * Qué se hace con un certificado recién abierto (auditoría SUNAT 28/10, B2).
 *
 * Hasta el 28/10 el .pfx se cifraba y se guardaba sin abrirlo: una clave
 * equivocada, el certificado de otra empresa o uno vencido se descubrían al
 * mandar la primera factura real, con el número ya gastado. Y como nadie
 * escribía `certificado_caduca_en`, el aviso de caducidad de la 156/161 no
 * podía saltar nunca.
 *
 * Puro: el reloj y el RUC entran por parámetro.
 */
export type RevisionCertificado =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Para `config_sunat.certificado_sujeto`: «RAZÓN SOCIAL · RUC …». */
      sujeto: string;
      /** Para `config_sunat.certificado_caduca_en` (date), en hora de Lima. */
      caducaEn: string;
      /** La frase para la pantalla al guardar. */
      frase: string;
    };

export function revisarDatosCertificado(
  datos: DatosCertificado,
  rucEmpresa: string,
  ahora: Date,
): RevisionCertificado {
  const problemas = problemasCertificado(datos, rucEmpresa, ahora);
  if (problemas.length > 0) {
    return { ok: false, error: `No se guardó nada. ${problemas.map((p) => p.mensaje).join(" ")}` };
  }

  const titular = datos.titular || "titular sin nombre";
  const ruc = datos.rucs.includes(rucEmpresa) ? rucEmpresa : null;
  const sujeto = ruc ? `${titular} · RUC ${ruc}` : titular;
  const vence = fechaCertificado(datos.validoHasta);
  const caducaEn = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(datos.validoHasta);

  const frase = ruc
    ? `Certificado de ${titular} · RUC ${ruc} · vence el ${vence}.`
    : `Certificado de ${titular} · vence el ${vence}. Ojo: no se encontró el RUC dentro del certificado; comprueba con la entidad que sea el de la empresa (${rucEmpresa}).`;

  return { ok: true, sujeto, caducaEn, frase };
}
