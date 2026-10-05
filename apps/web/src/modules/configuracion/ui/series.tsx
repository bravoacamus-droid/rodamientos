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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  SelectNativo,
  toast,
} from "@rodatech/ui";
import { Plus } from "lucide-react";

import {
  crearSerie,
  guardarSerie,
  type ResultadoConfig,
} from "../acciones/guardar";
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
  /*
    Las de ensayo que HOY son las que se usarían al emitir. Es la lista que
    hay que cambiar antes de facturar de verdad, y por eso se calcula y se
    enseña arriba en vez de dejarla repartida por la tabla.
  */
  const pruebasPorDefecto = series.filter(
    (s) => s.es_prueba && s.predeterminada && s.activo,
  );

  /*
    Lo tecleado en «Desde», por serie, hasta que se guarda o se deshace. Vive
    aquí y no en cada fila porque cada serie se pinta dos veces (tarjeta y
    tabla) y las dos tienen que enseñar el mismo número. Sin borrador, lo que
    vale es lo guardado.
  */
  const [borradores, setBorradores] = React.useState<Record<string, string>>({});
  const inicialDe = (s: SerieDocumento) =>
    borradores[s.id] ?? String(s.correlativo_inicial);

  return (
    <div className="@container flex flex-col gap-3">
      {pruebasPorDefecto.length > 0 ? (
        <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
          <p className="text-sm font-medium">
            Ahora mismo se emitiría con series de pruebas
          </p>
          <p className="mt-1 text-sm">
            {pruebasPorDefecto.map((s) => s.serie).join(", ")} —{" "}
            <strong>está bien mientras estemos probando</strong>: así los
            ensayos no gastan números del talonario de verdad.
          </p>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Antes de facturar en serio hay que poner por defecto la serie que
            continúa la numeración. No hace falta acordarse: al pasar a
            producción el sistema se niega a emitir con estas y dice cuál usar.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* `text-sm`: esto explica cómo funciona el correlativo, y es de lo
            que más falta hace leer de toda la pantalla. */}
        <p className="text-sm text-[var(--fg-subtle)]">
          «Desde» es el número en el que se quedó el sistema anterior. «Va por»
          es el último que se emitió aquí. El próximo documento se lleva el
          mayor de los dos, más uno — los correlativos nunca retroceden.
        </p>
        {puedeEditar ? <DialogNuevaSerie /> : null}
      </div>

      {/*
        Revisión de diseño del 02/10: en el teléfono esta tabla se desplazaba
        de lado (390 px: 319 → 791). Por debajo de `@3xl` (48 rem, 816 px con
        la base de 17 px) cada serie es una tarjeta; se mide el ancho de ESTA
        caja (`@container`), no el de la pantalla.
      */}
      <ul className="flex flex-col gap-2.5 @3xl:hidden">
        {series.map((s) => (
          <TarjetaSerie
            key={s.id}
            serie={s}
            puedeEditar={puedeEditar}
            inicial={inicialDe(s)}
            setInicial={(v) => setBorradores((b) => ({ ...b, [s.id]: v }))}
          />
        ))}
      </ul>

      <div className="scroll-x hidden @3xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Serie</th>
              <th className="px-3 py-2 text-right font-medium">Desde</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Va por</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">El próximo</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <FilaSerie
                key={s.id}
                serie={s}
                puedeEditar={puedeEditar}
                inicial={inicialDe(s)}
                setInicial={(v) => setBorradores((b) => ({ ...b, [s.id]: v }))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Lo que la fila y la tarjeta de una serie comparten: el número tecleado en
 * «Desde», sus avisos y las acciones.
 *
 * El borrador vive en `TablaSeries` y no aquí, porque la misma serie se pinta
 * dos veces —tabla y tarjeta, una de las dos oculta según el ancho—: con un
 * estado en cada una, lo tecleado en la tarjeta se perdería al ensanchar la
 * ventana y aparecería el número viejo en la tabla.
 */
function useEdicionSerie(
  serie: SerieDocumento,
  inicial: string,
  setInicial: (v: string) => void,
) {
  const { ocupado, correr } = useAccion();

  const propuesto = Number(inicial);
  const cambiado =
    propuesto !== serie.correlativo_inicial && inicial.trim() !== "";
  const avisos = cambiado ? avisosDelInicial(serie, propuesto) : [];
  const bloqueado = avisos.some((a) => a.tono === "danger");

  return {
    ocupado,
    cambiado,
    avisos,
    bloqueado,
    deshacer: () => setInicial(String(serie.correlativo_inicial)),
    guardar: async () => {
      const bien = await correr(() =>
        guardarSerie(serie.id, {
          correlativo_inicial: propuesto,
        }),
      );
      if (!bien) setInicial(String(serie.correlativo_inicial));
    },
    predeterminar: () =>
      correr(() => guardarSerie(serie.id, { predeterminada: true })),
    alternarActivo: () =>
      correr(() => guardarSerie(serie.id, { activo: !serie.activo })),
  };
}

type EdicionSerie = ReturnType<typeof useEdicionSerie>;

interface PropsSerie {
  serie: SerieDocumento;
  puedeEditar: boolean;
  inicial: string;
  setInicial: (v: string) => void;
}

function FilaSerie({ serie, puedeEditar, inicial, setInicial }: PropsSerie) {
  const edicion = useEdicionSerie(serie, inicial, setInicial);
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
          <InsigniasSerie serie={serie} />
        </td>

        <td className="px-3 py-2 text-right">
          <CampoDesde
            serie={serie}
            puedeEditar={puedeEditar}
            inicial={inicial}
            setInicial={setInicial}
            className="h-8 w-28 text-right tabular"
          />
        </td>

        <td className="px-3 py-2 text-right tabular text-[var(--fg-muted)]">
          {serie.correlativo_actual}
        </td>

        {/* Sin partir: «F001-» arriba y «00000001» abajo no se lee como un
            número (revisión por módulos del 02/10). */}
        <td className="whitespace-nowrap px-3 py-2 font-mono text-sm">
          {proximoNumero(serie)}
        </td>

        <td className="whitespace-nowrap px-3 py-2 text-right">
          {puedeEditar ? (
            <div className="flex justify-end gap-1">
              <AccionesSerie serie={serie} edicion={edicion} variante="outline" />
            </div>
          ) : null}
        </td>
      </tr>

      {edicion.avisos.length > 0 ? (
        <tr className="border-b border-[var(--border-soft)]">
          <td colSpan={6} className="px-3 pb-2">
            <AvisosSerie avisos={edicion.avisos} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * La misma serie, cuando la tabla no cabe.
 *
 * Revisión de diseño del 02/10: en el teléfono esta tabla se desplazaba de
 * lado (390 px: 319 → 791), y lo que se viene a tocar —«Desde» y los
 * botones— quedaba fuera de la vista. Aquí cada dato lleva su nombre al
 * lado, porque no hay cabecera que lo diga, y los botones van a lo ancho y
 * con borde: en la tabla son discretos porque la fila ya dice dónde están.
 */
function TarjetaSerie({ serie, puedeEditar, inicial, setInicial }: PropsSerie) {
  const edicion = useEdicionSerie(serie, inicial, setInicial);
  const fiscal = TIPOS_FISCALES.includes(serie.tipo);

  return (
    <li className="flex flex-col gap-2.5 rounded-lg border border-[var(--border)] p-3">
      <div>
        <p className="text-sm font-medium">
          {ETIQUETA_TIPO_DOCUMENTO[serie.tipo]}
          {fiscal ? (
            <Badge tone="info" size="xs" className="ml-2">
              SUNAT
            </Badge>
          ) : null}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-mono text-base font-semibold">{serie.serie}</span>
          <InsigniasSerie serie={serie} />
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2 flex items-center justify-between gap-3">
          <dt className="text-[var(--fg-subtle)]">Desde</dt>
          <dd>
            <CampoDesde
              serie={serie}
              puedeEditar={puedeEditar}
              inicial={inicial}
              setInicial={setInicial}
              className="w-32 text-right tabular"
            />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--fg-subtle)]">Va por</dt>
          <dd className="tabular">{serie.correlativo_actual}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--fg-subtle)]">El próximo</dt>
          <dd className="font-mono">{proximoNumero(serie)}</dd>
        </div>
      </dl>

      {edicion.avisos.length > 0 ? <AvisosSerie avisos={edicion.avisos} /> : null}

      {puedeEditar ? (
        <div className="flex flex-wrap gap-2 [&>*]:flex-1">
          <AccionesSerie serie={serie} edicion={edicion} variante="outline" />
        </div>
      ) : null}
    </li>
  );
}

function InsigniasSerie({ serie }: { serie: SerieDocumento }) {
  return (
    <>
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
      {/*
        Se dice cuáles son de ensayo, porque desde la 093 cambia lo que el
        sistema deja hacer con ellas: en producción se niega a emitir. Sin
        enseñarlo, el día que alguien ponga producción el error saldría de
        la nada.
      */}
      {serie.es_prueba ? (
        <Badge tone="warning" size="xs" className="ml-2">
          Pruebas
        </Badge>
      ) : null}
    </>
  );
}

function CampoDesde({
  serie,
  puedeEditar,
  inicial,
  setInicial,
  className,
}: PropsSerie & { className: string }) {
  return puedeEditar ? (
    <Input
      value={inicial}
      onChange={(e) => setInicial(e.target.value.replace(/[^0-9]/g, ""))}
      inputMode="numeric"
      aria-label={`Correlativo inicial de ${serie.serie}`}
      className={className}
    />
  ) : (
    <span className="tabular">{serie.correlativo_inicial}</span>
  );
}

/**
 * Los botones de una serie. `variante` es lo único que cambia entre la fila
 * y la tarjeta.
 *
 * Revisión por módulos del 02/10: en la tabla iban en «ghost» —texto suelto,
 * sin caja— y ahora van con borde en las dos: un botón tiene que parecer un
 * botón (CLAUDE.md §1).
 */
function AccionesSerie({
  serie,
  edicion,
  variante,
}: {
  serie: SerieDocumento;
  edicion: EdicionSerie;
  variante: "ghost" | "outline";
}) {
  const { ocupado, cambiado, bloqueado } = edicion;

  if (cambiado) {
    return (
      <>
        <Button size="sm" disabled={ocupado || bloqueado} onClick={edicion.guardar}>
          Guardar
        </Button>
        <Button variant={variante} size="sm" onClick={edicion.deshacer}>
          Deshacer
        </Button>
      </>
    );
  }

  return (
    <>
      {!serie.predeterminada && serie.activo ? (
        <Button
          variant={variante}
          size="sm"
          disabled={ocupado}
          onClick={edicion.predeterminar}
        >
          Usar por defecto
        </Button>
      ) : null}
      {/*
        La serie por defecto no se puede desactivar, y el botón no se pinta:
        un «Desactivar» gris deshabilitado en cada fila por defecto parecía
        roto, y la explicación solo salía al pasar el ratón (revisión por
        módulos del 02/10). Para desactivarla, primero se elige otra.
      */}
      {serie.predeterminada ? null : (
        <Button
          variant={variante}
          size="sm"
          disabled={ocupado}
          onClick={edicion.alternarActivo}
        >
          {serie.activo ? "Desactivar" : "Activar"}
        </Button>
      )}
    </>
  );
}

function AvisosSerie({ avisos }: { avisos: EdicionSerie["avisos"] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {avisos.map((a, i) => (
        <li
          key={i}
          className={`text-sm ${
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
        <DialogHeader>
          <DialogTitle>Nueva serie</DialogTitle>
          <DialogDescription>
            Se crea activa, pero NO como predeterminada: cambiar por dónde
            numera un tipo de documento es una decisión aparte, y se toma con
            «usar por defecto».
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
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
              error={
                serie && !formatoOk
                  ? "Ese formato no lo acepta la base."
                  : undefined
              }
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
                  onChange={(e) =>
                    setInicial(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  className="tabular"
                />
              </Campo>
              <Campo id="nueva-longitud" label="Dígitos" ayuda="Entre 4 y 10.">
                <Input
                  id="nueva-longitud"
                  value={longitud}
                  onChange={(e) =>
                    setLongitud(e.target.value.replace(/[^0-9]/g, ""))
                  }
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
              <p className="text-sm text-[var(--fg-muted)]">
                El primer documento será{" "}
                <span className="font-mono">
                  {`${serie}-${String(Number(inicial)).padStart(Number(longitud), "0")}`}
                </span>
                .
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          {/* Con borde y a tamaño normal, como el «Cancelar» de los demás
              diálogos de Configuración (revisión por módulos del 02/10). */}
          <Button variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
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
