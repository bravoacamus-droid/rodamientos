"use client";

/*
 * "use client" OBLIGATORIO: alta y edición en un diálogo, con estado.
 */

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
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
  SelectNativo,
  toast,
} from "@rodatech/ui";
import { Pencil, Plus } from "lucide-react";

import { activarCuenta, crearCuenta, guardarCuenta } from "../acciones/cuentas";
import type { ResultadoConfig } from "../acciones/guardar";
import {
  ETIQUETA_MONEDA_CUENTA,
  type CuentaBancaria,
} from "../dominio/tipos";

/**
 * Las cuentas a las que se cobra, en tarjetas.
 *
 * Luis, 15/09: *«no puedo ver las cuentas que se crearon, que están en
 * cotización… debería traerlo como card para añadir, cuál aparecerían;
 * agregar, editar o eliminar»*.
 *
 * Existen desde la 064 y se imprimen al pie de cada cotización y factura, pero
 * se daban de alta con SQL contra producción. Van en tarjeta y no en tabla
 * porque son dos o tres, no veinte, y lo que hay que leer de cada una es un
 * bloque —banco, moneda, número, CCI— y no una fila de columnas.
 *
 * En cada una se dice **si sale en el papel o no**, que es la pregunta que
 * Luis hizo con esas palabras: «cuál aparecerían».
 */
export function CuentasParaCobrar({
  cuentas,
  puedeEditar,
}: {
  cuentas: CuentaBancaria[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = React.useState<CuentaBancaria | null>(null);
  const [creando, setCreando] = React.useState(false);

  const activas = cuentas.filter((c) => c.activo);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--fg-muted)]">
          Salen impresas al pie de cada cotización y factura. Willy, 07/09:{" "}
          <em>«abajo de la cotización debe aparecer el número de cuentas
          siempre»</em>. No son la cuenta de detracción: esa es del Banco de la
          Nación y el cliente no puede transferir ahí.
        </p>
        {puedeEditar ? (
          <Button onClick={() => setCreando(true)} className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Nueva cuenta
          </Button>
        ) : null}
      </div>

      {/* El aviso que evita la transferencia perdida. Se factura en dólares y
          se cobra en soles a quien paga en soles: con una sola moneda dada de
          alta, el cliente que paga en la otra transfiere a la que no es. */}
      {activas.length > 0 &&
      !(activas.some((c) => c.moneda === "USD") && activas.some((c) => c.moneda === "PEN")) ? (
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          Solo hay cuenta en{" "}
          <strong>{ETIQUETA_MONEDA_CUENTA[activas[0]!.moneda]}</strong>. Quien
          pague en la otra moneda no tendrá a dónde transferir.
        </p>
      ) : null}

      {cuentas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--fg-muted)]">
          Todavía no hay ninguna, así que las cotizaciones salen sin cuenta al
          pie y el cliente tiene que llamar para preguntar a dónde paga.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cuentas.map((c) => (
            <Tarjeta
              key={c.id}
              cuenta={c}
              puedeEditar={puedeEditar}
              onEditar={() => setEditando(c)}
            />
          ))}
        </ul>
      )}

      {creando ? (
        <DialogoCuenta cuenta={null} onCerrar={() => setCreando(false)} />
      ) : null}
      {editando ? (
        <DialogoCuenta cuenta={editando} onCerrar={() => setEditando(null)} />
      ) : null}
    </div>
  );
}

