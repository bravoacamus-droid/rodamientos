import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import {
  comprasAbiertasDe,
  cotizacionPorId,
  type CompraAbierta,
} from "../api/consultas";
import { estadoInicial, type EstadoConstructor } from "../dominio/constructor";
import { Constructor } from "./constructor";

/** La misma lista que `permisos_rol` tiene para `cotizaciones`. */
const ROLES = ["gerencia", "admin", "ventas"];

/**
 * Editar una cotización que el cliente todavía no ha aceptado.
 *
 * Willy, 07/09 (15:49): *«ya sería editar la cotización, esa es otra opción»*.
 * Y en la misma reunión se dijo en voz alta que faltaba: *«en este caso no le
 * puedo hacer porque falta editar la cotización»*.
 *
 * ---------------------------------------------------------------------------
 * Hasta que el documento comprometa a alguien
 * ---------------------------------------------------------------------------
 * Empezó siendo «solo borrador y enviada», con este argumento: una `aprobada`
 * es lo que el cliente ACEPTÓ, y cambiarle un precio después es reescribir un
 * acuerdo. El argumento sigue siendo bueno y era incompleto.
 *
 * Luis, 08/09: *«si la cotización fue aprobada puede seguir editando siempre y
 * cuando todavía no se haga las compras de los productos o se hizo la guía»*.
 * Entre el sí del cliente y la salida de la mercadería pueden pasar semanas
 * —hay que comprar, importar, esperar— y en ese hueco el cliente llama para
 * añadir dos rodamientos. La única salida era clonar: un número nuevo por
 * añadir una línea.
 *
 * Así que el corte no es el estado, es el compromiso (070): guía emitida o
 * algo facturado. La misma regla que rige la guía, el pedido y la recepción.
 *
 * De las compras se AVISA, no se bloquea: no hay vínculo entre una compra y
 * la cotización que la motivó. Lo explica `comprasAbiertasDe`.
 *
 * Se comprueba aquí, y lo vuelve a comprobar `actualizar_cotizacion` en la
 * base — que es donde no se puede saltar.
 */
