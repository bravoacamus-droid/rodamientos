-- 165 · Los avisos de cotizaciones llegan al celular
--
-- El problema. El celular recibe por defecto los avisos de severidad «media»
-- o más (162, `suscripciones_push.severidad_minima`). Y los dos avisos de
-- cotizaciones que más le importan a Willy nacían como «baja»:
-- «Cotización por vencer» (desde la 021) y «Cotizaciones vencidas sin
-- respuesta» (161). Se veían en la bandeja y nunca llegaban al celular.
--
-- Luis, 28/10: «los avisos eran para notificar sobre cotizaciones vencidas,
-- cosas que se tienen que facturar o cobrar».
--
-- Los dos pasan a «media». Lo que se factura (guía sin facturar, media) y lo
-- que se cobra (crédito por vencer, media; vencido, alta) ya llegaban. La
-- cotización en borrador se queda en «baja»: es un recordatorio, no un
-- cliente esperando.
--
-- Parche sobre la versión viva de `generar_alertas()` (161), con anclas que
-- revientan si no están, y las alertas abiertas de esos dos tipos se suben
-- también.

do $$
declare
  v_def text := replace(pg_get_functiondef('public.generar_alertas()'::regprocedure), E'\r\n', E'\n');
begin
  if position($a$'cotizacion_por_vencer', 'baja'$a$ in v_def) = 0
     or position($a$'cotizaciones_sin_cerrar', 'baja'$a$ in v_def) = 0 then
    if position($a$'cotizacion_por_vencer', 'media'$a$ in v_def) > 0
       and position($a$'cotizaciones_sin_cerrar', 'media'$a$ in v_def) > 0 then
      return; -- ya aplicada
    end if;
    raise exception '165: no encuentro las anclas de severidad en generar_alertas()';
  end if;
  v_def := replace(v_def, $a$'cotizacion_por_vencer', 'baja'$a$, $a$'cotizacion_por_vencer', 'media'$a$);
  v_def := replace(v_def, $a$'cotizaciones_sin_cerrar', 'baja'$a$, $a$'cotizaciones_sin_cerrar', 'media'$a$);
  execute v_def;
end $$;

update alertas set severidad = 'media'
 where not archivada and severidad = 'baja'
   and tipo in ('cotizacion_por_vencer', 'cotizaciones_sin_cerrar');

-- Centinela: genera y mira que salgan en «media»; deshace.
do $$
declare
  v_def text := pg_get_functiondef('public.generar_alertas()'::regprocedure);
begin
  if position($a$'cotizacion_por_vencer', 'media'$a$ in v_def) = 0
     or position($a$'cotizaciones_sin_cerrar', 'media'$a$ in v_def) = 0 then
    raise exception '165: la función no quedó con «media»';
  end if;
  begin
    perform public.generar_alertas();
    if exists (select 1 from alertas
                where not archivada and severidad = 'baja'
                  and tipo in ('cotizacion_por_vencer', 'cotizaciones_sin_cerrar')) then
      raise exception '165: sigue habiendo avisos de cotización en «baja»';
    end if;
    raise exception '__165_DESHACER__';
  exception when others then
    if sqlerrm <> '__165_DESHACER__' then raise; end if;
  end;
end $$;
