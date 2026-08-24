"use client";

// Cliente: es un diálogo con estado propio y llama a dos Server Actions.

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Input,
  SelectNativo,
} from "@rodatech/ui";

import { buscarPorDocumento } from "@/modules/clientes/acciones/consultar";
import { guardarCliente } from "@/modules/clientes/acciones/guardar";
import type { TipoDocumento } from "@/modules/clientes/dominio/tipos";

import type { ClienteOpcion } from "./index";

/**
 * Alta rápida de cliente sin salir de la cotización.
 *
 * Willy lo pidió así (34:12): *pegar el RUC desde la propia cotización*. El
 * caso es concreto y frecuente — llega un cliente nuevo, hay que cotizarle
 * ahora, y mandarlo a otra pantalla significa perder la cotización a medias.
 *
 * Aquí solo caben los tres campos imprescindibles: tipo de documento, número y
 * razón social. Todo lo demás —crédito, dirección, contacto— se completa
 * después desde el maestro. Es la misma lección de siempre: *«a las justas me
 * dan correo»*; pedir la ficha entera en mitad de una venta no hace que los
 * datos aparezcan.
 *
 * Guarda con la MISMA Server Action que el maestro. Un alta paralela sería un
 * segundo sitio donde validar el RUC, generar el código y desambiguar
 * duplicados, y los dos se separarían al primer cambio.
 */
export function ClienteRapido({
  onCreado,
}: {
  /** Recibe el cliente ya guardado para seleccionarlo en la cotización. */
  onCreado: (cliente: ClienteOpcion) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoDocumento>("RUC");
  const [numero, setNumero] = React.useState("");
  const [razonSocial, setRazonSocial] = React.useState("");
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [consultando, consultar] = React.useTransition();
  const [guardando, guardar] = React.useTransition();

  const limpiar = () => {
    setTipo("RUC");
    setNumero("");
    setRazonSocial("");
    setAviso(null);
    setError(null);
  };

  const traerDatos = () => {
    setError(null);
    setAviso(null);
    consultar(async () => {
      const r = await buscarPorDocumento(tipo, numero.trim());
      if (!r.ok) {
        // Cuota agotada NO bloquea: se escribe a mano y se sigue.
        setError(
          r.agotada
            ? `${r.error} Escribe la razón social a mano y guarda igual.`
            : r.error,
        );
        return;
      }
      setRazonSocial(r.datos.razon_social);
      if (r.datos.condicion === "NO HABIDO") {
        setAviso("SUNAT lo marca como NO HABIDO. Su crédito fiscal es observable.");
      } else if (r.datos.estado && r.datos.estado !== "ACTIVO") {
        setAviso(`Estado en SUNAT: ${r.datos.estado}.`);
      }
    });
  };

  const enviar = () => {
    setError(null);
    guardar(async () => {
      // La acción del maestro espera FormData con el JSON en `cliente`.
      const datos = new FormData();
      datos.set(
        "cliente",
        JSON.stringify({
          tipo_documento: tipo,
          numero_documento: numero.trim() || null,
          razon_social: razonSocial.trim(),
          nombre_comercial: null,
          direccion: null,
          ubigeo_codigo: null,
          referencia_direccion: null,
          sector: null,
          contacto: null,
          cargo_contacto: null,
          email: null,
          telefono: null,
          whatsapp: null,
          condicion_pago: "contado",
          linea_credito: 0,
          dias_credito: 0,
          dias_gracia: 0,
          vendedor_id: null,
          notas: null,
        }),
      );

      const r = await guardarCliente(null, datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }

      onCreado({
        id: r.id,
        codigo: r.codigo,
        razon_social: r.razonSocial,
        numero_documento: numero.trim() || null,
        contacto: null,
        // Nace al contado: dar crédito a alguien de quien no se sabe nada es
        // una decisión, no un valor por defecto.
        condicion_pago: "contado",
        dias_credito: 0,
        bloqueado: false,
      });

      limpiar();
      setAbierto(false);
    });
  };

  const listo = razonSocial.trim().length > 2 && !guardando;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) limpiar();
      }}
    >
      {/* El disparador va DENTRO del Dialog, que es como Radix lo espera: un
          botón suelto empujando el estado desde fuera funciona en teoría, pero
          aquí el clic se perdía entre el formulario y el portal. */}
      <DialogTrigger className="text-xs text-brand-700 underline underline-offset-2 hover:text-brand-600">
        + Cliente nuevo
      </DialogTrigger>

        <DialogContent className="max-w-md">
          <DialogTitle>Cliente nuevo</DialogTitle>
          <DialogDescription>
            Lo mínimo para poder cotizarle. El resto de la ficha se completa
            después desde Clientes.
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Documento</span>
                <SelectNativo
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoDocumento)}
                >
                  <option value="RUC">RUC</option>
                  <option value="DNI">DNI</option>
                  <option value="CE">C.E.</option>
                  <option value="SIN_DOC">Sin doc.</option>
                </SelectNativo>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Número</span>
                <div className="flex gap-2">
                  <Input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
                    placeholder={tipo === "RUC" ? "20131312955" : "46027897"}
                    className="tabular"
                    inputMode="numeric"
                    autoFocus
                  />
                  {tipo === "RUC" || tipo === "DNI" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={traerDatos}
                      disabled={consultando || numero.trim() === ""}
                    >
                      {consultando ? "…" : "Traer"}
                    </Button>
                  ) : null}
                </div>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Razón social <span className="text-[var(--danger)]">*</span>
              </span>
              <Input
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="Se rellena sola al traer los datos"
              />
            </label>

            {aviso ? (
              <p className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
                {aviso}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <p className="text-xs text-[var(--fg-muted)]">
              Nace <strong>al contado</strong>. Darle crédito es una decisión que
              se toma en su ficha, no un valor por defecto.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={enviar} disabled={!listo}>
              {guardando ? "Guardando…" : "Crear y usar"}
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
