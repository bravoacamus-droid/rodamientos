import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BotonesDocumento } from "@/componentes/botones-documento";
import { cuentasParaCobrar, emisorParaImprimir } from "@/lib/emisor";

import { detalleComprobante } from "../api/consultas";
import { DocumentoComprobante } from "./documento";

/**
 * La hoja imprimible de un comprobante.
 *
 * Es una pantalla aparte y no un modo de la ficha, por lo mismo que en
 * cotizaciones: la ficha tiene estado, acciones y avisos de SUNAT, y esto es
 * un documento. Separarlas hace que lo que se imprime sea exactamente lo que
 * se ve, sin depender de acordarse de poner `no-print` en cada botón nuevo.
 */
export default async function PaginaImprimirComprobante({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  /*
    `auto=1` llega desde la ficha: se abre la hoja y sale la ventana de
    imprimir sola. El botón «Imprimir» de la ficha traía aquí y ahí se acababa
    —había que acordarse de Ctrl+P—, que es un botón que no hace lo que dice.
  */
  const auto = (Array.isArray(sp.auto) ? sp.auto[0] : sp.auto) === "1";
  const [resultado, emisor, cuentas] = await Promise.all([
    detalleComprobante(id),
    emisorParaImprimir(),
    cuentasParaCobrar(),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el comprobante"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const c = resultado.datos;

  return (
    <div className="flex flex-col gap-3">
      {/* Lo único que no es el documento, y por eso lleva `no-print`. */}
      <div className="flex items-center justify-between gap-3 no-print">
        <Link
          href={`/facturacion/${c.id}`}
          className="text-sm text-[var(--fg-muted)] underline-offset-2 hover:underline"
        >
          ← Volver al comprobante
        </Link>
        {c.estado === "anulado" ? (
          <span className="text-sm font-medium text-[var(--danger)]">
            Este comprobante está ANULADO. No debería imprimirse para entregar.
          </span>
        ) : null}

        {/* Quien llega a la hoja viene a sacarla, y hasta hoy tenía que
            acordarse de Ctrl+P. Es el mismo componente que la guía. */}
        <BotonesDocumento auto={auto} />
      </div>

      <div className="overflow-hidden rounded-md bg-white elev-2 print:rounded-none print:shadow-none">
        <DocumentoComprobante c={c} emisor={emisor} cuentas={cuentas} />
      </div>
    </div>
  );
}
