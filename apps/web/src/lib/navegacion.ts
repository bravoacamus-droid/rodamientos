import type { Rol } from "@rodatech/config";

/**
 * Los iconos del menú. Uno por ítem, ninguno decorativo.
 *
 * Es el NOMBRE, no el componente: este archivo lo importa el layout del
 * servidor, y guardar aquí un icono obligaría a marcar el módulo como cliente
 * y arrastraría los diecinueve trazos a cada página. El nombre se resuelve en
 * la barra lateral, que ya es cliente.
 */
export type NombreIcono =
  | "tablero" | "cotizacion" | "listos" | "guia" | "factura" | "cobranza"
  | "producto" | "kit" | "cargar" | "equivalencia" | "cliente" | "proveedor"
  | "inventario" | "kardex" | "recepcion" | "ajuste"
  | "compra" | "porcomprar" | "precios" | "importacion"
  | "reporte" | "alerta" | "bitacora" | "configuracion" | "transporte"
  | "empresa" | "sunat" | "usuarios";

export interface ItemNav {
  etiqueta: string;
  ruta: string;
  icono: NombreIcono;
  /** Roles que ven el ítem. Vacío = todos los autenticados. */
  roles?: readonly Rol[];
}

export interface GrupoNav {
  titulo: string;
  /**
   * El icono del grupo, al lado del título.
   *
   * Luis, 08/09, sobre su rediseño: *«más visible… entendible qué hace cada
   * cosa»*. Un título de grupo en gris y en versalitas se lee como una
   * etiqueta de sistema; con icono se reconoce de un vistazo, igual que los
   * ítems de dentro.
   */
  icono: NombreIcono;
  items: readonly ItemNav[];
}

/**
 * Menú del ERP.
 *
 * Refleja el alcance v2: sin bancos, sin multi-almacén ni transferencias, sin
 * listas de precio múltiples. Ver docs/PLAN-V2.md §2.11.
 *
 * Esto es solo la navegación. Que un rol NO vea un ítem no lo protege: la
 * autorización real vive en RLS y en la validación de cada Server Action.
 */
/**
 * El tablero, suelto y arriba del todo.
 *
 * Fuera de los grupos a propósito: no es «una cosa de ventas», es la portada
 * — donde se mira cómo va el negocio antes de decidir a qué módulo entrar.
 * Meterlo dentro de un grupo lo escondía cuando ese grupo se plegaba.
 */
export const TABLERO: ItemNav = {
  etiqueta: "Tablero",
  ruta: "/dashboard",
  icono: "tablero",
};

/**
 * Configuración: un grupo más, el último.
 *
 * Estuvo anclada al pie de la barra, fuera de los grupos, con el argumento de
 * que así se llegaba sin buscarla. Luis, 15/09, viéndolo: *«debería estar
 * abajo de Gestión, del sidebar»*. Y es lo correcto: anclada parecía un
 * añadido pegado por fuera —encima el indicador de desarrollo de Next se le
 * sentaba encima y la tapaba— cuando es un módulo como los otros cinco.
 *
 * Va la última porque es la que menos se abre, no porque sea distinta.
 *
 * Lo que también cambia el 15/09 es que deja de ser UN enlace a una pantalla
 * de scroll infinito. Luis: *«en vez de tener un botón de configuración abajo
 * del módulo de gestión, pongamos otro de configuración y que cada uno tenga
 * su propio menú: datos de empresa, configuración de SUNAT con sus series y
 * correlativos, usuarios; así tenerlo ordenado»*.
 *
 * Y tenía razón por una razón que se ve en la pantalla: las tres cosas se
 * tocan en momentos distintos. Los datos de la empresa, una vez. Las series,
 * el día que SUNAT da una nueva. Los usuarios, cada vez que entra alguien.
 * Tenerlas en la misma página obligaba a pasar por encima de las otras dos
 * para llegar a la que se busca.
 *
 * «SUNAT y numeración» y no «SUNAT» a secas: ahí dentro viven también las
 * series de cotización, orden de compra y recepción, que son numeración
 * nuestra y no tienen nada que ver con SUNAT. Llamar SUNAT a esa pantalla
 * sería enseñar mal lo que hay dentro.
 */
