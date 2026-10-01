-- ###########################################################################
-- 097 · EL FLETE AÉREO SE REPARTE POR PESO, NO POR VALOR
-- ###########################################################################
--
-- Willy mandó el 01/10 la hoja con la que calcula una importación aérea (un
-- pedido real: 29 rodamientos para 6 clientes) y contestó por qué la hace así
-- (§AP). Su fórmula es:
--
--     costo puesto en Lima = FOB + ($ de DHL ÷ kg del envío) × peso unitario
--
-- *«El costo de DHL que me cotiza mi proveedor en origen lo divido entre el
-- peso total calculado y me sale un factor $/kg, eso me sirve para determinar
-- los precios unitarios de cada ítem acá en Lima»*.
--
-- Y tiene razón: DHL cobra por kilo. El ERP, en cambio, repartía TODO gasto
-- por valor —un solo factor `1 + gastos ÷ valor de la compra`, desde la 022—,
-- y con su propio pedido eso da:
--
--     6312 2Z/C3     FOB  9.43  1.73 kg   Willy 26.99   ERP 19.75  (−27 %)
--     NKIB 5902 XL   FOB  3.77  0.05 kg   Willy  4.29   ERP  7.90
--     HK 1012        FOB  0.39  0.005 kg  Willy  0.44   ERP  0.82
--
-- El pesado salía más barato de lo que costó y el liviano casi al doble. El
-- margen y el precio mínimo, mal en los dos.
--
-- ---------------------------------------------------------------------------
-- La solución: cada GASTO dice cómo se reparte
-- ---------------------------------------------------------------------------
-- No toda la importación va por peso. El desaduanaje —*«lo determinan en
-- función al valor de la factura (FOB) y también al peso»*— es sobre todo
-- impuestos, que van por valor. Así que no es la compra la que elige, es cada
-- gasto: `gastos_importacion.reparto` = 'valor' | 'peso'. La pantalla propone
-- (courier y flete → peso; lo demás → valor) y quien registra puede cambiarlo.
--
-- La recepción reparte cada bolsa por su base:
--
--     unidad = costo × (1 + gastos_por_valor ÷ valor_compra)
--            + peso_unitario × (gastos_por_peso ÷ kg_compra)
--
-- Las dos bases son la COMPRA ENTERA, no la entrega: la lección de la 022,
-- perdida en la 042 y repuesta en la 094.
--
-- ---------------------------------------------------------------------------
-- Si falta un peso, todo por valor
-- ---------------------------------------------------------------------------
-- Repartir por kilo con una pieza sin peso le regalaría el flete a esa pieza y
-- se lo cobraría a las demás. Antes que un número mal repartido sin que nadie
-- lo vea, la base lo reparte todo por valor —como hasta hoy— y lo devuelve en
-- el resultado. La pantalla lo avisa ANTES de guardar y deja escribir el peso.
--
-- ---------------------------------------------------------------------------
-- El peso viaja con la compra
-- ---------------------------------------------------------------------------
-- `compra_items.peso_kg`: el que se usó al comprar. Y si se escribe, se apunta
-- también en el producto, porque es un dato físico y casi ningún producto lo
-- tiene: cada compra aérea va llenando el catálogo. El de la compra es el que
-- manda al recibir; si es cero, se usa el del producto.
-- ###########################################################################

alter table public.gastos_importacion
  add column if not exists reparto text not null default 'valor';

alter table public.gastos_importacion drop constraint if exists gastos_reparto_valido;
alter table public.gastos_importacion add constraint gastos_reparto_valido
  check (reparto in ('valor', 'peso'));

comment on column public.gastos_importacion.reparto is
  'Cómo se reparte este gasto sobre el costo al recibir: valor (proporcional al importe de cada línea) o peso (proporcional a sus kg). 097.';

alter table public.compra_items
  add column if not exists peso_kg numeric(12,4) not null default 0;

