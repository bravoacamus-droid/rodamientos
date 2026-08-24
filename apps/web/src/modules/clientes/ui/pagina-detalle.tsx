import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EstadoError, Moneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { clientePorId } from "../api/consultas";
import { ETIQUETA_CONDICION, ETIQUETA_DOCUMENTO } from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";

/** Roles que mantienen la cartera. Ventas entra porque es quien da de alta. */
const ROLES_ESCRITURA = ["gerencia", "admin", "ventas"];

/**
 * Ficha de un cliente.
 *
 * Es el «ver cliente» del menú: todo lo que hace falta saber antes de
 * cotizarle o de darle crédito, sin entrar a editar. Lo que se puede tocar
 * está en el mismo menú de tres puntos que en el listado, para que la acción
 * esté siempre en el mismo sitio.
 */
export default async function PaginaDetalleCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil] = await Promise.all([clientePorId(id), perfilActual()]);

  if (!resultado.ok) {
    if (resultado.error.includes("no existe")) notFound();
    return (
      <div className="p-1">
        <EstadoError titulo="No se pudo cargar el cliente" descripcion={resultado.error} />
      </div>
    );
  }

  const c = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ROLES_ESCRITURA.includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/clientes" className="text-sm text-[var(--fg-muted)] underline">
            ← Clientes
          </Link>
          {/* `break-words` y no `truncate`: la razón social es el dato que se
              viene a leer, cortarla a 360 px sería esconder justo lo importante. */}
          <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">
            {c.razon_social}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[var(--fg-subtle)]">{c.codigo}</span>
            <Badge tone="neutral" size="xs">
              {ETIQUETA_DOCUMENTO[c.tipo_documento]} {c.numero_documento ?? "—"}
            </Badge>
            <Badge tone={c.condicion_pago === "credito" ? "info" : "neutral"} size="xs">
              {ETIQUETA_CONDICION[c.condicion_pago]}
            </Badge>
            {c.bloqueado ? (
              <Badge tone="danger" size="xs">
                Bloqueado
              </Badge>
            ) : null}
            {!c.activo ? (
              <Badge tone="warning" size="xs">
                Desactivado
              </Badge>
            ) : null}
          </div>
          {c.nombre_comercial ? (
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{c.nombre_comercial}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {puedeEditar ? (
            <Link
              href={`/clientes/${c.id}/editar`}
              className="inline-flex h-11 items-center rounded-md border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)] md:h-control-md"
            >
              Editar
            </Link>
          ) : null}
          <AccionesFila
            id={c.id}
            codigo={c.codigo}
            razonSocial={c.razon_social}
            bloqueado={c.bloqueado}
            puedeEditar={puedeEditar}
          />
        </div>
      </header>

      {c.bloqueado ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm"
        >
          <strong>Cliente bloqueado.</strong>{" "}
          {c.motivo_bloqueo ?? "No se registró el motivo."} No se le puede cotizar
          ni vender a crédito hasta desbloquearlo.
        </p>
      ) : null}

      {/* -------------------------------------------------------- Crédito */}
      {/* Dos columnas en móvil ya caben (son cifras cortas); cuatro solo desde
          `lg`, que es cuando hay ancho para que no se aprieten. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          etiqueta="Condición"
          valor={ETIQUETA_CONDICION[c.condicion_pago]}
          pie={c.condicion_pago === "credito" ? `${c.dias_credito} días` : "paga al entregar"}
        />
        <Tarjeta
          etiqueta="Línea de crédito"
          valor={
            c.condicion_pago === "credito" && c.linea_credito > 0 ? (
              <Moneda valor={c.linea_credito} />
            ) : (
              "—"
            )
          }
          pie={
            c.condicion_pago !== "credito"
              ? "no aplica al contado"
              : c.linea_credito > 0
                ? "tope de deuda"
                : "sin tope definido"
          }
        />
        <Tarjeta
          etiqueta="Días de gracia"
          valor={c.condicion_pago === "credito" ? String(c.dias_gracia) : "—"}
          pie="antes de contarla vencida"
        />
        <Tarjeta
          etiqueta="Vendedor"
          valor={c.vendedor_nombre ?? "Sin asignar"}
          pie={c.vendedor_nombre ? "lo atiende" : "nadie lo tiene asignado"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------ Contacto */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Contacto</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <Dato etiqueta="Persona" valor={c.contacto} />
            <Dato etiqueta="Cargo" valor={c.cargo_contacto} />
            <Dato etiqueta="Correo" valor={c.email} />
            <Dato etiqueta="Teléfono" valor={c.telefono} />
            <Dato etiqueta="WhatsApp" valor={c.whatsapp} />
            <Dato etiqueta="Sector" valor={c.sector} />
          </dl>
        </section>

        {/* ----------------------------------------------------- Dirección */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Dirección</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <Dato etiqueta="Dirección fiscal" valor={c.direccion} />
            <Dato etiqueta="Distrito" valor={c.ubigeo_nombre} />
            <Dato etiqueta="Ubigeo" valor={c.ubigeo_codigo} />
            <Dato etiqueta="Referencia" valor={c.referencia_direccion} />
          </dl>
          {!c.direccion || !c.ubigeo_codigo ? (
            <p className="mt-3 rounded-sm bg-[var(--surface-2)] p-2.5 text-xs text-[var(--fg-muted)]">
              Falta dirección o distrito. Se puede cotizar igual, pero la guía de
              remisión los exige: conviene completarlos antes del primer despacho.
            </p>
          ) : null}
        </section>
      </div>

      {c.notas ? (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Notas</h2>
          <p className="whitespace-pre-wrap break-words text-sm">{c.notas}</p>
        </section>
      ) : null}

      <p className="text-xs text-[var(--fg-subtle)]">
        Dado de alta el {new Date(c.creado_en).toLocaleDateString("es-PE")}.
      </p>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  pie?: string;
}) {
  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--fg-muted)]">{etiqueta}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular">{valor}</p>
      {pie ? <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}

/** Un dato que puede faltar. Se dice «sin registrar», no se deja el hueco. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-40 shrink-0 text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">
        {valor ?? <span className="text-[var(--fg-subtle)]">Sin registrar</span>}
      </dd>
    </div>
  );
}
