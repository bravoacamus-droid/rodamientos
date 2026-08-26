-- ###########################################################################
-- 022 · IMPORTACIONES: los gastos se cobraban dos veces
-- ###########################################################################
--
-- Dos cosas. La primera es un error de costo.
--
-- ---------------------------------------------------------------------------
-- 1 · El prorrateo de gastos se aplicaba ENTERO en cada recepción parcial
-- ---------------------------------------------------------------------------
--
-- `recepcionar_mercaderia()` calculaba el factor así:
--
--     v_gastos := compras.gastos_importacion            -- TODO el gasto
--     v_base   := sum(cantidad * costo) DE ESTA RECEPCIÓN
--     v_factor := 1 + v_gastos / v_base
--
-- Con una sola recepción sale bien. Con dos parciales, no:
--
--   Compra de 100 unidades a 10 = 1.000, con 200 de gastos.
--     · en una entrega:  base 1.000, factor 1,2  → 100 u a 12 = 1.200  ✔
--     · en dos de 50:    base   500, factor 1,4  →  50 u a 14 =   700
--                        base   500, factor 1,4  →  50 u a 14 =   700
--                                                        total = 1.400  ✘
--
-- Los 200 de gastos se cobraron dos veces. Y el kardex no lo delata: cada
-- recepción cuadra consigo misma, la invariante `stock.valorizado = kardex` se
-- mantiene, y lo único que pasa es que el costo promedio de esos productos
-- queda inflado. O sea, se vende más caro de lo necesario o se cree que se
-- está ganando menos de lo que se gana, y nadie sabe por qué.
--
-- El constructor de compras ya decía lo correcto: enseña
-- `costoEnAlmacen = subtotal + gastos` sobre la compra ENTERA, o sea que los
-- gastos entran una vez. La pantalla y la base discrepaban.
--
-- La corrección es más simple que el error: el denominador es el valor de la
-- COMPRA, no el de la entrega. Así cada unidad carga su parte proporcional de
-- los gastos, llegue en un envío o en cuatro, y el factor sale idéntico en
-- todas las entregas de la misma compra.
--
--     v_factor := 1 + gastos / valor_total_de_la_compra
--
-- Cuando la compra llega de una sola vez, el resultado es EXACTAMENTE el
-- mismo que antes: valor de la entrega = valor de la compra. Así que esto no
-- reescribe la historia de lo ya recibido, solo arregla lo que venga.
--
-- ---------------------------------------------------------------------------
-- 2 · La tabla `gastos_importacion` no la usaba nadie
-- ---------------------------------------------------------------------------
--
-- Existe desde la 002 con (concepto, monto, documento) y estaba vacía: el
-- constructor de compras guarda un ÚNICO número en `compras.gastos_importacion`
-- y eso es lo que lee la recepción. Detallar «flete 120, aduana 60, seguro 20»
-- sin que el detalle mande sería tener dos verdades.
--
-- Se ata con un disparador: la columna pasa a ser la SUMA de las filas en
-- cuanto haya al menos una. Quien no detalle sigue tecleando el total como
-- hasta ahora; quien detalle, manda el detalle.
--
-- Y un cerrojo: no se tocan los gastos de una compra que ya recibió
-- mercadería. El costo ya entró al kardex, y cambiar el número después dejaría
-- la pantalla diciendo una cosa y el kardex otra. Se corrige con un ajuste de
-- inventario, que es la misma regla que ya tiene la anulación de compras.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La recepción, con el prorrateo corregido
-- ---------------------------------------------------------------------------
create or replace function public.recepcionar_mercaderia(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_recepcion uuid;
  v_numero    text;
  v_compra    uuid := nullif(p_datos ->> 'compra_id','')::uuid;
  v_items     jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_gastos    numeric(14,2) := 0;
  v_base      numeric(14,2) := 0;
  v_factor    numeric(12,6) := 1;
begin
  if not public.puede_escribir('recepciones') then
    raise exception 'Tu rol no puede recepcionar mercadería'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La recepción no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  v_numero := public.siguiente_numero_interno('recepcion');

  insert into recepciones (numero, compra_id, proveedor_id, fecha, guia_proveedor, factura_proveedor, recibido_por, observaciones)
  values (
    v_numero, v_compra,
    coalesce(nullif(p_datos ->> 'proveedor_id','')::uuid, (select c.proveedor_id from compras c where c.id = v_compra)),
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    nullif(p_datos ->> 'guia_proveedor',''),
    nullif(p_datos ->> 'factura_proveedor',''),
    auth.uid(),
    nullif(p_datos ->> 'observaciones','')
  ) returning id into v_recepcion;

  insert into recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario)
  select v_recepcion,
         (i ->> 'producto_id')::uuid,
         (i ->> 'cantidad')::numeric,
         coalesce(nullif(i ->> 'costo_unitario','')::numeric, 0)
  from jsonb_array_elements(v_items) i;

  -- Gastos de importación: reparto SIMPLE por valor, no landed cost (§2.11).
  -- Willy compra por DHL; el courier y el despacho express se distribuyen
  -- proporcionalmente al valor de la línea y con eso basta.
  if v_compra is not null then
    select coalesce(c.gastos_importacion, 0) into v_gastos from compras c where c.id = v_compra;

    -- EL DENOMINADOR ES LA COMPRA ENTERA, no esta entrega. Ver la cabecera:
    -- con el valor de la entrega, dos recepciones parciales cobraban los
    -- gastos dos veces.
    select coalesce(sum(ci.cantidad * ci.costo_unitario), 0) into v_base
      from compra_items ci where ci.compra_id = v_compra;

    -- Recepción sin compra detrás, o compra sin importe: se cae al valor de
    -- la entrega, que es lo único que hay. Es el caso de la recepción suelta.
    if v_base = 0 then
      select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
        from recepcion_items ri where ri.recepcion_id = v_recepcion;
    end if;

    if v_gastos > 0 and v_base > 0 then
      v_factor := 1 + (v_gastos / v_base);
    end if;
  end if;

  -- UN solo llamado al kardex para toda la recepción.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
        'producto_id',       ri.producto_id,
        'tipo',              'ingreso',
        'cantidad',          ri.cantidad,
        'costo_unitario',    round(ri.costo_unitario * v_factor, 4),
        'referencia_tipo',   'recepcion',
        'referencia_id',     v_recepcion,
        'referencia_numero', v_numero,
        'motivo',            'Recepción de mercadería'
      ) order by ri.producto_id)
     from recepcion_items ri where ri.recepcion_id = v_recepcion)
  );

  -- Avance de la compra.
  if v_compra is not null then
    update compra_items ci
       set cantidad_recibida = least(ci.cantidad, ci.cantidad_recibida + ri.cantidad)
      from recepcion_items ri
     where ri.recepcion_id = v_recepcion
       and ci.compra_id = v_compra
       and ci.producto_id = ri.producto_id;

    update compras c
       set estado = case
             when not exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida < x.cantidad)
               then 'recibida'::estado_compra
             when exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida > 0)
               then 'recibida_parcial'::estado_compra
             else c.estado end
     where c.id = v_compra;
  end if;

  return jsonb_build_object('id', v_recepcion, 'numero', v_numero,
                            'items', jsonb_array_length(v_items), 'factor_gastos', v_factor);
