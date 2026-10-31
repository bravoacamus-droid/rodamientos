"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
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
  Moneda,
  SelectNativo,
  Textarea,
  buttonVariants,
  formatearFecha,
} from "@rodatech/ui";
import { FileUp, HandCoins, X } from "lucide-react";
import { alcanzaUmbral } from "@/modules/facturacion/dominio/retencion";

import { registrarCobro, type ResultadoCobro } from "../acciones/cobrar";
import { tipoCambioDelPago } from "../acciones/tipo-cambio";
import { cuotasDelComprobante } from "../acciones/gestionar";
import {
  avisosPago,
  bloqueosPago,
  quedaSaldado,
  repartoEnCuotas,
  retencionPendiente,
  retieneDePorDefecto,
} from "../dominio/cobro";
import {
  ETIQUETA_MEDIO,
  type CuotaComprobante,
  type DocumentoPorCobrar,
  type MedioPago,
  saldoEnMoneda,
} from "../dominio/tipos";
import { TIPOS_VOUCHER } from "./voucher-del-pago";

const dos = (n: number) => Math.round(n * 100) / 100;

/**
 * Registrar el cobro de un documento.
 *
 * El importe arranca en el SALDO, no en cero: lo normal es que el cliente
 * pague lo que debe, y pedir que lo teclee cada vez es pedirle que se
 * equivoque.
 *
 * Enseña el reparto sobre las cuotas antes de confirmar. No es adorno: es lo
 * que el cobrador le va a decir al cliente por teléfono —«con esto te queda
 * cerrada la primera y la segunda a la mitad»— y calcularlo de cabeza mientras
 * hablas es como se cuelan los errores.
 */
