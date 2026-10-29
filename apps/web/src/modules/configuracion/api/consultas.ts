import "server-only";

import { clienteAdmin, exigirAdmin, hayClaveAdmin } from "@rodatech/db/admin";
import { envOpcional } from "@rodatech/config";
import { periodoActual } from "@rodatech/consultas";
import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { Accion, Modulo } from "@/lib/permisos-comun";

import { contarConsultas, type ConteoConsulta, type FilaBitacoraConsulta } from "../dominio/consultas-externas";
import type { ModuloDef, Permiso } from "../dominio/permisos";
import type { Respaldo } from "../dominio/respaldo";
import { ordenarSeries } from "../dominio/serie";
import type {
  ConteosCatalogo,
  CuentaBancaria,
  Empresa,
  Rol,
  RolDef,
  SerieDocumento,
  TipoDocumento,
  Usuario,
} from "../dominio/tipos";

export interface UsoConsultas {
  periodo: string;
  limite: number;
  usadas: number;
  /** Decolecta contestó 429: se acabó aunque nuestro contador diga otra cosa. */
  agotadoPorDecolecta: boolean;
  reiniciaEl: string | null;
  porTipo: ConteoConsulta[];
  guardados: { ruc: number; dni: number; diasDeCambio: number };
  anteriores: Array<{ periodo: string; usadas: number; limite: number }>;
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** La fila única de `empresa` (id = 1, lo garantiza `empresa_unica`). */
export async function empresa(): Promise<Resultado<Empresa>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("empresa")
      .select(
        `razon_social, nombre_comercial, ruc, direccion, ubigeo_codigo, telefono, celular,
         email, email_ventas, web, eslogan, igv_porcentaje,
         detraccion_monto_minimo, detraccion_porcentaje, retencion_porcentaje,
         cuenta_detraccion, agente_retencion, banco, cuenta_corriente, cci,
         meta_venta_mensual, actualizado_en`,
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) {
      return {
        ok: false,
        error: "No hay ficha de empresa. La crea el seed 007_seed_maestros.sql.",
      };
    }

