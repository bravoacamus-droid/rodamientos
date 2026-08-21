/**
 * Sustituto de `server-only` para las pruebas.
 *
 * El paquete real es un centinela: existe para que el empaquetador REVIENTE si
 * un módulo de servidor termina importado desde el navegador. Fuera de Next no
 * hay quién lo resuelva, y sin este alias cualquier test que toque un archivo
 * con `import "server-only"` falla al cargar.
 *
 * Se sustituye solo en vitest. El centinela sigue intacto en el build, que es
 * donde de verdad protege.
 */
export {};
