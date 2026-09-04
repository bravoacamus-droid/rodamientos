-- ###########################################################################
-- 059 · UN MARGEN SIN COSTO NO ES UN MARGEN
-- ###########################################################################
--
-- Encontrado el 04/09 abriendo el tablero con el histórico entero:
--
--     VENDIDO   USD 201,797
--     MARGEN    USD 201,797   ·   0.0% sobre el costo
--
-- El margen es **la venta entera**, y su propia explicación lo desmiente en la
-- línea de abajo. Las dos cifras salen de la misma cuenta y las dos son
-- falsas.
--
-- ---------------------------------------------------------------------------
-- Por qué
-- ---------------------------------------------------------------------------
-- Los **479** comprobantes del histórico se cargaron sin costo:
-- `costo_total = 0` en todos. Así que `margen = venta - 0 = venta`, y el
-- porcentaje, que divide entre el costo, cae al `else 0`.
--
-- Aritméticamente las dos son correctas. Y las dos le dicen a Willy que gana
-- el 100 % de lo que vende.
--
-- ---------------------------------------------------------------------------
-- Y no es un problema que se pase solo
-- ---------------------------------------------------------------------------
-- Es lo primero que se piensa: «cuando empiece a facturar de verdad, se
-- arregla». No.
--
-- Esos 479 documentos NUNCA van a tener costo — se cargaron de su sistema
-- anterior y ese dato no vino. Así que cualquier rango que los incluya —«Este
-- año», «Todo», y todo lo que mire hacia atrás— va a mezclar para siempre
-- ventas con costo y ventas sin él, y el margen saldrá inflado.
--
-- **El caso mixto no es transitorio: es el permanente.**
--
-- ---------------------------------------------------------------------------
-- El arreglo
-- ---------------------------------------------------------------------------
-- El margen se calcula SOLO sobre lo que tiene costo conocido, y la función
-- devuelve además cuánta venta es esa. Con eso, la pantalla puede decir la
-- verdad en los tres casos:
--
--   · nada tiene costo      → «Sin costo registrado». No hay margen que dar.
--   · todo tiene costo      → el margen, a secas.
--   · una parte             → el margen de esa parte, diciendo de qué parte.
--
-- Devolver `null` en vez de un número sería más limpio, pero la firma de la
-- función es un `returns table` y cambiar tipos obliga a un `drop`. Se
-- devuelve el dato que falta —`venta_con_costo`— y decide quien pinta, que es
-- donde además hay que redactar la frase.
-- ###########################################################################

set search_path = public, extensions;

-- `returns table` no se puede ampliar con `create or replace`: hay que
-- soltarla. Nada más depende de ella —solo la llama el tablero por RPC—.
drop function if exists public.serie_ventas(date, date, text);

create or replace function public.serie_ventas(
  p_desde date,
  p_hasta date,
  p_grano text default 'mes'
)
returns table (
  periodo date,
  documentos bigint,
  venta numeric,
  costo numeric,
  margen numeric,
  margen_pct numeric,
  unidades numeric,
  /**
   * La venta de los documentos que SÍ traen costo.
   *
   * Es lo que permite no mentir: el margen solo significa algo sobre esta
   * parte, y quien pinta necesita saber si es toda la venta, una parte o
   * ninguna.
   */
  venta_con_costo numeric
)
language sql
stable security definer
set search_path = public, extensions
as $$
  select
    date_trunc(public.unidad_periodo(p_grano), c.fecha_emision)::date as periodo,
    count(distinct c.id)                        as documentos,
    round(sum(c.op_gravada), 2)                 as venta,
    round(sum(c.costo_total), 2)                as costo,
    -- El margen, SOLO de lo que tiene costo. Restar la venta entera menos un
    -- costo que solo cubre parte de ella es lo que daba el 100 %.
    -- `coalesce` sobre el `filter`: sin ninguna fila que lo cumpla, un
    -- `sum(...) filter` devuelve NULL, y ese null se propaga a la resta.
    -- Devolverlo tal cual haría que el tablero enseñara un hueco donde debe
    -- decir «no se sabe» — y de paso deja mudo a cualquier centinela, porque
    -- `null <> 0` no es verdadero: no falla, se calla.
    round(
      coalesce(sum(c.op_gravada) filter (where c.costo_total > 0), 0)
      - sum(c.costo_total), 2)                  as margen,
    -- Sobre el COSTO (023).
    case when sum(c.costo_total) > 0
         then round(
                (coalesce(sum(c.op_gravada) filter (where c.costo_total > 0), 0)
                 - sum(c.costo_total)) / sum(c.costo_total) * 100, 2)
         else 0 end                             as margen_pct,
    coalesce((
      select round(sum(ci.cantidad), 2) from comprobante_items ci
       where ci.comprobante_id = any(array_agg(c.id))
    ), 0)                                       as unidades,
    coalesce(round(sum(c.op_gravada) filter (where c.costo_total > 0), 2), 0)
                                                as venta_con_costo
  from comprobantes c
  where c.estado <> 'anulado'
    and c.tipo in ('factura','boleta')
    and c.fecha_emision between p_desde and p_hasta
  group by 1
  order by 1;
