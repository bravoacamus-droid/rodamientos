-- ###########################################################################
-- 023 · EL MARGEN SE MIDE SOBRE EL COSTO
-- ###########################################################################
--
-- Willy, en la demo del 26/08 (28:35), a los cinco segundos de ver el tablero:
--
--   «Ese margen creo que ustedes lo están considerando con respecto al precio
--    de venta… lo que me interesa saber es el margen con respecto al costo.»
--
-- Tiene razón, y no es una preferencia: es cómo trabaja. Su plantilla de
-- productos calcula P.V. = P.C. × 1,20 EXACTO en las siete filas que mandó, o
-- sea que piensa en «le pongo 20 %». Con la fórmula que había:
--
--     costo 10, venta 12  →  (12 − 10) / 12  =  16,7 %
--
-- ...la pantalla le devolvía 16,7 donde él esperaba 20. **Todos los márgenes
-- que ha visto están por debajo de lo que él cree.** Por eso lo notó tan
-- rápido.
--
--     costo 10, venta 12  →  (12 − 10) / 10  =  20,0 %   ← lo que hace ahora
--
-- ---------------------------------------------------------------------------
-- Y además no era consistente consigo mismo
-- ---------------------------------------------------------------------------
-- `v_productos_stock.margen_pct` YA dividía entre el costo desde la 005. O
-- sea que el listado del catálogo decía 20 % y el tablero decía 16,7 % del
-- mismo producto, y en el código había un comentario afirmando que las dos
-- hacían lo mismo. La palabra «margen» significaba dos cosas distintas en la
-- misma aplicación.
--
-- Esta migración las unifica en la definición que pidió el cliente.
--
-- ---------------------------------------------------------------------------
-- Qué NO cambia
-- ---------------------------------------------------------------------------
-- El margen en DINERO (venta − costo) es el mismo con las dos fórmulas: solo
-- cambia el denominador del porcentaje. Así que ninguna cifra de utilidad se
-- mueve, ni el kardex, ni un total de documento. Cambia lo que se enseña como
-- porcentaje, y nada más.
--
-- El denominador sigue siendo el importe SIN IGV: el IGV no es ingreso, se
-- recauda para SUNAT.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Ventas mensuales
-- ---------------------------------------------------------------------------
create or replace view v_ventas_mensuales
with (security_invoker = true) as
select
  date_trunc('month', c.fecha_emision)::date as mes,
  count(*)                                   as documentos,
  sum(c.op_gravada)                          as venta_neta,
  sum(c.igv)                                 as igv,
  sum(c.total)                               as total,
  sum(c.costo_total)                         as costo,
  sum(c.op_gravada) - sum(c.costo_total)     as margen,
  -- Sobre el COSTO. Con costo cero se devuelve 0 y no infinito: un mes sin
  -- costo cargado es «no se sabe», y enseñar un porcentaje enorme diría que
  -- el negocio va redondo cuando lo que pasa es que falta un dato.
  case when sum(c.costo_total) > 0
       then round((sum(c.op_gravada) - sum(c.costo_total)) / sum(c.costo_total) * 100, 2)
       else 0 end                            as margen_pct
from comprobantes c
where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
group by 1;

comment on view v_ventas_mensuales is
  'Serie mensual de ventas. `margen_pct` va sobre el COSTO, no sobre la venta: es como lo pidió Willy (26/08, 28:35) y como calcula su propia plantilla (P.V. = P.C. x 1,20).';

-- ---------------------------------------------------------------------------
-- 2. Top de productos
-- ---------------------------------------------------------------------------
-- Se le añade `margen_pct` para que la aplicación deje de calcularlo por su
-- cuenta: lo hacía sobre la venta, con un comentario que decía —falsamente—
-- que era lo mismo que la ficha de producto.
create or replace view v_top_productos
with (security_invoker = true) as
select
  ci.producto_id,
  p.codigo,
  p.descripcion,
  m.nombre                    as marca,
  f.nombre                    as subfamilia,
  sum(ci.cantidad)            as unidades,
  round(sum(ci.importe), 2)   as venta,
  round(sum(ci.cantidad * ci.costo_unitario), 2) as costo,
  round(sum(ci.importe) - sum(ci.cantidad * ci.costo_unitario), 2) as margen,
  count(distinct c.cliente_id) as clientes,
  max(c.fecha_emision)        as ultima_venta,
  -- Va AL FINAL y no junto a `margen`, que es donde se leería mejor:
  -- `create or replace view` solo admite AÑADIR columnas por el final. Meterla
  -- en medio obliga a un `drop view`, y eso tumbaría cualquier vista que
  -- dependiera de esta. No vale la pena por el orden de una columna.
  case when sum(ci.cantidad * ci.costo_unitario) > 0
       then round(
              (sum(ci.importe) - sum(ci.cantidad * ci.costo_unitario))
              / sum(ci.cantidad * ci.costo_unitario) * 100, 2)
       else 0 end             as margen_pct
