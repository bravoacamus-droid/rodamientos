"use client";

import * as React from "react";
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
} from "@rodatech/ui";
import { Eye, FilePenLine, FileUp, Trash2, X } from "lucide-react";

import {
  corregirNumerosDelProveedor,
  enlaceAlPapel,
  quitarPapelDelProveedor,
  subirPapelDelProveedor,
} from "../acciones/adjuntos";

/**
 * Los papeles del proveedor: sus números y sus escaneos.
 *
 * Willy, 07/09 (29:27): *«siempre nos atienden con guía y factura»* — *«¿quiere
 * subir su guía y su factura también?»* — *«claro»*.
 *
 * ---------------------------------------------------------------------------
 * Lo que cambió el 09/09
 * ---------------------------------------------------------------------------
 * Eran tres botones que subían al vuelo, cada uno el suyo, y los números solo
 * se podían poner al recibir. Luis, mirando una recepción guardada sin
 * números:
 *
 *   *«Me dejó guardar como recibido sin poner la guía y la factura; debería
 *   haber un editar o algo para guardar eso de nuevo. Aparte de eso, subir los
 *   documentos con un solo botón de guardar, y con vista previa a los
 *   documentos dentro de la página, en un modal»*.
 *
 * Y al ver la primera versión: *«ponlo pero que tenga color; por eso yo te
 * decía poner un botón editar al costado de Volver al listado»*.
 *
 * Las tres cosas son la misma: **el número y el papel de una guía son la misma
 * guía**. Estaban en dos sitios —uno en el formulario de recibir y otro aquí—
 * y ninguno de los dos se podía corregir después. Ahora hay un botón arriba,
 * en color, y un diálogo con las dos columnas y un solo Guardar.
 *
 * Se sigue pudiendo recibir sin ellos, y es deliberado: la mercadería llega
 * hoy y hay que cuadrar el almacén hoy; la factura viene después, o el número
 * se quedó en un papel en la camioneta. Lo que faltaba no era prohibirlo, era
 * poder volver.
 */

export interface PapelDelProveedor {
  id: string;
  tipo: "guia" | "factura" | "pago" | "otro";
  ruta: string;
  nombre: string;
  tamanoBytes: number | null;
  creadoEn: string;
}

type Papel = PapelDelProveedor["tipo"];

const ETIQUETA: Record<Papel, string> = {
  guia: "Guía",
  factura: "Factura",
  pago: "Pago",
  otro: "Otro",
};

/* La factura es el papel de lo que se debe y el pago el de que ya se pagó: en
   la lista, la pregunta es «¿está pagada esta?». */
const TONO: Record<Papel, "success" | "info" | "neutral"> = {
  guia: "neutral",
  factura: "info",
  pago: "success",
  otro: "neutral",
};

/** Los tipos que acepta el bucket, dichos al `<input>` para que filtre él. */
const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic";

