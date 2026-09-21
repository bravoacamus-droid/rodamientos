"use client";

// Cliente: es un diálogo con estado propio y llama a una Server Action.

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  SelectNativo,
} from "@rodatech/ui";
import { Plus } from "lucide-react";

import { rucValido } from "@rodatech/consultas/validacion";

import { buscarProveedorPorDocumento } from "../acciones/consultar";
import { guardarProveedor } from "../acciones/guardar";
import type { ProveedorOpcion } from "../dominio/opcion";

/**
 * Alta rápida de proveedor sin salir de la pantalla en la que se esté.
 *
 * Vivía dentro de recepciones y solo la usaba recepciones. Ahora la usan las
 * DOS pantallas que eligen proveedor —la compra y la recepción—, así que se
 * mudó al módulo dueño del dato. Es la misma razón por la que
 * `proveedoresParaSelector` vive aquí: un alta paralela por pantalla sería un
 * segundo sitio donde validar el RUC, generar el código y desambiguar
 * duplicados, y los dos se separarían al primer cambio.
 *
 * Guarda con la MISMA Server Action que el maestro. Aquí solo se recortan los
 * campos: lo demás se completa después desde la ficha.
 *
 * ---------------------------------------------------------------------------
 * El RUC SÍ se consulta, desde el 21/09
 * ---------------------------------------------------------------------------
 * Hasta hoy no lo hacía, y estaba razonado: son 100 consultas de Decolecta al
 * mes, un proveedor se da de alta una vez cada muchos meses, y en el mostrador
 * su razón social está impresa en la factura que se tiene delante. El propio
 * comentario admitía que **en la compra el argumento es más flojo** —quien
 * pide mercadería está en un escritorio— y lo dejaba anotado como decisión
 * pendiente.
 *
 * Luis la tomó el 21/09: *«si voy a registrar un nuevo proveedor tenemos que
 * tener la validación de RUC»*. Es el mismo gesto que ya tiene el alta de
 * agencia y el de cliente, y tenerlo en dos de tres sitios era lo peor de
 * ambos mundos: quien lo aprende en una pantalla lo busca en la otra.
 *
 * Lo que SÍ se conserva del argumento de la cuota: la consulta solo sale si
 * se pulsa el botón. No se dispara al teclear, y el dígito verificador se
 * comprueba antes de salir a la red — un RUC mal copiado no se lleva por
 * delante una de las cien.
 */