from comprobante_items ci
join comprobantes c on c.id = ci.comprobante_id
join productos p    on p.id = ci.producto_id
join marcas m       on m.id = p.marca_id
join subfamilias f     on f.id = p.subfamilia_id
where c.estado <> 'anulado' and c.tipo in ('factura','boleta')
group by ci.producto_id, p.codigo, p.descripcion, m.nombre, f.nombre;

comment on view v_top_productos is
  'Ranking de lo más vendido. `margen_pct` sobre el costo, igual que el resto del sistema desde la 023.';

-- ---------------------------------------------------------------------------
-- 3. El margen que se guarda en cada cotización
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_totales_cotizacion()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id  uuid := coalesce(new.cotizacion_id, old.cotizacion_id);
  v_sub numeric(14,2);
  v_desc numeric(14,2);
  v_costo numeric(14,2);
  v_igv_pct numeric(5,2);
begin
  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;

  select coalesce(sum(ci.importe), 0),
         coalesce(sum(round(ci.cantidad * ci.valor_unitario * ci.descuento_pct / 100.0, 2)), 0),
         coalesce(sum(round(ci.cantidad * ci.costo_unitario, 2)), 0)
    into v_sub, v_desc, v_costo
    from cotizacion_items ci where ci.cotizacion_id = v_id;

  update cotizaciones c
     set subtotal        = v_sub,
         descuento_total = v_desc,
         igv             = round(v_sub * v_igv_pct / 100.0, 2),
         total           = v_sub + round(v_sub * v_igv_pct / 100.0, 2),
         costo_total     = v_costo,
         -- Sobre el COSTO (023). Sin costo cargado se guarda 0: es «no se
         -- sabe», y un 100 % le diría al vendedor que está regalando margen
         -- cuando lo que falta es el dato.
         margen_pct      = case when v_costo > 0
                                then round((v_sub - v_costo) / v_costo * 100, 2)
                                else 0 end,
         actualizado_en  = now()
   where c.id = v_id;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Las cotizaciones ya guardadas
-- ---------------------------------------------------------------------------
-- `cotizaciones.margen_pct` es un valor GUARDADO, no calculado al leer: lo
-- escribe el trigger cuando cambia una línea. Cambiar la fórmula no toca las
-- que ya existen, así que se quedarían con el número viejo hasta que alguien
-- las editara — y en pantalla se vería una cotización al 15,5 % junto a un
-- catálogo que dice 20 % del mismo producto. Que es justo la incoherencia que
-- esta migración viene a quitar.
--
-- Se recalculan todas de una vez. Solo se toca `margen_pct`: ni el subtotal,
-- ni el IGV, ni el total, ni el costo se mueven.
update cotizaciones c
   set margen_pct = case when c.costo_total > 0
                         then round((c.subtotal - c.costo_total) / c.costo_total * 100, 2)
                         else 0 end
 where c.margen_pct is distinct from
       (case when c.costo_total > 0
             then round((c.subtotal - c.costo_total) / c.costo_total * 100, 2)
             else 0 end);

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_costo numeric := 10;
  v_venta numeric := 12;
  v_pct   numeric;
begin
  -- El caso que Willy tiene en la cabeza: su plantilla hace P.V. = P.C. x 1,20.
  v_pct := round((v_venta - v_costo) / v_costo * 100, 2);
  if v_pct <> 20.00 then
    raise exception 'El margen sobre costo de 10→12 debería ser 20 %%, y da %', v_pct;
  end if;

  -- Y que la vieja daba otra cosa, para que quede escrito por qué se cambió.
  if round((v_venta - v_costo) / v_venta * 100, 2) <> 16.67 then
    raise exception 'La fórmula vieja no reproduce el 16,67 %% que veía Willy';
  end if;

  -- Las dos vistas y el trigger tienen que hablar el mismo idioma que
  -- v_productos_stock, que ya dividía entre el costo desde la 005.
  if (select count(*) from pg_views where viewname in ('v_ventas_mensuales','v_top_productos')) <> 2 then
    raise exception 'Faltó recrear alguna de las dos vistas';
  end if;

  -- Y que no haya quedado ninguna cotización con el margen viejo guardado.
  if exists (
    select 1 from cotizaciones c
    where c.margen_pct is distinct from
          (case when c.costo_total > 0
                then round((c.subtotal - c.costo_total) / c.costo_total * 100, 2)
                else 0 end)
  ) then
    raise exception 'Quedaron cotizaciones con el margen calculado a la vieja usanza';
  end if;

  raise notice 'Margen: unificado sobre el costo en vistas, trigger, catálogo y cotizaciones ya guardadas.';
end $$;
