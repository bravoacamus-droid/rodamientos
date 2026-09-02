"use client";

// Cliente: se elige la plantilla y a quién se le pide, y el mensaje se rehace
// al vuelo. Los enlaces se abren desde el navegador — el servidor no manda
// nada, y eso es deliberado.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, SelectNativo } from "@rodatech/ui";
import { ClipboardList, Copy, Mail, MessageCircle } from "lucide-react";

import { abrirRonda } from "../../acciones/comparar";
import { AnadirProveedor } from "./anadir";

// Por la ruta profunda: el índice de `mensajes` reexporta su `api/`, que es
// `server-only`, y esto es un componente de cliente. Es la misma razón por
// la que el constructor de compras importa el buscador de proveedores por su
// ruta y no por el índice.
import { canalesDisponibles, enlaceCorreo, enlaceWhatsapp } from "@/modules/mensajes/dominio/enlaces";
import {
  ETIQUETA_CANAL,
  listaDeItems,
  renderizar,
  type Plantilla,
} from "@/modules/mensajes/dominio/plantillas";
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

export interface ItemPedido {
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  cantidad: number;
}

/**
 * Pedir precio a varios proveedores del mismo tirón.
 *
 * Luis, 02/09: *«ayudar a él en compras a mandar a su WhatsApp para preguntar
 * los precios»*, con *«mensajes predeterminados que puede crear»*.
 *
 * **No manda nada solo.** Cada botón abre WhatsApp o el correo con el texto ya
 * escrito y la persona pulsa enviar. El envío automático sería la Cloud API de
 * Meta —número dedicado, verificación, plantillas aprobadas por Meta y pago
 * por conversación— y para pedirle precio a cuatro proveedores conocidos no
 * compensa, aparte del riesgo de que baneen el número.
 *
 * Lo que ahorra no es el envío: es no volver a teclear quince códigos cuatro
 * veces, y que los cuatro reciban exactamente la misma lista.
 */