export const CONFIGURACION: GrupoNav = {
  titulo: "Configuración",
  icono: "configuracion",
  items: [
    {
      etiqueta: "Datos de la empresa",
      ruta: "/configuracion/empresa",
      icono: "empresa",
      roles: ["gerencia", "admin"],
    },
    {
      etiqueta: "SUNAT y numeración",
      ruta: "/configuracion/sunat",
      icono: "sunat",
      roles: ["gerencia", "admin"],
    },
    {
      etiqueta: "Usuarios",
      ruta: "/configuracion/usuarios",
      icono: "usuarios",
      // Solo gerencia CAMBIA roles, pero admin necesita ver quién entra.
      roles: ["gerencia", "admin"],
    },
    {
      etiqueta: "Permisos",
      ruta: "/configuracion/permisos",
      icono: "usuarios",
      // Misma regla que arriba: admin mira, gerencia cambia. Y va DESPUÉS de
      // Usuarios porque se toca mucho menos: una cosa es el alta de alguien
      // que entra hoy y otra es qué puede hacer su rol, que se decide una vez.
      roles: ["gerencia", "admin"],
    },
  ],
};

export const NAVEGACION: readonly GrupoNav[] = [
  {
    // «Ventas» y no «Operación»: es como lo llama Luis y como lo entiende
    // quien vende. «Operación» describe el software, no el trabajo.
    titulo: "Ventas",
    icono: "cotizacion",
    items: [
      { etiqueta: "Cotizaciones", ruta: "/cotizaciones", icono: "cotizacion" },
      // Justo después, porque es el paso siguiente del mismo hilo: se
      // cotiza, el cliente confirma, y cuando llega la mercadería alguien
      // tiene que acordarse de avisarle. Ese «alguien» era la memoria de
      // Willy hasta el 04/09.
      { etiqueta: "Listos para entregar", ruta: "/cotizaciones/listos", icono: "listos" },
      { etiqueta: "Guías de remisión", ruta: "/guias", icono: "guia" },
      { etiqueta: "Facturación", ruta: "/facturacion", icono: "factura" },
      { etiqueta: "Cobranzas", ruta: "/cobranzas", icono: "cobranza", roles: ["gerencia", "admin", "cobranzas"] },
    ],
  },
  {
    titulo: "Catálogo",
    icono: "producto",
    items: [
      { etiqueta: "Productos", ruta: "/productos", icono: "producto" },
      // Quien mantiene el maestro es Compras; gerencia y admin pueden todo.
      {
        etiqueta: "Cargar productos",
        ruta: "/productos/cargar", icono: "cargar",
        roles: ["gerencia", "admin", "compras"],
      },
      /*
        Los kits (085), justo debajo de Productos.

        Willy, 16/09: *«me lo vas a presentar como un kit; ya me ha pasado
        tres y en adelante te voy a pasar todo, por máquina»*. Es catálogo —se
        define una vez y se cotiza muchas—, no una operación.

        Va en el menú desde el primer día a propósito: en este proyecto lo que
        no está en el menú no existe, y ya van treinta veces.
      */
      { etiqueta: "Kits", ruta: "/productos/kits", icono: "kit" },
      { etiqueta: "Equivalencias", ruta: "/equivalencias", icono: "equivalencia" },
      { etiqueta: "Clientes", ruta: "/clientes", icono: "cliente" },
      // Con quién y con qué se despacha: las agencias, los vehículos propios y
      // los conductores. Va en Catálogo y no en Configuración porque se
      // mantiene mientras se trabaja —a la agencia nueva se le da de alta el
      // día que el cliente la pide—, no el día de la puesta en marcha.
      {
        etiqueta: "Transporte", ruta: "/transporte", icono: "transporte",
        roles: ["gerencia", "admin", "ventas", "almacen"],
      },
    ],
  },
  {
    titulo: "Almacén",
    icono: "inventario",
    items: [
      { etiqueta: "Inventario", ruta: "/inventario", icono: "inventario" },
      { etiqueta: "Kardex", ruta: "/inventario/kardex", icono: "kardex" },
      { etiqueta: "Recepciones", ruta: "/recepciones", icono: "recepcion", roles: ["gerencia", "admin", "almacen", "compras"] },
      // El cuadre lo pidió Willy como "un botón que se usa con cuidado" (26:49).
      { etiqueta: "Ajuste de inventario", ruta: "/inventario/ajuste", icono: "ajuste", roles: ["gerencia"] },
    ],
  },
  {
    // «Compras», por lo mismo: nadie dice «voy a abastecimiento».
    titulo: "Compras",
    icono: "compra",
    items: [
      // Antes que «Compras» a propósito: es la pantalla desde la que se
      // empieza. Willy no abre el ERP para registrar una compra, la abre
      // para saber qué le falta.
      { etiqueta: "Por comprar", ruta: "/compras/por-comprar", icono: "porcomprar", roles: ["gerencia", "admin", "compras"] },
      /*
        Entre las dos, que es donde cae en el flujo: se ve qué falta, se
        pregunta el precio, y de ahí sale la compra.

        Se llamaba «Precios» y el nombre engañaba. Luis, 21/09: *«yo lo haría
        en una sola pantalla porque si no, mucho enredo»* — y esa pantalla es
        justo esta: varios productos, varios proveedores, sus precios, y de
        ahí salen las compras repartidas. Pero «Precios» suena a una tabla de
        consulta, así que Willy entraba por «Compras», que es la de UN
        proveedor, y acababa repitiéndola una vez por cada uno.

        «Pedir precios» es su propio verbo —él dice «pedir precio»— y dice lo
        que se hace ahí.
      */
      { etiqueta: "Pedir precios", ruta: "/compras/precios", icono: "precios", roles: ["gerencia", "admin", "compras"] },
      { etiqueta: "Compras", ruta: "/compras", icono: "compra", roles: ["gerencia", "admin", "compras"] },
      /*
        Proveedores vive aquí desde el 11/09, y no en Catálogo.

        Luis: *«no sé qué tan factible sea pasar proveedores a compras, porque
        en sí proveedores tiene que ver con compras, ¿no?»*. Sí, y el propio
        menú ya lo decía: era el único ítem de Catálogo con los roles
        `gerencia, admin, compras` —los mismos que todo este grupo— mientras
        sus vecinos los veía cualquiera.

        A un proveedor solo se entra desde una compra: para pedirle precio,
        para ver qué le compraste o para corregirle el RUC antes de registrar
        una factura. Nadie abre «Catálogo» pensando en un proveedor.

        Clientes NO se mueve, y no es incoherencia: a un cliente se entra desde
        cotizaciones, desde facturación y desde cobranzas —tres grupos—, así
        que no es «una cosa de ventas». Es un maestro de verdad, y ahí es donde
        se queda.
      */
      { etiqueta: "Proveedores", ruta: "/proveedores", icono: "proveedor", roles: ["gerencia", "admin", "compras"] },
      { etiqueta: "Importaciones", ruta: "/importaciones", icono: "importacion", roles: ["gerencia", "admin", "compras"] },
    ],
  },
  {
    titulo: "Gestión",
    icono: "reporte",
    items: [
      { etiqueta: "Reportes", ruta: "/reportes", icono: "reporte", roles: ["gerencia", "admin"] },
      { etiqueta: "Alertas", ruta: "/alertas", icono: "alerta" },
      // Dice quién hizo qué, así que la ve quien responde de ello.
      { etiqueta: "Qué ha pasado", ruta: "/actividad", icono: "bitacora", roles: ["gerencia", "admin"] },
    ],
  },
  // Y la última, definida arriba porque es larga y tiene su propia historia.
  CONFIGURACION,
];

