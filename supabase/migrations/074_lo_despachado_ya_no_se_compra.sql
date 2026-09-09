-- ###########################################################################
-- 074 · LO QUE YA SALIÓ CON GUÍA NO HAY QUE VOLVER A COMPRARLO
-- ###########################################################################
--
-- Luis, 09/09:
--
--   *«Hay cotizaciones que ya están aprobadas, ya está comprado, hasta
--   facturado, y cuando entro a ver me dice que tengo que comprar. […] Una vez
--   que ya está hecha la guía se separa el stock de ese pedido hasta terminar
--   todo el flujo. Ya está hecho todo, no es necesario que me marque de nuevo
--   que tengo que comprar si ya salió ese pedido.»*
--
-- Tenía razón, y el caso estaba delante: **COT1-000006 tiene la guía
-- T001-00000001 emitida** —la mercadería salió del almacén— y la bandeja decía:
--
--     GE-112     comprometido 1 · atendido 0 · stock 0 · FALTA 1
--     6309       comprometido 1 · atendido 0 · stock 0 · FALTA 1
--     10X4B-AL   comprometido 1 · atendido 0 · stock 0 · FALTA 1
--
-- Le estaba diciendo a Willy que comprara lo que acababa de entregar.
--
-- ---------------------------------------------------------------------------
-- Por qué pasaba
-- ---------------------------------------------------------------------------
-- La vista medía el avance de una línea con `cantidad_atendida`, que sube al
-- **facturar**. Pero el stock lo mueve la **guía**, al emitirse (`emitir_guia`
-- registra la salida). Entre esos dos momentos —y pueden pasar días, porque
-- Willy factura contra la guía sellada por el cliente— el pedido queda así:
--
--   · lo comprometido sigue entero, porque no se ha facturado nada;
--   · el stock ya bajó, porque la mercadería salió;
--   · y `falta = comprometido − stock` da **todo el pedido**.
--
-- Es decir, cuanto más avanzaba el pedido, más fuerte pedía comprarlo. Y no es
-- un caso raro: es EL flujo, porque en este negocio la guía va siempre antes
-- que la factura.
--
-- ---------------------------------------------------------------------------
-- El arreglo: el avance es el MÁXIMO, no la suma
-- ---------------------------------------------------------------------------
-- Una línea puede avanzar por dos caminos —salir con guía o facturarse— y hay
-- que contar los dos sin contarlos dos veces:
--
--     avance = greatest(cantidad_atendida, despachado_con_guia)
--
-- Sumarlos sería el error opuesto: al facturar lo que ya se despachó, la línea
-- descontaría el doble y el pedido desaparecería antes de tiempo.
--
-- El máximo es correcto en los tres casos reales:
--
--   · despachado 3, facturado 0  → 3 (salió, no hay que comprarlo)
--   · despachado 3, facturado 3  → 3 (y no 6)
--   · despachado 0, facturado 3  → 3 (mostrador: se factura y descarga a la vez)
--
-- Solo cuentan las guías **emitidas**. Un borrador no ha sacado nada del
-- almacén —`emitir_guia` es quien registra el movimiento— y una anulada lo
-- devolvió.
--
-- ---------------------------------------------------------------------------
-- Qué NO se rompe
-- ---------------------------------------------------------------------------
-- Facturar sigue igual: `cotizacionesFacturables` lee `cotizaciones` y sus
-- líneas, no esta vista. Un pedido despachado y sin facturar sale de la
-- bandeja de compras y de «Listos para entregar» —que es lo correcto, ya no
-- hay nada que comprar ni que entregar— y sigue estando en Facturación, que es
-- lo único que le queda por hacer.
-- ###########################################################################

set local search_path = public, extensions;

