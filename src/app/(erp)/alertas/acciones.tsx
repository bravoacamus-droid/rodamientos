"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/primitives";

export function BotonRegenerar() {
  const router = useRouter();
  const [cargando, setCargando] = React.useState(false);

  async function regenerar() {
    setCargando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("generar_alertas");
    if (error) {
      toast.error("No se pudieron recalcular las alertas", { description: error.message });
    } else {
      toast.success(`${data} alerta(s) activas`, {
        description: "El motor de reglas volvió a evaluar toda la operación.",
      });
      router.refresh();
    }
    setCargando(false);
  }

  return (
    <Button variant="primary" size="md" loading={cargando} onClick={regenerar}>
      <RefreshCw />
      Recalcular alertas
    </Button>
  );
}
