# @rodatech/sunat

Conector de facturación electrónica **SUNAT (Perú)**. Código propio en TypeScript,
sin dependencia de librerías peruanas de terceros para la lógica de negocio.

Genera **XML UBL 2.1**, lo **firma** (XML-DSig), lo **envía** a SUNAT por SOAP y
procesa el **CDR**. Emisión directa a SUNAT (sin OSE/PSE).

Portado desde el monorepo `itech` (paquete `@itech/sunat`), donde ya se probó contra
el ambiente beta de SUNAT hasta obtener CDR aceptado. El paquete no conoce Supabase
ni ninguna tabla de la app: recibe objetos de dominio y devuelve XML/CDR, así que se
copia entre proyectos sin arrastrar dependencias propias de cada uno.

## Documentos soportados

| Documento | Tipo SUNAT | Estado |
|---|---|---|
| Factura | 01 | Implementado y verificado contra beta |
| Boleta de venta | 03 | Implementado y verificado contra beta |
| Nota de crédito | 07 | Implementado y verificado contra beta |
| Nota de débito | 08 | Implementado y verificado contra beta |
| Resumen diario de boletas | RC (asíncrono, vía `SummaryDocuments`) | Implementado y verificado contra beta |
| Comunicación de baja | RA (asíncrono, vía `VoidedDocuments`) | Implementado y verificado contra beta |
| Guía de remisión electrónica (GRE) | 09 / 31 | **NO implementada en el conector** — ver "Pendiente" |

## API pública de `crearConector()`

```ts
import { crearConector, type ConfigSunat } from "@rodatech/sunat";

const conector = crearConector(config); // config: ConfigSunat
```

`crearConector(config: ConfigSunat): ConectorSunat` devuelve un objeto con:

- `generarYFirmar(comprobante: Comprobante): Promise<ComprobanteFirmado>`
  Genera el XML UBL 2.1 de una factura/boleta y lo firma con el certificado.
- `enviar(firmado: ComprobanteFirmado, tipoDocumento: string, serie: string, correlativo: number): Promise<ResultadoCdr>`
  Envía un comprobante ya firmado a SUNAT y procesa el CDR.
- `emitir(comprobante: Comprobante): Promise<ResultadoCdr>`
  Atajo: genera, firma y envía en un solo paso.
- `generarYFirmarNota(nota: NotaComprobante): Promise<ComprobanteFirmado>`
  Genera y firma el XML de una nota de crédito (07) o débito (08).
- `emitirNota(nota: NotaComprobante): Promise<ResultadoCdr>`
  Genera, firma y envía una nota.
- `emitirResumenBoletas(resumen: ResumenBoletas): Promise<ResultadoResumen>`
  Envía el resumen diario de boletas. Devuelve un ticket (SUNAT lo procesa asíncrono);
  el CDR se obtiene después con `consultarResumen`.
- `emitirComunicacionBaja(baja: ComunicacionBaja): Promise<ResultadoResumen>`
  Comunica la baja de facturas/notas ya aceptadas. También asíncrono, vía ticket.
- `consultarResumen(ticket: string): Promise<ResultadoCdr | { enProceso: true }>`
  Consulta el CDR de un resumen o baja ya enviado.
- `probarConexion(ruc: string): Promise<ResultadoPrueba>`
  Comprueba las credenciales SOL contra SUNAT sin emitir nada.

También se exportan directamente desde el paquete:

- `montoEnLetras(monto: number, moneda?: string): string`
- `clasificarRechazo(codigo: string | null | undefined): Rechazo` y
  `sePuedeReenviar(codigo): boolean` — para decidir si un rechazo de SUNAT admite
  reenvío o exige anular y emitir un comprobante nuevo.
- `idResumen(fechaGeneracion: Date, correlativo: number): string` (formato `RC-AAAAMMDD-n`)
  e `idBaja(fechaComunicacion: Date, correlativo: number): string` (formato `RA-AAAAMMDD-n`).
- Catálogos SUNAT tipados (`TIPO_DOCUMENTO`, `AFECTACION_IGV`, `MONEDA`,
  `UNIDAD_MEDIDA`, etc.) y validaciones (`rucValido`, `dniValido`, `usuarioSolCompleto`).

### Subpath exports

| Export | Contenido |
|---|---|
| `@rodatech/sunat` | API completa: `crearConector`, catálogos, dominio, `montoEnLetras`, rechazos |
| `@rodatech/sunat/catalogos` | Solo las tablas SUNAT tipadas y validaciones (RUC, DNI, IGV) |
| `@rodatech/sunat/dominio` | Solo los tipos de contrato (`Comprobante`, `Emisor`, `Receptor`, `Totales`…) más los ayudantes de totales y de cotización impresa. No incluye el certificado ni nada que dependa de Node |
| `@rodatech/sunat/impresion` | Armado de la representación impresa (QR, monto en letras, `armarComprobanteImpreso`) sin arrastrar el firmador ni el cliente SOAP — pensado para la tienda pública |
| `@rodatech/sunat/guia` | Solo los **tipos de dominio** de la guía de remisión (`GuiaRemision`, `MOTIVO_TRASLADO`, `MODALIDAD_TRASLADO`…). No expone `generarGuiaXml`: ver "Pendiente" |

