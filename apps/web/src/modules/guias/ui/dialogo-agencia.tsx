"use client";

import * as React from "react";
import {
  Button,
  Campo,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rodatech/ui";

import { registrarAgencia, type AgenciaCreada } from "../acciones/agencia";
import { consultarRucAgencia } from "../acciones/consultar-ruc";

/**
 * Dar de alta una agencia sin salir de la guía.
 *
 * Luis: *«en guía falta poner en agencia un botón que abra un modal para
 * registrar una nueva agencia»*.
 *
 * El desplegable solo sabía ofrecer las tres que trajo la 029. Para una
 * cuarta —el cliente de Huancayo que manda por la suya— había que teclear el
 * RUC y la razón social a mano en cada envío, sin que quedara apuntada. Y
 * salir a otra pantalla a darla de alta pierde la guía a medio preparar, que
 * es lo mismo que pasaba con el teléfono del proveedor en «Pedir precio».
 *
 * ---------------------------------------------------------------------------
 * El RUC va PRIMERO, y trae lo demás
 * ---------------------------------------------------------------------------
 * Luis, 21/09: *«primero podemos poner el RUC con un botón de traer datos: así
 * buscan por RUC y trae la razón social, y le pone un nombre corto»*.
 *
 * El orden importa porque la razón social es lo que sale IMPRESO en la guía.
 * Teclearla a mano es la forma más fácil de que un documento fiscal lleve
 * «SHALOM EMPRESARIAL SAC» donde el padrón dice «SHALOM EMPRESARIAL S.A.C.», y
 * eso no se descubre hasta que alguien lo observa. El nombre corto es al revés:
 * es de uso interno, SUNAT no lo sabe, y va después.
 *
 * El foco entra en el RUC, que es lo primero que se hace.
 *
 * Y todo sigue siendo OPCIONAL: sin internet, sin cuota o con una agencia que
 * no está en el padrón, se escribe a mano y se guarda igual. El botón es un
 * atajo, no una puerta.
 */
export function DialogoAgencia({
  abierto,
  onCerrar,
  onGuardada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** La agencia ya guardada, para que quien llama la meta en su lista y la elija. */
  onGuardada: (agencia: AgenciaCreada, yaExistia: boolean) => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [razon, setRazon] = React.useState("");
  const [ruc, setRuc] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  /** Lo que contestó SUNAT, para poder decirlo debajo del campo. */
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [traido, setTraido] = React.useState(false);
  const [consultando, iniciarConsulta] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setNombre("");
    setRazon("");
    setRuc("");
    setTelefono("");
    setError(null);
    setAviso(null);
    setTraido(false);
  }, [abierto]);

  /*
    Traer la razón social del padrón.

    Pisa lo que hubiera escrito: quien pulsa el botón quiere el dato oficial,
    que es el que va impreso. El nombre corto NO se toca —SUNAT no lo conoce, y
    si alguien ya escribió «Shalom» sería absurdo borrárselo.

    Un fallo aquí NUNCA bloquea: se avisa y se sigue a mano. Hay 100 consultas
    al mes para toda la empresa y una agencia nueva no puede depender de que
    queden.
  */
  function traerDatos() {
    setError(null);
    setAviso(null);
    iniciarConsulta(async () => {
      const r = await consultarRucAgencia(ruc);
      if (!r.ok) {
        setTraido(false);
        setAviso(
          r.agotada
            ? "Se agotó la cuota de consultas de este mes. Escribe la razón social a mano y guarda igual; la cuota se renueva el día 1."
            : `${r.error} Escribe la razón social a mano y guarda igual.`,
        );
        return;
      }
      setRazon(r.datos.razon_social);
      setTraido(true);
      /*
        El estado del contribuyente se DICE, no se esconde.

        Una agencia de baja o no habida sigue pudiendo transportar, así que no
        se bloquea nada — pero es justo lo que conviene saber antes de poner su
        RUC en un documento que va a SUNAT.
      */
      const estado = [r.datos.estado, r.datos.condicion]
        .filter((x): x is string => Boolean(x))
        .join(" · ");
      setAviso(estado ? `SUNAT: ${estado}.` : null);
    });
  }

  function guardar() {
    setError(null);

    if (razon.trim() === "") {
      setError("Falta la razón social: es la que sale impresa en la guía.");
      return;
    }
    if (ruc.trim() !== "" && !/^[0-9]{11}$/.test(ruc.trim())) {
      setError("El RUC son once dígitos, o déjalo vacío.");
      return;
    }

    empezar(async () => {
      const r = await registrarAgencia({
        razon_social: razon.trim(),
        nombre_corto: nombre.trim(),
        numero_documento: ruc.trim(),
        telefono: telefono.trim(),
        direccion: null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardada(r.agencia, r.yaExistia);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva agencia</DialogTitle>
          <DialogDescription>
            Queda en la lista para las próximas guías. No se pierde nada de lo
            que llevas escrito aquí.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {/*
            El RUC y su botón, en la misma fila y pegados.

            `items-end` para que el botón quede alineado con el campo y no con
            su etiqueta: el `Campo` mete el rótulo arriba, así que sin esto el
            botón flota medio renglón por encima.
          */}
          <div className="flex items-end gap-2">
            <Campo
              id="ag-ruc"
              label="RUC"
              /*
                Sin RUC la guía se prepara, pero no se emite: SUNAT lo exige
                para el transportista público. Decirlo aquí evita descubrirlo
                al final, con el camión esperando.
              */
              ayuda="Sin él la guía se guarda, pero no se puede emitir."
              className="min-w-0 flex-1"
            >
              <Input
                id="ag-ruc"
                value={ruc}
                onChange={(e) => {
                  setRuc(e.target.value.replace(/\D/g, "").slice(0, 11));
                  // Cambiar el RUC invalida lo que trajo el anterior.
                  setTraido(false);
                  setAviso(null);
                }}
                onKeyDown={(e) => {
                  // Enter en el RUC consulta, no guarda. Es lo que se espera
                  // al terminar de pegar once dígitos.
                  if (e.key === "Enter" && ruc.length === 11) {
                    e.preventDefault();
                    traerDatos();
                  }
                }}
                className="tabular"
                inputMode="numeric"
                /*
                  Con X y no un número.

                  El ejemplo que había, `20601226310`, NO es un RUC válido —su
                  dígito verificador no cuadra— así que desde que el botón
                  comprueba el dígito, enseñaba como modelo justo lo que el
                  sistema rechaza. Mismo criterio que el teléfono de al lado.
                */
                placeholder="20XXXXXXXXX"
                autoFocus
              />
            </Campo>
            {/*
              Botón de verdad, no un icono ni un enlace: la regla de la casa
              es que lo pulsable lo parezca. Se apaga hasta que el RUC tenga
              los once dígitos, porque antes solo puede gastar cuota para nada.
            */}
            <Button
              type="button"
              variant="outline"
              onClick={traerDatos}
              disabled={ruc.length !== 11 || consultando}
              className="mb-[1.625rem] shrink-0"
            >
              {consultando ? "Buscando…" : "Traer datos"}
            </Button>
          </div>

          {aviso ? (
            <p className="-mt-1 text-sm text-[var(--fg-muted)]">{aviso}</p>
          ) : null}

          <Campo
            id="ag-razon"
            label="Razón social"
            requerido
            ayuda={
              traido
                ? "La trajo SUNAT. Es la que sale impresa en la guía."
                : "La que sale impresa en la guía. Cópiala tal cual del papel, o tráela con el RUC."
            }
          >
            <Input
              id="ag-razon"
              value={razon}
              onChange={(e) => {
                setRazon(e.target.value);
                setTraido(false);
              }}
              placeholder="SHALOM EMPRESARIAL S.A.C."
            />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="ag-nombre"
              label="Nombre corto"
              ayuda="Como la llamas: «Shalom», «Olva». Es lo que verás en la lista."
            >
              <Input
                id="ag-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Shalom"
              />
            </Campo>
            <Campo id="ag-tel" label="Teléfono">
              <Input
                id="ag-tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                placeholder="01 XXX XXXX"
              />
            </Campo>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
            >
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {/* `type="button"` en los dos: esto vive dentro del formulario de la
              guía y sin eso lo enviarían a medias. */}
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar agencia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
