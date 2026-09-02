"use client";

// Cliente: se escribe el mensaje y se ve al vuelo cómo queda con datos de
// ejemplo. Sin la vista previa, saber si `{items}` va a caber donde toca
// obliga a guardar y mandar uno de prueba.

import * as React from "react";
import { Badge, Button, Input, SelectNativo, Textarea } from "@rodatech/ui";
import { Check, Pencil, Plus, X } from "lucide-react";

import {
  darDeBajaPlantilla,
  guardarPlantilla,
  type ResultadoPlantilla,
} from "../acciones/guardar";

import {
  ETIQUETA_CANAL,
  ETIQUETA_USO,
  TOPE_PLANTILLA,
  VARIABLES,
  renderizar,
  revisarPlantilla,
  sePuede,
  type Canal,
  type Plantilla,
  type Uso,
} from "../dominio/plantillas";

const USOS: Uso[] = ["pedido_precio", "cotizacion", "cobranza", "general"];
const CANALES: Canal[] = ["whatsapp", "correo"];

/** Una plantilla en blanco, para el alta. */
const VACIA: Plantilla = {
  id: "",
  nombre: "",
  uso: "pedido_precio",
  canal: "whatsapp",
  asunto: null,
  cuerpo: "",
  predeterminada: false,
  activa: true,
};

/**
 * Los mensajes que se mandan, editables por quien los manda.
 *
 * Willy pide precio por WhatsApp desde siempre (30:01). Esto guarda el texto
 * con el que lo pide para no volver a teclearlo, y deja que lo corrija él: la
 * forma de pedir precio en este rubro no la sabe quien programa.
 */