## Configuración: `ConfigSunat`

```ts
interface ConfigSunat {
  ambiente: "beta" | "produccion";
  certificadoPfx: Buffer;   // certificado digital .pfx/.p12
  certificadoClave: string; // clave del certificado
  usuarioSol: string;       // RUC + usuario SOL secundario, p.ej. "20609715732MODDATOS"
  claveSol: string;         // clave del usuario SOL
}
```

- Una instancia de `ConfigSunat` corresponde a **una empresa emisora** (un RUC, un
  certificado).
- `usuarioSol` necesita el usuario SOL **secundario** con permiso de facturación
  electrónica, no el principal.
- El certificado se lee con `node-forge` (PKCS#12): no depende de OpenSSL del
  sistema, así que funciona igual en servidor o en una función serverless.

## Endpoints: beta vs producción

`endpointFacturacion(ambiente)` (usado internamente por `crearConector`) resuelve:

| Ambiente | URL (billService de comprobantes) |
|---|---|
| `beta` | `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService` |
| `produccion` | `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService` |

El ambiente **beta** (homologación) acepta credenciales de prueba públicas
(`MODDATOS`, p.ej. usuario `20609715732MODDATOS`) y sirve con cualquier RUC de
prueba. Todo el flujo (factura, boleta, notas, resumen, baja) se probó ahí antes
de tocar producción. Las credenciales SOL reales del cliente solo hacen falta para
emitir en producción.

También existe `endpointGuias(ambiente)` con las URL del billService de guías de
remisión (`e-guiaremision.sunat.gob.pe` / `...-beta`), pero **no hay ningún código
en este paquete que las use** — ver "Pendiente".

## Pendiente

**La guía de remisión electrónica (GRE) NO está implementada en el conector**,
aunque en el código existan `src/dominio/guia.ts` (el modelo `GuiaRemision`) y
`src/ubl/guia.ts` (`generarGuiaXml`, que arma el XML `DespatchAdvice`):

- `ConectorSunat` (lo que devuelve `crearConector`) **no tiene** ningún método
  `emitirGuia` ni equivalente. `generarGuiaXml` se importa en `src/index.ts` pero
  no se conecta a ningún flujo de firma/envío.
- `src/ubl/guia.ts` lo dice en su propio encabezado: la estructura sigue la
  especificación pero **nunca se envió contra el servidor real de SUNAT** — a
  diferencia de factura, nota, resumen y baja, que sí se probaron hasta obtener
  CDR aceptado. Hay que darla por **no verificada**.
- Además, la GRE usa una **API REST distinta** a la de comprobantes (no es SOAP
  como `billService`), con credenciales separadas que aún no se han integrado.
- `endpointGuias()` existe en `src/transporte/endpoints.ts` pero no se usa: es un
  resto de la Fase D, planificada pero no construida.

Para usar guías de remisión hay que: (1) construir el cliente de la API REST de
GRE de SUNAT, (2) firmar y validar `generarGuiaXml` contra beta hasta obtener
respuesta real, y (3) exponer un método en `ConectorSunat` (o un conector aparte)
que conecte ambas piezas. Ninguno de esos tres pasos existe hoy.

Otros pendientes menores:

- No se ejecutó `pnpm install` en este monorepo, así que no se pudo correr
  `tsc --noEmit` ni la suite de tests (88 pruebas) contra `node_modules` reales
  al portar el paquete — ver el historial de porting para el detalle.
- El script de emisión real contra el ambiente beta de SUNAT (el que vive en
  `itech` como `vitest.sunat.config.mts`) no se portó: emite comprobantes de
  verdad y no tiene sentido correrlo fuera de una integración real con datos de
  una empresa.

## Uso

```ts
import { crearConector, TIPO_DOCUMENTO } from "@rodatech/sunat";

const conector = crearConector({
  ambiente: "beta",
  certificadoPfx: buffer,
  certificadoClave: "...",
  usuarioSol: "20609715732MODDATOS",
  claveSol: "...",
});

const cdr = await conector.emitir(comprobante); // comprobante: objeto de dominio
if (cdr.aceptado) {
  // archivar cdr.cdrXml, marcar el comprobante como aceptado
} else {
  const rechazo = clasificarRechazo(cdr.codigo);
  // rechazo.reintentable dice si tiene sentido reenviar o hay que emitir otro
}
```

## Estructura

```
src/
├── catalogos/    Tablas oficiales SUNAT tipadas + validaciones (RUC, DNI, IGV)
├── dominio/      Contrato: Comprobante, Emisor, Receptor, Item, Nota, CDR, Guia
├── ubl/          Generación UBL 2.1 (factura, nota, resumen, baja, guía)
├── firma/        XML-DSig con el certificado (node-forge + xml-crypto)
├── transporte/   SOAP + WS-Security, endpoints, zip
├── cdr/          Parseo del CDR y códigos de respuesta
├── impresion/    Representación impresa: QR, monto en letras, armado del papel
├── rechazos.ts   Clasificación de rechazos SUNAT (reintentable o no)
└── index.ts      API pública (crearConector, ConectorSunat)
```
