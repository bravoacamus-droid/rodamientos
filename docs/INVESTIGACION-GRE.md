# Investigación: emisión de la Guía de Remisión Electrónica (GRE) ante SUNAT

**Fecha de la investigación:** 20 de agosto de 2026
**Alcance:** verificar el mecanismo vigente de emisión de GRE y estimar el esfuerzo de
implementarlo en `packages/sunat`.

> **Nota de método.** Todo lo que se afirma abajo está respaldado por una URL. Cuando algo
> no se pudo confirmar contra fuente oficial se dice explícitamente **NO CONFIRMADO**. No se
> han inventado endpoints ni nombres de parámetros: los que aparecen aquí están copiados
> literalmente del manual de SUNAT, de la resolución vigente o de la especificación OpenAPI
> de Greenter (que a su vez cita el manual de SUNAT).

---

## 0. Respuesta corta

Tu entendimiento es **correcto**, y además está confirmado normativamente y por la propia
página de servicios web de SUNAT actualizada en mayo de 2026:

1. La GRE vigente se envía por **API REST con OAuth2**, no por SOAP.
2. Las credenciales son un **`client_id` / `client_secret` de aplicación**, distintos del
   usuario SOL — aunque el usuario SOL *también* se sigue usando, como `username`/`password`
   dentro del `grant_type=password`.
3. El endpoint SOAP `https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService`
   que hay cableado en `transporte/endpoints.ts` corresponde al sistema anterior y **ya no
   figura en la lista oficial de servicios web de SUNAT**.
4. El envío es **asíncrono por ticket**, no síncrono como la factura.

---

## 1. ¿Cuál es el mecanismo vigente? ¿REST, SOAP, o ambos?

### 1.1 La norma dice REST

El **Anexo N.° 13 «Aspectos técnicos del servicio de recepción»**, en su versión vigente
—sustituida por la **Resolución de Superintendencia N.° 000108-2026/SUNAT**, en vigor desde
el **1 de junio de 2026**— dice literalmente:

> **1.1. Métodos para el envío**
> El envío se realiza a través de un **servicio REST**, utilizando los siguientes métodos:
> a) **POST**, el cual permite recibir un archivo ZIP con un único formato digital y el valor
> del hash del archivo ZIP, y devuelve un **número de ticket** (identificador único de proceso)
> que es asignado por el sistema SUNAT.

Fuente (PDF oficial): <https://www.sunat.gob.pe/legislacion/superin/2026/anexo-000108-2026.pdf>

Esa misma resolución sustituye también el **Anexo N.° 12** (GRE remitente), el **Anexo N.° 14**
(estándar UBL 2.1 de ambas guías) y el **Anexo N.° 28** (GRE transportista), y actualiza el
**Anexo N.° 8** (catálogos). Es decir: **el anexo técnico de la GRE que está vigente hoy es el
de la RS 000108-2026/SUNAT**, no el original de la RS 000123-2022/SUNAT.

Resumen normativo de la RS 000108-2026/SUNAT (vigencia 01/06/2026):
<https://grzasociados.com/resolucion-de-superintendencia-n-000108-2026-sunat-se-modifican-los-sujetos-obligados-a-emitir-la-guia-de-remision-remitente-incorpora-un-documento-relacionado-con-el-traslado-de-merc/>
y <https://actualidadempresarial.pe/norma/resolucion-000108-2026-sunat/7661d6c7-f6ee-40b1-b155-60c4977b8100>

### 1.2 SUNAT ya no publica el endpoint SOAP de guías

El PDF **«Servicios WEB Disponibles»** de la sección *Guías y Manuales* de SUNAT, en su
versión de **mayo de 2026**, lista únicamente:

| Entorno | Servicio | URL |
|---|---|---|
| Beta | Factura | `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl` |
| Beta | DDJJ Boletos aéreos | `https://e-beta.sunat.gob.pe/ol-ti-tcpfegem-beta/billService?wsdl` |
| Beta | Retenciones | `https://e-beta.sunat.gob.pe/ol-ti-itemision-otroscpe-gem-beta/billService?wsdl` |
| Producción | Factura Electrónica | `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl` |
| Producción | DDJJ Boletos aéreos | `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl` |
| Producción | Retención y Percepción | `https://e-factura.sunat.gob.pe/ol-ti-itemision-otroscpe-gem/billService?wsdl` |
| Consultas | Validez de facturas | `https://e-factura.sunat.gob.pe/ol-it-wsconsvalidcpe/billValidService?wsdl` |
| Consultas | CDR y estado de envío | `https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService?wsdl` |

**No aparece ninguna URL de guía de remisión**, ni en beta ni en producción.

