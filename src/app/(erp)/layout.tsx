import { redirect } from "next/navigation";
import { createClient, getSesion } from "@/lib/supabase/server";
import { Shell, type Perfil } from "@/components/layout/shell";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion?.perfil) redirect("/login");

  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const [alertas, emergencias, vencidos] = await Promise.all([
    supabase.from("alertas").select("id", { count: "exact", head: true }).eq("archivada", false),
    supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("es_emergencia", true)
      .eq("requiere_aprobacion", true)
      .is("aprobado_en", null)
      .neq("estado", "anulado"),
    supabase
      .from("comprobantes")
      .select("id", { count: "exact", head: true })
      .gt("saldo", 0)
      .neq("estado", "anulado")
      .lt("fecha_vencimiento", hoy),
  ]);

  return (
    <Shell
      perfil={sesion.perfil as Perfil}
      contadores={{
        alertas: alertas.count ?? 0,
        emergencias: emergencias.count ?? 0,
        vencidos: vencidos.count ?? 0,
      }}
    >
      {children}
    </Shell>
  );
}