/**
 * Cuál de los ítems del menú corresponde a la ruta actual.
 *
 * Gana el MÁS ESPECÍFICO. Con `/compras` y `/compras/por-comprar` en la
 * misma lista, un simple «empieza por» marcaría los dos a la vez, y un menú
 * con dos ítems encendidos no dice dónde estás: dice que el menú está roto.
 * Pasaba ya con `/inventario` contra `/inventario/kardex` y con `/productos`
 * contra `/productos/cargar`.
 *
 * Devuelve la ruta del ítem, o null si ninguno encaja —una pantalla que no
 * está en el menú, como el detalle de un cliente— y entonces no se marca
 * nada, que es la verdad.
 */
export function rutaActiva(
  ruta: string,
  grupos: readonly GrupoNav[] = NAVEGACION,
): string | null {
  let mejor: string | null = null;
  for (const grupo of grupos) {
    for (const item of grupo.items) {
      const encaja = ruta === item.ruta || ruta.startsWith(item.ruta + "/");
      if (encaja && (mejor === null || item.ruta.length > mejor.length)) {
        mejor = item.ruta;
      }
    }
  }
  return mejor;
}

/**
 * Filtra el menú para un rol. Sin rol conocido, solo lo abierto a todos.
 *
 * Los grupos que se quedan sin ítems desaparecen, así que la configuración no
 * le sale a quien no tiene ninguno de sus tres permisos: no hace falta un
 * interruptor aparte para esconderla.
 */
export function menuPara(rol: Rol | null): GrupoNav[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((i) => !i.roles || (rol !== null && i.roles.includes(rol))),
  })).filter((grupo) => grupo.items.length > 0);
}
