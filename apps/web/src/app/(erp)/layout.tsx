import { perfilActual } from "@rodatech/db/servidor";
import { Logo } from "@/componentes/logo";
import { BarraLateral, MenuMovil } from "@/componentes/barra-lateral";
import { MenuUsuario } from "@/componentes/menu-usuario";
import { SelectorTema } from "@/componentes/selector-tema";
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
    // AL IMPRIMIR NO QUEDA NADA DE ESTO.
    //
    // El menú y la barra de arriba salían en el papel: la cotización que se le
    // manda a un cliente llevaba impreso el botón de hamburguesa, el selector
    // de tema y el nombre del usuario con su rol. Y va aquí, en el layout, y
    // no documento por documento: así vale para la cotización, la factura, la
    // boleta, la guía y lo que venga después.
    <div className="flex min-h-dvh print:block print:min-h-0">
      <BarraLateral grupos={grupos} />

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4 md:px-6 print:hidden">
          {/* En móvil el logo cede su sitio al botón del menú: sin él no hay
              forma de llegar a ningún módulo desde un teléfono. */}
          <MenuMovil grupos={grupos} />
          <Logo className="h-7 w-auto md:hidden" priority={false} />
          <div className="ml-auto flex items-center gap-1">
            <SelectorTema />
            <MenuUsuario
              nombre={perfil?.nombre ?? "Sesión"}
              rol={perfil?.rol ?? null}
            />
          </div>
        </header>

        {/* min-w-0 para que una tabla ancha no estire el layout entero:
            el desbordamiento tiene que quedarse dentro de su contenedor. En
            papel el margen lo pone `@page`, no el padding de la pantalla. */}
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