export function ProveedorRapido({
  documentoInicial = "",
  nombreInicial = "",
  variante = "boton",
  onCreado,
}: {
  /** Lo tecleado en la caja de búsqueda, si parecía un RUC. */
  documentoInicial?: string;
  /** Lo tecleado, si parecía un nombre. */
  nombreInicial?: string;
  /**
   * `boton` al lado de la caja de búsqueda; `enlace` para el aviso de «todavía
   * no hay proveedores», donde un segundo botón competiría con el de la
   * pantalla.
   */
  variante?: "boton" | "enlace";
  onCreado: (proveedor: ProveedorOpcion) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [numero, setNumero] = React.useState(documentoInicial);
  const [razonSocial, setRazonSocial] = React.useState(nombreInicial);
  const [tipo, setTipo] = React.useState<"local" | "importacion">("local");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, guardar] = React.useTransition();

  /** Lo que contestó SUNAT, para poder decirlo bajo el campo. */
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [traido, setTraido] = React.useState(false);
  const [consultando, consultar] = React.useTransition();

  /*
    Traer la razón social del padrón.

    Pisa lo que hubiera: quien pulsa el botón quiere el dato oficial, que es el
    que va a acabar impreso en una orden de compra. Un fallo NUNCA bloquea —se
    avisa y se escribe a mano— porque el alta de un proveedor no puede depender
    de que queden consultas.
  */
  const traerDatos = () => {
    setError(null);
    setAviso(null);
    consultar(async () => {
      const r = await buscarProveedorPorDocumento("RUC", numero.replace(/D/g, ""));
      if (!r.ok) {
        setTraido(false);
        setAviso(
          r.agotada
            ? "Se agotó la cuota de consultas de este mes. Escribe la razón social a mano y guarda igual; la cuota se renueva el día 1."
            : `${r.error} Escribe la razón social a mano y guarda igual.`,
        );
        return;
      }
      setRazonSocial(r.datos.razon_social);
      setTraido(true);
      // El estado del contribuyente se dice, no se esconde: un proveedor de
      // baja se puede seguir usando, pero conviene saberlo antes.
      const estado = [r.datos.estado, r.datos.condicion]
        .filter((x): x is string => Boolean(x))
        .join(" · ");
      setAviso(estado ? `SUNAT: ${estado}.` : null);
    });
  };

  // Lo tecleado en la caja llega ya escrito. Si el diálogo está cerrado se
  // sincroniza; abierto no, o borraría lo que se esté escribiendo dentro.
  React.useEffect(() => {
    if (abierto) return;
    setNumero(documentoInicial);
    setRazonSocial(nombreInicial);
  }, [abierto, documentoInicial, nombreInicial]);

  const limpiar = () => {
    setNumero(documentoInicial);
    setRazonSocial(nombreInicial);
    setTipo("local");
    setError(null);
    setAviso(null);
    setTraido(false);
  };

  const enviar = () => {
    setError(null);
    guardar(async () => {
      const fd = new FormData();
      fd.set(
        "proveedor",
        JSON.stringify({
          tipo_documento: "RUC",
          numero_documento: numero.trim(),
          razon_social: razonSocial.trim(),
          tipo,
          pais: "Perú",
          dias_pago: 0,
          lead_time_dias: 3,
          marca_ids: [],
        }),
      );

      const r = await guardarProveedor(null, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }

      // La ficha recién creada, completa. Lo que no se preguntó son los valores
      // por defecto que la acción acaba de escribir, no ceros inventados: un
      // proveedor nuevo no tiene compras ni marcas todavía.
      onCreado({
        id: r.id,
        codigo: r.codigo,
        razon_social: r.razonSocial,
        numero_documento: numero.trim(),
        tipo_documento: "RUC",
        tipo,
        pais: "Perú",
        direccion: null,
        contacto: null,
        telefono: null,
        whatsapp: null,
        email: null,
        dias_pago: 0,
        lead_time_dias: 3,
        activo: true,
        marcas: [],
        compras: 0,
        ultima_compra: null,
      });
      setAbierto(false);
      limpiar();
    });
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) limpiar();
      }}
    >
      <DialogTrigger asChild>
        {variante === "boton" ? (
          <Button type="button" variant="outline" className="shrink-0">
            <Plus aria-hidden="true" />
            Nuevo
          </Button>
        ) : (
          <button
            type="button"
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            + Nuevo proveedor
          </button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
          <DialogDescription>
            Lo mínimo para saber a quién se le compra. El resto de la ficha
            —contacto, plazo de entrega, marcas que representa— se completa
            después desde el maestro de proveedores.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mt-4 flex flex-col gap-3">
            {/* El RUC y su botón, en la misma fila y alineados por abajo. */}
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium">RUC</span>
                <Input
                  value={numero}
                  onChange={(e) => {
                    setNumero(e.target.value.replace(/D/g, "").slice(0, 11));
                    // Cambiar el RUC invalida lo que trajo el anterior.
                    setTraido(false);
                    setAviso(null);
                  }}
                  onKeyDown={(e) => {
                    // Enter consulta en vez de guardar: es lo que se espera al
                    // terminar de pegar once dígitos.
                    if (e.key === "Enter" && rucValido(numero)) {
                      e.preventDefault();
                      traerDatos();
                    }
                  }}
                  placeholder="20XXXXXXXXX"
                  className="tabular"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              {/*
                Se apaga hasta que el RUC sea válido DE VERDAD —once dígitos y
                el verificador cuadrando—, no solo hasta que tenga largo. Cada
                consulta que sale gasta una de las cien del mes.
              */}
              <Button
                type="button"
                variant="outline"
                onClick={traerDatos}
                disabled={!rucValido(numero) || consultando}
                className="shrink-0"
              >
                {consultando ? "Buscando…" : "Traer datos"}
              </Button>
            </div>

            {aviso ? (
              <p className="-mt-1 text-sm text-[var(--fg-muted)]">{aviso}</p>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Razón social</span>
              <Input
                value={razonSocial}
                onChange={(e) => {
                  setRazonSocial(e.target.value);
                  setTraido(false);
                }}
                placeholder="Tal como figura en la factura"
                autoComplete="off"
              />
              <span className="text-sm text-[var(--fg-muted)]">
                {traido
                  ? "La trajo SUNAT."
                  : "Tal cual de la factura, o tráela con el RUC."}
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tipo de compra</span>
              <SelectNativo
                value={tipo}
                onChange={(e) =>
                  setTipo(e.target.value as "local" | "importacion")
                }
              >
                <option value="local">Local</option>
                <option value="importacion">Importación</option>
              </SelectNativo>
              <span className="text-xs text-[var(--fg-subtle)]">
                «Importación» habilita el prorrateo de gastos en la compra.
              </span>
            </label>

            {error ? (
              <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2 text-xs text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAbierto(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={enviar}
            disabled={
              guardando || numero.trim() === "" || razonSocial.trim() === ""
            }
          >
            {guardando ? "Guardando…" : "Crear proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
