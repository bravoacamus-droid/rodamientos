"use client";

// Cliente: encadena tres desplegables y va a buscar el siguiente nivel al
// servidor cuando cambia el anterior.

import * as React from "react";
import { Campo, SelectNativo } from "@rodatech/ui";

/**
 * Compara nombres de sitio ignorando tildes y mayúsculas.
 *
 * Hace falta porque los nombres llegan de dos sitios que no escriben igual:
 * nuestra tabla dice «Lima» y «Áncash», y la consulta de RUC devuelve «LIMA»
 * y «ANCASH». Un `<select>` casa su `value` con el texto EXACTO de la opción,
 * así que sin esto el desplegable saldría en blanco justo después de pulsar
 * «Traer datos», que es cuando más lleno debería estar.
 */
const plano = (s: string) =>
  s.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase().trim();

/** El nombre de la lista que corresponde al que llega, o «» si no está. */
function casar(llega: string, lista: string[]): string {
  if (llega === "") return "";
  return lista.find((x) => plano(x) === plano(llega)) ?? "";
}

/** Un distrito, con su código. */
export interface DistritoUbigeo {
  codigo: string;
  distrito: string;
}

/**
 * Departamento → provincia → distrito.
 *
 * Willy, 31/08 (7:23): *«aquí en el ubigeo, que es el distrito, debería traer,
 * aquí tenemos que tener todos los distritos y provincias, departamentos»*.
 *
 * Hasta la 037 esto no se podía hacer y por eso no se hizo: `ubigeo` tenía 64
 * distritos de los 1.874 del país, y una cascada sobre un padrón incompleto se
 * ve rota. Elegir Cusco y que solo salga la provincia «Cusco» —con el cliente
 * real de La Convención sin aparecer— es peor que no tener cascada.
 *
 * Con el padrón entero cargado, ya son 25 · 196 · 1.874.
 *
 * ---------------------------------------------------------------------------
 * Los niveles se piden al servidor, no se precargan
 * ---------------------------------------------------------------------------
 * Mandar los 1.874 distritos al navegador en cada alta de cliente son ~120 kB
 * que casi nadie usa: el 90 % de las altas rellena esto solo con pulsar «Traer
 * datos». Se piden los 25 departamentos al abrir, y lo demás cuando se elige.
 */
export function SelectorUbigeoCascada({
  id,
  codigo,
  departamento,
  provincia,
  onElegir,
  cargarDepartamentos,
  cargarProvincias,
  cargarDistritos,
}: {
  id: string;
  /** El código elegido, o "" si todavía no hay. */
  codigo: string;
  /** Dónde está parada la cascada. Los sube el formulario para poder
   *  precargarla al editar y al traer datos de SUNAT. */
  departamento: string;
  provincia: string;
  onElegir: (v: {
    codigo: string;
    departamento: string;
    provincia: string;
    distrito: string;
  }) => void;
  cargarDepartamentos: () => Promise<string[]>;
  cargarProvincias: (departamento: string) => Promise<string[]>;
  cargarDistritos: (departamento: string, provincia: string) => Promise<DistritoUbigeo[]>;
}) {
  const [departamentos, setDepartamentos] = React.useState<string[]>([]);
  const [provincias, setProvincias] = React.useState<string[]>([]);
  const [distritos, setDistritos] = React.useState<DistritoUbigeo[]>([]);
  const [cargando, setCargando] = React.useState(false);

  // Los 25 departamentos, una vez.
  React.useEffect(() => {
    let vigente = true;
    void cargarDepartamentos().then((d) => {
      if (vigente) setDepartamentos(d);
    });
    return () => {
      vigente = false;
    };
  }, [cargarDepartamentos]);

  // Las provincias del departamento que esté puesto. Se dispara también al
  // montar con uno ya elegido —editando un cliente, o justo después de «Traer
  // datos»— para que el desplegable del medio no salga vacío.
  React.useEffect(() => {
    let vigente = true;
    if (!departamento) {
      setProvincias([]);
      return;
    }
    setCargando(true);
    void cargarProvincias(departamento)
      .then((p) => {
        if (vigente) setProvincias(p);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [departamento, cargarProvincias]);

  React.useEffect(() => {
    let vigente = true;
    if (!departamento || !provincia) {
      setDistritos([]);
      return;
    }
    setCargando(true);
    void cargarDistritos(departamento, provincia)
      .then((d) => {
        if (vigente) setDistritos(d);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [departamento, provincia, cargarDistritos]);

  // Lo que de verdad se marca en cada desplegable: el nombre de NUESTRA
  // lista, no el que llegó. Mientras los departamentos no hayan cargado sale
  // vacío y se rellena solo en cuanto llegan.
  const depSel = casar(departamento, departamentos);
  const provSel = casar(provincia, provincias);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Campo id={`${id}-dep`} label="Departamento">
        <SelectNativo
          id={`${id}-dep`}
          className="h-11 md:h-control-md"
          value={depSel}
          onChange={(e) =>
            // Cambiar de departamento invalida los dos de abajo: dejar puesta
            // la provincia anterior guardaría un distrito de otro sitio.
            onElegir({ codigo: "", departamento: e.target.value, provincia: "", distrito: "" })
          }
        >
          <option value="">Elige…</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectNativo>
      </Campo>

      <Campo id={`${id}-prov`} label="Provincia">
        <SelectNativo
          id={`${id}-prov`}
          className="h-11 md:h-control-md"
          value={provSel}
          disabled={!depSel}
          onChange={(e) =>
            onElegir({ codigo: "", departamento: depSel, provincia: e.target.value, distrito: "" })
          }
        >
          <option value="">{depSel ? "Elige…" : "Primero el departamento"}</option>
          {provincias.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectNativo>
      </Campo>

      <Campo
        id={id}
        label="Distrito"
        ayuda={cargando ? "Cargando…" : "SUNAT lo exige en la guía de remisión."}
      >
        <SelectNativo
          id={id}
          className="h-11 md:h-control-md"
          value={codigo}
          disabled={!provSel}
          onChange={(e) => {
            const d = distritos.find((x) => x.codigo === e.target.value);
            onElegir({
              codigo: d?.codigo ?? "",
              departamento: depSel,
              provincia: provSel,
              distrito: d?.distrito ?? "",
            });
          }}
        >
          <option value="">{provSel ? "Elige…" : "Primero la provincia"}</option>
          {distritos.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.distrito}
            </option>
          ))}
        </SelectNativo>
      </Campo>
    </div>
  );
}