export function PedirPrecio({
  items,
  proveedores: sugeridos,
  plantillas,
  empresa,
  yo,
  hoy,
}: {
  items: ItemPedido[];
  /** Los que ya venden algo de esto, primero; el resto se busca abajo. */
  proveedores: ProveedorParaPedir[];
  plantillas: Plantilla[];
  empresa: string;
  yo: string;
  hoy: string;
}) {
  // La lista arranca en lo que el sistema sabe y crece con lo que se busque.
  // Sin esto la pantalla no arranca el primer día: `proveedor_productos` se
  // llena sola con cada compra, así que hoy —97 proveedores, cero compras—
  // no propondría a nadie.
  const [proveedores, setProveedores] = React.useState(sugeridos);
  const [plantillaId, setPlantillaId] = React.useState(plantillas[0]?.id ?? "");
  const [elegidos, setElegidos] = React.useState<Set<string>>(
    // Se preseleccionan los que venden algo de la lista: es la sugerencia que
    // el sistema aprendió de las compras (046), y casi siempre es la buena.
    () => new Set(sugeridos.filter((p) => p.coincidencias > 0).map((p) => p.id)),
  );
  const [copiado, setCopiado] = React.useState<string | null>(null);

  const router = useRouter();
  const [abriendo, empezarRonda] = React.useTransition();
  const [avisoRonda, setAvisoRonda] = React.useState<string | null>(null);

  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? plantillas[0];

  const lista = React.useMemo(
    () =>
      listaDeItems(
        items.map((i) => ({
          codigo: i.codigo,
          descripcion: i.descripcion,
          marca: i.marca,
          cantidad: i.cantidad,
          unidad: i.unidad,
        })),
      ),
    [items],
  );

  const textoPara = React.useCallback(
    (proveedor: string) =>
      plantilla
        ? renderizar(plantilla.cuerpo, {
            proveedor,
            items: lista,
            empresa,
            yo,
            fecha: hoy,
          })
        : "",
    [plantilla, lista, empresa, yo, hoy],
  );

  const asuntoPara = React.useCallback(
    (proveedor: string) =>
      plantilla?.asunto
        ? renderizar(plantilla.asunto, { proveedor, empresa, yo, fecha: hoy })
        : `Solicitud de cotización · ${empresa}`,
    [plantilla, empresa, yo, hoy],
  );

  const alternar = (id: string) =>
    setElegidos((previos) => {
      const copia = new Set(previos);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });

  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles no se rompe nada: el texto está a la vista
      // y se puede seleccionar a mano.
      setCopiado(null);
    }
  };

  const marcados = proveedores.filter((p) => elegidos.has(p.id));

  /**
   * Guardar la ronda para poder apuntar lo que contesten.
   *
   * Es un botón aparte y no algo que pase solo al abrir WhatsApp, por dos
   * motivos. Uno: preguntar un precio de paso —«oye, ¿cuánto el 6205?»— no
   * merece un documento, y llenar la lista de rondas de una línea acabaría
   * con que nadie la mire. Dos: el envío lo hace el navegador, así que aquí
   * no hay forma de saber si de verdad lo mandó.
   */
  const guardarRonda = () => {
    setAvisoRonda(null);
    empezarRonda(async () => {
      const r = await abrirRonda({
        nota: `${items.length} ${items.length === 1 ? "producto" : "productos"} de la bandeja`,
        items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
        proveedores: marcados.map((p) => p.id),
      });
      if (!r.ok) {
        setAvisoRonda(r.error);
        return;
      }
      router.push(`/compras/precios/${r.id}`);
    });
  };

  const sinContacto = marcados.filter((p) => {
    const c = canalesDisponibles(p);
    return !c.whatsapp && !c.correo;
  });

  if (plantillas.length === 0) {
    return (
      <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
        No hay ningún mensaje escrito para pedir precios.{" "}
        <Link href="/configuracion" className="font-medium underline">
          Escribe el primero en Configuración
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------- Qué se pide */}
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Qué se pide</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((i) => (
            <li key={i.producto_id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono font-medium">{i.codigo}</span>
              <span className="text-[var(--fg-muted)]">
                {i.marca ? `${i.marca} · ` : ""}
                {i.descripcion}
              </span>
              <span className="ml-auto tabular">
                {i.cantidad} {i.unidad}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------- Con qué texto */}
      <section className="card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Con qué mensaje</span>
          <SelectNativo
            value={plantillaId}
            onChange={(e) => setPlantillaId(e.target.value)}
            className="h-11 md:h-control-md"
          >
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {ETIQUETA_CANAL[p.canal]}
              </option>
            ))}
          </SelectNativo>
          <span className="text-xs text-[var(--fg-subtle)]">
            Se corrigen en{" "}
            <Link href="/configuracion" className="underline">
              Configuración
            </Link>
            .
          </span>
        </label>
      </section>

      {/* -------------------------------------------------------- A quién */}
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">A quién se le pide</h2>
        <p className="mb-3 text-xs text-[var(--fg-subtle)]">
          Salen los que ya te han vendido algo de esta lista, y primero el que
          vende más cosas: a ese se le pide una vez en vez de cinco.
        </p>

        {proveedores.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">
            Todavía no consta que nadie venda estos productos. Se aprende solo
            con cada compra —y con cada precio que te contesten—, y mientras
            tanto los buscas aquí abajo.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {proveedores.map((p) => {
              const canales = canalesDisponibles(p);
              const texto = textoPara(p.razon_social);
              const wa = enlaceWhatsapp(p.whatsapp ?? p.telefono, texto);
              const correo = enlaceCorreo(p.email, asuntoPara(p.razon_social), texto);
              const marcado = elegidos.has(p.id);

              return (
                <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternar(p.id)}
                    className="mt-1 size-4"
                    aria-label={`Pedirle a ${p.razon_social}`}
                  />

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/proveedores/${p.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {p.razon_social}
                    </Link>
                    <span className="ml-2 text-xs text-[var(--fg-subtle)]">
                      vende {p.coincidencias} de {items.length}
                      {p.ultimoCostoUsd !== null
                        ? ` · la última vez, $ ${p.ultimoCostoUsd.toFixed(2)}`
                        : ""}
                    </span>

                    {!canales.whatsapp && !canales.correo ? (
                      <span className="mt-1 block text-xs text-[var(--warn)]">
                        No tiene WhatsApp ni correo en su ficha. Puedes copiar el
                        texto, o{" "}
                        <Link href={`/proveedores/${p.id}/editar`} className="underline">
                          ponerle el número
                        </Link>
                        .
                      </span>
                    ) : null}
                  </div>

                  {marcado ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
                        >
                          <MessageCircle className="size-4" aria-hidden="true" />
                          WhatsApp
                        </a>
                      ) : null}
                      {correo ? (
                        <a
                          href={correo}
                          className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                        >
                          <Mail className="size-4" aria-hidden="true" />
                          Correo
                        </a>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => void copiar(p.id, texto)}
                      >
                        <Copy aria-hidden="true" />
                        {copiado === p.id ? "Copiado" : "Copiar"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <AnadirProveedor
          yaEstan={new Set(proveedores.map((p) => p.id))}
          onAnadir={(p) => {
            setProveedores((previos) => [...previos, p]);
            // Se marca al añadirlo: buscar a alguien y añadirlo ES decir que
            // se le quiere preguntar. Obligar a un segundo clic sería pedir
            // que confirme lo que acaba de hacer.
            setElegidos((previos) => new Set(previos).add(p.id));
          }}
        />
      </section>

      {/* --------------------------------------------------- Vista previa */}
      {plantilla ? (
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Así le llega</h2>
          <p className="mb-2 text-xs text-[var(--fg-subtle)]">
            Con el nombre del primero que has marcado. A cada uno le llega el
            suyo.
          </p>
          <p className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            {textoPara(marcados[0]?.razon_social ?? "PROVEEDOR")}
          </p>
        </section>
      ) : null}

      {sinContacto.length > 0 ? (
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <strong>
            {sinContacto.length === 1
              ? "Uno de los marcados no tiene"
              : `${sinContacto.length} de los marcados no tienen`}
          </strong>{" "}
          WhatsApp ni correo en su ficha, así que solo se les puede copiar el
          texto. Es lo que más ayuda a arreglar: el maestro llegó sin datos de
          contacto.
        </p>
      ) : null}

      {/* Lo que convierte esto en un flujo y no en un generador de textos:
          apuntar a quién se le preguntó, para tener dónde escribir lo que
          contesten. Sin esto, la respuesta que llega el miércoles se pierde. */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium">¿Vas a esperar respuesta?</p>
          <p className="text-xs text-[var(--fg-subtle)]">
            Guarda la consulta y tendrás dónde apuntar lo que te diga cada uno,
            ver quién sale más barato y convertirlo en compras.
          </p>
        </div>
        <Button
          type="button"
          onClick={guardarRonda}
          disabled={abriendo || marcados.length === 0}
          className="gap-1.5"
        >
          <ClipboardList className="size-4" aria-hidden="true" />
          {abriendo
            ? "Guardando…"
            : `Anotar la consulta a ${marcados.length} ${
                marcados.length === 1 ? "proveedor" : "proveedores"
              }`}
        </Button>
      </section>

      {avisoRonda ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm"
        >
          {avisoRonda}
        </p>
      ) : null}

      <p className="text-xs text-[var(--fg-subtle)]">
        Se abre WhatsApp con el mensaje escrito y lo mandas tú.{" "}
        <strong>Nada sale solo</strong>: no hay envío automático, ni falta.
      </p>
    </div>
  );
}