end $$;

comment on function public.recepcionar_mercaderia(jsonb) is
  'Única puerta al ingreso de stock. El factor de gastos se calcula sobre el valor de la COMPRA, no de la entrega: con el valor de la entrega, dos recepciones parciales cobraban los gastos completos cada una (022).';

-- ---------------------------------------------------------------------------
-- 2. El detalle de gastos manda sobre el total
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_gastos_importacion()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_compra uuid := coalesce(new.compra_id, old.compra_id);
  v_estado estado_compra;
  v_suma   numeric(14,2);
begin
  select c.estado into v_estado from compras c where c.id = v_compra;

  -- El cerrojo. Una vez que entró mercadería, el costo ya está en el kardex y
  -- cambiar el gasto dejaría la pantalla y el kardex diciendo cosas distintas.
  -- Es la misma regla que la anulación de compras: lo que ya se movió se
  -- corrige con un ajuste de inventario, no reescribiendo el documento.
  if v_estado is distinct from 'registrada' then
    raise exception
      'La compra ya no está en «registrada» (está en %). Los gastos de importación se congelan en cuanto entra mercadería: corrige con un ajuste de inventario.',
      coalesce(v_estado::text, 'ninguna')
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(g.monto), 0) into v_suma
    from gastos_importacion g where g.compra_id = v_compra;

  update compras set gastos_importacion = v_suma, actualizado_en = now()
   where id = v_compra;

  return null;  -- AFTER trigger: el valor de retorno se ignora.
end $$;

comment on function public.sincronizar_gastos_importacion() is
  'Mantiene compras.gastos_importacion = suma del detalle. Quien no detalla sigue tecleando el total; quien detalla, manda el detalle. Se niega si la compra ya recibió mercadería.';

drop trigger if exists trg_gastos_importacion on gastos_importacion;
create trigger trg_gastos_importacion
  after insert or update or delete on gastos_importacion
  for each row execute function public.sincronizar_gastos_importacion();

-- Es una función de disparador: PostgREST no la expone porque devuelve
-- `trigger`, pero se cierra igual. La superficie que no existe no hay que
-- auditarla (misma razón que en la 012).
revoke execute on function public.sincronizar_gastos_importacion() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_gastos numeric := 200;
  v_total  numeric := 1000;
  v_mitad  numeric := 500;
  v_viejo  numeric;
  v_nuevo  numeric;
begin
  -- El caso de la cabecera, con números: dos entregas de media compra.
  v_viejo := 2 * (v_mitad * (1 + v_gastos / v_mitad));   -- 1.400 · lo que hacía
  v_nuevo := 2 * (v_mitad * (1 + v_gastos / v_total));   -- 1.200 · lo que hace

  if v_viejo <> v_total + 2 * v_gastos then
    raise exception 'La aritmética del ejemplo no reproduce el error: %', v_viejo;
  end if;
  if v_nuevo <> v_total + v_gastos then
    raise exception 'La corrección no da el total esperado: %', v_nuevo;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_gastos_importacion' and not tgisinternal
  ) then
    raise exception 'No quedó instalado el disparador de gastos de importación';
  end if;

  if has_function_privilege('authenticated', 'public.sincronizar_gastos_importacion()', 'EXECUTE') then
    raise exception 'La función de disparador quedó abierta a authenticated';
  end if;

  raise notice 'Importaciones: prorrateo sobre la compra entera y detalle de gastos atado al total.';
end $$;
