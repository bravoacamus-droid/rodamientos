import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import {
  agenciasDelMaestro,
  conductoresDelMaestro,
  vehiculosDelMaestro,
} from "../api/consultas";
import { guardarAgencia, guardarConductor, guardarVehiculo } from "../acciones/guardar";
import { Maestro, type CampoMaestro, type FilaMaestro } from "./maestro";

/**
 * El maestro de transporte.
 *
 * Luis, 07/09: *«deberíamos tener nuestra data maestra de transporte, ¿no?,
 * donde tenemos público y privado, así pueden editar, crear o dar de baja»*.
 *
 * La guía distingue dos modalidades y hasta hoy solo una tenía maestro: las
 * agencias existían desde la 029, y la camioneta de la empresa y su chofer se
 * tecleaban enteros en cada despacho. Son los mismos dos o tres todas las
 * semanas, y teclearlos cada vez es la vía por la que un número de licencia
 * entra mal y sale impreso en un documento que fiscaliza SUNAT.
 *
 * Se ordena como la guía: primero público, después privado.
 */

const CAMPOS_AGENCIA: readonly CampoMaestro[] = [
  {
    clave: "nombre_corto",
    etiqueta: "Nombre corto",
    ayuda: "Como la llamas: «Shalom», «Olva». Es lo que verás en la lista.",
    maximo: 60,
  },
  {
    clave: "razon_social",
    etiqueta: "Razón social",
    requerido: true,
    ayuda: "La que sale impresa en la guía. Cópiala tal cual del papel.",
    placeholder: "SHALOM EMPRESARIAL S.A.C.",
    maximo: 200,
  },
  {
    clave: "numero_documento",
    etiqueta: "RUC",
    ayuda: "Sin él la guía se guarda, pero no se puede emitir.",
    modo: "digitos",
    maximo: 11,
    ancho: "medio",
    mono: true,
  },
  { clave: "telefono", etiqueta: "Teléfono", maximo: 40, ancho: "medio" },
  { clave: "direccion", etiqueta: "Dirección", maximo: 200 },
];

const CAMPOS_VEHICULO: readonly CampoMaestro[] = [
  {
    clave: "placa",
    etiqueta: "Placa",
    requerido: true,
    ayuda: "Con guion o sin él, da igual: se guarda siempre igual.",
    placeholder: "ABC-123",
    modo: "mayusculas",
    maximo: 12,
    ancho: "medio",
    mono: true,
  },
  { clave: "marca", etiqueta: "Marca", placeholder: "Hyundai", maximo: 60, ancho: "medio" },
  {
    clave: "descripcion",
    etiqueta: "Cómo se le reconoce",
    ayuda: "Lo que dirías en el patio: «la H100 blanca».",
    maximo: 120,
  },
];

const CAMPOS_CONDUCTOR: readonly CampoMaestro[] = [
  {
    clave: "nombre",
    etiqueta: "Nombre",
    requerido: true,
    ayuda: "Como sale impreso en la guía.",
    maximo: 160,
  },
  {
    clave: "numero_documento",
    etiqueta: "DNI",
    modo: "digitos",
    maximo: 8,
    ancho: "medio",
    mono: true,
  },
  {
    clave: "licencia",
    etiqueta: "Licencia",
    ayuda: "Sin ella la guía privada se guarda, pero no se emite.",
    modo: "mayusculas",
    maximo: 30,
    ancho: "medio",
    mono: true,
  },
  { clave: "telefono", etiqueta: "Teléfono", maximo: 40, ancho: "medio" },
];

/** Junta lo que hay en una línea, saltándose los huecos. */
function juntar(...partes: (string | null | undefined)[]): string {
  return partes.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");
}

/*
  El texto de cada fila se arma AQUÍ, en el servidor.

  La tentación era pasarle a `Maestro` un `principal={(f) => f.placa}`, y no se
  puede: entre un Server Component y uno de cliente solo cruzan datos y Server
  Actions. Falla en ejecución —«Functions cannot be passed directly to Client
  Components»— y el typecheck no dice nada.
*/

export default async function PaginaTransporte() {
  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  // Los mismos de la 029 y la 060: quien despacha, mantiene.
  const puedeEditar =
    rol === "gerencia" || rol === "admin" || rol === "ventas" || rol === "almacen";

  const [agencias, vehiculos, conductores] = await Promise.all([
    agenciasDelMaestro(),
    vehiculosDelMaestro(),
    conductoresDelMaestro(),
  ]);

  const roto = [agencias, vehiculos, conductores].find((r) => !r.ok);
  if (roto && !roto.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el transporte"
        descripcion="La consulta no llegó a completarse."
        detalle={roto.error}
      />
    );
  }
  if (!agencias.ok || !vehiculos.ok || !conductores.ok) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transporte</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Con quién y con qué se despacha. Nada se borra: lo que se deja de usar
          se da de baja, para que una guía vieja siga diciendo lo que decía.
        </p>
      </div>

      <Maestro
        tipo="agencia"
        titulo="Transporte público"
        descripcion="Las agencias con las que se manda a provincia."
        etiquetaNuevo="Nueva agencia"
        campos={CAMPOS_AGENCIA}
        filas={agencias.datos.map(
          (a): FilaMaestro => ({
            ...a,
            titulo: a.nombre_corto || a.razon_social,
            detalle: juntar(
              a.nombre_corto ? a.razon_social : null,
              a.numero_documento ? `RUC ${a.numero_documento}` : "sin RUC",
              a.telefono,
            ),
          }),
        )}
        puedeEditar={puedeEditar}
        guardar={guardarAgencia}
        vacio="Todavía no hay ninguna agencia. Da de alta la primera y saldrá en la guía."
      />

      <Maestro
        tipo="vehiculo"
        titulo="Vehículos propios"
        descripcion="Con los que se reparte en transporte privado."
        etiquetaNuevo="Nuevo vehículo"
        campos={CAMPOS_VEHICULO}
        filas={vehiculos.datos.map(
          (v): FilaMaestro => ({
            ...v,
            titulo: v.placa,
            detalle: juntar(v.marca, v.descripcion),
          }),
        )}
        puedeEditar={puedeEditar}
        guardar={guardarVehiculo}
        vacio="Todavía no hay ningún vehículo. Da de alta el primero y la placa saldrá sola en la guía."
      />

      <Maestro
        tipo="conductor"
        titulo="Conductores"
        descripcion="Quién conduce en transporte privado. En público lo declara la agencia."
        etiquetaNuevo="Nuevo conductor"
        campos={CAMPOS_CONDUCTOR}
        filas={conductores.datos.map(
          (c): FilaMaestro => ({
            ...c,
            titulo: c.nombre,
            detalle: juntar(
              c.numero_documento ? `DNI ${c.numero_documento}` : "sin DNI",
              c.licencia ? `licencia ${c.licencia}` : "sin licencia",
              c.telefono,
            ),
          }),
        )}
        puedeEditar={puedeEditar}
        guardar={guardarConductor}
        vacio="Todavía no hay ningún conductor. Da de alta el primero y sus datos saldrán solos en la guía."
      />
    </div>
  );
}
