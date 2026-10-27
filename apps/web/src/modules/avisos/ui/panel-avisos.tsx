"use client";

/*
 * "use client" OBLIGATORIO: pedir permiso de notificaciones, registrar el
 * service worker y suscribirse solo existen en el navegador.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, BellRing, Send, Share, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { Button, SelectNativo, toast } from "@rodatech/ui";

import { cambiarQueMeLlega, probarAviso, quitarAparato, registrarAparato } from "../acciones/aparatos";
import { OPCIONES_SEVERIDAD, type Severidad } from "../dominio/envio";
import type { MiAparato } from "../api/consultas";
import { estadoDelNavegador, suscripcionActual, suscribir, type EstadoNavegador } from "./navegador";

/**
 * «Recibir avisos en este celular», en «Mi perfil» (162).
 *
 * Willy: *«pero no te llega como una alerta, tú tienes que entrar y ver»*
 * (25:21). Esto es lo que hace que le llegue: un botón, una vez, en cada
 * aparato donde los quiera.
 *
 * Cada estado se dice con palabras, porque lo que falla aquí falla fuera del
 * ERP —un permiso del navegador, un iPhone sin instalar— y «no funciona» sin
 * más es exactamente lo que no se puede arreglar por teléfono.
 */
export function PanelAvisos({
  aparatos,
  clavePublica,
}: {
  aparatos: MiAparato[];
  clavePublica: string | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = React.useState<EstadoNavegador | "cargando">("cargando");
  const [miEndpoint, setMiEndpoint] = React.useState<string | null>(null);
  const [ocupado, empezar] = React.useTransition();

  const esteActivado = miEndpoint !== null && aparatos.some((a) => a.endpoint === miEndpoint && a.activa);
  const severidad: Severidad = aparatos[0]?.severidad_minima ?? "media";

  // Al abrir la pantalla: qué permite este navegador y si ya está suscrito.
  // Si lo está pero la base no lo tiene (lo quitaron desde otro aparato, o el
  // navegador renovó la dirección), se vuelve a apuntar en silencio.
  React.useEffect(() => {
    let vivo = true;
    (async () => {
      const e = estadoDelNavegador();
      if (!vivo) return;
      setEstado(e);
      if (e !== "listo" && e !== "concedido") return;
      const sub = await suscripcionActual();
      if (!vivo || !sub) return;
      setMiEndpoint(sub.endpoint);
      if (!aparatos.some((a) => a.endpoint === sub.endpoint && a.activa)) {
        // Sin `cancelar`: una función no viaja a una Server Action.
        const { endpoint, p256dh, auth, agente } = sub;
        const r = await registrarAparato({ endpoint, p256dh, auth, agente });
        if (vivo && r.ok) router.refresh();
      }
    })();
    return () => {
      vivo = false;
    };
    // Solo al montar: `aparatos` cambia tras el refresh y no hace falta repetirlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function activar() {
    if (!clavePublica) return;
    empezar(async () => {
      const r = await suscribir(clavePublica);
      if (!r.ok) {
        setEstado(estadoDelNavegador());
        toast.error(r.error);
        return;
      }
      const g = await registrarAparato(r.suscripcion);
      if (!g.ok) {
        toast.error(g.error);
        return;
      }
      setMiEndpoint(r.suscripcion.endpoint);
      setEstado("concedido");
      toast.success(g.mensaje);
      router.refresh();
    });
  }

  function probar() {
    if (!miEndpoint) return;
    empezar(async () => {
      const r = await probarAviso(miEndpoint);
      if (r.ok) toast.success(r.mensaje);
      else toast.error(r.error);
    });
  }

  function quitar(a: MiAparato) {
    empezar(async () => {
      if (a.endpoint === miEndpoint) {
        const sub = await suscripcionActual();
        await sub?.cancelar();
        setMiEndpoint(null);
      }
      const r = await quitarAparato(a.id);
      if (r.ok) toast.success(r.mensaje);
      else toast.error(r.error);
      router.refresh();
    });
  }

  function cambiar(v: Severidad) {
    empezar(async () => {
      const r = await cambiarQueMeLlega(v);
      if (r.ok) toast.success(r.mensaje);
      else toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Estado
        estado={estado}
        esteActivado={esteActivado}
        sinClaves={!clavePublica}
        ocupado={ocupado}
        onActivar={activar}
        onProbar={probar}
      />

      {aparatos.length > 0 && (
        <>
          <div className="flex max-w-md flex-col gap-1.5">
            <label htmlFor="que-me-llega" className="text-sm font-medium">
              Qué avisos te llegan
            </label>
            <SelectNativo
              id="que-me-llega"
              value={OPCIONES_SEVERIDAD.some((o) => o.valor === severidad) ? severidad : "media"}
              disabled={ocupado}
              onChange={(e) => cambiar(e.target.value as Severidad)}
            >
              {OPCIONES_SEVERIDAD.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </SelectNativo>
            <p className="text-sm text-[var(--fg-muted)]">
              Urgentes: stock en negativo, facturas vencidas, rechazos de SUNAT. Los importantes
              suman las facturas por vencer y el stock bajo.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Tus aparatos</h3>
            <ul className="flex flex-col gap-2">
              {aparatos.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Smartphone aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--fg-muted)]" />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {a.aparato}
                        {a.endpoint === miEndpoint && (
                          <span className="ml-2 rounded bg-brand-600/10 px-1.5 py-0.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
                            Este aparato
                          </span>
                        )}
                      </p>
                      <p className="text-[var(--fg-muted)]">
                        Activado el {fecha(a.creada_en)}
                        {a.ultimo_envio ? ` · Último aviso: ${fechaHora(a.ultimo_envio)}` : " · Todavía no recibió avisos"}
                      </p>
                      {!a.activa && (
                        <p className="text-[var(--danger)]">
                          Ya no acepta avisos. Quítalo y vuelve a activarlo desde ese aparato.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="md" disabled={ocupado} onClick={() => quitar(a)}>
                    <Trash2 aria-hidden="true" />
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Estado({
  estado,
  esteActivado,
  sinClaves,
  ocupado,
  onActivar,
  onProbar,
}: {
  estado: EstadoNavegador | "cargando";
  esteActivado: boolean;
  sinClaves: boolean;
  ocupado: boolean;
  onActivar: () => void;
  onProbar: () => void;
}) {
  if (estado === "cargando") {
    return <p className="text-sm text-[var(--fg-muted)]">Comprobando este aparato…</p>;
  }

  if (sinClaves) {
    return (
      <Aviso icono={<TriangleAlert aria-hidden="true" className="size-5" />} tono="aviso">
        El servidor todavía no tiene configurados los avisos. Avisa a Luis.
      </Aviso>
    );
  }

  if (estado === "ios-instalar") {
    return (
      <Aviso icono={<Share aria-hidden="true" className="size-5" />} tono="info">
        <strong>En iPhone hay un paso antes.</strong> Toca el botón de compartir de Safari, elige
        «Añadir a pantalla de inicio», abre el ERP desde ese icono nuevo y vuelve aquí. Hace falta
        iOS 16.4 o más reciente.
      </Aviso>
    );
  }

  if (estado === "no-compatible") {
    return (
      <Aviso icono={<BellOff aria-hidden="true" className="size-5" />} tono="aviso">
        Este navegador no puede recibir avisos. En el celular usa Chrome (Android) o Safari
        (iPhone); en la computadora, Chrome o Edge.
      </Aviso>
    );
  }

  if (estado === "bloqueado") {
    return (
      <Aviso icono={<BellOff aria-hidden="true" className="size-5" />} tono="peligro">
        <strong>Este navegador tiene los avisos bloqueados para el ERP.</strong> Para desbloquearlos:
        toca el candado que está a la izquierda de la dirección, entra en «Permisos» o
        «Configuración del sitio», pon «Notificaciones» en «Permitir» y vuelve a cargar la página.
      </Aviso>
    );
  }

  if (esteActivado) {
    return (
      <div className="flex flex-col gap-3">
        <Aviso icono={<BellRing aria-hidden="true" className="size-5" />} tono="ok">
          <strong>Activado.</strong> Los avisos del sistema te llegan a {esteAparato()} aunque no tengas
          el ERP abierto: cada mañana a las 7:10 y otra vez por la tarde.
        </Aviso>
        <div>
          <Button variant="outline" size="lg" loading={ocupado} onClick={onProbar}>
            <Send aria-hidden="true" />
            Mandar un aviso de prueba
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--fg-muted)]">
        Te llega una notificación al celular cuando el sistema encuentra algo que mirar: una factura
        vencida, un producto sin stock, un rechazo de SUNAT. No hace falta tener el ERP abierto.
      </p>
      <div>
        <Button size="lg" loading={ocupado} onClick={onActivar}>
          <Bell aria-hidden="true" />
          Recibir avisos en {esteAparato()}
        </Button>
      </div>
      <p className="text-sm text-[var(--fg-muted)]">
        El navegador te va a preguntar si permites las notificaciones: contesta «Permitir».
      </p>
    </div>
  );
}

function Aviso({
  icono,
  tono,
  children,
}: {
  icono: React.ReactNode;
  tono: "ok" | "info" | "aviso" | "peligro";
  children: React.ReactNode;
}) {
  const color = {
    ok: "border-[var(--ok)] text-[var(--ok)]",
    info: "border-brand-500 text-brand-600",
    aviso: "border-[var(--warn)] text-[var(--warn)]",
    peligro: "border-[var(--danger)] text-[var(--danger)]",
  }[tono];
  return (
    <div className={`flex items-start gap-3 rounded-lg border-l-4 bg-[var(--surface-2)] p-3 ${color}`}>
      <span className="mt-0.5 shrink-0">{icono}</span>
      <p className="text-sm text-[var(--fg)]">{children}</p>
    </div>
  );
}

/** «este celular» o «esta computadora»: Willy no piensa en «aparatos». Solo se llama ya en el navegador. */
function esteAparato(): string {
  return /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent) ? "este celular" : "esta computadora";
}

const LIMA = "America/Lima";
function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}
function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