alter table public.compra_items drop constraint if exists compra_item_peso_pos;
alter table public.compra_items add constraint compra_item_peso_pos check (peso_kg >= 0);

comment on column public.compra_items.peso_kg is
  'Peso por unidad con el que se compró (097). Reparte los gastos «por peso» al recibir; si es 0, se usa productos.peso_kg.';

-- ###########################################################################
-- `crear_compra` guarda el peso de cada línea y el reparto de cada gasto
-- ###########################################################################
-- Parche sobre la definición VIVA (la de la 095), con columnas nuevas al
-- FINAL de la lista y de los valores (lección de la 071, ver 091).
do $$
declare
  v_def text;
  v_items_cols_viejo constant text :=
    'insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)';
  v_items_cols_nuevo constant text :=
    'insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario, peso_kg)';
  v_items_vals_viejo constant text :=
$v$         coalesce(nullif(i.valor ->> 'costo_unitario','')::numeric, 0)
  from jsonb_array_elements(v_items) with ordinality as i(valor, orden);$v$;
  v_items_vals_nuevo constant text :=
$v$         coalesce(nullif(i.valor ->> 'costo_unitario','')::numeric, 0),
         greatest(coalesce(nullif(i.valor ->> 'peso_kg','')::numeric, 0), 0)
  from jsonb_array_elements(v_items) with ordinality as i(valor, orden);

  -- El peso que se escribe al comprar se apunta en el producto (097): es un
  -- dato físico, casi ningún producto lo tiene, y cada compra aérea va
  -- llenando el catálogo. Solo si se escribió: un cero no borra nada.
  update productos p
     set peso_kg = round(ci.peso_kg, 3)
    from compra_items ci
   where ci.compra_id = v_compra
     and ci.producto_id = p.id
     and ci.peso_kg > 0
     and p.peso_kg is distinct from round(ci.peso_kg, 3);$v$;
  v_gastos_cols_viejo constant text :=
    'insert into gastos_importacion (compra_id, concepto, monto)';
  v_gastos_cols_nuevo constant text :=
    'insert into gastos_importacion (compra_id, concepto, monto, reparto)';
  v_gastos_vals_viejo constant text :=
$v$         (g ->> 'monto')::numeric
    from jsonb_array_elements(coalesce(p_datos -> 'gastos', '[]'::jsonb)) g$v$;
  v_gastos_vals_nuevo constant text :=