export default async function PaginaEditarCotizacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil] = await Promise.all([cotizacionPorId(id), perfilActual()]);

  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes editar cotizaciones"
        descripcion="Tu rol no tiene permiso. Habla con Gerencia si crees que debería."
      />
    );
  }

  if (!resultado.ok) {
    if (resultado.error.includes("no existe")) notFound();
    return (
      <EstadoError
        titulo="No se pudo cargar la cotización"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { cabecera, lineas } = resultado.datos;

  /*
    Cerrada: se vuelve a la ficha en vez de enseñar un formulario que va a
    rebotar al guardar.

    `aprobada` entra desde la 070. Luis, 08/09: *«si la cotización fue
    aprobada puede seguir editando siempre y cuando todavía no se haga la
    guía»*. El corte de verdad —guía emitida o algo facturado— lo pone la
    función en la base, que es donde no se puede saltar: esto es solo el
    atajo para no pintar un formulario condenado.
  */
  if (
    cabecera.estado !== "borrador" &&
    cabecera.estado !== "enviada" &&
    cabecera.estado !== "aprobada"
  ) {
    redirect(`/cotizaciones/${cabecera.id}`);
  }

  /*
    De la cotización guardada al estado del constructor.

    Las claves se numeran aquí, en el mismo orden que tienen las líneas: el
    reducer las usa para React y para localizar la línea que se toca, y tienen
    que ser estables dentro de una edición. Los `id` reales de la base no
    sirven —al guardar se borran y se reinsertan (069)— así que usar el
    contador del propio constructor es más honesto que fingir permanencia.
  */
  const estado: EstadoConstructor = {
    ...estadoInicial(cabecera.cliente_id),
    validezDias: cabecera.validez_dias,
    tiempoEntrega: cabecera.tiempo_entrega ?? "",
    // A mano: lo que hay guardado manda sobre lo que deduciría de las líneas.
    // Si se recalculara al abrir, editar una coma reescribiría un plazo que
    // alguien puso a propósito.
    entregaAMano: true,
    ordenCompraCliente: cabecera.orden_compra_cliente ?? "",
    contacto: cabecera.contacto ?? "",
    contactoId: null,
    condiciones: cabecera.condiciones ?? "",
    observaciones: cabecera.observaciones ?? "",
    mostrarDescuento: cabecera.mostrar_descuento,
    mostrarDisponibilidad: cabecera.mostrar_disponibilidad,
    lineas: lineas.map((l, i) => ({
      key: `k${i + 1}`,
      productoId: l.producto_id,
      codigo: l.codigo,
      marca: l.marca,
      descripcion: l.descripcion,
      unidad: l.unidad_codigo,
      cantidad: l.cantidad,
      valorUnitario: l.valor_unitario,
      descuentoPct: l.descuento_pct,
      costoUnitario: l.costo_unitario,
      // El piso y el precio de lista del MAESTRO no viajan en la cotización.
      // Se quedan en cero, que el dominio lee como «sin P.M. cargado»: no
      // bloquea, y el aviso vuelve en cuanto se toca la línea y se rebusca el
      // producto. Inventarlos aquí sería peor — diría que hay un piso que
      // nadie ha comprobado.
      precioMinimo: 0,
      precioLista: l.valor_unitario,
      stock: 0,
      disponibilidad: l.disponibilidad,
      diasEntrega: l.dias_entrega,
    })),
    proximaKey: lineas.length + 1,
  };

  /*
    Solo se pregunta por las compras si el pedido ya está aprobado.

    En un borrador nadie ha salido a comprar nada por él, así que la consulta
    no diría más que ruido y costaría una lectura en cada edición.
  */
  const compras =
    cabecera.estado === "aprobada"
      ? await comprasAbiertasDe(lineas.map((l) => l.producto_id ?? ""))
      : [];

  return (
    <>
      {compras.length > 0 ? <AvisoDeCompras compras={compras} /> : null}
      <Constructor
      sugeridos={[]}
      hoy={new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
        new Date(),
      )}
      clienteInicial={{
        id: cabecera.cliente_id,
        codigo: "",
        razon_social: cabecera.cliente.razon_social,
        nombre_comercial: null,
        numero_documento: cabecera.cliente.numero_documento,
        tipo_documento: cabecera.cliente.tipo_documento,
        telefono: cabecera.cliente.telefono,
        condicion_pago: cabecera.cliente.condicion_pago,
        dias_credito: cabecera.cliente.dias_credito,
        bloqueado: false,
        motivo_bloqueo: null,
        activo: true,
        contacto: cabecera.cliente.contacto,
        // Los tres van a cero porque son adorno del BUSCADOR de clientes —
        // «cuántas veces le has cotizado», para distinguir dos nombres
        // parecidos— y aquí el cliente ya está elegido. Inventar un número
        // sería peor que un cero honesto.
        contactos: 0,
        cotizaciones: 0,
        ultima_cotizacion: null,
      }}
        editando={{ id: cabecera.id, numero: cabecera.numero, estado }}
      />
    </>
  );
}

/**
 * «Ojo: de esto ya hay una compra en marcha.»
 *
 * No bloquea, y esa es la decisión. No existe vínculo entre una compra y la
 * cotización que la motivó —`compra_items` guarda el producto, y una compra
 * junta lo que esperan varios clientes—, así que «hay una compra con este
 * código» no prueba que se comprara para este pedido.
 *
 * Lo que sí es verdad es lo que dice el aviso: hay una compra abierta que
 * lleva estos códigos. Con el número y el proveedor delante, quien está
 * mirando sabe si le afecta; el sistema no puede saberlo por él.
 *
 * En ámbar y no en rojo: no es un error, es algo que hay que mirar antes de
 * bajar una cantidad.
 */
function AvisoDeCompras({ compras }: { compras: CompraAbierta[] }) {
  return (
    <div className="mb-4 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3.5 text-sm">
      <p className="font-medium text-[var(--warn)]">
        {compras.length === 1
          ? "Hay una compra en marcha con productos de este pedido"
          : `Hay ${compras.length} compras en marcha con productos de este pedido`}
      </p>
      <p className="mt-1 text-[var(--fg-muted)]">
        Si bajas cantidades o quitas líneas, revisa antes que la compra siga
        cuadrando — puede ser de este pedido o de otro cliente.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {compras.map((c) => (
          <li key={c.id}>
            <Link
              href={`/compras/${c.id}`}
              className="font-mono text-[0.8rem] font-semibold text-brand-700 underline"
            >
              {c.numero}
            </Link>{" "}
            <span className="text-[var(--fg-muted)]">
              · {c.proveedor}
              {c.codigos.length > 0 ? ` · ${c.codigos.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
