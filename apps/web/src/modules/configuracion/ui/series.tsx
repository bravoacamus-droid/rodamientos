"use client";

/*
 * "use client" OBLIGATORIO: edición en línea con avisos que cambian al teclear.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Campo,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Input,
  SelectNativo,
  toast,
} from "@rodatech/ui";
import { Plus } from "lucide-react";

import { crearSerie, guardarSerie, type ResultadoConfig } from "../acciones/guardar";
import { avisosDelInicial, proximoNumero, serieValida } from "../dominio/serie";
import {
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_FISCALES,
  type SerieDocumento,
  type TipoDocumento,
} from "../dominio/tipos";

function useAccion() {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);

  const correr = React.useCallback(
    async (fn: () => Promise<ResultadoConfig>): Promise<boolean> => {
      setOcupado(true);
      try {
        const r = await fn();
        if (r.ok) {
          toast.success(r.mensaje);
          router.refresh();
          return true;
        }
        toast.error(r.error);
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [router],
  );

  return { ocupado, correr };
}

/**
 * Las series y sus correlativos.
 *
 * La columna que justifica la pantalla es «desde». Willy: *«los correlativos
 * van a iniciar desde el número que usted se quedó»* (06:08). Hasta ahora eso
 * era un `update` a mano contra producción, y equivocarse ahí significa emitir
 * una factura con un número que SUNAT ya tiene.
 */