$$;

comment on function public.serie_ventas(date, date, text) is
  'La serie de ventas del tablero. El margen se calcula solo sobre los documentos que traen costo: los 479 del histórico no lo traen, y contarlos daba un margen igual a la venta entera.';

revoke execute on function public.serie_ventas(date, date, text) from public, anon;
grant execute on function public.serie_ventas(date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_venta   numeric;
  v_margen  numeric;
  v_conCosto numeric;
  v_pct     numeric;
begin
  select sum(venta), sum(margen), sum(venta_con_costo), max(margen_pct)
    into v_venta, v_margen, v_conCosto, v_pct
    from public.serie_ventas('2000-01-01', '2100-01-01', 'anio');

  if v_venta is null then
    raise notice 'No hay comprobantes con los que probar. Se omite.';
    return;
  end if;

  -- Con TODO el histórico sin costo, el margen tiene que ser cero: no es que
  -- se gane cero, es que no se sabe. Y la pantalla lo dirá con palabras, que
  -- para eso lleva `venta_con_costo`.
  -- `coalesce` a un valor imposible: si el margen llegara NULL, `null <> 0`
  -- no es verdadero y este `if` no entraría — el centinela diría que todo
  -- bien sin haber comprobado nada. Pasó al escribir esta misma migración.
  if v_conCosto = 0 and coalesce(v_margen, -1) <> 0 then
    raise exception 'Sin ningún costo registrado el margen salió %, y debía ser 0',
      coalesce(v_margen::text, 'NULL');
  end if;

  -- El caso que de verdad importa: el margen NUNCA puede ser la venta entera
  -- cuando hay ventas sin costo.
  if v_conCosto < v_venta and v_margen >= v_venta then
    raise exception 'El margen (%) alcanza a la venta (%) habiendo ventas sin costo', v_margen, v_venta;
  end if;

  raise notice 'El margen se calcula solo sobre lo que tiene costo: % de % vendido.',
    v_conCosto, v_venta;
end $$;

-- ###########################################################################
-- El mismo fallo estaba en dos vistas más
-- ###########################################################################
--
-- Buscando `margen` por el esquema salieron cuatro sitios. Dos con el mismo
-- error, uno correcto y uno que es otra cosa:
--
--   · `v_ventas_mensuales`  → margen = venta entera. Alimenta Reportes.
--   · `v_top_productos`     → ídem, por producto.
--   · `v_productos_stock`   → **bien**: devuelve `null` cuando no hay costo.
--     Ya lo hacía. Es la prueba de que la forma correcta estaba escrita en el
--     proyecto desde el principio; simplemente no se aplicó en los otros dos.
--   · `cotizaciones.margen` → es el de la propia cotización, con su costo. Es
--     otro cálculo y está bien.
--
-- La columna nueva va la ÚLTIMA en las dos: `create or replace view` no puede
-- reordenar ni renombrar columnas, y metida en medio Postgres lo lee como que
-- la de al lado cambia de nombre. Es la lección de la 047 y la 058.
-- ###########################################################################

create or replace view v_ventas_mensuales as
select
  date_trunc('month', fecha_emision::timestamptz)::date as mes,
  count(*)                                              as documentos,
  sum(op_gravada)                                       as venta_neta,
  sum(igv)                                              as igv,
  sum(total)                                            as total,
  sum(costo_total)                                      as costo,
  -- Solo de lo que tiene costo. Antes: `sum(op_gravada) - sum(costo_total)`,
  -- que con el costo en cero daba la venta entera como ganancia.
  coalesce(sum(op_gravada) filter (where costo_total > 0), 0)
    - sum(costo_total)                                  as margen,
  case
    when sum(costo_total) > 0 then round(
      (coalesce(sum(op_gravada) filter (where costo_total > 0), 0)
       - sum(costo_total)) / sum(costo_total) * 100, 2)
    else 0
  end                                                   as margen_pct,
  coalesce(round(sum(op_gravada) filter (where costo_total > 0), 2), 0)
                                                        as venta_con_costo
from comprobantes c
where estado <> 'anulado'
  and tipo = any (array['factura'::tipo_documento, 'boleta'::tipo_documento])
group by 1;

comment on view v_ventas_mensuales is
  'Ventas por mes. El margen solo cuenta los documentos que traen costo: el histórico se cargó sin él y contarlo daba un margen igual a la venta.';

create or replace view v_top_productos as
select
  ci.producto_id,
  p.codigo,
  p.descripcion,
  m.nombre                                              as marca,
  f.nombre                                              as subfamilia,
  sum(ci.cantidad)                                      as unidades,
  round(sum(ci.importe), 2)                             as venta,
  round(sum(ci.cantidad * ci.costo_unitario), 2)        as costo,
  round(
    coalesce(sum(ci.importe) filter (where ci.costo_unitario > 0), 0)
    - sum(ci.cantidad * ci.costo_unitario), 2)          as margen,
  count(distinct c.cliente_id)                          as clientes,
  max(c.fecha_emision)                                  as ultima_venta,
  case
    when sum(ci.cantidad * ci.costo_unitario) > 0 then round(
      (coalesce(sum(ci.importe) filter (where ci.costo_unitario > 0), 0)
       - sum(ci.cantidad * ci.costo_unitario))
      / sum(ci.cantidad * ci.costo_unitario) * 100, 2)
    else 0
  end                                                   as margen_pct,
  coalesce(round(sum(ci.importe) filter (where ci.costo_unitario > 0), 2), 0)
                                                        as venta_con_costo
from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  join productos p on p.id = ci.producto_id
  join marcas m on m.id = p.marca_id
  join subfamilias f on f.id = p.subfamilia_id
where c.estado <> 'anulado'
  and c.tipo = any (array['factura'::tipo_documento, 'boleta'::tipo_documento])
group by ci.producto_id, p.codigo, p.descripcion, m.nombre, f.nombre;

comment on view v_top_productos is
  'Ranking de productos por venta. El margen solo cuenta las líneas con costo unitario registrado.';

do $$
declare
  v_mal int;
begin
  -- Ningún periodo ni producto puede dar un margen igual o mayor que su venta
  -- teniendo ventas sin costo. Es la forma corta del fallo.
  select count(*) into v_mal from v_ventas_mensuales
   where venta_con_costo < venta_neta and margen >= venta_neta;
  if v_mal > 0 then
    raise exception 'v_ventas_mensuales: % meses con el margen alcanzando a la venta', v_mal;
  end if;

  select count(*) into v_mal from v_top_productos
   where venta_con_costo < venta and margen >= venta;
  if v_mal > 0 then
    raise exception 'v_top_productos: % productos con el margen alcanzando a la venta', v_mal;
  end if;

  raise notice 'Las dos vistas de margen dejan de contar como ganancia lo que no tiene costo.';
end $$;