    const f = data as Record<string, unknown>;
    return {
      ok: true,
      datos: {
        razon_social: String(f.razon_social),
        nombre_comercial: String(f.nombre_comercial),
        ruc: String(f.ruc),
        direccion: (f.direccion as string | null) ?? null,
        ubigeo_codigo: (f.ubigeo_codigo as string | null) ?? null,
        telefono: (f.telefono as string | null) ?? null,
        celular: (f.celular as string | null) ?? null,
        email: (f.email as string | null) ?? null,
        email_ventas: (f.email_ventas as string | null) ?? null,
        web: (f.web as string | null) ?? null,
        eslogan: (f.eslogan as string | null) ?? null,
        igv_porcentaje: Number(f.igv_porcentaje ?? 18),
        detraccion_monto_minimo: Number(f.detraccion_monto_minimo ?? 700),
        detraccion_porcentaje: Number(f.detraccion_porcentaje ?? 12),
        retencion_porcentaje: Number(f.retencion_porcentaje ?? 3),
        cuenta_detraccion: (f.cuenta_detraccion as string | null) ?? null,
        agente_retencion: Boolean(f.agente_retencion),
        meta_venta_mensual: Number(f.meta_venta_mensual) > 0 ? Number(f.meta_venta_mensual) : null,
        banco: (f.banco as string | null) ?? null,
        cuenta_corriente: (f.cuenta_corriente as string | null) ?? null,
        cci: (f.cci as string | null) ?? null,
        actualizado_en: String(f.actualizado_en),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Todas las series, ordenadas como se leen. */
export async function series(): Promise<Resultado<SerieDocumento[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("series_documento")
      .select(
        `id, tipo, serie, correlativo_inicial, correlativo_actual, longitud,
         predeterminada, activo, es_prueba, descripcion`,
      )
      .limit(100);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: ordenarSeries(
        (data ?? []).map((s) => ({
          id: String(s.id),
          tipo: String(s.tipo) as TipoDocumento,
          serie: String(s.serie),
          correlativo_inicial: Number(s.correlativo_inicial ?? 1),
          correlativo_actual: Number(s.correlativo_actual ?? 0),
          longitud: Number(s.longitud ?? 8),
          predeterminada: Boolean(s.predeterminada),
          activo: Boolean(s.activo),
          es_prueba: Boolean(s.es_prueba),
          descripcion: (s.descripcion as string | null) ?? null,
        })),
      ),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cuándo entró cada uno por última vez, de Supabase Auth.
 *
 * `perfiles.ultimo_acceso` existía desde la 002 y NADIE la escribía: las seis
 * cuentas salían «nunca» aunque entran a diario (revisión por módulos del
 * 02/10). Auth sí lo apunta —`last_sign_in_at`—, así que se lee de ahí.
 *
 * Solo con la clave de servicio y solo para gerencia/admin, que es quien ve
 * esta lista. Si falta algo, mapa vacío: la lista sale igual, con lo que diga
 * la tabla.
 */
async function ultimosAccesos(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!hayClaveAdmin()) return mapa;
  try {
    await exigirAdmin();
    const { data, error } = await clienteAdmin().auth.admin.listUsers({ perPage: 200 });
    if (error) return mapa;
    for (const u of data.users) {
      if (u.last_sign_in_at) mapa.set(u.id, u.last_sign_in_at);
    }
  } catch {
    // Sin permiso o sin red: se queda lo de la tabla.
  }
  return mapa;
}

/** Quién entra y con qué rol. */
export async function usuarios(): Promise<Resultado<Usuario[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre, email, usuario, rol, cargo, telefono, activo")
      .order("activo", { ascending: false })
      .order("nombre")
      .limit(200);

    if (error) return fallo(error);

    const accesos = await ultimosAccesos();

    return {
      ok: true,
      datos: (data ?? []).map((u) => ({
        id: String(u.id),
        nombre: String(u.nombre),
        email: (u.email as string | null) ?? null,
        usuario: (u.usuario as string | null) ?? null,
        rol: String(u.rol) as Rol,
        cargo: (u.cargo as string | null) ?? null,
        telefono: (u.telefono as string | null) ?? null,
        activo: Boolean(u.activo),
        // Solo de Auth: la columna de la tabla se quitó en la 103.
        ultimo_acceso: accesos.get(String(u.id)) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cuántas filas tiene cada catálogo.
 *
 * Solo el número, y a propósito: editar marcas y familias todavía no tiene
 * pantalla, así que lo honesto es enseñar lo que hay y decir por dónde se
 * toca, en lugar de un formulario a medias. Se cuentan con `head: true`, que
 * no trae ninguna fila.
 */
export async function conteosCatalogo(): Promise<Resultado<ConteosCatalogo>> {
  try {
    const supabase = await clienteServidor();

    // Las cinco se escriben una a una y no con un `map` sobre una lista de
    // nombres: así `Promise.all` devuelve una tupla y cada resultado tiene su
    // tipo, en lugar de un array donde cada elemento «puede ser undefined».
    const contar = (tabla: "marcas" | "familias" | "subfamilias" | "tipos" | "unidades_medida") =>
      supabase.from(tabla).select("*", { count: "exact", head: true });

    const [marcas, familias, subfamilias, tipos, unidades] = await Promise.all([
      contar("marcas"),
      contar("familias"),
      contar("subfamilias"),
      contar("tipos"),
      contar("unidades_medida"),
    ]);

    const primerFallo = [marcas, familias, subfamilias, tipos, unidades].find((c) => c.error);
    if (primerFallo?.error) return fallo(primerFallo.error);

    return {
      ok: true,
      datos: {
        marcas: marcas.count ?? 0,
        familias: familias.count ?? 0,
        subfamilias: subfamilias.count ?? 0,
        tipos: tipos.count ?? 0,
        unidades: unidades.count ?? 0,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Las cuentas a las que se cobra, todas — activas y desactivadas.
 *
 * El papel solo imprime las activas (`cuentasParaCobrar` en `lib/emisor`),
 * pero la pantalla de configuración las enseña todas: una cuenta apagada que
 * no se ve es una cuenta que se vuelve a dar de alta por duplicado.
 */
export async function cuentasBancarias(): Promise<Resultado<CuentaBancaria[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .select("id, banco, moneda, numero, cci, orden, activo")
      // Las activas primero y en su orden de impresión; las apagadas al final.
      .order("activo", { ascending: false })
      .order("orden")
      .order("banco");

    if (error) return fallo(error, "configuracion/cuentasBancarias");

    return {
      ok: true,
      datos: (data ?? []).map((c) => ({
        id: String(c.id),
        banco: String(c.banco ?? ""),
        moneda: (String(c.moneda ?? "USD").toUpperCase() === "PEN"
          ? "PEN"
          : "USD") as CuentaBancaria["moneda"],
        numero: String(c.numero ?? ""),
        cci: (c.cci as string | null) ?? null,
        orden: Number(c.orden ?? 0),
        activo: Boolean(c.activo),
      })),
    };
  } catch (e) {
    return fallo(e, "configuracion/cuentasBancarias");
  }
}

/**
 * Los roles, los módulos y lo que puede cada rol en cada uno (143). Todo de
 * una vez: la pantalla los cruza en el navegador para que la casilla cambie
 * al instante.
 */
export async function rolesYPermisos(): Promise<
  Resultado<{ roles: RolDef[]; modulos: ModuloDef[]; permisos: Permiso[] }>
> {
  try {
    const supabase = await clienteServidor();
    const [r, m, p, u] = await Promise.all([
      supabase.from("roles").select("clave, nombre, descripcion, sistema, creado_en").order("creado_en").limit(200),
      supabase.from("modulos").select("clave, nombre, ayuda, acciones, orden").order("orden").limit(100),
      supabase.from("permisos").select("rol, modulo, accion").limit(5000),
      supabase.from("perfiles").select("rol").limit(1000),
    ]);
    const error = r.error ?? m.error ?? p.error ?? u.error;
    if (error) return fallo(error, "configuracion/rolesYPermisos");

    const cuantos = new Map<string, number>();
    for (const f of u.data ?? []) cuantos.set(String(f.rol), (cuantos.get(String(f.rol)) ?? 0) + 1);

    // Los seis de siempre en su orden de siempre; los creados, detrás.
    const ORDEN = ["gerencia", "admin", "ventas", "almacen", "compras", "cobranzas"];
    const posicion = (c: string) => (ORDEN.includes(c) ? ORDEN.indexOf(c) : ORDEN.length);

    return {
      ok: true,
      datos: {
        roles: (r.data ?? [])
          .map((x) => ({
            clave: String(x.clave),
            nombre: String(x.nombre),
            descripcion: (x.descripcion as string | null) ?? null,
            sistema: Boolean(x.sistema),
            usuarios: cuantos.get(String(x.clave)) ?? 0,
          }))
          .sort((a, b) => posicion(a.clave) - posicion(b.clave)),
        modulos: (m.data ?? []).map((x) => ({
          clave: x.clave as Modulo,
          nombre: String(x.nombre),
          ayuda: String(x.ayuda),
          acciones: (x.acciones ?? []) as Accion[],
        })),
        permisos: (p.data ?? []).map((x) => ({
          rol: String(x.rol),
          modulo: x.modulo as Modulo,
          accion: x.accion as Accion,
        })),
      },
    };
  } catch (e) {
    return fallo(e, "configuracion/rolesYPermisos");
  }
}

/** Los roles para elegir al dar de alta o cambiar a un usuario. */
export async function rolesParaElegir(): Promise<RolDef[]> {
  const r = await rolesYPermisos();
  return r.ok ? r.datos.roles : [];
}

/**
 * La última copia de seguridad buena y la última que se intentó (147). Solo
 * las ven gerencia y admin: a cualquier otro la RLS le devuelve cero filas, y
 * la pantalla no debe leer eso como «nunca se hizo una copia».
 */
export async function ultimosRespaldos(): Promise<
  Resultado<{ ultimaBuena: Respaldo | null; ultima: Respaldo | null }>
> {
  try {
    const supabase = await clienteServidor();
    const columnas = "fecha, ok, tablas, filas, archivos";
    const [buena, cualquiera] = await Promise.all([
      supabase.from("respaldos").select(columnas).eq("ok", true).order("fecha", { ascending: false }).limit(1),
      supabase.from("respaldos").select(columnas).order("fecha", { ascending: false }).limit(1),
    ]);
    const error = buena.error ?? cualquiera.error;
    if (error) return fallo(error, "configuracion/ultimosRespaldos");

    const leer = (f: Record<string, unknown> | undefined): Respaldo | null =>
      f
        ? {
            fecha: String(f.fecha),
            ok: Boolean(f.ok),
            tablas: Number(f.tablas),
            filas: Number(f.filas),
            archivos: Number(f.archivos),
          }
        : null;
    return { ok: true, datos: { ultimaBuena: leer(buena.data?.[0]), ultima: leer(cualquiera.data?.[0]) } };
  } catch (e) {
    return fallo(e, "configuracion/ultimosRespaldos");
  }
}

/**
 * Lo gastado de Decolecta en el ciclo en curso, y los dos anteriores.
 *
 * `consultas_cuota` es el contador que manda —lo sube la reserva atómica
 * antes de salir a la red, y es el que se compara con el límite del plan—.
 * La bitácora dice en qué se gastó y cuánto se ahorró la memoria.
 */
export async function usoConsultasExternas(): Promise<Resultado<UsoConsultas>> {
  try {
    const supabase = await clienteServidor();
    const ahora = new Date();
    const periodo = periodoActual(ahora, Number(envOpcional("DECOLECTA_QUOTA_CYCLE_DAY") ?? 1));
    const [cuotas, bitacora, memoria] = await Promise.all([
      supabase
        .from("consultas_cuota")
        .select("periodo, limite, consumidas, agotado_forzado, fin_ciclo")
        .order("periodo", { ascending: false })
        .limit(3),
      supabase.from("consultas_log").select("endpoint, desde_cache, status_code").eq("periodo", periodo),
      supabase.from("consultas_cache").select("espacio").eq("ok", true),
    ]);
    const error = cuotas.error ?? bitacora.error ?? memoria.error;
    if (error) return fallo(error, "configuracion/usoConsultasExternas");

    const filas = (cuotas.data ?? []) as Array<Record<string, unknown>>;
    const actual = filas.find((f) => f.periodo === periodo);
    const guardados = { ruc: 0, dni: 0, tipo_cambio: 0 };
    for (const f of (memoria.data ?? []) as Array<{ espacio: string }>) {
      if (f.espacio in guardados) guardados[f.espacio as keyof typeof guardados] += 1;
    }
    const { count: dias } = await supabase
      .from("tipos_cambio_sunat")
      .select("fecha", { count: "exact", head: true });

    return {
      ok: true,
      datos: {
        periodo,
        limite: actual ? Number(actual.limite) : Number(envOpcional("DECOLECTA_QUOTA_LIMIT") ?? 100),
        usadas: actual ? Number(actual.consumidas) : 0,
        agotadoPorDecolecta: actual ? Boolean(actual.agotado_forzado) : false,
        reiniciaEl: actual ? String(actual.fin_ciclo) : null,
        porTipo: contarConsultas((bitacora.data ?? []) as FilaBitacoraConsulta[]),
        guardados: { ruc: guardados.ruc, dni: guardados.dni, diasDeCambio: dias ?? 0 },
        anteriores: filas
          .filter((f) => f.periodo !== periodo)
          .map((f) => ({ periodo: String(f.periodo), usadas: Number(f.consumidas), limite: Number(f.limite) })),
      },
    };
  } catch (e) {
    return fallo(e, "configuracion/usoConsultasExternas");
  }
}