export function TablaSeries({
  series,
  puedeEditar,
}: {
  series: SerieDocumento[];
  puedeEditar: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--fg-subtle)]">
          «Desde» es el número en el que se quedó el sistema anterior. «Va por»
          es el último que se emitió aquí. El próximo documento se lleva el mayor
          de los dos, más uno — los correlativos nunca retroceden.
        </p>
        {puedeEditar ? <DialogNuevaSerie /> : null}
      </div>

      <div className="scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Serie</th>
              <th className="px-3 py-2 text-right font-medium">Desde</th>
              <th className="px-3 py-2 text-right font-medium">Va por</th>
              <th className="px-3 py-2 font-medium">El próximo</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <FilaSerie key={s.id} serie={s} puedeEditar={puedeEditar} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaSerie({
  serie,
  puedeEditar,
}: {
  serie: SerieDocumento;
  puedeEditar: boolean;
}) {
  const { ocupado, correr } = useAccion();
  const [inicial, setInicial] = React.useState(String(serie.correlativo_inicial));

  const propuesto = Number(inicial);
  const cambiado = propuesto !== serie.correlativo_inicial && inicial.trim() !== "";
  const avisos = cambiado ? avisosDelInicial(serie, propuesto) : [];
  const bloqueado = avisos.some((a) => a.tono === "danger");

  const fiscal = TIPOS_FISCALES.includes(serie.tipo);

  return (
    <>
      <tr className="border-b border-[var(--border-soft)]">
        <td className="px-3 py-2">
          {ETIQUETA_TIPO_DOCUMENTO[serie.tipo]}
          {fiscal ? (
            <Badge tone="info" size="xs" className="ml-2">
              SUNAT
            </Badge>
          ) : null}
        </td>

        <td className="px-3 py-2">
          <span className="font-mono">{serie.serie}</span>
          {serie.predeterminada ? (
            <Badge tone="brand" size="xs" className="ml-2">
              Por defecto
            </Badge>
          ) : null}
          {!serie.activo ? (
            <Badge tone="neutral" size="xs" className="ml-2">
              Inactiva
            </Badge>
          ) : null}
        </td>

        <td className="px-3 py-2 text-right">
          {puedeEditar ? (
            <Input
              value={inicial}
              onChange={(e) => setInicial(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              aria-label={`Correlativo inicial de ${serie.serie}`}
              className="h-8 w-28 text-right tabular"
            />
          ) : (
            <span className="tabular">{serie.correlativo_inicial}</span>
          )}
        </td>

        <td className="px-3 py-2 text-right tabular text-[var(--fg-muted)]">
          {serie.correlativo_actual}
        </td>

        <td className="px-3 py-2 font-mono text-[0.8rem]">{proximoNumero(serie)}</td>

        <td className="whitespace-nowrap px-3 py-2 text-right">
          {puedeEditar ? (
            <div className="flex justify-end gap-1">
              {cambiado ? (
                <>
                  <Button
                    size="sm"
                    disabled={ocupado || bloqueado}
                    onClick={async () => {
                      const bien = await correr(() =>
                        guardarSerie(serie.id, { correlativo_inicial: propuesto }),
                      );
                      if (!bien) setInicial(String(serie.correlativo_inicial));
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInicial(String(serie.correlativo_inicial))}
                  >
                    Deshacer
                  </Button>
                </>
              ) : (
                <>
                  {!serie.predeterminada && serie.activo ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      onClick={() => correr(() => guardarSerie(serie.id, { predeterminada: true }))}
                    >
                      Usar por defecto
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ocupado || serie.predeterminada}
                    title={
                      serie.predeterminada
                        ? "La serie por defecto no se puede desactivar: elige otra antes."
                        : undefined
                    }
                    onClick={() => correr(() => guardarSerie(serie.id, { activo: !serie.activo }))}
                  >
                    {serie.activo ? "Desactivar" : "Activar"}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </td>
      </tr>

      {avisos.length > 0 ? (
        <tr className="border-b border-[var(--border-soft)]">
          <td colSpan={6} className="px-3 pb-2">
            <ul className="flex flex-col gap-0.5">
              {avisos.map((a, i) => (
                <li
                  key={i}
                  className={`text-xs ${
                    a.tono === "danger"
                      ? "text-[var(--danger)]"
                      : a.tono === "warning"
                        ? "text-[var(--warn)]"
                        : "text-[var(--fg-muted)]"
                  }`}
                >
                  {a.texto}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const TIPOS: readonly TipoDocumento[] = [
  "factura",
  "boleta",
  "nota_credito",
  "nota_debito",
  "guia_remision",
  "cotizacion",
  "compra",
  "recepcion",
  "ajuste_inventario",
];

function DialogNuevaSerie() {
  const { ocupado, correr } = useAccion();
  const [abierto, setAbierto] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoDocumento>("factura");
  const [serie, setSerie] = React.useState("");
  const [inicial, setInicial] = React.useState("1");
  const [longitud, setLongitud] = React.useState("8");
  const [descripcion, setDescripcion] = React.useState("");

  const formatoOk = serieValida(serie);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Nueva serie
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogTitle>Nueva serie</DialogTitle>
        <DialogDescription>
          Se crea activa, pero NO como predeterminada: cambiar por dónde numera
          un tipo de documento es una decisión aparte, y se toma con «usar por
          defecto».
        </DialogDescription>

        <div className="flex flex-col gap-3 py-2">
          <Campo id="nueva-tipo" label="Tipo de documento">
            <SelectNativo
              id="nueva-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDocumento)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_DOCUMENTO[t]}
                </option>
              ))}
            </SelectNativo>
          </Campo>

          <Campo
            id="nueva-serie"
            label="Serie"
            ayuda="De 2 a 6 caracteres, mayúsculas o dígitos. F001, B001, T001…"
            error={serie && !formatoOk ? "Ese formato no lo acepta la base." : undefined}
          >
            <Input
              id="nueva-serie"
              value={serie}
              onChange={(e) => setSerie(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="nueva-inicial" label="Empieza en">
              <Input
                id="nueva-inicial"
                value={inicial}
                onChange={(e) => setInicial(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="tabular"
              />
            </Campo>
            <Campo id="nueva-longitud" label="Dígitos" ayuda="Entre 4 y 10.">
              <Input
                id="nueva-longitud"
                value={longitud}
                onChange={(e) => setLongitud(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="tabular"
              />
            </Campo>
          </div>

          <Campo id="nueva-desc" label="Descripción">
            <Input
              id="nueva-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Campo>

          {formatoOk && Number(inicial) > 0 && Number(longitud) >= 4 ? (
            <p className="text-xs text-[var(--fg-muted)]">
              El primer documento será{" "}
              <span className="font-mono">
                {`${serie}-${String(Number(inicial)).padStart(Number(longitud), "0")}`}
              </span>
              .
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={ocupado || !formatoOk}
            onClick={async () => {
              const bien = await correr(() =>
                crearSerie({
                  tipo,
                  serie,
                  correlativo_inicial: Number(inicial) || 1,
                  longitud: Number(longitud) || 8,
                  descripcion: descripcion.trim() || null,
                }),
              );
              if (bien) {
                setAbierto(false);
                setSerie("");
                setDescripcion("");
              }
            }}
          >
            {ocupado ? "Creando…" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
