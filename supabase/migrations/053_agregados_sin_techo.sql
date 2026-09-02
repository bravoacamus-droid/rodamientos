-- ###########################################################################
-- 053 · LOS AGREGADOS QUE LEÍAN LA TABLA ENTERA
-- ###########################################################################
--
-- De la auditoría del 31/08 (PENDIENTES §0.4). Es el mismo fallo de los tres
-- contadores de §0.3 —agregar sobre la página en vez de sobre la tabla— pero
-- en sitios distintos, y esta vez sin ningún `.limit()` a la vista: se pedía
-- la vista COMPLETA y se sumaba en JavaScript.
--
-- Que no haya `.limit()` no significa que no haya tope. **PostgREST corta a
-- las 1.000 filas** y no lo dice. Así que estas consultas hoy aciertan, y el
-- día que la empresa pase de mil documentos empiezan a dar cifras cortas sin
-- avisar. Exactamente la misma clase de fallo, con la misma forma de morir.
--
-- ---------------------------------------------------------------------------
-- Los dos que de verdad crecen
-- ---------------------------------------------------------------------------
--   · `embudoComercial` leía `v_trazabilidad_venta` entera. Esa vista crece
--     con CADA cotización y CADA venta: es el más peligroso de los tres.
--   · `agingCartera` y `resumen` leían `v_cartera` entera. Crece con cada
--     comprobante abierto.
--
-- El tercero de la lista, `v_valorizacion_inventario`, **no crece**: ya agrupa
-- por subfamilia en Postgres y devuelve 34 filas hoy y 34 dentro de tres años.
-- La auditoría lo puso junto a los otros dos y no era el mismo caso; lo único
-- que le hacía falta era dejar de pedirlo con `select("*")`.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- El embudo comercial
-- ---------------------------------------------------------------------------
-- Una fila. Lo que antes se armaba recorriendo la trazabilidad entera con tres
-- `Set` para no contar dos veces la misma cotización.
create or replace view v_embudo_comercial
with (security_invoker = true) as
with
-- Cada documento se cuenta UNA vez. Una cotización con dos guías aparece dos
-- veces en la trazabilidad, y sumar sin distinguir hacía el embudo más ancho
-- abajo que arriba.
cotizado as (
  select count(*) as documentos, coalesce(sum(total_cotizado), 0) as importe
    from (
      select distinct cotizacion_id, total_cotizado
        from v_trazabilidad_venta
       where cotizacion_id is not null
    ) c
),
facturado as (
  select count(*) as documentos,
         coalesce(sum(total_facturado), 0) as importe,
         coalesce(sum(saldo), 0)           as saldo
    from (
      select distinct comprobante_id, total_facturado, saldo
        from v_trazabilidad_venta
       where comprobante_id is not null
    ) f
),
despachado as (
  -- El importe de las ventas que SÍ llevaron guía. La guía no lleva importes,
  -- solo mercadería, así que se mide por lo facturado de esas ventas.
  select count(distinct guia_id) as guias,
         coalesce(sum(total_facturado), 0) as importe
    from (
      select distinct guia_id, comprobante_id, total_facturado
        from v_trazabilidad_venta
       where guia_id is not null and comprobante_id is not null
    ) d
)
select
  round(cotizado.importe, 2)                    as cotizado,
  cotizado.documentos::int                      as cotizaciones,
  round(despachado.importe, 2)                  as despachado,
  despachado.guias::int                         as guias,
  round(facturado.importe, 2)                   as facturado,
  facturado.documentos::int                     as comprobantes,
  round(facturado.importe - facturado.saldo, 2) as cobrado,
  round(facturado.saldo, 2)                     as por_cobrar
from cotizado, facturado, despachado;

comment on view v_embudo_comercial is
  'El embudo de cotizado a cobrado, contado sobre la tabla entera. Antes se recorría v_trazabilidad_venta completa en JavaScript, y PostgREST la corta a las 1.000 filas sin decirlo (PENDIENTES §0.4).';

-- ---------------------------------------------------------------------------
-- La antigüedad de la cartera
-- ---------------------------------------------------------------------------
create or replace view v_aging_cartera
with (security_invoker = true) as
select
  tramo_aging                as tramo,
  count(*)::int              as documentos,
  round(sum(saldo), 2)       as saldo,
  round(sum(saldo) filter (where dias_vencido > 0), 2) as vencido
from v_cartera
where saldo > 0
group by tramo_aging;

comment on view v_aging_cartera is
  'La cartera abierta por tramo de antigüedad. Antes se agrupaba en JavaScript sobre v_cartera completa, con el tope mudo de PostgREST detrás.';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Lo que hay que demostrar no es que devuelvan un número, sino que devuelven
-- EL MISMO que la cuenta a mano sobre la tabla entera.
do $$
declare
  v_e record;
  v_n bigint;
  v_m numeric;
begin
  select * into v_e from v_embudo_comercial;

  select count(distinct cotizacion_id) into v_n
    from v_trazabilidad_venta where cotizacion_id is not null;
  if v_e.cotizaciones is distinct from v_n then
    raise exception 'El embudo cuenta % cotizaciones y hay %', v_e.cotizaciones, v_n;
  end if;

  select count(distinct comprobante_id) into v_n
    from v_trazabilidad_venta where comprobante_id is not null;
  if v_e.comprobantes is distinct from v_n then
    raise exception 'El embudo cuenta % comprobantes y hay %', v_e.comprobantes, v_n;
  end if;

  -- Lo cobrado más lo pendiente tiene que ser lo facturado. Es la cuenta que
  -- alguien va a hacer de cabeza mirando la pantalla.
  if round(v_e.cobrado + v_e.por_cobrar, 2) is distinct from v_e.facturado then
    raise exception 'El embudo no cuadra: cobrado % + por cobrar % <> facturado %',
      v_e.cobrado, v_e.por_cobrar, v_e.facturado;
  end if;

  -- Y la suma por tramos tiene que ser la cartera abierta.
  select coalesce(round(sum(saldo), 2), 0) into v_m from v_aging_cartera;
  if v_m is distinct from (select coalesce(round(sum(saldo), 2), 0) from v_cartera where saldo > 0) then
    raise exception 'El aging suma % y la cartera abierta suma %',
      v_m, (select coalesce(round(sum(saldo),2),0) from v_cartera where saldo > 0);
  end if;

  raise notice 'El embudo y el aging cuentan sobre la tabla entera.';
end $$;