function pesa(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Un PDF se enseña en un marco; una foto, como foto. */
function esPdf(nombre: string): boolean {
  return nombre.toLowerCase().endsWith(".pdf");
}

// ---------------------------------------------------------------------------
// El botón de arriba, y el diálogo
// ---------------------------------------------------------------------------

/**
 * Poner o corregir los números y subir los escaneos.
 *
 * Va arriba, al lado de «Volver al listado», y en color: Luis, 09/09, *«ponlo
 * pero que tenga color»*. En gris y metido dentro de la sección de papeles no
 * lo veía, y es la regla de siempre de esta casa — un botón tiene que parecer
 * un botón, y el que se usa va donde se mira.
 *
 * Dice «Editar papeles» y no «Editar» a secas a propósito. En la cabecera de
 * una recepción, «Editar» promete cambiar cantidades y costos, y eso NO se
 * puede: ya movió el kardex, y corregirlo es un ajuste de inventario con su
 * motivo y su responsable. Prometer lo que no se cumple es peor que no
 * ofrecerlo.
 */
export function EditarPapelesDelProveedor({
  recepcionId,
  hayPapeles,
  guiaProveedor,
  facturaProveedor,
}: {
  recepcionId: string;
  /** Solo para decir en el botón si es la primera vez. */
  hayPapeles: boolean;
  /** El número, no el papel. Puede no haberlo: se recibe sin ellos. */
  guiaProveedor: string | null;
  facturaProveedor: string | null;
}) {
  const router = useRouter();
  const [enCurso, empezar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [abierto, setAbierto] = React.useState(false);
  const [guia, setGuia] = React.useState(guiaProveedor ?? "");
  const [factura, setFactura] = React.useState(facturaProveedor ?? "");
  const [archivos, setArchivos] = React.useState<Partial<Record<Papel, File>>>({});
  const [guardando, setGuardando] = React.useState<string | null>(null);

  const abrir = () => {
    // Se recargan al abrir: entre que se pintó la página y se pulsa, otro pudo
    // haberlos puesto.
    setGuia(guiaProveedor ?? "");
    setFactura(facturaProveedor ?? "");
    setArchivos({});
    setError(null);
    setAbierto(true);
  };

  const cambiaronNumeros =
    guia.trim() !== (guiaProveedor ?? "") || factura.trim() !== (facturaProveedor ?? "");
  const hayAlgo = cambiaronNumeros || Object.keys(archivos).length > 0;

  const ponArchivo = (tipo: Papel) => (f: File | undefined) =>
    setArchivos((prev) => {
      const copia = { ...prev };
      if (f) copia[tipo] = f;
      else delete copia[tipo];
      return copia;
    });

  /**
   * Un solo Guardar para todo.
   *
   * Los archivos van de uno en uno porque cada uno es una subida a Storage y
   * una fila distinta —no hay forma de mandarlos juntos— pero eso es cosa del
   * transporte, no de quien lo usa: se elige todo, se pulsa una vez.
   *
   * Los números primero: si algo falla a mitad, es mejor que lo guardado sea
   * el dato que se buscaba y no medio escaneo.
   */
  function guardar() {
    setError(null);
    empezar(async () => {
      if (cambiaronNumeros) {
        setGuardando("los números");
        const r = await corregirNumerosDelProveedor({
          recepcion_id: recepcionId,
          guia_proveedor: guia.trim() === "" ? null : guia.trim(),
          factura_proveedor: factura.trim() === "" ? null : factura.trim(),
        });
        if (!r.ok) {
          setGuardando(null);
          setError(r.error);
          return;
        }
      }

      for (const [tipo, archivo] of Object.entries(archivos)) {
        setGuardando(ETIQUETA[tipo as Papel].toLowerCase());
        const fd = new FormData();
        fd.set("recepcion_id", recepcionId);
        fd.set("tipo", tipo);
        fd.set("archivo", archivo);
        const r = await subirPapelDelProveedor(fd);
        if (!r.ok) {
          setGuardando(null);
          // Se dice cuál falló: con tres a la vez, «no se pudo subir» a secas
          // deja sin saber cuál hay que repetir.
          setError(`${ETIQUETA[tipo as Papel]}: ${r.error}`);
          return;
        }
      }

      setGuardando(null);
      setAbierto(false);
      setArchivos({});
      router.refresh();
    });
  }

  const primeraVez =
    !hayPapeles && guiaProveedor === null && facturaProveedor === null;

  return (
    <>
      <Button type="button" onClick={abrir} className="gap-1.5">
        <FilePenLine className="size-4" aria-hidden="true" />
        {primeraVez ? "Poner números y papeles" : "Editar papeles"}
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Papeles del proveedor</DialogTitle>
            <DialogDescription>
              El número y el escaneo de cada uno. Rellena lo que tengas; lo que
              falte se puede poner después.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="flex flex-col gap-4">
              <FilaPapel
                titulo="Guía del proveedor"
                idNumero="numero-guia"
                placeholder="001-000123"
                valor={guia}
                onValor={setGuia}
                archivo={archivos.guia}
                onArchivo={ponArchivo("guia")}
              />

              <FilaPapel
                titulo="Factura del proveedor"
                idNumero="numero-factura"
                placeholder="F001-004567"
                valor={factura}
                onValor={setFactura}
                archivo={archivos.factura}
                onArchivo={ponArchivo("factura")}
              />

              {/* El pago no tiene número que apuntar: no es un comprobante del
                  proveedor, es el voucher de la transferencia. */}
              <FilaPapel
                titulo="Pago"
                ayuda="El voucher, cuando se le pague."
                archivo={archivos.pago}
                onArchivo={ponArchivo("pago")}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-3 rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
              >
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={enCurso}
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={enCurso || !hayAlgo}>
              {guardando !== null
                ? `Guardando ${guardando}…`
                : !hayAlgo
                  ? "Nada que guardar"
                  : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// La lista, con la vista previa
// ---------------------------------------------------------------------------

/**
 * Lo que ya está subido.
 *
 * ---------------------------------------------------------------------------
 * Se ve dentro, no en otra pestaña
 * ---------------------------------------------------------------------------
 * Abrir en una pestaña nueva obliga a volver, y el bucket es privado: la URL
 * es firmada y de diez minutos, así que el enlace de esa pestaña se muere solo
 * y no vale para nada después. Dentro del modal se mira, se compara con la
 * línea de arriba y se cierra.
 */
export function PapelesDelProveedor({
  papeles,
  puedeEditar,
}: {
  papeles: PapelDelProveedor[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [enCurso, empezar] = React.useTransition();

  const [mirando, setMirando] = React.useState<{
    papel: PapelDelProveedor;
    url: string;
  } | null>(null);

  function ver(papel: PapelDelProveedor) {
    setError(null);
    empezar(async () => {
      const r = await enlaceAlPapel(papel.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMirando({ papel, url: r.url });
    });
  }

  function quitar(id: string) {
    setError(null);
    empezar(async () => {
      const r = await quitarPapelDelProveedor(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMirando(null);
      router.refresh();
    });
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold">Papeles del proveedor</h2>
        <p className="text-sm text-[var(--fg-muted)]">
          Sus números y los escaneos, todos opcionales. PDF o foto.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
        >
          {error}
        </p>
      ) : null}

      {papeles.length === 0 ? (
        <p className="rounded-md bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
          {/* Se dice «el botón azul de arriba» y no su texto: ese texto
              cambia según sea la primera vez o no, y el color es justo lo que
              Luis pidió para poder encontrarlo. */}
          Todavía no hay ningún papel escaneado. Con el <strong>botón azul de
          arriba</strong> sube la guía y la factura con las que llegó la
          mercadería —es lo que se busca si después no cuadra un precio— y el
          voucher cuando le pagues.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {papeles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <Badge tone={TONO[p.tipo]} size="xs">
                {ETIQUETA[p.tipo]}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm" title={p.nombre}>
                {p.nombre}
              </span>
              <span className="shrink-0 text-sm text-[var(--fg-subtle)]">
                {pesa(p.tamanoBytes)}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enCurso}
                onClick={() => ver(p)}
                className="gap-1.5"
              >
                <Eye className="size-4" aria-hidden="true" />
                Ver
              </Button>

              {puedeEditar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={enCurso}
                  onClick={() => quitar(p.id)}
                  className="gap-1.5 text-[var(--danger)]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Quitar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={mirando !== null} onOpenChange={(v) => (v ? null : setMirando(null))}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {mirando ? ETIQUETA[mirando.papel.tipo] : "Papel"}
            </DialogTitle>
            <DialogDescription>{mirando?.papel.nombre}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {mirando ? (
              esPdf(mirando.papel.nombre) ? (
                // 70vh: lo bastante para leer un A4 sin que el modal se salga
                // de pantalla en un portátil.
                <iframe
                  src={mirando.url}
                  title={mirando.papel.nombre}
                  className="h-[70vh] w-full rounded-md border border-[var(--border)]"
                />
              ) : (
                // Una foto de móvil viene girada la mitad de las veces y en
                // 4000 px de ancho: se encaja, no se recorta.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mirando.url}
                  alt={mirando.papel.nombre}
                  className="mx-auto max-h-[70vh] w-auto rounded-md border border-[var(--border)] object-contain"
                />
              )
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMirando(null)}>
              <X className="size-4" aria-hidden="true" />
              Cerrar
            </Button>
            {mirando ? (
              <Button asChild>
                {/* Descargar sigue abriendo fuera: es lo que se manda al
                    contador, y el enlace firmado dura diez minutos. */}
                <a href={mirando.url} target="_blank" rel="noopener noreferrer">
                  Abrir aparte o descargar
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * Una fila del diálogo: el número y el archivo de la misma cosa.
 *
 * Juntos y no en dos secciones porque son el mismo papel. Separados, se pone
 * el número de la guía en el hueco de la factura — que es exactamente el error
 * que se comete cuando hay cuatro campos seguidos sin agrupar.
 */
function FilaPapel({
  titulo,
  ayuda,
  idNumero,
  placeholder,
  valor,
  onValor,
  archivo,
  onArchivo,
}: {
  titulo: string;
  ayuda?: string;
  idNumero?: string;
  placeholder?: string;
  valor?: string;
  onValor?: (v: string) => void;
  archivo: File | undefined;
  onArchivo: (f: File | undefined) => void;
}) {
  const entrada = React.useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {ayuda ? <p className="text-sm text-[var(--fg-muted)]">{ayuda}</p> : null}

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {idNumero && onValor ? (
          <Campo id={idNumero} label="Número">
            <Input
              id={idNumero}
              value={valor ?? ""}
              onChange={(e) => onValor(e.target.value)}
              placeholder={placeholder}
            />
          </Campo>
        ) : (
          <span className="hidden sm:block" />
        )}

        <div className="flex flex-col justify-end gap-1">
          <input
            ref={entrada}
            type="file"
            accept={ACEPTA}
            className="hidden"
            onChange={(e) => {
              onArchivo(e.target.files?.[0]);
              // Se limpia para que elegir DOS VECES el mismo archivo vuelva a
              // disparar el `change`: sin esto, la segunda no hace nada y
              // parece que la pantalla se colgó.
              e.target.value = "";
            }}
          />

          {archivo ? (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm" title={archivo.name}>
                {archivo.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onArchivo(undefined)}
                className="shrink-0 gap-1"
              >
                <X className="size-4" aria-hidden="true" />
                Quitar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => entrada.current?.click()}
              className="w-full gap-1.5"
            >
              <FileUp className="size-4" aria-hidden="true" />
              Elegir archivo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