Fuente: <https://cpe.sunat.gob.pe/sites/default/files/2026-05/Descarga%20aqu%C3%AD%20los%20Servicios%20WEB%20Disponibles%20-%20Incluye%20DDJJ%20de%20Boletos%20a%C3%A9reos.pdf>
(enlazado desde <https://cpe.sunat.gob.pe/guias-y-manuales>)

Comprobación técnica hecha durante esta investigación (20/08/2026): el WSDL antiguo
`https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService?wsdl` **todavía
responde HTTP 200**. Eso significa que la infraestructura sigue levantada, **no** que acepte
guías nuevas. **NO CONFIRMADO:** no se localizó ninguna resolución que fije una *fecha
explícita de apagado* del servicio SOAP de guías. Lo que sí está confirmado es que SUNAT dejó
de publicarlo y que la norma técnica vigente manda REST. **Recomendación: tratar el SOAP de
guías como muerto y no invertir un minuto en él.**

### 1.3 Fechas de obligatoriedad

- La GRE (nueva plataforma) se puso disponible el **13/07/2022** con la RS 000123-2022/SUNAT.
- La obligatoriedad se fue prorrogando vía facultad discrecional de no sancionar: hasta el
  30/06/2024, luego 31/12/2024
  (<https://www.nubefact.com/blog/actualizaciones-sunat/sunat-hasta-junio-2024-se-amplia-plazo-para-emision-obligatoria-de-guias-de-remision-electronica>,
  <https://thelemabogados.pe/es/la-sunat-prorroga-la-facultad-discrecional-de-no-sancionar-a-los-contribuyentes-que-deban-emitir-la-guia-de-remision-electronica-gre-hasta-el-30-de-junio-del-2024/>).
- **El último tramo de tolerancia terminó el 30/06/2026**: se permitió seguir usando la guía
  física hasta esa fecha sin sanción, y **desde el 01/07/2026 la GRE es obligatoria** para
  todo contribuyente que traslade bienes.
  Fuentes: <https://www.perucontable.com/tributaria/guia-de-remision-electronica-sunat-amplia-el-plazo-y-permite-seguir-usando-la-guia-fisica-hasta-el-30-06-2026/>,
  <https://perugestiona.pe/tramites-sunat/guia-remision-electronica/>

**Traducción operativa: a día de hoy (agosto 2026) ya estamos dentro del régimen obligatorio.**
No hay margen para posponer esto si el cliente traslada mercadería.

---

## 2. Endpoints, OAuth2 y credenciales

### 2.1 Obtención del token

Fuente primaria: **«Manual de Servicios Web — Plataforma Nueva GRE»**, SUNAT.
<https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE%20(1)_0.pdf>

Texto literal del manual:

- **URL (POST):** `https://api-seguridad.sunat.gob.pe/v1/clientessol/<client_id>/oauth2/token/`
  - `<client_id>` es el generado en el menú SOL.
  - **El manual advierte: «La URI colocada es referencial».** Aun así, es la que usan todas
    las implementaciones reales y el host responde (HTTP 200 verificado el 20/08/2026).
  - Ojo con la **barra final** de `/token/`.
- **Header:** `Content-Type: Application/json` *(sic, así lo escribe SUNAT — pero el cuerpo va
  como form-urlencoded; ver nota abajo)*.
- **Body** de tipo `x-www-form-urlencoded`, con estos parámetros exactos:

| Parámetro | Valor |
|---|---|
| `grant_type` | `password` (valor fijo) |
| `scope` | `https://api-cpe.sunat.gob.pe` |
| `client_id` | `<client_id>` generado en menú SOL |
| `client_secret` | `<client_secret>` generado en menú SOL |
| `username` | `<Número de RUC>` + `<Usuario SOL>` (concatenados, ej. `20609715732MODDATOS`) |
| `password` | `<Contraseña SOL>` |

- **Respuesta:** `access_token`, `token_type`, `expires_in` (segundos; **actualmente 1 hora**
  según el manual).
- **Uso:** header `Authorization: Bearer <token>`.

> **Contradicción a resolver en la implementación:** el manual dice `Content-Type: Application/json`
> pero a la vez dice que el body es `x-www-form-urlencoded`. La especificación OpenAPI de
> Greenter modela el request body como `application/x-www-form-urlencoded`
> (<https://github.com/thegreenter/gre-api/blob/HEAD/openapi.yaml>). **Recomendación: enviar
> `application/x-www-form-urlencoded`**, que es lo coherente y lo que hacen las librerías que
> funcionan en producción. **NO CONFIRMADO** empíricamente contra el servidor (no tenemos
> credenciales).

### 2.2 Cómo se obtienen `client_id` y `client_secret` en SOL

Texto literal del manual de SUNAT:

> En el menú SOL, debe inscribir la aplicación que usará los servicios REST y generar sus
> credenciales (`client_id` y `client_secret`). Este paso se realizará por única vez.
> La ubicación de la opción en el menú SOL es la siguiente:
> **Credenciales de API SUNAT / Credenciales de API SUNAT / Credenciales de API SUNAT / Credenciales de API SUNAT.**

(Sí, el manual repite el mismo nombre cuatro veces; es la anidación literal de menús.)

En la práctica, según guías de proveedores, se llega buscando **«API SUNAT»** en el buscador
del menú SOL y entrando a **«Gestión Credenciales de API SUNAT»**. Al registrar la aplicación
hay que:

- darle un **nombre** y una **URL** (cualquiera propia, p. ej. la del ERP);
- marcar el scope **«GREE Emisión de Comprobantes / v1/contribuyente/gem»**;
- marcar el tipo de aplicación **«Desktop»**;
- SUNAT devuelve **«ID»** (= `client_id`) y **«CLAVE»** (= `client_secret`).

Fuente: <https://facturalibre.org/blog/pasos-para-configurar-la-guia-de-remision/>
(también <https://manuales.gyomanager.com/guias-de-remision/credenciales-de-api-sunat>)

Esa misma guía advierte que **puede tardar hasta ~2 horas** hasta que las credenciales
queden activas. **NO CONFIRMADO** por SUNAT, pero conviene tenerlo en cuenta al probar.

> **Respuesta directa a tu pregunta:** sí, el `client_id`/`client_secret` es **distinto** del
> usuario SOL secundario. Pero **no lo reemplaza**: el flujo es `grant_type=password`, así que
> necesitas **las cuatro cosas a la vez** — `client_id`, `client_secret`, usuario SOL
> (RUC+usuario) y clave SOL. El usuario SOL que uses debe tener habilitado el perfil para
> emitir GRE.

### 2.3 Endpoints de envío y consulta

| Operación | Método | Ruta |
|---|---|---|
| Token | `POST` | `https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/` |
| Enviar GRE | `POST` | `{host}/v1/contribuyente/gem/comprobantes/{filename}` |
| Consultar envío (ticket) | `GET` | `{host}/v1/contribuyente/gem/comprobantes/envios/{numTicket}` |

Donde `{host}` en producción es **`https://api-cpe.sunat.gob.pe`**.

Fuentes:
- OpenAPI de Greenter (`servers:` y `paths:`): <https://github.com/thegreenter/gre-api/blob/HEAD/openapi.yaml>
- `Configuration::getHostSettings()` de la misma librería, que documenta los dos hosts:
  `https://api-seguridad.sunat.gob.pe/v1` («Url para obtener el token de autenticacion») y
  `https://api-cpe.sunat.gob.pe/v1` («Url para enviar comprobantes y consultar su estado»).
  <https://github.com/thegreenter/gre-api/blob/HEAD/src/Configuration.php>
- Confirmación independiente de ambas rutas:
  <https://gist.github.com/dlopez525/1cfdfcd4d9438eae7f72328cfe1886ee>

**Ambigüedad a tener en cuenta:** el README de `greenter/gre-api` usa
`https://api.sunat.gob.pe/v1` como host de envío, mientras que el `openapi.yaml` y
`Configuration.php` del **mismo repositorio** usan `https://api-cpe.sunat.gob.pe/v1`.
Comprobación hecha el 20/08/2026: **ambos hosts existen y devuelven HTTP 401** (no 404) ante
`GET /v1/contribuyente/gem/comprobantes/envios/x` sin token, lo que sugiere que los dos
enrutan al mismo gateway. **Recomendación: usar `https://api-cpe.sunat.gob.pe`**, que es
coherente con el `scope` del token, y dejarlo configurable.

### 2.4 Entorno beta / homologación — **no existe uno oficial**

**Esto es el hallazgo incómodo de la investigación.** SUNAT **no ofrece servidor de pruebas
para la nueva GRE**. NubeFact lo dice explícitamente:

> «Debido a que la SUNAT **NO** dispone de un servidor de pruebas para validar los XML de las
> nuevas Guías de Remisión Electrónica (GRE)…»

Fuente: <https://www.nubefact.com/blog/nubefact/nuevo-servidor-de-pruebas-gratuito-de-validacion-xml-para-las-nuevas-gre>

Esto es consistente con el PDF oficial de servicios web (§1.2), que solo lista beta para
factura, boletos aéreos y retenciones.

Alternativas para probar sin quemar correlativos en producción:

- **Servidor de pruebas gratuito de NubeFact**, que emula la API REST de la GRE:
  - Token: `https://gre-test.nubefact.com/v1/clientessol/test-85e5b0ae-255c-4891-a595-0b98c65c9854/oauth2/token`
  - Envío: `https://gre-test.nubefact.com/v1/contribuyente/gem/comprobantes/`
  - Consulta: `https://gre-test.nubefact.com/v1/contribuyente/gem/comprobantes/envios/`
  - Fuente: <https://gist.github.com/dlopez525/1cfdfcd4d9438eae7f72328cfe1886ee>
  - **NO CONFIRMADO:** no se verificó que ese `client_id` de prueba siga activo en agosto de
    2026 ni cuáles son las credenciales SOL de prueba asociadas. Hay que probarlo antes de
    depender de él.
- Un host mencionado en un resultado de búsqueda como beta de SUNAT
  (`https://gre-beta.sunat.gob.pe/v1/contribuyente/gem`) **no resolvió/no conectó** en la
  comprobación del 20/08/2026. **Trátese como inexistente hasta prueba en contrario.**

---

## 3. Flujo completo de emisión

```
1. POST  api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/
         (form-urlencoded: grant_type, scope, client_id, client_secret, username, password)
   →     { access_token, token_type, expires_in }          [cachear ~1 h]

2. Generar XML UBL 2.1 DespatchAdvice  →  firmar XML-DSig  →  ZIP

3. POST  api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/{filename}
         Authorization: Bearer <token>
         Content-Type: application/json
         { "archivo": { "nomArchivo": "...zip", "arcGreZip": "<base64>", "hashZip": "<sha256>" } }
   →     { "numTicket": "<uuid>", "fecRecepcion": "<date-time>" }

4. GET   api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/envios/{numTicket}
         Authorization: Bearer <token>
   →     { "codRespuesta": "0|98|99", "arcCdr": "<base64>", "indCdrGenerado": "0|1",
             "error": { "numError": "...", "desError": "..." } }   ← polling hasta salir de 98
```

**Respuestas a tus preguntas concretas:**

- **¿Se firma igual que una factura?** Sí. Es un UBL 2.1 con `ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent`
  donde va el `ds:Signature` enveloped, exactamente el mismo patrón que ya usa
  `firma/firmar.ts`. **NO CONFIRMADO** que SUNAT siga aceptando RSA-SHA1/SHA1 para la GRE
  igual que para la factura; Greenter usa el mismo firmador para ambos documentos, así que la
  presunción razonable es que sí, pero conviene verificarlo en la primera prueba real.
- **¿Va comprimido en ZIP?** Sí. El propio Anexo N.° 13 dice «recibir un archivo ZIP con un
  único formato digital y el valor del hash del archivo ZIP». Es el mismo empaquetado que ya
  hace `transporte/zip.ts`.
- **¿Síncrona o por ticket?** **Por ticket.** El POST devuelve `numTicket` (un **UUID**, no el
  número largo tipo `2011000000112` del `sendSummary` SOAP) y hay que consultar con el GET.
- **Códigos de `codRespuesta`:** `98` = en proceso, `99` = envío con error, `0` = envío OK.
- **El nodo `error`** solo aparece si `codRespuesta` es `99`.
- **`indCdrGenerado`:** `1` = sí genera CDR, `0` = no.

Fuente de todos los nombres de campo anteriores: `components/schemas` de
<https://github.com/thegreenter/gre-api/blob/HEAD/openapi.yaml>, que a su vez referencia como
`externalDocs` el manual oficial de SUNAT.

### 3.1 Nombre del archivo

La especificación describe `nomArchivo` como:

> «Nombre del archivo zip enviado. Estructura: **`RRRRRRRRRRR-TT-SSSS-NNNNNNNN.zip`**»

es decir RUC(11) - tipo(2) - serie(4) - correlativo(8).

**Discrepancia detectada:** el ejemplo del README de la misma librería usa
`20161515648-09-T001-124.zip`, con el correlativo **sin rellenar a 8 dígitos**. Y el path
`{filename}` del POST va **sin la extensión `.zip`** (`enviarCpe('20161515648-09-T001-124', ...)`).
**NO CONFIRMADO** cuál de las dos formas acepta SUNAT para el correlativo. Es exactamente el
tipo de detalle que hay que verificar en la primera prueba real; en factura ya sabemos que
SUNAT no exige relleno, así que probablemente da igual, pero no lo demos por hecho.

### 3.2 El CDR

`arcCdr` viene en base64. **NO CONFIRMADO** si el base64 decodifica a un ZIP (que contendría
`R-<nombre>.xml`, como en SOAP) o directamente al XML del `ApplicationResponse`. La
descripción del campo solo dice «CDR generado (base64)». La implementación debe ser
defensiva: mirar la firma mágica `PK\x03\x04` y, si es ZIP, descomprimir; si no, tratarlo
como XML. Una vez obtenido el `ApplicationResponse`, el parser `cdr/index.ts` que ya existe
sirve tal cual.

### 3.3 Errores

Del manual oficial de SUNAT:

- **Nivel general** (conectividad/invocación): body `{ "cod", "msg", "exc" }`. Códigos HTTP
  400 / 401 / 403 / 404 / 405 / 406 / 415 / 500.
- **Nivel específico** (validación funcional del servicio): HTTP **422**, body
  `{ "cod": "422", "msg", "exc", "errors": [ { "codError", "desError" } ] }`.

Ejemplo real del manual: `{"codError": "166", "desError": "Código de ticket no enviado."}`

---

## 4. Tipos de documento, UBL y qué cambió

### 4.1 Catálogo 01 (tipo de documento)

Confirmado en el Anexo N.° 8 vigente (RS 000108-2026/SUNAT):

| Código | Documento |
|---|---|
| `09` | Guía de Remisión **Remitente** |
| `31` | Guía de Remisión **Transportista** |

Fuente: <https://www.sunat.gob.pe/legislacion/superin/2026/anexo-000108-2026.pdf>

### 4.2 Versión UBL

- Raíz: `DespatchAdvice` (namespace `urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2`)
- `cbc:UBLVersionID` = **`2.1`**
- `cbc:CustomizationID` = **`2.0`**
- `cbc:DespatchAdviceTypeCode` con `@listAgencyName="PE:SUNAT"`, `@listName="Tipo de Documento"`,
  `@listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01"`

Fuente: **Anexo N.° 14 — «Estándar UBL 2.1 Guía de remisión remitente - Guía de remisión
transportista»**, en su versión de la RS 000123-2022
(<https://www.normaslegalesonline.pe/imagenes//13/07/2022/1657738942240_R-123-2022-SUNAT-7-1.pdf>)
y su sustitución vigente en la RS 000108-2026
(<https://www.sunat.gob.pe/legislacion/superin/2026/anexo-000108-2026.pdf>).

### 4.3 Qué cambió respecto de la versión anterior

La GRE anterior (SEE del contribuyente, la del SOAP) era **UBL 2.0** con `CustomizationID`
`1.0`, con una estructura de `Shipment` mucho más pobre. La nueva versión (`CustomizationID`
`2.0`):

- Usa **`cbc:HandlingCode`** para el motivo de traslado con `listURI` a `catalogo20` y
  **`cbc:HandlingInstructions`** para la descripción del motivo (antes se usaban otros tags).
- Introduce **`cbc:GrossWeightMeasure`** (peso bruto total de la **carga**, obligatorio) y
  **`cbc:NetWeightMeasure`** (peso bruto total de los **ítems seleccionados**, condicional) —
  dos pesos distintos, más `cbc:Information` como *sustento de la diferencia* entre ambos.
- Introduce indicadores como texto libre acordado en **`cbc:SpecialInstructions`**
  (`SUNAT_Envio_IndicadorTransbordoProgramado`, `SUNAT_Envio_IndicadorTrasladoVehiculoM1L`,
  `SUNAT_Envio_IndicadorVehiculoConductoresTransp`, …).
- Añade **`cac:BuyerCustomerParty`** y **`cac:SellerSupplierParty`** (comprador y tercero).
- Añade documentos relacionados tipificados con **catálogo 61**
  (`cac:AdditionalDocumentReference` con `cbc:DocumentTypeCode` + `cbc:DocumentType`).
- Añade **puertos/aeropuertos** (`cac:FirstArrivalPortLocation`, catálogos 63 y 64) para
  mercancía extranjera.
- Añade **propiedades adicionales del ítem** (`cac:AdditionalItemProperty` con catálogo 55):
  partida arancelaria, indicador de bien normalizado, número de contenedor, manifiesto de
  carga, etc.

Cambios específicos que trajo la **RS 000108-2026/SUNAT** (vigente 01/06/2026):

- Nuevo documento relacionado: **«Cita u Orden de Entrega de Mercancías del Terminal
  Portuario»** para traslados desde puertos/aeropuertos a almacenes aduaneros.
- **Obligatoriedad de consignar la fecha de inicio del traslado en la GRE-transportista**.
- Nuevos supuestos de **GRE por evento**.
- Cuando la GRE-Remitente ya trae correctamente los datos del transportista, **ya no se
  requiere una guía adicional** — dato relevante de negocio: puede que nunca necesitemos
  emitir tipo `31`.
- Excepciones de sustento para mercancía extranjera hacia ZED / ZOFRATACNA.

Fuentes: <https://grzasociados.com/resolucion-de-superintendencia-n-000108-2026-sunat-se-modifican-los-sujetos-obligados-a-emitir-la-guia-de-remision-remitente-incorpora-un-documento-relacionado-con-el-traslado-de-merc/>,
<https://mifact.net/sunat-modifica-la-guia-de-remision-electronica-2026-que-cambia-para-el-comercio-exterior-y-el-transporte-de-mercancias/>,
<https://llbsolutions.com/es/guias-remision-electronicas-sunat-cambios-clave-2026/>

---

## 5. Campos obligatorios del XML (rutas UBL literales)

Rutas copiadas literalmente de la columna «TAG UBL» del Anexo N.° 14
(<https://www.normaslegalesonline.pe/imagenes//13/07/2022/1657738942240_R-123-2022-SUNAT-7-1.pdf>),
contrastadas con la plantilla de referencia de Greenter
(<https://github.com/thegreenter/xml/blob/HEAD/src/Xml/Templates/despatch2022.xml.twig>).
`M` = obligatorio, `C` = condicional.

### Cabecera

| Dato | Cond. | TAG |
|---|---|---|
| Versión UBL | M | `/DespatchAdvice/cbc:UBLVersionID` = `2.1` |
| Versión estructura | M | `/DespatchAdvice/cbc:CustomizationID` = `2.0` |
| Serie-correlativo | M | `/DespatchAdvice/cbc:ID` — formato `T###-NNNNNNNN` |
| Fecha emisión | M | `/DespatchAdvice/cbc:IssueDate` (`YYYY-MM-DD`) |
| Hora emisión | M | `/DespatchAdvice/cbc:IssueTime` (`hh:mm:ss`) |
| Tipo de documento | M | `/DespatchAdvice/cbc:DespatchAdviceTypeCode` = `09` / `31` |
| Observaciones | C | `/DespatchAdvice/cbc:Note` |
| Remitente (doc.) | M | `…/cac:DespatchSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID` `@schemeID="6"` |
| Remitente (razón social) | M | `…/cac:DespatchSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName` |
| Destinatario | M | `…/cac:DeliveryCustomerParty/cac:Party/…` (mismo patrón) |

Los atributos de los identificadores de parte llevan
`@schemeName="Documento de Identidad"`, `@schemeAgencyName="PE:SUNAT"`,
`@schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06"`.

### Datos del envío (`cac:Shipment`)

| Dato | Cond. | TAG |
|---|---|---|
| Identificador del traslado | M | `/DespatchAdvice/cac:Shipment/cbc:ID` = **`SUNAT_Envio`** (literal) |
| **Motivo del traslado** | M | `…/cac:Shipment/cbc:HandlingCode` — **Catálogo N.° 20**, con `@listAgencyName="PE:SUNAT"`, `@listName="Motivo de traslado"`, `@listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20"` |
| Descripción del motivo | C | `…/cac:Shipment/cbc:HandlingInstructions` (obligatoria si el motivo es «Otros») |
| **Peso bruto total de la carga** | **M** | `…/cac:Shipment/cbc:GrossWeightMeasure`, formato `n(12,3)` |
| **Unidad del peso bruto** | **M** | `…/cac:Shipment/cbc:GrossWeightMeasure@unitCode` — **Catálogo N.° 03**: `"KGM"` kilogramos, `"TNE"` toneladas |
| Peso bruto de los ítems | C | `…/cac:Shipment/cbc:NetWeightMeasure` + `@unitCode` (`"KGM"`) |
| Sustento de la diferencia de peso | C | `…/cac:Shipment/cbc:Information` |
| N.° de bultos/pallets | C | `…/cac:Shipment/cbc:TotalTransportHandlingUnitQuantity` |
| Indicadores | C | `…/cac:Shipment/cbc:SpecialInstructions` (repetible) |

### Modalidad de traslado y transportista (`cac:ShipmentStage`)

| Dato | Cond. | TAG |
|---|---|---|
| **Modalidad de traslado** | M | `…/cac:Shipment/cac:ShipmentStage/cbc:TransportModeCode` — **Catálogo N.° 18**, `@listName="Modalidad de traslado"`, `@listURI="…catalogos:catalogo18"`. `01` público / `02` privado |
| Fecha de inicio del traslado | M | `…/cac:ShipmentStage/cac:TransitPeriod/cbc:StartDate` (`YYYY-MM-DD`) |
| Fecha de entrega al transportista | C | `…/cac:ShipmentStage/cac:LoadingTransportEvent/cbc:OccurrenceDate` |

**Transporte público (`01`)** → se identifica al transportista:

| Dato | TAG |
|---|---|
| RUC del transportista | `…/cac:ShipmentStage/cac:CarrierParty/cac:PartyIdentification/cbc:ID` (`@schemeID="6"`) |
| Razón social | `…/cac:ShipmentStage/cac:CarrierParty/cac:PartyLegalEntity/cbc:RegistrationName` |
| N.° registro MTC | `…/cac:ShipmentStage/cac:CarrierParty/cac:PartyLegalEntity/cbc:CompanyID` |

**Transporte privado (`02`)** → se identifican conductor y vehículo:

| Dato | TAG |
|---|---|
| Tipo de conductor | `…/cac:ShipmentStage/cac:DriverPerson/cbc:JobTitle` — literal `'Principal'` o `'Secundario'` |
| Doc. identidad del conductor | `…/cac:ShipmentStage/cac:DriverPerson/cbc:ID` + `@schemeID` (**Catálogo N.° 06**) |
| Nombres | `…/cac:ShipmentStage/cac:DriverPerson/cbc:FirstName` |
| Apellidos | `…/cac:ShipmentStage/cac:DriverPerson/cbc:FamilyName` |
| **Licencia de conducir** | `…/cac:ShipmentStage/cac:DriverPerson/cac:IdentityDocumentReference/cbc:ID` |

Hasta **2 conductores secundarios** adicionales, incrementales.

**Vehículo** — ojo, **NO va dentro de `ShipmentStage`** sino en `TransportHandlingUnit`:

| Dato | TAG |
|---|---|
| **Placa del vehículo principal** | `…/cac:Shipment/cac:TransportHandlingUnit/cac:TransportEquipment/cbc:ID` |
| Tarjeta Única de Circulación / CHVE | `…/cac:TransportEquipment/cac:ApplicableTransportMeans/cbc:RegistrationNationalityID` |
| N.° autorización especial | `…/cac:TransportEquipment/cac:ShipmentDocumentReference/cbc:ID` + `@schemeID` (`@schemeName="Entidad Autorizadora"`) |
| Placas de vehículos secundarios (hasta 2) | `…/cac:TransportEquipment/cac:AttachedTransportEquipment/cbc:ID` |

### Ubigeos de partida y llegada (`cac:Delivery`)

| Dato | Cond. | TAG |
|---|---|---|
| **Ubigeo del punto de partida** | **M** | `…/cac:Shipment/cac:Delivery/cac:Despatch/cac:DespatchAddress/cbc:ID` — **Catálogo N.° 13**, `@schemeAgencyName="PE:INEI"`, `@schemeName="Ubigeos"` |
| **Dirección del punto de partida** | **M** | `…/cac:Despatch/cac:DespatchAddress/cac:AddressLine/cbc:Line` |
| Código establecimiento de partida | C | `…/cac:Despatch/cac:DespatchAddress/cbc:AddressTypeCode` con `@listID` = RUC asociado |
| **Ubigeo del punto de llegada** | M/C | `…/cac:Shipment/cac:Delivery/cac:DeliveryAddress/cbc:ID` (mismos atributos) |
| Dirección del punto de llegada | M/C | `…/cac:DeliveryAddress/cac:AddressLine/cbc:Line` |
| Código establecimiento de llegada | C | `…/cac:DeliveryAddress/cbc:AddressTypeCode` con `@listID` |

### Líneas (`cac:DespatchLine`)

| Dato | TAG |
|---|---|
| N.° de orden | `/DespatchAdvice/cac:DespatchLine/cbc:ID` |
| Cantidad + unidad | `…/cac:DespatchLine/cbc:DeliveredQuantity` + `@unitCode` (**Catálogo N.° 03** / N.° 65) |
| Referencia de línea | `…/cac:DespatchLine/cac:OrderLineReference/cbc:LineID` |
| **Descripción del ítem** | `…/cac:DespatchLine/cac:Item/cbc:Description` ← **`cbc:Description`, no `cbc:Name`** |
| Código del ítem | `…/cac:DespatchLine/cac:Item/cac:SellersItemIdentification/cbc:ID` |
| Código SUNAT (UNSPSC) | `…/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode` |
| Propiedades adicionales | `…/cac:Item/cac:AdditionalItemProperty/cbc:Name` + `cbc:NameCode` (Cat. 55) + `cbc:Value` |

### Catálogo N.° 20 — motivos de traslado (versión oficial vigente)

| Código | Descripción |
|---|---|
| `01` | Venta |
| `02` | Compra |
| `03` | Venta con entrega a terceros |
| `04` | Traslado entre establecimientos de la misma empresa |
| `05` | Consignación |
| `06` | Devolución |
| `07` | Recojo de bienes transformados |
| `08` | Importación |
| `09` | Exportación |
| `13` | Otros no comprendidos en ningún código del presente catálogo |
| `14` | Venta sujeta a confirmación del comprador |
| `17` | Traslado de bienes para transformación |
| `18` | Traslado por emisor itinerante de comprobantes de pago |
| `19` | Traslado de mercancía extranjera |

Fuente: <https://www.sunat.gob.pe/legislacion/superin/2024/anexo1-000240-2024.pdf>
(confirmado también en <https://cpe.sunat.gob.pe/node/171>)

> ⚠️ **BUG YA DETECTADO EN NUESTRO CÓDIGO.** `packages/sunat/src/dominio/guia.ts` tiene la
> constante `MOTIVO_TRASLADO` **desplazada**: declara `TRANSFORMACION: "08"`,
> `RECOJO_BIENES: "09"`, `IMPORTACION: "13"`, `EXPORTACION: "14"`, `OTROS: "18"`. Lo correcto
> es `07` recojo de bienes transformados, `08` importación, `09` exportación, `13` otros,
> `17` traslado para transformación, `18` emisor itinerante. Tal como está, **una guía de
> exportación se emitiría como "venta sujeta a confirmación del comprador"**. Hay que
> corregirlo.

---

## 6. Anulación / baja de una GRE

**No existe API para dar de baja una GRE.** Esto es un cambio importante respecto de la
factura, donde sí tenemos `ubl/baja.ts` + `sendSummary`.

La baja se hace **exclusivamente desde el portal SUNAT Operaciones en Línea (SEE-SOL)**:
Empresas → Guía de Remisión Electrónica → **Baja de GRE**. Ni OSE ni PSE pueden anular guías.

Fuentes:
- <https://cpe.sunat.gob.pe/node/118> (oficial, «No conformidad y baja de una GRE»)
- <https://www.nubefact.com/blog/actualizaciones-sunat/anular-dar-de-baja-guia-de-remision-electronica-gre-desde-la-sunat>
  («Las Guías de Remisión Electrónica (GRE) se pueden dar de baja únicamente desde la SUNAT
  con la Clave SOL»)

**Cuándo procede la baja:** cuando el traslado aún no ha empezado, o cuando ya empezó pero el
destinatario cambia antes de llegar al punto de destino. En este último caso hay que dar de
baja la guía emitida y emitir una nueva.

**Restricción:** no se puede dar de baja una GRE-remitente o GRE-transportista si ya existe
una **GRE por evento** relacionada con ella; y la GRE por evento no se puede dar de baja en
ningún caso — solo se «cancela» emitiendo otra del mismo tipo.

**Consecuencia de diseño para nuestro ERP:** el módulo debe registrar el estado de la guía y
ofrecer al usuario la instrucción de anular manualmente en SOL, no prometer un botón de
"anular" que llame a una API. Alternativa contemplada por la norma: **emitir una GRE por
evento** para documentar hechos posteriores que afectan el traslado — pero esa es otra
funcionalidad, no una baja.

**NO CONFIRMADO:** el plazo exacto (en días) para dar de baja una GRE. Las fuentes
consultadas describen los supuestos pero no un plazo numérico como el de las facturas (7 días).

---

## 7. Librerías open source de referencia

| Proyecto | Lenguaje | Qué aporta | ¿Sirve de referencia? |
|---|---|---|---|
| **[thegreenter/gre-api](https://github.com/thegreenter/gre-api)** | PHP | Cliente REST de la GRE: OAuth2 + `enviarCpe` + `consultarEnvio`. **Incluye [`openapi.yaml`](https://github.com/thegreenter/gre-api/blob/HEAD/openapi.yaml) con los paths, schemas y nombres de campo exactos.** | **Sí — es la mejor referencia disponible.** El `openapi.yaml` es prácticamente la spec que SUNAT no publicó en formato máquina. Se puede portar a TS casi 1:1. |
| **[thegreenter/xml](https://github.com/thegreenter/xml)** | PHP (Twig) | Plantilla [`despatch2022.xml.twig`](https://github.com/thegreenter/xml/blob/HEAD/src/Xml/Templates/despatch2022.xml.twig) = el UBL 2.1 completo de la GRE nueva, con todos los atributos `listURI`/`schemeURI`. | **Sí, imprescindible.** Es el contraste práctico contra el Anexo N.° 14. Nótese `despatch.xml.twig` (vieja) vs `despatch2022.xml.twig` (nueva) — usar la segunda. |
| **[thegreenter/greenter](https://github.com/thegreenter/greenter)** | PHP | Suite completa (firma, ZIP, modelos, envío). | Sí, como referencia de firma y validaciones. Ya lo usamos así para factura. |
| **[giansalex/lycet](https://github.com/giansalex/lycet)** | PHP | API REST propia sobre Greenter. | Marginal — es una capa de servicio, no aporta detalle del protocolo SUNAT. |
| **[Greeva.Sunat.GRE](https://www.nuget.org/packages/Greeva.Sunat.GRE/1.0.3)** | C#/.NET | Port del cliente GRE. | Útil como segunda opinión sobre nombres de campo. **NO CONFIRMADO** su grado de mantenimiento. |
| **[erickorlando/openinvoiceperu](https://github.com/erickorlando/openinvoiceperu)** | C#/.NET | Facturación SUNAT. | **NO CONFIRMADO** que cubra la GRE REST nueva. |
| **[thegreenter/consulta-cpe-openapi](https://github.com/thegreenter/consulta-cpe-openapi)** | spec | Consulta integrada de CPE (otra API REST de SUNAT con el mismo patrón OAuth2). | Útil como referencia del patrón de autenticación. |

**No se encontró ninguna librería JS/TS madura que implemente la GRE REST vigente.** Ese es
justamente el hueco que llenaría nuestro paquete.

---

## 8. VEREDICTO: esfuerzo e impacto en `packages/sunat`

### 8.1 Qué se reutiliza tal cual (≈ 60 % del trabajo ya está hecho)

| Módulo actual | Reutilización |
|---|---|
| `firma/firmar.ts` + `firma/certificado.ts` | **100 %.** Es XML-DSig enveloped dentro de `ext:ExtensionContent`; el `DespatchAdvice` ya trae ese bloque. Solo verificar que SUNAT acepte RSA-SHA1 también aquí. |
| `transporte/zip.ts` (`comprimirComprobante`) | **100 %.** Mismo ZIP con un único `.xml`. Ya devuelve base64, que es exactamente lo que pide `arcGreZip`. |
| `transporte/zip.ts` (`extraerCdr`) | **~90 %.** Sirve si `arcCdr` resulta ser un ZIP; hay que añadir la detección ZIP-vs-XML descrita en §3.2. |
| `cdr/index.ts` (`parsearCdr`) | **100 %.** El CDR de la GRE es un `ApplicationResponse` UBL igual que el de factura. |
| `ubl/comun.ts` (`fecha`, `hora`, `bloqueFirma`) | **100 %.** |
| `rechazos.ts` | **~80 %.** La clasificación por rangos de código (0 / 100-1999 / 2000-3999 / 4000+) aplica igual al CDR de guía. Hay que añadir los errores REST (`cod`/`codError`) que no pasan por CDR. |
| `ubl/guia.ts` | **~70 % de la forma, pero con correcciones.** La estructura general acierta; ver §8.3. |
| `dominio/guia.ts` | **~80 %.** Modelo razonable, con un bug de catálogo y campos faltantes. |

### 8.2 Qué hay que escribir de cero

1. **Cliente OAuth2 (`transporte/oauth.ts`)** — POST form-urlencoded al endpoint de
   `api-seguridad`, parseo de `access_token`/`expires_in`, **caché en memoria con margen de
   expiración** (p. ej. renovar a los 55 min) y renovación transparente ante un 401.
   *Nuevo, ~120 líneas.*
2. **Transporte REST (`transporte/rest-gre.ts`)** — `enviarGuia(filename, zipB64, sha256)` y
   `consultarEnvio(numTicket)`, con manejo de los dos niveles de error (general y 422 con
   array `errors`) y reintentos ante 429/503. *Nuevo, ~180 líneas.*
3. **Hash SHA-256 del ZIP** — trivial con `node:crypto`, pero hay que decidir si se hashea el
   **binario** del ZIP o su base64. Greenter hace `hash('sha256', $greZip)` sobre el
   **contenido binario**, no sobre el base64. *Nuevo, ~5 líneas — pero es un detalle que si se
   equivoca produce rechazos incomprensibles.*
4. **Polling del ticket** — bucle con backoff hasta que `codRespuesta` deje de ser `98`.
   Decidir si es síncrono (bloqueante con timeout) o si se persiste el ticket y se consulta
   después. **Recomiendo persistir el ticket**, igual que ya se hace con el resumen de
   boletas. *Nuevo, ~80 líneas + cambios en la app.*
5. **Endpoints GRE** — sustituir `endpointGuias()` (SOAP) por hosts REST configurables.
   *Reescritura de ~15 líneas.*
6. **Soporte de GRE Transportista (`31`)** — el Anexo N.° 14 apartado b) tiene una estructura
   parcialmente distinta (el remitente va en `cac:DespatchSupplierParty` pero el transportista
   emisor va en `ShipmentStage/CarrierParty`, y hay campos propios como el n.° de la Tarjeta
   Única de Circulación). *Nuevo, ~150 líneas.* **Posiblemente aplazable:** con la
   RS 000108-2026, si la GRE-Remitente trae bien los datos del transportista ya no se exige
   guía adicional. Para un distribuidor de rodamientos que **remite**, el tipo `09` basta.
7. **Validaciones previas** — obligatoriedad condicional según modalidad (público exige RUC de
   transportista; privado exige placa + conductor + licencia), ubigeo de 6 dígitos, formato de
   pesos `n(12,3)`. *Nuevo, ~120 líneas, encaja en `catalogos/validaciones.ts`.*
8. **Documentar el flujo de baja manual en SOL** (no hay API).

### 8.3 Correcciones necesarias en `ubl/guia.ts` (ya identificadas, sin ejecutar código)

Contrastando el archivo actual contra el Anexo N.° 14 y la plantilla de Greenter:

| Problema | Actual | Debe ser |
|---|---|---|
| Descripción del motivo en el tag equivocado | `cbc:Information` | `cbc:HandlingInstructions`. `cbc:Information` es el *sustento de la diferencia de peso*, otra cosa. |
| Descripción del ítem | `cac:Item/cbc:Name` | `cac:Item/cbc:Description` |
| Tag no previsto en el anexo | `cbc:SplitConsignmentIndicator` | No figura en el Anexo N.° 14 ni en la plantilla de Greenter. **Quitarlo** (riesgo de rechazo por XSD). |
| `AddressTypeCode` sin `@listID` | `cbc:AddressTypeCode` a secas | `@listID` = RUC asociado al establecimiento |
| Ubigeo | atributos `@schemeAgencyName="PE:INEI"`, `@schemeName="Ubigeos"` ✔ | correcto |
| Documento relacionado incompleto | solo `cbc:ID` + `cbc:DocumentTypeCode` | añadir `@listAgencyName`/`@listName`/`@listURI` (catálogo **61**, no 01), `cbc:DocumentType` y opcionalmente `cac:IssuerParty` |
| Identificadores de parte sin atributos completos | solo `@schemeID` | añadir `@schemeName="Documento de Identidad"`, `@schemeAgencyName="PE:SUNAT"`, `@schemeURI="…catalogo06"` |
| Vehículo solo si es privado | `if (!esPublico && doc.vehiculo)` | el bloque `TransportHandlingUnit` no está atado a la modalidad en el anexo; revisar |
| Conductor solo si es privado | `if (!esPublico && doc.conductor)` | correcto como regla general, pero la RS 000108-2026 introduce el indicador `SUNAT_Envio_IndicadorVehiculoConductoresTransp` para el caso público |
| `MOTIVO_TRASLADO` desplazado | ver §5 | corregir los códigos `07`–`19` |
| Falta `cbc:NetWeightMeasure`, `cbc:TotalTransportHandlingUnitQuantity`, `cbc:SpecialInstructions`, `cac:LoadingTransportEvent`, `cac:BuyerCustomerParty` | ausentes | añadir (condicionales) |

### 8.4 Estimación de esfuerzo

| Bloque | Estimación |
|---|---|
| Cliente OAuth2 + caché de token | 0,5 día |
| Transporte REST (envío + consulta + errores + reintentos) | 1 día |
| Corrección y completado de `ubl/guia.ts` (tipo 09) | 1 día |
| Modelo de dominio + validaciones condicionales | 0,5 día |
| Polling/persistencia de ticket + integración en `index.ts` | 0,5 día |
| Tests unitarios (XML esperado, parseo de respuestas) | 1 día |
| Pruebas end-to-end contra el servidor de NubeFact | 0,5 día |
| **Subtotal GRE Remitente (09)** | **≈ 5 días** |
| GRE Transportista (31), si se necesita | +1,5 días |
| GRE por evento, si se necesita | +1,5 días |

**Estimación realista para la funcionalidad que el ERP necesita (guía de remisión remitente):
5 días de desarrollo**, más el tiempo de espera por credenciales.

### 8.5 Riesgos y bloqueantes

1. **BLOQUEANTE — credenciales.** Sin el `client_id`/`client_secret` que el cliente debe
   generar en su menú SOL, no se puede probar contra SUNAT. Es un trámite del contribuyente,
   no nuestro. **Hay que pedirlo ya**, y contar con que las credenciales pueden tardar en
   activarse.
2. **No hay entorno de pruebas oficial.** Se depende del servidor de NubeFact (§2.4) o de
   quemar correlativos en producción. Esto encarece la depuración: cada rechazo de SUNAT
   consume un correlativo real. Conviene reservar una serie (`T002`, por ejemplo) para las
   primeras pruebas.
3. **Ambigüedades documentadas** (host `api.sunat.gob.pe` vs `api-cpe.sunat.gob.pe`,
   relleno del correlativo en `nomArchivo`, `arcCdr` ZIP-vs-XML, `Content-Type` del token,
   algoritmo de firma). Ninguna es grave, pero cada una puede costar medio día de prueba y
   error contra un servidor que da mensajes crípticos. **Diseñar los tres primeros puntos como
   configurables/defensivos desde el inicio.**
4. **La norma se mueve.** El anexo técnico cambió en junio de 2026 (RS 000108-2026). Conviene
   dejar el generador de XML fácil de extender con campos nuevos.

### 8.6 Recomendación

Implementar **solo la GRE Remitente (`09`) por REST**, borrar `endpointGuias()` del módulo
SOAP para que nadie lo cablee por error, y dejar el tipo `31` y la GRE por evento fuera del
alcance inicial. La baja se documenta como procedimiento manual en SOL.

El paquete está bien posicionado: la parte cara de la facturación electrónica —firma XML-DSig
con `.pfx`, empaquetado ZIP, lectura de CDR— ya está resuelta y probada contra el servidor
real. Lo que falta es **transporte nuevo y XML corregido**, no arquitectura nueva.

---

## Anexo — Fuentes consultadas

**Oficiales SUNAT**
- Manual de Servicios Web — Plataforma Nueva GRE: <https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE%20(1)_0.pdf>
- RS 000108-2026/SUNAT, anexos (Anexo N.° 8, 12, **13**, 14, 28): <https://www.sunat.gob.pe/legislacion/superin/2026/anexo-000108-2026.pdf>
- Anexo N.° 14 (RS 000123-2022), estándar UBL 2.1 GRE remitente/transportista: <https://www.normaslegalesonline.pe/imagenes//13/07/2022/1657738942240_R-123-2022-SUNAT-7-1.pdf>
- Catálogo N.° 20 — motivos de traslado: <https://www.sunat.gob.pe/legislacion/superin/2024/anexo1-000240-2024.pdf>
- Servicios Web Disponibles (mayo 2026): <https://cpe.sunat.gob.pe/sites/default/files/2026-05/Descarga%20aqu%C3%AD%20los%20Servicios%20WEB%20Disponibles%20-%20Incluye%20DDJJ%20de%20Boletos%20a%C3%A9reos.pdf>
- Guías y Manuales: <https://cpe.sunat.gob.pe/guias-y-manuales>
- Landing GRE: <https://cpe.sunat.gob.pe/landing/guia-de-remision-electronica-gre>
- No conformidad y baja de una GRE: <https://cpe.sunat.gob.pe/node/118>
- Motivos de traslado: <https://cpe.sunat.gob.pe/node/171>
- Obligados a la emisión de la GRE: <https://cpe.sunat.gob.pe/node/119>
- Manual del Programador (SOAP, versión antigua — solo para contraste): <https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20(1).pdf>

**Librerías y especificaciones**
- <https://github.com/thegreenter/gre-api> · [`openapi.yaml`](https://github.com/thegreenter/gre-api/blob/HEAD/openapi.yaml) · [`Configuration.php`](https://github.com/thegreenter/gre-api/blob/HEAD/src/Configuration.php)
- <https://github.com/thegreenter/xml/blob/HEAD/src/Xml/Templates/despatch2022.xml.twig>
- <https://fe-primer.greenter.dev/docs/webservices/>
- <https://gist.github.com/dlopez525/1cfdfcd4d9438eae7f72328cfe1886ee>

**Secundarias (contexto normativo y operativo)**
- <https://grzasociados.com/resolucion-de-superintendencia-n-000108-2026-sunat-se-modifican-los-sujetos-obligados-a-emitir-la-guia-de-remision-remitente-incorpora-un-documento-relacionado-con-el-traslado-de-merc/>
- <https://actualidadempresarial.pe/norma/resolucion-000108-2026-sunat/7661d6c7-f6ee-40b1-b155-60c4977b8100>
- <https://www.perucontable.com/tributaria/guia-de-remision-electronica-sunat-amplia-el-plazo-y-permite-seguir-usando-la-guia-fisica-hasta-el-30-06-2026/>
- <https://perugestiona.pe/tramites-sunat/guia-remision-electronica/>
- <https://mifact.net/sunat-modifica-la-guia-de-remision-electronica-2026-que-cambia-para-el-comercio-exterior-y-el-transporte-de-mercancias/>
- <https://llbsolutions.com/es/guias-remision-electronicas-sunat-cambios-clave-2026/>
- <https://www.nubefact.com/blog/nubefact/nuevo-servidor-de-pruebas-gratuito-de-validacion-xml-para-las-nuevas-gre>
- <https://www.nubefact.com/blog/actualizaciones-sunat/anular-dar-de-baja-guia-de-remision-electronica-gre-desde-la-sunat>
- <https://facturalibre.org/blog/pasos-para-configurar-la-guia-de-remision/>
- <https://manuales.gyomanager.com/guias-de-remision/credenciales-de-api-sunat>
- <https://thelemabogados.pe/es/la-sunat-prorroga-la-facultad-discrecional-de-no-sancionar-a-los-contribuyentes-que-deban-emitir-la-guia-de-remision-electronica-gre-hasta-el-30-de-junio-del-2024/>