$v$         (g ->> 'monto')::numeric,
         -- Cualquier cosa que no sea «peso» es «valor»: es lo de siempre.
         case when g ->> 'reparto' = 'peso' then 'peso' else 'valor' end
    from jsonb_array_elements(coalesce(p_datos -> 'gastos', '[]'::jsonb)) g$v$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'crear_compra';

  if v_def is null then
    raise exception '097: no existe crear_compra';
  end if;

  v_def := replace(v_def, chr(13), '');

  if position('reparto' in v_def) > 0 then
    raise notice '097: crear_compra ya conoce el reparto; no se toca.';
    return;
  end if;

  if position(v_items_cols_viejo in v_def) = 0 then
    raise exception '097: las columnas de compra_items no son las esperadas';
  end if;
  if position(v_items_vals_viejo in v_def) = 0 then
    raise exception '097: los valores de compra_items no son los esperados: %',
      substring(v_def from greatest(position('costo_unitario'',''''' in v_def) - 100, 1) for 300);
  end if;
  if position(v_gastos_cols_viejo in v_def) = 0 or position(v_gastos_vals_viejo in v_def) = 0 then
    raise exception '097: el insert de gastos no es el de la 095';
  end if;

  v_def := replace(v_def, v_items_cols_viejo, v_items_cols_nuevo);
  v_def := replace(v_def, v_items_vals_viejo, v_items_vals_nuevo);
  v_def := replace(v_def, v_gastos_cols_viejo, v_gastos_cols_nuevo);
  v_def := replace(v_def, v_gastos_vals_viejo, v_gastos_vals_nuevo);

  execute v_def;
end $$;

-- ###########################################################################
-- `recepcionar_mercaderia` reparte cada gasto por su base
-- ###########################################################################
-- Esta sí se reescribe entera: el cambio es el corazón del cálculo y un
-- parche de texto no se dejaría leer. Se parte de la definición VIVA (094),
-- copiada tal cual salvo el bloque de gastos y el costo que va al kardex. Lo
-- que la 042 se llevó por delante —el denominador de la compra entera— está.
create or replace function public.recepcionar_mercaderia(p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_recepcion   uuid;
  v_numero      text;
  v_compra      uuid := nullif(p_datos ->> 'compra_id','')::uuid;
  v_items       jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_gastos      numeric(14,2) := 0;
  v_base        numeric(14,2) := 0;
  v_factor      numeric(12,6) := 1;
  -- 097: la bolsa que va por kilo, sus kilos, y lo que toca a cada kilo.
  v_gasto_peso  numeric(14,2) := 0;
  v_kilos       numeric(16,4) := 0;
  v_falta_peso  boolean := false;
  v_por_kg      numeric(16,6) := 0;
  v_por_peso    boolean := false;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y recepcionar mercadería
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
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

  if v_compra is not null then
    -- El total de gastos sigue saliendo de la compra (022 lo mantiene igual a
    -- la suma del detalle). Así una compra vieja, con un solo número y sin
    -- detalle, se reparte por valor como siempre.
    select coalesce(c.gastos_importacion, 0) into v_gastos from compras c where c.id = v_compra;

    -- 097: lo que va por kilo.
    select coalesce(sum(g.monto), 0) into v_gasto_peso
      from gastos_importacion g
     where g.compra_id = v_compra and g.reparto = 'peso';

    if v_gasto_peso > 0 then
      -- Los kilos de la COMPRA ENTERA, con el peso con que se compró y, si
      -- no se escribió, el del producto.
      select coalesce(sum(ci.cantidad * coalesce(nullif(ci.peso_kg, 0), p.peso_kg, 0)), 0),
             coalesce(bool_or(coalesce(nullif(ci.peso_kg, 0), p.peso_kg, 0) = 0), false)
        into v_kilos, v_falta_peso
        from compra_items ci
        join productos p on p.id = ci.producto_id
       where ci.compra_id = v_compra;

      -- Una pieza sin peso: todo por valor, como hasta la 097. Repartir por
      -- kilo le regalaría el flete a esa pieza.
      if v_falta_peso or v_kilos <= 0 then
        v_gasto_peso := 0;
      else
        v_por_kg   := v_gasto_peso / v_kilos;
        v_por_peso := true;
      end if;
    end if;

    -- Lo demás va por valor. EL DENOMINADOR ES LA COMPRA ENTERA, no esta
    -- entrega (022, perdido en la 042, repuesto en la 094). Con el valor de
    -- la entrega, dos recepciones parciales cobraban los gastos dos veces.
    select coalesce(sum(ci.cantidad * ci.costo_unitario), 0) into v_base
      from compra_items ci where ci.compra_id = v_compra;

    -- Compra sin importe: se cae al valor de la entrega, que es lo único que
    -- hay.
    if v_base = 0 then
      select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
        from recepcion_items ri where ri.recepcion_id = v_recepcion;
    end if;
    if (v_gastos - v_gasto_peso) > 0 and v_base > 0 then
      v_factor := 1 + ((v_gastos - v_gasto_peso) / v_base);
    end if;
  end if;

  -- UN solo llamado al kardex para toda la recepción.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
        'producto_id',       ri.producto_id,
        'tipo',              'ingreso',
        'cantidad',          ri.cantidad,
        -- 097: lo de valor como factor, lo de peso como kilos × $/kg.
        'costo_unitario',    round(
                               ri.costo_unitario * v_factor
                               + v_por_kg * coalesce(
                                   nullif((select ci.peso_kg from compra_items ci
                                            where ci.compra_id = v_compra
                                              and ci.producto_id = ri.producto_id
                                            limit 1), 0),
                                   p.peso_kg, 0),
                             4),
        'referencia_tipo',   'recepcion',
        'referencia_id',     v_recepcion,
        'referencia_numero', v_numero,
        'motivo',            'Recepción de mercadería'
      ) order by ri.producto_id)
     from recepcion_items ri
     join productos p on p.id = ri.producto_id
     where ri.recepcion_id = v_recepcion)
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
                            'items', jsonb_array_length(v_items), 'factor_gastos', v_factor,
                            -- 097: para que la pantalla diga cómo se repartió.
                            'por_kg', v_por_kg, 'reparto_por_peso', v_por_peso,
                            'falta_peso', v_falta_peso);
end $function$;

-- ###########################################################################
-- Centinela · SE EJECUTA, Y SE DESHACE (regla de la 091)
-- ###########################################################################
--   1 · Aérea con dos piezas de 10, una de 1 kg y otra de 0.1 kg, courier 11
--       POR PESO y desaduanaje 4 POR VALOR:
--         pesada  = 10 + 10 × 4/20 + 1   × 11/1.1 = 10 + 2 + 10 = 22
--         liviana = 10 + 10 × 4/20 + 0.1 × 11/1.1 = 10 + 2 +  1 = 13
--       Y el peso escrito quedó apuntado en el producto.
--   2 · Lo mismo con una pieza SIN peso: todo por valor, 15 y 15.
--   3 · El reparto por defecto de un gasto sin decir nada es «valor».
do $$
declare
  v_perfil uuid; v_prov uuid;
  v_a uuid; v_b uuid; v_c uuid;
  v_c1 uuid; v_c2 uuid;
  v_costo_a numeric; v_costo_b numeric; v_costo_a2 numeric; v_costo_c numeric;
  v_peso_a numeric; v_def_reparto text; v_r jsonb;
  v_fallo text;
begin
  select p.id into v_perfil
    from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.escribir and pr.tabla = 'recepciones'
   where p.activo
     and exists (select 1 from permisos_rol x where x.rol = p.rol and x.tabla = 'compras' and x.escribir)
   limit 1;
  select id into v_prov from proveedores limit 1;
  -- Tres productos sin movimientos y SIN peso, para que el peso de la prueba
  -- sea el único que cuenta y el caso 2 de verdad no tenga peso.
  select coalesce(jsonb_agg(x.id), '[]'::jsonb) into v_r
    from (select p.id from productos p
           where not exists (select 1 from movimientos_inventario m where m.producto_id = p.id)
             and p.peso_kg = 0 and not p.es_kit
           limit 3) x;

  if v_perfil is null or v_prov is null or jsonb_array_length(v_r) < 3 then
    raise notice '097: faltan datos para el centinela; no corre.';
    return;
  end if;
  v_a := (v_r ->> 0)::uuid; v_b := (v_r ->> 1)::uuid; v_c := (v_r ->> 2)::uuid;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);

    -- 1 · Aérea: courier por peso, desaduanaje por valor.
    v_c1 := (public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov, 'tipo', 'importacion', 'via_importacion', 'aerea',
      'moneda', 'USD', 'afecto_igv', false,
      'gastos', jsonb_build_array(
        jsonb_build_object('concepto', 'Courier', 'monto', 11, 'reparto', 'peso'),
        jsonb_build_object('concepto', 'Desaduanaje', 'monto', 4, 'reparto', 'valor')),
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 10, 'peso_kg', 1),
        jsonb_build_object('producto_id', v_b, 'cantidad', 1, 'costo_unitario', 10, 'peso_kg', 0.1))
    )) ->> 'id')::uuid;

    select peso_kg into v_peso_a from productos where id = v_a;

    perform public.recepcionar_mercaderia(jsonb_build_object(
      'compra_id', v_c1, 'proveedor_id', v_prov,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 10),
        jsonb_build_object('producto_id', v_b, 'cantidad', 1, 'costo_unitario', 10))));

    select costo_unitario into v_costo_a from movimientos_inventario
     where producto_id = v_a and referencia_tipo = 'recepcion' order by creado_en desc limit 1;
    select costo_unitario into v_costo_b from movimientos_inventario
     where producto_id = v_b and referencia_tipo = 'recepcion' order by creado_en desc limit 1;

    -- 2 · La pieza C no tiene peso: todo por valor.
    v_c2 := (public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov, 'tipo', 'importacion', 'via_importacion', 'aerea',
      'moneda', 'USD', 'afecto_igv', false,
      'gastos', jsonb_build_array(
        jsonb_build_object('concepto', 'Courier', 'monto', 10, 'reparto', 'peso')),
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 10, 'peso_kg', 1),
        jsonb_build_object('producto_id', v_c, 'cantidad', 1, 'costo_unitario', 10))
    )) ->> 'id')::uuid;

    v_r := public.recepcionar_mercaderia(jsonb_build_object(
      'compra_id', v_c2, 'proveedor_id', v_prov,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 10),
        jsonb_build_object('producto_id', v_c, 'cantidad', 1, 'costo_unitario', 10))));

    -- Por la recepción, no por la hora: dentro de una transacción todos los
    -- movimientos llevan el mismo `creado_en`, y «el último» de A sería el
    -- de la prueba 1.
    select costo_unitario into v_costo_a2 from movimientos_inventario
     where producto_id = v_a and referencia_id = (v_r ->> 'id')::uuid;
    select costo_unitario into v_costo_c from movimientos_inventario
     where producto_id = v_c and referencia_id = (v_r ->> 'id')::uuid;

    -- 3 · Un gasto insertado sin reparto, en una compra SIN recibir: a una
    -- recibida la base ya no deja añadirle gastos (022), y eso está bien.
    v_c2 := (public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov, 'tipo', 'importacion', 'via_importacion', 'aerea',
      'moneda', 'USD', 'afecto_igv', false,
      'items', jsonb_build_array(
        jsonb_build_object('producto_id', v_c, 'cantidad', 1, 'costo_unitario', 1))
    )) ->> 'id')::uuid;
    insert into gastos_importacion (compra_id, concepto, monto)
    values (v_c2, 'Sin decir', 1) returning reparto into v_def_reparto;

    raise exception using message = '__097_DESHACER__';
  exception when others then
    if sqlerrm <> '__097_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  if v_fallo is not null then
    raise exception '097: el centinela se rompió: %', v_fallo;
  end if;

  if round(v_costo_a, 2) <> 22 or round(v_costo_b, 2) <> 13 then
    raise exception '097: por peso salieron % y % (tenían que ser 22 y 13)', v_costo_a, v_costo_b;
  end if;
  if v_peso_a <> 1 then
    raise exception '097: el peso escrito al comprar no llegó al producto (quedó %)', v_peso_a;
  end if;
  if round(v_costo_a2, 2) <> 15 or round(v_costo_c, 2) <> 15 then
    raise exception '097: con una pieza sin peso salieron % y % (tenían que ser 15 y 15)', v_costo_a2, v_costo_c;
  end if;
  if (v_r ->> 'falta_peso')::boolean is not true or (v_r ->> 'reparto_por_peso')::boolean then
    raise exception '097: la recepción sin peso no lo dijo: %', v_r;
  end if;
  if v_def_reparto <> 'valor' then
    raise exception '097: un gasto sin reparto quedó como «%»', v_def_reparto;
  end if;

  raise notice '097: por peso 22 y 13; sin peso, todo por valor 15 y 15; el peso llegó al producto; por defecto «valor».';
end $$;
