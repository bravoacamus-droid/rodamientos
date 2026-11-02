"use client";

/*
 * "use client" OBLIGATORIO: edición en línea con avisos que cambian al teclear.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  EstadoBadge,
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
  cambiarNombreSerie,
  crearSerie,
  guardarSerie,
  type ResultadoConfig,
} from "../acciones/guardar";
import {
  avisosDelInicial,
  esSerieImportante,
  nombreDeSerie,
  proximoCorrelativo,
  proximoNumero,
  serieValida,
} from "../dominio/serie";
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
  /*
    Solo lo importante (02/11). Moisés: *«solo déjame los importantes»*. Las
    desactivadas y las de boleta —Willy no emite boletas— quedan detrás de un
    botón; siguen ahí para reactivarlas.
  */
  const [verTodas, setVerTodas] = React.useState(false);
  const ocultas = series.filter((s) => !esSerieImportante(s));
  const visibles = verTodas ? series : series.filter((s) => esSerieImportante(s));
  /*
    Lo que se ve y se edita es el PRÓXIMO número, como el «Correlativo» de
    SIMPLE (02/11). Moisés: *«el primer número como lo tenemos nosotros… se va
    modificando al tiempo que se están utilizando»*. Antes se editaba el
    «Primer número», que no se mueve, y el que avanzaba era «Va por»: dos
    columnas para una idea. Guardar sigue escribiendo `correlativo_inicial`
    —el próximo es el mayor de los dos— y nunca retrocede.
  */
  const inicialDe = (s: SerieDocumento) =>
    borradores[s.id] ?? String(proximoCorrelativo(s));

  return (
    <div className="@container flex flex-col gap-3">
      {pruebasPorDefecto.length > 0 ? (
        <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
          <p className="text-sm font-medium">
            En beta se emite con las series de pruebas
          </p>
          <p className="mt-1 text-sm">
            {pruebasPorDefecto.map((s) => s.serie).join(", ")} —{" "}
            <strong>así las pruebas no gastan números del talonario de verdad</strong>.
          </p>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Al pasar el ambiente a producción, el sistema pone solas por defecto
            las reales (F002, FC02, FD02, T002), y al volver a beta, otra vez
            estas. No hay que cambiarlas a mano.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* `text-sm`: esto explica cómo funciona el correlativo, y es de lo
            que más falta hace leer de toda la pantalla. */}
        <p className="text-sm text-[var(--fg-subtle)]">
          <strong>«Próximo número»</strong> es el que llevará el siguiente
          documento, como el «Correlativo» de SIMPLE: avanza solo con cada uno
          que se emite. Se puede subir —si el sistema anterior ya usó algunos
          números— pero nunca bajar: los correlativos no retroceden.
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
        {visibles.map((s) => (
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
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Próximo número</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Saldrá como</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => (
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

      {ocultas.length > 0 ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => setVerTodas((v) => !v)}>
          {verTodas
            ? "Ver solo las importantes"
            : `Ver también las de pruebas, las de boleta y las desactivadas (${ocultas.length})`}
        </Button>
      ) : null}
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
    propuesto !== proximoCorrelativo(serie) && inicial.trim() !== "";
  const avisos = cambiado ? avisosDelInicial(serie, propuesto) : [];
  const bloqueado = avisos.some((a) => a.tono === "danger");

  return {
    ocupado,
    cambiado,
    avisos,
    bloqueado,
    deshacer: () => setInicial(String(proximoCorrelativo(serie))),
    guardar: async () => {
      const bien = await correr(() =>
        guardarSerie(serie.id, {
          correlativo_inicial: propuesto,
        }),
      );
      if (!bien) setInicial(String(proximoCorrelativo(serie)));
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
          {nombreDeSerie(serie)}
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

        {/* Sin partir: «F001-» arriba y «00000001» abajo no se lee como un
            número (revisión por módulos del 02/10). */}
        <td className="whitespace-nowrap px-3 py-2 text-sm">
          <span className="font-mono">{proximoNumero(serie)}</span>
          {serie.correlativo_actual > 0 ? (
            <span className="block text-[var(--fg-subtle)]">último emitido: {serie.correlativo_actual}</span>
          ) : null}
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
          <td colSpan={5} className="px-3 pb-2">
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
          {nombreDeSerie(serie)}
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
          <dt className="text-[var(--fg-subtle)]">Próximo número</dt>
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
          <dt className="text-[var(--fg-subtle)]">Saldrá como</dt>
          <dd className="font-mono">{proximoNumero(serie)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--fg-subtle)]">Último emitido</dt>
          <dd className="tabular">{serie.correlativo_actual > 0 ? serie.correlativo_actual : "ninguno"}</dd>
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
      {/* «De baja» y no «Inactiva»: la misma insignia que todo lo que se da
          de baja en vez de borrarse. */}
      {!serie.activo ? <EstadoBadge estado="de_baja" size="xs" className="ml-2" /> : null}
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
      aria-label={`Próximo número de ${serie.serie}`}
      className={className}
    />
  ) : (
    <span className="tabular">{proximoCorrelativo(serie)}</span>
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
      {serie.activo ? <CambiarNombreSerie serie={serie} variante={variante} /> : null}
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

/**
 * «Cambiar serie» (02/11). Moisés: *«la idea es que también puedan modificar
 * los números de serie»*. La ventana dice ANTES qué va a pasar: con documentos
 * emitidos no se puede; de pruebas, se crea la real y la de pruebas se va;
 * real sin usar, se renombra (`cambiarNombreSerie`).
 */
function CambiarNombreSerie({ serie, variante }: { serie: SerieDocumento; variante: "ghost" | "outline" }) {
  const { ocupado, correr } = useAccion();
  const [abierto, setAbierto] = React.useState(false);
  const [nueva, setNueva] = React.useState("");
  const usada = serie.correlativo_actual > 0;
  const valida = serieValida(nueva) && nueva !== serie.serie;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) setNueva("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variante} size="sm">
          Cambiar serie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Cambiar {serie.serie} · {nombreDeSerie(serie)}
          </DialogTitle>
          <DialogDescription>
            {usada
              ? `${serie.serie} ya emitió ${serie.correlativo_actual} documentos y así los tiene SUNAT: su nombre no se puede cambiar. Crea la serie nueva con «Nueva serie» y pulsa «Usar por defecto» en ella.`
              : serie.es_prueba
                ? `${serie.serie} es de pruebas. Se crea la serie nueva, real, empezando en 1${serie.predeterminada ? " y por defecto" : ""}, y ${serie.serie} queda desactivada.`
                : `${serie.serie} todavía no emitió nada: se le cambia el nombre.`}
          </DialogDescription>
        </DialogHeader>
        {usada ? null : (
          <DialogBody>
            <Campo
              id={`renombrar-${serie.id}`}
              label="Nueva serie"
              ayuda={valida ? `Será: ${nombreDeSerie({ tipo: serie.tipo, serie: nueva })}.` : "De 2 a 6 letras mayúsculas o dígitos, como en SIMPLE: FD02, T002, OC02…"}
            >
              <Input
                id={`renombrar-${serie.id}`}
                value={nueva}
                onChange={(e) => setNueva(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={6}
                placeholder={serie.serie}
                className="font-mono"
                autoFocus
              />
            </Campo>
          </DialogBody>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            {usada ? "Entendido" : "Cancelar"}
          </Button>
          {usada ? null : (
            <Button
              type="button"
              disabled={!valida || ocupado}
              onClick={async () => {
                const bien = await correr(() => cambiarNombreSerie(serie.id, nueva));
                if (bien) setAbierto(false);
              }}
            >
              {ocupado ? "Guardando…" : serie.es_prueba ? `Crear ${nueva || "la nueva"}` : `Cambiar a ${nueva || "…"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
              ayuda={
                serie && formatoOk
                  ? `Será: ${nombreDeSerie({ tipo, serie })}.`
                  : "Como en SIMPLE: F002 factura, FC02 nota de crédito a factura, FD02 nota de débito a factura, T002 guía, CT02 cotización."
              }
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
              <Campo id="nueva-inicial" label="Primer número">
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