export function Cobrador({
  documento,
  hoy,
}: {
  documento: DocumentoPorCobrar;
  /** La fecha la fija el servidor: el dominio no lee reloj. */
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  const [monto, setMonto] = React.useState(documento.saldo);
  const [medio, setMedio] = React.useState<MedioPago>("transferencia");
  const [fecha, setFecha] = React.useState(hoy);
  const [referencia, setReferencia] = React.useState("");
  const [observaciones, setObservaciones] = React.useState("");

  /*
    La retención (31/10). Willy: *«son agentes de retención por lo que
    depositaron el 97 % osea $637.19, como lo registro??»*. Con la casilla, el
    importe de arriba es lo DEPOSITADO y la retención va aparte: se registran
    los dos cobros de una vez —lo que entró al banco y lo que el cliente paga
    a SUNAT— y la factura queda saldada.
  */
  const pendienteRet = retencionPendiente(documento);
  const [retiene, setRetiene] = React.useState(false);
  const [retencion, setRetencion] = React.useState(pendienteRet);
  // Si la persona ya tocó la casilla, el umbral que llega tarde no la mueve.
  const tocoRetencion = React.useRef(false);
  // ¿Llega a S/ 700? Al cambio del día de la factura, que es el de la ley.
  const [umbral, setUmbral] = React.useState<boolean | null>(
    documento.tipo_cambio ? alcanzaUmbral(documento.total, documento.tipo_cambio) : null,
  );

  /*
    Pagó en soles (14/10). Willy, 13/10: *«generalmente [en dólares]… uno que
    otro en soles; 99 % son dólares»*. Se registra en dólares —la deuda es en
    dólares—, convertido al tipo de cambio que se diga, y la nota deja escrito
    cuántos soles fueron y a cuánto.
  */
  /*
    Una factura EN SOLES (116) se cobra en soles, al cambio de su factura —el
    que se congeló al aprobar la cotización—, no al del día del pago. Así lo
    que el cliente paga entero salda entero: si paga todo lo pendiente en
    soles, se aplica exacto el saldo en dólares, sin el céntimo suelto que
    dejaría dividir.
  */
  const esPen = documento.moneda === "PEN" && Boolean(documento.tipo_cambio);
  const saldoPen = saldoEnMoneda(documento);
  const [enSoles, setEnSoles] = React.useState(esPen);
  const [soles, setSoles] = React.useState(esPen ? saldoPen.toFixed(2) : "");
  const [tc, setTc] = React.useState(esPen ? String(documento.tipo_cambio) : "");
  const [trayendoTc, traerTc] = React.useTransition();
  const [avisoTc, setAvisoTc] = React.useState<string | null>(null);
  const solesNum = Number(soles.replace(",", "."));
  const tcNum = Number(tc.replace(",", "."));
  // Lo que queda por depositar, sin la retención: pagarlo entero salda entero.
  const retUsd = retiene ? retencion : 0;
  const retPen = esPen && retiene ? dos(retencion * (documento.tipo_cambio ?? 0)) : 0;
  const aDolares = (s: number, t: number) =>
    esPen && s >= saldoPen - retPen - 0.005 ? dos(documento.saldo - retUsd) : dos(s / t);
  const conversion = enSoles && solesNum > 0 && tcNum > 0 ? aDolares(solesNum, tcNum) : null;
  const pedirTc = () => {
    setAvisoTc(null);
    traerTc(async () => {
      const t = await tipoCambioDelPago(fecha);
      if (t.ok) {
        setTc(String(t.venta));
        if (solesNum > 0) setMonto(aDolares(solesNum, t.venta));
      } else setAvisoTc(`${t.error} Escríbelo a mano.`);
    });
  };

  /** Marca o desmarca la retención y rehace el depósito para que cuadre. */
  const ponerRetencion = (si: boolean, ret = pendienteRet) => {
    setRetiene(si);
    setRetencion(ret);
    setMonto(dos(documento.saldo - (si ? ret : 0)));
    if (esPen) {
      const rp = si ? dos(ret * (documento.tipo_cambio ?? 0)) : 0;
      setSoles(dos(saldoPen - rp).toFixed(2));
    }
  };

  const [cuotas, setCuotas] = React.useState<CuotaComprobante[]>([]);
  const entradaVoucher = React.useRef<HTMLInputElement>(null);
  const [voucher, setVoucher] = React.useState<string | null>(null);

  const [resultado, cobrar, cobrando] = useActionState<
    ResultadoCobro | null,
    FormData
  >(async (previo, formData) => {
    const r = await registrarCobro(previo, formData);
    // React 19 vacía el formulario al terminar la acción, y el selector de
    // archivo con él: el nombre tiene que irse también, o diría que hay un
    // voucher que ya no se va a mandar.
    setVoucher(null);
    if (r.ok) {
      setAbierto(false);
      router.refresh();
    }
    return r;
  }, null);

  // Las cuotas se piden al abrir, no al montar: la mayoría de las filas de la
  // cartera no se van a cobrar en esta sesión.
  React.useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void cuotasDelComprobante(documento.id).then((r) => {
      if (vigente && r.ok) setCuotas(r.datos);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, documento.id]);

  // El umbral de S/ 700, solo si hace falta para decidir: cliente agente,
  // factura sin retención de nacimiento y sin cambio propio. Una consulta
  // por día, con caché.
  React.useEffect(() => {
    if (!abierto || umbral !== null) return;
    if (!documento.cliente_agente || documento.retencion_aplica || pendienteRet <= 0) return;
    let vigente = true;
    void tipoCambioDelPago(documento.fecha_emision).then((t) => {
      if (!vigente || !t.ok) return;
      const llega = alcanzaUmbral(documento.total, t.venta);
      setUmbral(llega);
      if (!tocoRetencion.current && retieneDePorDefecto(documento, llega)) ponerRetencion(true);
    });
    return () => {
      vigente = false;
    };
    // `ponerRetencion` y `documento` cambian con cada render; lo que decide es abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, umbral]);

  // Lo que baja del saldo: el depósito más lo retenido.
  const aplicado = dos(monto + retUsd);
  const bloqueos = bloqueosPago(documento, aplicado, fecha);
  if (retiene && !(retencion > 0)) {
    bloqueos.push({ campo: "monto", mensaje: "La retención tiene que ser mayor que cero." });
  }
  if (retiene && monto < 0) {
    bloqueos.push({ campo: "monto", mensaje: "Lo depositado no puede ser negativo." });
  }
  const avisos = avisosPago(documento, aplicado, medio, fecha, hoy);
  if (retiene && umbral === false) {
    avisos.push({
      clave: "bajo-umbral",
      mensaje: "Esta factura no llega a S/ 700: por ley no se le retiene. Compruébalo con el cliente.",
    });
  }
  const salda = quedaSaldado(documento.saldo, aplicado);
  const reparto = cuotas.length > 1 ? repartoEnCuotas(cuotas, aplicado) : [];

  const notaSoles =
    conversion !== null
      ? `Pagó S/ ${solesNum.toFixed(2)} al tipo de cambio ${tcNum.toFixed(3)} (= $ ${conversion.toFixed(2)}).`
      : null;
  const payload = JSON.stringify({
    pagos: [
      // Sin depósito, solo la retención: el cliente ya pagó lo demás antes.
      ...(monto > 0
        ? [
            {
              comprobante_id: documento.id,
              fecha,
              monto,
              medio,
              referencia: referencia.trim() || null,
              observaciones: [notaSoles, observaciones.trim() || null].filter(Boolean).join(" ") || null,
            },
          ]
        : []),
      ...(retiene && retencion > 0
        ? [
            {
              comprobante_id: documento.id,
              fecha,
              monto: retencion,
              medio: "retencion" as const,
              referencia: null,
              observaciones: "Retención del IGV (3 %) que el cliente paga a SUNAT.",
            },
          ]
        : []),
    ],
  });

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) {
          // Al reabrir se vuelve al saldo vigente: si ya se cobró algo, el
          // importe de antes ya no vale.
          tocoRetencion.current = false;
          const marcar = retieneDePorDefecto(documento, umbral);
          setRetiene(marcar);
          setRetencion(pendienteRet);
          setMonto(dos(documento.saldo - (marcar ? pendienteRet : 0)));
          if (esPen) {
            setEnSoles(true);
            setSoles(dos(saldoPen - (marcar ? dos(pendienteRet * (documento.tipo_cambio ?? 0)) : 0)).toFixed(2));
            setTc(String(documento.tipo_cambio));
          }
          setFecha(hoy);
          setVoucher(null);
        }
      }}
    >
      {/* De 32 px en escritorio pasaba a 38, como el resto de botones, y con
          su icono: es la acción principal de la fila (revisión por módulos
          del 02/10). */}
      <DialogTrigger className={buttonVariants({ variant: "primary" })}>
        <HandCoins aria-hidden="true" />
        Cobrar
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cobrar {documento.numero}</DialogTitle>
          <DialogDescription>
            {documento.cliente} · saldo{" "}
            <strong>
              <Moneda
                valor={esPen ? saldoPen : documento.saldo}
                moneda={esPen ? "PEN" : "USD"}
                tamano="sm"
                className="text-inherit"
              />
            </strong>
            {esPen ? ` · factura en soles, al cambio ${documento.tipo_cambio?.toFixed(3)}` : ""}
            {documento.dias_vencido > 0
              ? ` · vencido hace ${documento.dias_vencido} días`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* El pie va DENTRO del formulario: su botón es el que envía. Por eso
            el cuerpo se envuelve aparte y no el formulario entero. */}
        <form action={cobrar}>
          <DialogBody className="flex flex-col gap-3">
            <input type="hidden" name="cobro" value={payload} />

            {/* La retención, lo primero: decide qué significa el importe. */}
            {pendienteRet > 0 ? (
              <div
                className={`flex flex-col gap-2 rounded-sm border p-2.5 ${retiene ? "border-[var(--info)] bg-[var(--info-bg)]" : "border-[var(--border)]"}`}
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={retiene}
                    onChange={(e) => {
                      tocoRetencion.current = true;
                      ponerRetencion(e.target.checked);
                    }}
                  />
                  El cliente retuvo el 3 % (agente de retención)
                </label>
                {retiene ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-sm">Retención ($)</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={retencion}
                        onChange={(e) => {
                          tocoRetencion.current = true;
                          ponerRetencion(true, Number(e.target.value));
                        }}
                        className="w-32 tabular"
                      />
                    </label>
                    <span className="pb-2 text-sm text-[var(--fg-muted)]">
                      3 % de <Moneda valor={documento.total} tamano="sm" className="text-inherit" />
                      {esPen ? ` · S/ ${retPen.toFixed(2)}` : ""}. No entra al banco: el cliente la paga a SUNAT.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : documento.retencion_cobrada > 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                La retención de esta factura ya se registró (
                <Moneda valor={documento.retencion_cobrada} tamano="sm" className="text-inherit" />
                ).
              </p>
            ) : null}

            {/* De dos en dos solo si caben: a 390 px la fecha se quedaba en
                un tercio del diálogo y se cortaba (revisión por módulos del
                02/10). */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {retiene ? "Lo que depositó" : "Importe"} <span className="text-[var(--danger)]">*</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                  className="tabular"
                  autoFocus
                />
                {/* Atajo para el caso normal: el cliente paga lo que debe. Un
                    botón con borde y no un enlace subrayado: Willy tiene que
                    ver que se pulsa (CLAUDE.md §1). */}
                {!salda ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMonto(dos(documento.saldo - retUsd));
                      if (enSoles && esPen) setSoles(dos(saldoPen - retPen).toFixed(2));
                    }}
                    className="self-start"
                  >
                    Poner el saldo completo
                  </Button>
                ) : (
                  <span className="text-sm text-[var(--ok)]">
                    Queda saldado.
                  </span>
                )}
              </label>

              {/* En soles: se escribe lo que pagó y a cuánto, y el importe en
                  dólares se calcula solo. */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={enSoles}
                    onChange={(e) => {
                      setEnSoles(e.target.checked);
                      if (e.target.checked && !tc) pedirTc();
                    }}
                  />
                  El cliente pagó en soles
                </label>
                {enSoles ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-sm">Pagó (S/)</span>
                      <Input
                        inputMode="decimal"
                        value={soles}
                        onChange={(e) => {
                          setSoles(e.target.value);
                          const n = Number(e.target.value.replace(",", "."));
                          if (n > 0 && tcNum > 0) setMonto(aDolares(n, tcNum));
                        }}
                        className="w-32 tabular"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm">Tipo de cambio</span>
                      <Input
                        inputMode="decimal"
                        value={tc}
                        // El de la factura, fijo: es el que convierte su deuda.
                        readOnly={esPen}
                        onChange={(e) => {
                          setTc(e.target.value);
                          const t = Number(e.target.value.replace(",", "."));
                          if (solesNum > 0 && t > 0) setMonto(aDolares(solesNum, t));
                        }}
                        className="w-28 tabular"
                        placeholder={trayendoTc ? "Consultando…" : "3.450"}
                      />
                    </label>
                    {esPen ? (
                      <span className="pb-2 text-sm text-[var(--fg-muted)]">el de la factura</span>
                    ) : (
                      <Button type="button" variant="outline" onClick={pedirTc} disabled={trayendoTc}>
                        Traer de SUNAT
                      </Button>
                    )}
                    {conversion !== null ? (
                      <span className="text-sm">
                        = <strong className="tabular">$ {conversion.toFixed(2)}</strong>
                      </span>
                    ) : null}
                    {avisoTc ? <span className="w-full text-sm text-[var(--warn)]">{avisoTc}</span> : null}
                  </div>
                ) : null}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Forma de pago</span>
                <SelectNativo
                  value={medio}
                  onChange={(e) => setMedio(e.target.value as MedioPago)}
                >
                  {/* Sin «Detracción» (14/10): Willy vende productos y a él
                      solo le retienen. Sin «Nota de crédito» (157): la nota
                      baja el saldo sola al emitirse. Sin «Retención» (31/10):
                      elegida aquí se llevaba el total entero como retenido;
                      va con la casilla de arriba. Las tres se siguen leyendo
                      en el historial. */}
                  {Object.entries(ETIQUETA_MEDIO)
                    .filter(([v]) => v !== "detraccion" && v !== "nota_credito" && v !== "retencion")
                    .map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </SelectNativo>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Fecha</span>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Referencia</span>
                <Input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="N.º de operación, cheque o depósito"
                />
              </label>
            </div>

            {/* El voucher (109), opcional: la foto o el PDF de la transferencia.
                Un botón con borde y no un «Elegir archivo» del navegador, que
                cambia de idioma y de forma según el equipo (CLAUDE.md §1). */}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Voucher del pago (foto o PDF)</span>
              <input
                ref={entradaVoucher}
                type="file"
                name="voucher"
                accept={TIPOS_VOUCHER}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => setVoucher(e.target.files?.[0]?.name ?? null)}
              />
              {voucher ? (
                <div className="flex items-center gap-2 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
                  <FileUp className="size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm" title={voucher}>
                    {voucher}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (entradaVoucher.current) entradaVoucher.current.value = "";
                      setVoucher(null);
                    }}
                    className="gap-1"
                  >
                    <X className="size-4" aria-hidden="true" />
                    Quitar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => entradaVoucher.current?.click()}
                  className="gap-1.5 self-start"
                >
                  <FileUp className="size-4" aria-hidden="true" />
                  Subir voucher
                </Button>
              )}
              <span className="text-sm text-[var(--fg-muted)]">
                Opcional. También se puede subir después, desde «Lo cobrado».
              </span>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observaciones</span>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
              />
            </label>

            {/* El reparto sobre las cuotas: lo que el cobrador le va a decir al
              cliente. Solo se enseña si hay más de una; con una sola no aporta. */}
            {reparto.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1 text-sm font-medium">Cómo se reparte</p>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {reparto.map((r) => (
                    <li key={r.cuota.id} className="flex justify-between gap-2">
                      <span className="text-[var(--fg-muted)]">
                        Cuota {r.cuota.numero} · vence{" "}
                        {formatearFecha(r.cuota.fecha_vencimiento)}
                      </span>
                      <span className="tabular">
                        {r.aplica > 0 ? `+$ ${r.aplica.toFixed(2)}` : "—"}
                        <span
                          className={`ml-2 ${r.quedaSaldo === 0 ? "text-[var(--ok)]" : "text-[var(--fg-muted)]"}`}
                        >
                          {r.quedaSaldo === 0
                            ? "saldada"
                            : `quedan $ ${r.quedaSaldo.toFixed(2)}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {avisos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <ul className="flex flex-col gap-1 text-sm">
                  {avisos.map((a) => (
                    <li key={a.clave}>· {a.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {bloqueos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5">
                <ul className="flex flex-col gap-1 text-sm text-[var(--danger)]">
                  {bloqueos.map((b, i) => (
                    <li key={`${b.campo}-${i}`}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {resultado && !resultado.ok ? (
              <p className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {resultado.error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={bloqueos.length > 0 || cobrando}>
              {cobrando
                ? "Registrando…"
                : retiene
                  ? `Registrar $ ${monto.toFixed(2)} + retención $ ${retencion.toFixed(2)}`
                  : enSoles && esPen && solesNum > 0
                    ? `Registrar S/ ${solesNum.toFixed(2)}`
                    : `Registrar $ ${monto.toFixed(2)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