export function EditorPlantillas({
  iniciales,
  puedeEditar,
}: {
  iniciales: Plantilla[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = React.useState<Plantilla | null>(null);

  if (editando) {
    return (
      <Formulario
        plantilla={editando}
        onCerrar={() => setEditando(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {iniciales.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Todavía no hay ninguno.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {iniciales.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className={`text-sm ${p.activa ? "" : "text-[var(--fg-muted)]"}`}>
                    {p.nombre}
                  </strong>
                  <Badge tone={p.canal === "whatsapp" ? "success" : "info"} size="xs">
                    {ETIQUETA_CANAL[p.canal]}
                  </Badge>
                  {p.predeterminada ? (
                    <Badge tone="brand" size="xs">
                      la que se propone
                    </Badge>
                  ) : null}
                  {p.activa ? null : (
                    <Badge tone="neutral" size="xs">
                      de baja
                    </Badge>
                  )}
                </span>
                <span className="block text-xs text-[var(--fg-subtle)]">
                  {ETIQUETA_USO[p.uso]}
                </span>
                <span className="mt-1 block whitespace-pre-wrap text-sm text-[var(--fg-muted)]">
                  {p.cuerpo.length > 160 ? `${p.cuerpo.slice(0, 160)}…` : p.cuerpo}
                </span>
              </div>

              {puedeEditar ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={() => setEditando(p)}
                >
                  <Pencil aria-hidden="true" />
                  Corregir
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar ? (
        <div>
          <Button type="button" variant="outline" className="h-9" onClick={() => setEditando(VACIA)}>
            <Plus aria-hidden="true" />
            Escribir uno nuevo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Formulario({
  plantilla,
  onCerrar,
}: {
  plantilla: Plantilla;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = React.useState(plantilla.nombre);
  const [uso, setUso] = React.useState<Uso>(plantilla.uso);
  const [canal, setCanal] = React.useState<Canal>(plantilla.canal);
  const [asunto, setAsunto] = React.useState(plantilla.asunto ?? "");
  const [cuerpo, setCuerpo] = React.useState(plantilla.cuerpo);
  const [predeterminada, setPredeterminada] = React.useState(plantilla.predeterminada);
  const [activa, setActiva] = React.useState(plantilla.activa);

  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const [resultado, guardar, guardando] = React.useActionState<
    ResultadoPlantilla | null,
    FormData
  >(async (previo, formData) => {
    const r = await guardarPlantilla(previo, formData);
    if (r.ok) onCerrar();
    return r;
  }, null);

  const [dandoBaja, bajar] = React.useTransition();

  const avisos = React.useMemo(
    () => revisarPlantilla(cuerpo, uso, canal),
    [cuerpo, uso, canal],
  );

  // La vista previa con los ejemplos de cada variable. No es el mensaje que se
  // va a mandar —eso depende del proveedor— pero sí enseña la FORMA, que es lo
  // que se está decidiendo aquí.
  const previa = React.useMemo(() => {
    const valores: Record<string, string> = {};
    for (const v of VARIABLES[uso]) valores[v.clave] = v.ejemplo;
    if (uso === "pedido_precio") {
      valores.items = "- 6205-2RS · SKF · RODAMIENTO RIGIDO — 10 NIU\n- 6305 · FAG — 4 NIU";
    }
    return renderizar(cuerpo, valores);
  }, [cuerpo, uso]);

  /** Mete la variable donde está el cursor, que es donde se la espera. */
  const insertar = (clave: string) => {
    const area = areaRef.current;
    const marca = `{${clave}}`;
    if (!area) {
      setCuerpo((c) => c + marca);
      return;
    }
    const { selectionStart: a, selectionEnd: b } = area;
    setCuerpo((c) => c.slice(0, a) + marca + c.slice(b));
    // Después de que React repinte, el cursor va detrás de lo insertado.
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(a + marca.length, a + marca.length);
    });
  };

  const payload = JSON.stringify({
    id: plantilla.id === "" ? null : plantilla.id,
    nombre,
    uso,
    canal,
    asunto: canal === "correo" ? asunto.trim() || null : null,
    cuerpo,
    predeterminada,
    activa,
  });

  return (
    <form action={guardar} className="flex flex-col gap-4">
      <input type="hidden" name="plantilla" value={payload} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span className="text-sm font-medium">Nombre</span>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Pedido de precios · WhatsApp"
            className="h-11 md:h-control-md"
            maxLength={80}
          />
          <span className="text-xs text-[var(--fg-subtle)]">
            Solo para reconocerlo en la lista. No sale en el mensaje.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">¿Para qué es?</span>
          <SelectNativo
            value={uso}
            onChange={(e) => setUso(e.target.value as Uso)}
            className="h-11 md:h-control-md"
          >
            {USOS.map((u) => (
              <option key={u} value={u}>
                {ETIQUETA_USO[u]}
              </option>
            ))}
          </SelectNativo>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">¿Por dónde se manda?</span>
          <SelectNativo
            value={canal}
            onChange={(e) => setCanal(e.target.value as Canal)}
            className="h-11 md:h-control-md"
          >
            {CANALES.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CANAL[c]}
              </option>
            ))}
          </SelectNativo>
        </label>

        {canal === "correo" ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Asunto</span>
            <Input
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Solicitud de cotización · {empresa}"
              className="h-11 md:h-control-md"
              maxLength={200}
            />
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">El mensaje</span>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES[uso].map((v) => (
            <button
              key={v.clave}
              type="button"
              onClick={() => insertar(v.clave)}
              title={v.ayuda}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-xs hover:bg-[var(--surface-2)]"
            >
              {`{${v.clave}}`}
            </button>
          ))}
        </div>
        <Textarea
          ref={areaRef}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          rows={9}
          maxLength={TOPE_PLANTILLA}
          placeholder="Buenos días, {proveedor}…"
          className="font-mono text-sm"
        />
        <span className="text-xs text-[var(--fg-subtle)]">
          Pulsa una variable de arriba para meterla donde tienes el cursor.{" "}
          {cuerpo.length} de {TOPE_PLANTILLA} caracteres.
        </span>
      </div>

      {avisos.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {avisos.map((a) => (
            <li
              key={a.mensaje}
              className={`rounded-md border p-2.5 text-sm ${
                a.gravedad === "error"
                  ? "border-[var(--danger)] bg-[var(--danger-bg)]"
                  : "border-[var(--warn)] bg-[var(--warn-bg)]"
              }`}
            >
              {a.mensaje}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
          Así se vería
        </p>
        <p className="whitespace-pre-wrap text-sm">{previa || "—"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={predeterminada}
            onChange={(e) => setPredeterminada(e.target.checked)}
            className="size-4"
          />
          Proponer este por defecto
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="size-4"
          />
          En uso
        </label>
      </div>

      {resultado && !resultado.ok ? (
        <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm">
          {resultado.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={guardando || !sePuede(avisos) || nombre.trim() === ""}>
          <Check aria-hidden="true" />
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>

        {plantilla.id && plantilla.activa ? (
          <Button
            type="button"
            variant="subtle"
            className="ml-auto"
            disabled={dandoBaja}
            onClick={() =>
              bajar(async () => {
                await darDeBajaPlantilla(plantilla.id);
                onCerrar();
              })
            }
          >
            <X aria-hidden="true" />
            Dar de baja
          </Button>
        ) : null}
      </div>
    </form>
  );
}