function Tarjeta({
  cuenta,
  puedeEditar,
  onEditar,
}: {
  cuenta: CuentaBancaria;
  puedeEditar: boolean;
  onEditar: () => void;
}) {
  const router = useRouter();

  /*
    `useActionState` con `<form action>`, y no un `await` suelto.

    Se intentó primero llamando la Server Action a pelo desde el `onClick`
    —incluso metida en un `useTransition`— y la promesa NO VOLVÍA NUNCA: el
    botón se quedaba en «Guardando…» para siempre mientras el log del servidor
    enseñaba un 200 en 400 ms. Un rato de 15/09 se fue en eso.

    Este es el arreglo que el proyecto ya tenía probado —`FormEmpresa` guarda
    así desde el principio—, así que no se inventa nada: el formulario manda
    los datos como `FormData` y React se encarga del resto.
  */
  const [, alternar, enCurso] = useActionState<ResultadoConfig | null, FormData>(
    async (previo, formData) => {
      const r = await activarCuenta(previo, formData);
      if (r.ok) {
        toast.success(r.mensaje);
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    null,
  );

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${
        cuenta.activo ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cuenta.banco}</p>
          <p className="text-sm text-[var(--fg-muted)]">
            {ETIQUETA_MONEDA_CUENTA[cuenta.moneda]}
          </p>
        </div>
        {cuenta.activo ? (
          <Badge tone="success" size="xs">
            Sale en el papel
          </Badge>
        ) : (
          <Badge tone="neutral" size="xs">
            No se imprime
          </Badge>
        )}
      </div>

      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--fg-subtle)]">Número</dt>
          <dd className="tabular">{cuenta.numero}</dd>
        </div>
        <div className="min-w-0">
          {/* El CCI se dice aunque falte: sin él, un cliente de otro banco no
              puede pagar, y eso no puede quedarse en un hueco en blanco. */}
          <dt className="text-xs text-[var(--fg-subtle)]">CCI</dt>
          <dd className="tabular">
            {cuenta.cci ?? (
              <span className="text-[var(--warn)]">
                Falta — sin CCI no pueden pagarte desde otro banco
              </span>
            )}
          </dd>
        </div>
      </dl>

      {puedeEditar ? (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onEditar}
            className="flex-1 gap-1.5"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </Button>
          <form action={alternar} className="flex-1">
            <input type="hidden" name="id" value={cuenta.id} />
            <input type="hidden" name="activo" value={cuenta.activo ? "0" : "1"} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={enCurso}
              className="w-full"
            >
              {cuenta.activo ? "Quitar del papel" : "Volver a usar"}
            </Button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Alta y edición, en el mismo diálogo.
 *
 * Son los mismos cuatro campos y la misma validación; dos formularios
 * separados serían dos sitios donde olvidarse el CCI.
 */
function DialogoCuenta({
  cuenta,
  onCerrar,
}: {
  cuenta: CuentaBancaria | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [datos, setDatos] = React.useState({
    banco: cuenta?.banco ?? "",
    moneda: cuenta?.moneda ?? ("USD" as CuentaBancaria["moneda"]),
    numero: cuenta?.numero ?? "",
    cci: cuenta?.cci ?? "",
    orden: cuenta?.orden ?? 0,
  });
  // Mismo arreglo que en la tarjeta: ver el comentario de arriba.
  const [, enviar, guardando] = useActionState<ResultadoConfig | null, FormData>(
    async (previo, formData) => {
      const r = cuenta
        ? await guardarCuenta(previo, formData)
        : await crearCuenta(previo, formData);
      if (r.ok) {
        toast.success(r.mensaje);
        router.refresh();
        onCerrar();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    null,
  );

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cuenta ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
          <DialogDescription>
            Tal como quieres que salga impresa al pie de la cotización.
          </DialogDescription>
        </DialogHeader>

        <form action={enviar}>
          {/* Un solo campo con todo dentro: así el esquema del servidor y el
              estado de aquí son la misma forma. Igual que en FormEmpresa. */}
          {cuenta ? <input type="hidden" name="id" value={cuenta.id} /> : null}
          <input
            type="hidden"
            name="cuenta"
            value={JSON.stringify({
              banco: datos.banco,
              moneda: datos.moneda,
              numero: datos.numero,
              cci: datos.cci || null,
              orden: datos.orden,
            })}
          />

          <DialogBody className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="cuenta-banco" label="Banco" requerido>
                <Input
                  id="cuenta-banco"
                  value={datos.banco}
                  onChange={(e) => setDatos((d) => ({ ...d, banco: e.target.value }))}
                  placeholder="Banco de Crédito del Perú (BCP)"
                  required
                />
              </Campo>

              <Campo
                id="cuenta-moneda"
                label="Moneda"
                ayuda="Decide a cuál se le manda al cliente según la moneda del documento."
              >
                <SelectNativo
                  id="cuenta-moneda"
                  value={datos.moneda}
                  onChange={(e) =>
                    setDatos((d) => ({
                      ...d,
                      moneda: e.target.value as CuentaBancaria["moneda"],
                    }))
                  }
                >
                  <option value="USD">{ETIQUETA_MONEDA_CUENTA.USD}</option>
                  <option value="PEN">{ETIQUETA_MONEDA_CUENTA.PEN}</option>
                </SelectNativo>
              </Campo>
            </div>

            <Campo id="cuenta-numero" label="Número de cuenta" requerido>
              <Input
                id="cuenta-numero"
                value={datos.numero}
                onChange={(e) => setDatos((d) => ({ ...d, numero: e.target.value }))}
                className="tabular"
                required
              />
            </Campo>

            <Campo
              id="cuenta-cci"
              label="CCI"
              ayuda="Para quien transfiere desde otro banco. Es el que más piden."
            >
              <Input
                id="cuenta-cci"
                value={datos.cci}
                onChange={(e) => setDatos((d) => ({ ...d, cci: e.target.value }))}
                className="tabular"
              />
            </Campo>

            <Campo
              id="cuenta-orden"
              label="Orden en el papel"
              ayuda="El número más bajo sale primero. Willy imprime primero la de dólares, que es la moneda en la que factura."
            >
              <Input
                id="cuenta-orden"
                type="number"
                min={0}
                max={99}
                value={datos.orden}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, orden: Number(e.target.value) }))
                }
                className="tabular"
              />
            </Campo>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : cuenta ? "Guardar cambios" : "Añadir cuenta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
