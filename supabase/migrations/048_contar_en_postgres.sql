-- ###########################################################################
-- 048 · TRES CONTADORES QUE MENTÍAN EN SILENCIO
-- ###########################################################################
--
-- De la auditoría del 31/08 (PENDIENTES §0.3). La peor clase de fallo: no
-- revientan, dan un número equivocado y nadie se entera.
--
--   alertas · resumenBandeja        `.limit(2000)` y suma en JavaScript
--   cobranzas · carteraPorCliente   `.limit(1000)` y agrupa en JavaScript
--   equivalencias · totalDeclaradas `.limit(2000)` y cuenta productos distintos
--
-- Los tres agregan SOBRE LA PÁGINA, no sobre la tabla. Mientras haya menos
-- filas que el tope aciertan, así que hoy los tres dan bien — y el día que se
-- pase el tope siguen dando un número, solo que otro. Un contador que se
-- rompe en voz alta se arregla; uno que se queda corto se cree.
--
-- Es la misma clase de fallo que el truncado mudo de los desplegables de
-- proveedor (§6), que ya mordió una vez.
--
-- ---------------------------------------------------------------------------
-- Se arreglan contando en Postgres
-- ---------------------------------------------------------------------------
-- Tres vistas. `security_invoker`, como todas: son lecturas y tienen que
-- respetar RLS — que un contador salte las políticas para dar un número más
-- redondo sería peor que el número equivocado.
--
-- La agregación baja a la base; lo que decide algo se queda en TypeScript. En
-- cobranzas, por ejemplo, la vista suma por cliente y la PRIORIDAD —qué llamada
-- hacer primero— se sigue calculando arriba, donde está probada.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · El contador de la campana
-- ---------------------------------------------------------------------------
create or replace view v_resumen_alertas
with (security_invoker = true) as
select
  count(*)                                          as total,
  count(*) filter (where not leida)                 as sin_leer,
  count(*) filter (where severidad = 'critica')     as criticas,
  count(*) filter (where severidad = 'alta')        as altas,
  count(*) filter (where severidad = 'media')       as medias,
  count(*) filter (where severidad = 'baja')        as bajas,
  count(*) filter (where severidad = 'info')        as infos,
  max(generada_en)                                  as ultima
from alertas
where not archivada;

comment on view v_resumen_alertas is
  'El contador de la campana, contado sobre la tabla entera. Antes se sumaban en JavaScript las 2.000 primeras alertas sin archivar (PENDIENTES §0.3).';

-- ---------------------------------------------------------------------------
-- 2 · La deuda por cliente
-- ---------------------------------------------------------------------------
-- Una fila por cliente en vez de una por documento. El número de clientes con
-- deuda viva está acotado por el maestro —hoy 97— así que después de agrupar
-- ya no hay nada que truncar.
create or replace view v_cartera_por_cliente
with (security_invoker = true) as
select
  c.cliente_id,
  max(c.cliente)                        as cliente,
  max(c.documento)                      as documento,
  count(*)                              as documentos,
  round(sum(c.saldo), 2)                as saldo,
  -- Vencido es lo que YA pasó de fecha, no todo lo que se debe.
  round(sum(c.saldo) filter (where c.dias_vencido > 0), 2) as vencido,
  max(c.dias_vencido)                   as dias_mas_antiguo
from v_cartera c
group by c.cliente_id;

comment on view v_cartera_por_cliente is
  'Lo que debe cada cliente, agrupado en Postgres. Antes se agrupaban en JavaScript los 1.000 primeros documentos, y a partir de ahí la deuda salía de menos (PENDIENTES §0.3).';

-- ---------------------------------------------------------------------------
-- 3 · Cuántas equivalencias hay
-- ---------------------------------------------------------------------------
-- `pares` ya salía bien —se pedía con `count: exact`—; lo que se contaba sobre
-- la página era **cuántos productos distintos** aparecen, y ese es el número
-- que dice si el módulo se está usando.
create or replace view v_resumen_equivalencias
with (security_invoker = true) as
select
  (select count(*) from producto_equivalencias) as pares,
  (select count(*) from (
     select producto_id as id from producto_equivalencias
     union
     select equivalente_id from producto_equivalencias
   ) t)                                          as productos;

comment on view v_resumen_equivalencias is
  'Pares declarados y cuántos productos distintos tocan. El segundo se contaba sobre las 2.000 primeras filas (PENDIENTES §0.3).';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Lo que hay que demostrar no es que las vistas devuelvan un número, sino que
-- devuelven EL MISMO que la cuenta hecha a mano sobre la tabla entera. Si
-- alguna se separa, el contador vuelve a mentir y nadie lo notaría.
do $$
declare
  v_a record;
  v_n bigint;
  v_m numeric;
begin
  -- 1 · Alertas.
  select * into v_a from v_resumen_alertas;
  select count(*) into v_n from alertas where not archivada;
  if v_a.total is distinct from v_n then
    raise exception 'v_resumen_alertas.total dice % y la tabla tiene %', v_a.total, v_n;
  end if;
  select count(*) into v_n from alertas where not archivada and not leida;
  if v_a.sin_leer is distinct from v_n then
    raise exception 'v_resumen_alertas.sin_leer dice % y son %', v_a.sin_leer, v_n;
  end if;
  if v_a.total is distinct from
     (v_a.criticas + v_a.altas + v_a.medias + v_a.bajas + v_a.infos) then
    raise exception 'Las severidades no suman el total: % vs %',
      v_a.criticas + v_a.altas + v_a.medias + v_a.bajas + v_a.infos, v_a.total;
  end if;

  -- 2 · Cartera. La suma por cliente tiene que dar la suma total.
  select coalesce(round(sum(saldo), 2), 0) into v_m from v_cartera_por_cliente;
  if v_m is distinct from (select coalesce(round(sum(saldo), 2), 0) from v_cartera) then
    raise exception 'v_cartera_por_cliente suma % y v_cartera suma %',
      v_m, (select coalesce(round(sum(saldo),2),0) from v_cartera);
  end if;
  select count(*) into v_n from v_cartera_por_cliente;
  if v_n is distinct from (select count(distinct cliente_id) from v_cartera) then
    raise exception 'v_cartera_por_cliente tiene % filas y hay % clientes con deuda',
      v_n, (select count(distinct cliente_id) from v_cartera);
  end if;

  -- 3 · Equivalencias.
  select pares into v_n from v_resumen_equivalencias;
  if v_n is distinct from (select count(*) from producto_equivalencias) then
    raise exception 'v_resumen_equivalencias.pares dice % y hay %',
      v_n, (select count(*) from producto_equivalencias);
  end if;

  raise notice 'Los tres contadores cuentan sobre la tabla entera, no sobre una página.';
end $$;