create or replace view v_comprometido
with (security_invoker = true) as
select
  ci.producto_id,
  ci.cotizacion_id,
  ci.id                      as item_id,
  q.numero                   as cotizacion,
  q.fecha,
  q.cliente_id,
  cl.razon_social            as cliente,
  ci.codigo,
  ci.descripcion,
  ci.marca,
  ci.disponibilidad,
  coalesce(ci.dias_entrega, public.dias_por_defecto(ci.disponibilidad)) as dias_entrega,
  ci.cantidad                as cotizado,
  -- Lo confirmado menos lo que ya avanzó, por el camino que fuera (074).
  --
  -- El `::numeric(14,2)` no es cosmético: `create or replace view` se niega a
  -- cambiarle el tipo a una columna que ya existía, y la resta de dos
  -- `numeric(14,2)` da un `numeric` a secas.
  (ci.cantidad_aprobada - greatest(ci.cantidad_atendida, coalesce(d.despachado, 0)))::numeric(14,2) as comprometido,
  ci.costo_unitario          as costo_referencia,
  coalesce(s.cantidad, 0)    as stock,
  greatest(
    ci.cantidad_aprobada
      - greatest(ci.cantidad_atendida, coalesce(d.despachado, 0))
      - coalesce(s.cantidad, 0),
    0
  ) as falta,
  -- Al final, y no al lado de `comprometido`, porque `create or replace`
  -- tampoco deja reordenar columnas: solo añadir detrás.
  ci.cantidad_atendida       as atendido,
  -- Nuevo en la 074, y también al final por lo mismo.
  coalesce(d.despachado, 0)::numeric(14,2) as despachado
from cotizacion_items ci
join cotizaciones q on q.id = ci.cotizacion_id
join clientes cl    on cl.id = q.cliente_id
left join stock s   on s.producto_id = ci.producto_id
/*
  Lo que ya salió con guía, por línea de cotización.

  `left join lateral` y no un `sum()` con `group by`: la vista devuelve una
  fila por línea de cotización, y agrupar aquí obligaría a meter en el
  `group by` las quince columnas de arriba.
*/
left join lateral (
  select coalesce(sum(gi.cantidad), 0) as despachado
    from guia_items gi
    join guias_remision g on g.id = gi.guia_id
   where gi.cotizacion_item_id = ci.id
     -- Solo las emitidas: el borrador no ha movido stock y la anulada lo
     -- devolvió.
     and g.estado = 'emitida'
) d on true
where q.estado = 'aprobada'
  and ci.producto_id is not null
  and coalesce(ci.cantidad_aprobada, 0)
        - greatest(ci.cantidad_atendida, coalesce(d.despachado, 0)) > 0;

comment on view v_comprometido is
  'Líneas confirmadas que siguen pendientes —descontando lo facturado Y lo ya despachado con guía— con lo que falta contra el stock. Es de donde sale la bandeja «Por comprar» y «Listos para entregar». Desde la 074 el avance es el MÁXIMO de lo atendido y lo despachado: sumarlos descontaría dos veces la misma mercadería, y mirar solo lo atendido mandaba a comprar de nuevo un pedido que ya había salido con guía.';

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Con el caso que lo destapó: una cotización aprobada cuya guía está emitida
-- no puede seguir pidiendo compra de lo que ya salió.
do $$
declare
  v_malo int;
begin
  /*
    Se comprueba la COLUMNA, no el texto de la definición.

    El primer intento buscaba `greatest` dentro de `pg_get_viewdef`, y falló:
    Postgres no guarda el SQL que uno escribe, lo guarda normalizado —entre
    otras cosas, en mayúsculas—. Un centinela que depende de cómo se escribió
    el SQL es un centinela que revienta sin que nada esté roto.
  */
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'v_comprometido'
       and column_name = 'despachado'
  ) then
    raise exception 'v_comprometido perdió la columna despachado: volvería a mandar a comprar lo ya entregado';
  end if;

  /*
    Ninguna línea despachada del todo puede seguir en la vista.

    Se comprueba contra los datos, no contra el texto de la definición: es la
    diferencia entre «el SQL menciona guia_items» y «el resultado es correcto».
  */
  select count(*) into v_malo
    from cotizacion_items ci
    join cotizaciones q on q.id = ci.cotizacion_id
    join lateral (
      select coalesce(sum(gi.cantidad), 0) as despachado
        from guia_items gi
        join guias_remision g on g.id = gi.guia_id
       where gi.cotizacion_item_id = ci.id and g.estado = 'emitida'
    ) d on true
   where q.estado = 'aprobada'
     and d.despachado >= coalesce(ci.cantidad_aprobada, 0)
     and exists (select 1 from v_comprometido v where v.item_id = ci.id);

  if v_malo > 0 then
    raise exception '% líneas ya despachadas siguen pidiendo compra', v_malo;
  end if;
end $$;
