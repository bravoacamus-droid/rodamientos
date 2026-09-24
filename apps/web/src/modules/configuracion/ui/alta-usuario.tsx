"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, SelectNativo, toast } from "@rodatech/ui";
import { Check, Copy, UserPlus, X } from "lucide-react";

import { crearUsuario } from "../acciones/usuarios";
import { AYUDA_ROL, ETIQUETA_ROL, ROLES, type Rol } from "../dominio/tipos";

/**
 * Dar de alta a un empleado.
 *
 * Antes del 24/09 esto no existía: había que entrar al panel de Supabase. La
 * pantalla lo decía sin disimulo —«el alta se hace en Supabase Auth»— y eso,
 * el día de la entrega, significaba que Willy no podía meter a nadie sin
 * llamar por teléfono.
 *
 * La contraseña no se pide: la genera el servidor y se enseña UNA vez, al
 * terminar. Es deliberado —Luis, 24/09: «se crea una automáticamente»—, y
 * evita el vicio de siempre, que es poner a todos la misma.
 */
export function AltaUsuario({ hayClave }: { hayClave: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [creada, setCreada] = React.useState<{
    nombre: string;
    email: string;
    contrasena: string;
  } | null>(null);

  if (!hayClave) {
    /*
      Un botón que va a fallar es peor que no tener botón: se intenta, sale un
      error técnico y nadie sabe qué hacer. `hayClaveAdmin()` existía desde el
      principio justo para esto —«la interfaz lo consulta para no ofrecer un
      botón que va a fallar»— y hasta hoy no lo consultaba nadie.
    */
    return (
      <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
        Para dar de alta desde aquí falta configurar{" "}
        <code className="text-sm">SUPABASE_SERVICE_ROLE_KEY</code> en el
        servidor. Mientras tanto, las cuentas se crean desde Supabase.
      </p>
    );
  }

  if (creada) {
    return <ContrasenaReciencreada datos={creada} onCerrar={() => setCreada(null)} />;
  }

  if (!abierto) {
    return (
      <Button onClick={() => setAbierto(true)} className="gap-2">
        <UserPlus className="size-4" aria-hidden />
        Dar de alta a alguien
      </Button>
    );
  }

  return (
    <Formulario
      onCancelar={() => setAbierto(false)}
      onCreada={(d) => {
        setAbierto(false);
        setCreada(d);
        router.refresh();
      }}
    />
  );
}

function Formulario({
  onCancelar,
  onCreada,
}: {
  onCancelar: () => void;
  onCreada: (d: { nombre: string; email: string; contrasena: string }) => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [cargo, setCargo] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [rol, setRol] = React.useState<Rol>("ventas");
  const [enviando, empezar] = React.useTransition();

  const listo = nombre.trim().length >= 3 && email.includes("@") && !enviando;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    empezar(async () => {
      const r = await crearUsuario({
        nombre: nombre.trim(),
        email: email.trim(),
        cargo: cargo.trim() || undefined,
        telefono: telefono.trim() || undefined,
        rol,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onCreada({ nombre: r.nombre, email: r.email, contrasena: r.contrasena });
    });
  }

  return (
    <form onSubmit={enviar} className="rounded-lg border border-[var(--border)] p-4">
      <h3 className="mb-3 text-base font-semibold">Dar de alta a alguien</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="alta-nombre" label="Nombre y apellidos" requerido>
          <Input
            id="alta-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            autoFocus
          />
        </Campo>

        <Campo
          id="alta-email"
          label="Correo"
          requerido
          ayuda="Con este correo entra al sistema."
        >
          <Input
            id="alta-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Campo>

        <Campo id="alta-cargo" label="Cargo" ayuda="Como se le llama en la empresa.">
          <Input id="alta-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        </Campo>

        <Campo id="alta-telefono" label="Teléfono">
          <Input
            id="alta-telefono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </Campo>
      </div>

      {/* El rol va aparte y a lo ancho: es lo único de esta pantalla que no se
          puede cambiar sin volver a pasar por gerencia, y lo que decide qué
          ve. La ayuda cambia con la selección para no tener que saberse la
          tabla de memoria. */}
      <div className="mt-3">
        <Campo id="alta-rol" label="Qué va a poder hacer" requerido ayuda={AYUDA_ROL[rol]}>
          <SelectNativo
            id="alta-rol"
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </SelectNativo>
        </Campo>
      </div>

      <p className="mt-3 text-sm text-[var(--fg-muted)]">
        La contraseña se genera sola y te la enseñamos al terminar, para que se
        la des. En cuanto entre, el sistema le obliga a cambiarla.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={!listo}>
          {enviando ? "Creando…" : "Crear la cuenta"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * La contraseña, enseñada UNA vez.
 *
 * No se guarda en ningún sitio nuestro: Supabase se queda el hash y nosotros
 * no la volvemos a ver. Si se cierra esto sin apuntarla, hay que dar una
 * nueva. Por eso el aviso es rotundo y el botón de cerrar dice lo que hace.
 */
function ContrasenaReciencreada({
  datos,
  onCerrar,
}: {
  datos: { nombre: string; email: string; contrasena: string };
  onCerrar: () => void;
}) {
  const [copiada, setCopiada] = React.useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(datos.contrasena);
      setCopiada(true);
      toast.success("Contraseña copiada.");
    } catch {
      toast.error("No se pudo copiar. Apúntala a mano.");
    }
  }

  return (
    <div className="rounded-lg border border-[var(--ok)] bg-[var(--ok-bg)] p-4">
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            Cuenta creada para {datos.nombre}
          </h3>
          <p className="text-sm text-[var(--fg-muted)]">Entra con {datos.email}</p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="text-sm text-[var(--fg-muted)]">Su contraseña para entrar</p>
        {/*
          Grande y en monoespaciada: esto se va a dictar en voz alta o copiar a
          mano, y quien lo lee no ve bien. `tracking-wide` separa los grupos.
          La genera `dominio/contrasena.ts` sin caracteres que se confundan.
        */}
        <p className="mt-1 select-all font-mono text-2xl font-semibold tracking-wide">
          {datos.contrasena}
        </p>
      </div>

      <p className="mt-3 text-sm">
        <strong>Apúntala ahora.</strong> No se guarda en ningún sitio y no se
        puede volver a ver: si se pierde, hay que darle una nueva.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={copiar} className="gap-2">
          {copiada ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copiada ? "Copiada" : "Copiar contraseña"}
        </Button>
        <Button variant="outline" onClick={onCerrar} className="gap-2">
          <X className="size-4" aria-hidden />
          Ya la apunté, cerrar
        </Button>
      </div>
    </div>
  );
}
