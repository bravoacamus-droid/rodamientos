/*
  Hasta cuánto puede durar aquí una Server Action que habla con SUNAT
  (auditoría SUNAT 28/10, M7). 60 s es el tope más alto que admiten TODOS los
  planes de Vercel, también Hobby sin Fluid Compute: con más, el despliegue
  falla en el plan pequeño. Alcanza para lo normal —una factura tarda 1-3 s;
  lo peor real es un envío colgado (25 s) más la consulta de su constancia
  (15 s)—. Si aun así se corta, nada se pierde: el documento queda «enviado»
  con su candado, y la guía se pregunta por su ticket antes de reenviarse.
  Con Vercel Pro y Fluid Compute se puede subir (hasta 800) si «Enviar todas»
  se queda corto con diez documentos y SUNAT lento.
*/
export const maxDuration = 60;

export { PaginaDetalleGuia as default } from "@/modules/guias";
