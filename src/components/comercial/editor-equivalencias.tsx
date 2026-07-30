"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2, Link2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BuscadorProductos, type ProductoBusqueda } from "@/components/comercial/buscador-productos";
import { Button, Select, Input, Field, Badge, Table, THead, TBody, EmptyState } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { money, num } from "@/lib/utils";

type Equivalente = {
  id: string; sku: string; codigo_fabricante: string; descripcion: string;
  marca: string; marca_segmento: string; tipo: string; nota: string | null;
  stock: number; precio_mayorista: number; estado_stock: string;
};

const TIPOS = [
  { id: "exacta", label: "Intercambiable", desc: "Mismo código de fabricante, reemplazo directo" },
  { id: "similar", label: "Dimensión similar", desc: "Mismas medidas, varía sellado o juego interno" },
  { id: "sustituto", label: "Sustituto", desc: "Cumple la función con diferencias técnicas" },
];

export function EditorEquivalencias({
  productoId,
  productoSku,
  codigoFabricante,
  equivalentes,
}: {
  productoId: string;
  productoSku: string;
  codigoFabricante: string;
  equivalentes: Equivalente[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [borrando, setBorrando] = React.useState<string | null>(null);
  const [buscandoAuto, setBuscandoAuto] = React.useState(false);

  const [seleccion, setSeleccion] = React.useState<ProductoBusqueda | null>(null);
  const [tipo, setTipo] = React.useState("exacta");
  const [nota, setNota] = React.useState("");

  /** Busca en el catálogo otros productos con el mismo código de fabricante. */
  async function detectarAutomaticas() {
    setBuscandoAuto(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("v_stock_productos")
      .select("id, sku, marca, descripcion")
      .eq("codigo_fabricante", codigoFabricante)
      .neq("id", productoId)
      .eq("activo", true);

    const yaLigados = new Set(equivalentes.map((e) => e.id));
    const nuevos = (data ?? []).filter((d) => !yaLigados.has(d.id));

    if (!nuevos.length) {
      toast.info("Sin equivalencias nuevas por detectar", {
        description: `No hay otros productos con el código ${codigoFabricante} fuera de los ya vinculados.`,
      });
      setBuscandoAuto(false);
      return;
    }

    const { error } = await supabase.from("producto_equivalencias").insert(
      nuevos.map((n) => ({
        producto_id: productoId,
        equivalente_id: n.id,
        tipo: "exacta",
        nota: "Mismo código de fabricante · intercambiable dimensionalmente",
      }))
    );

    if (error) {
      toast.error("No se pudieron vincular", { description: error.message });
    } else {
      toast.success(`${nuevos.length} equivalencia(s) detectadas`, {
        description: nuevos.map((n) => n.marca).join(", "),
      });
      router.refresh();
    }
    setBuscandoAuto(false);
  }

  async function vincular() {
    if (!seleccion) return toast.error("Seleccione el producto equivalente");
    if (seleccion.id === productoId) return toast.error("Un producto no puede ser equivalente de sí mismo");

    setGuardando(true);
    const supabase = createClient();

    const { error } = await supabase.from("producto_equivalencias").insert({
      producto_id: productoId,
      equivalente_id: seleccion.id,
      tipo,
      nota: nota.trim() || TIPOS.find((t) => t.id === tipo)?.desc,
    });

    if (error) {
      toast.error(
        error.message.includes("duplicate")
          ? "Esa equivalencia ya está registrada"
          : "No se pudo vincular",
        { description: error.message.includes("duplicate") ? undefined : error.message }
      );
      setGuardando(false);
      return;
    }

    const { data: user } = await supabase.auth.getUser();
    await supabase.from("actividad").insert({
      usuario_id: user.user?.id ?? null,
      accion: "crear_equivalencia",
      entidad: "producto_equivalencias",
      entidad_id: productoId,
      descripcion: `${productoSku} vinculado con ${seleccion.sku} como equivalencia ${tipo}`,
    });

    toast.success(`${seleccion.sku} vinculado como equivalente`);
    setSeleccion(null);
    setNota("");
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  /** La relación puede estar guardada en cualquiera de los dos sentidos. */
  async function desvincular(equivalenteId: string, sku: string) {
    setBorrando(equivalenteId);
    const supabase = createClient();

    const { error } = await supabase
      .from("producto_equivalencias")
      .delete()
      .or(
        `and(producto_id.eq.${productoId},equivalente_id.eq.${equivalenteId}),` +
        `and(producto_id.eq.${equivalenteId},equivalente_id.eq.${productoId})`
      );

    if (error) {
      toast.error("No se pudo desvincular", { description: error.message });
    } else {
      toast.success(`${sku} desvinculado`);
      router.refresh();
    }
    setBorrando(null);
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={detectarAutomaticas} loading={buscandoAuto}>
          <Sparkles />
          Detectar
        </Button>
        <Button variant="subtle" size="sm" onClick={() => setAbierto(true)}>
          <Plus />
          Vincular
        </Button>
      </div>

      {/* -------------------------------- Listado editable de equivalencias */}
      {equivalentes.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight />}
          titulo="Sin equivalencias registradas"
          descripcion={`Use «Detectar» para vincular automáticamente los productos que comparten el código ${codigoFabricante}, o vincúlelos manualmente.`}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <th>Equivalente</th>
              <th>Marca</th>
              <th>Relación</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Precio</th>
              <th className="w-10" />
            </tr>
          </THead>
          <TBody>
            {equivalentes
              .slice()
              .sort((a, b) => Number(b.stock) - Number(a.stock))
              .map((e) => (
                <tr key={e.id}>
                  <td>
                    <a
                      href={`/productos/${e.id}`}
                      className="block text-[12.5px] font-semibold text-brand-700 hover:underline"
                    >
                      {e.sku}
                    </a>
                    <span className="block text-[11px] text-subtle">{e.codigo_fabricante}</span>
                  </td>
                  <td>
                    <Badge
                      tone={
                        e.marca_segmento === "premium" ? "brand"
                        : e.marca_segmento === "economica" ? "neutral" : "info"
                      }
                      size="xs"
                    >
                      {e.marca}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={e.tipo === "exacta" ? "success" : "warning"} size="xs">
                      {TIPOS.find((t) => t.id === e.tipo)?.label ?? e.tipo}
                    </Badge>
                  </td>
                  <td className="text-right text-[12.5px] font-medium tabular">
                    <span style={{ color: Number(e.stock) > 0 ? "var(--ok)" : "var(--danger)" }}>
                      {num(e.stock, 0)}
                    </span>
                  </td>
                  <td className="text-right text-[12.5px] tabular">{money(e.precio_mayorista)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      loading={borrando === e.id}
                      onClick={() => desvincular(e.id, e.sku)}
                      aria-label={`Desvincular ${e.sku}`}
                    >
                      <Trash2 className="text-[var(--danger)]" />
                    </Button>
                  </td>
                </tr>
              ))}
          </TBody>
        </Table>
      )}

      {/* ---------------------------------------------- Vincular manual */}
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        titulo={`Vincular equivalencia de ${productoSku}`}
        descripcion="La relación es bidireccional: el equivalente también mostrará este producto."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardando} onClick={vincular} disabled={!seleccion}>
              <Link2 />
              Vincular
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Producto equivalente
            </p>
            {seleccion ? (
              <div className="flex items-center justify-between rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-brand-800">{seleccion.sku}</p>
                  <p className="truncate text-[11px] text-muted">{seleccion.descripcion}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setSeleccion(null)}>
                  <Trash2 className="text-[var(--danger)]" />
                </Button>
              </div>
            ) : (
              <BuscadorProductos
                onSeleccionar={setSeleccion}
                placeholder="Busque el equivalente por código o descripción…"
                autoFocus
              />
            )}
          </div>

          <Field label="Tipo de relación">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>
              ))}
            </Select>
          </Field>

          <Field label="Nota técnica" hint="Se muestra al vendedor al ofrecer la alternativa">
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={TIPOS.find((t) => t.id === tipo)?.desc}
            />
          </Field>

          {tipo !== "exacta" && (
            <div className="flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2.5">
              <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0 text-accent-800" />
              <p className="text-[10.5px] leading-relaxed text-accent-900">
                Las equivalencias que no son intercambiables exigen validar la aplicación con el
                cliente: un sellado o juego interno distinto puede fallar en el equipo aunque las
                medidas coincidan.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
