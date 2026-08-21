import { perfilActual } from "@rodatech/db/servidor";
import { Logo } from "@/componentes/logo";
import { BarraLateral, MenuMovil } from "@/componentes/barra-lateral";
import { MenuUsuario } from "@/componentes/menu-usuario";
import { menuPara } from "@/lib/navegacion";

export default async function LayoutErp({
  children,
}: {
  children: React.ReactNode;
}) {
  // El middleware ya garantizó que hay sesión. El perfil puede faltar si el
  // usuario existe en Auth pero aún no tiene fila en `perfiles`; en ese caso
  // se muestra el menú mínimo en vez de romper.
  const perfil = await perfilActual().catch(() => null);
  const grupos = menuPara(perfil?.rol ?? null);

  return (
    <div className="flex min-h-dvh">
      <BarraLateral grupos={grupos} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4 md:px-6">
          {/* En móvil el logo cede su sitio al botón del menú: sin él no hay
              forma de llegar a ningún módulo desde un teléfono. */}
          <MenuMovil grupos={grupos} />
          <Logo className="h-7 w-auto md:hidden" priority={false} />
          <div className="ml-auto">
            <MenuUsuario
              nombre={perfil?.nombre ?? "Sesión"}
              rol={perfil?.rol ?? null}
            />
          </div>
        </header>

        {/* min-w-0 para que una tabla ancha no estire el layout entero:
            el desbordamiento tiene que quedarse dentro de su contenedor. */}
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
