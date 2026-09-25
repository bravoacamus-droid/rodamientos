-- ###########################################################################
-- 094 · LOS GASTOS DE IMPORTACIÓN SE COBRABAN DOS VECES — OTRA VEZ
-- ###########################################################################
--
-- Encontrado el 25/09 preparando el rediseño de compras, mirando de dónde
-- saca la recepción los gastos que prorratea.
--
-- ---------------------------------------------------------------------------
-- El fallo, que ya se había arreglado una vez
-- ---------------------------------------------------------------------------
-- La **022** lo explicó en su cabecera y lo arregló: el factor de gastos se
-- calculaba contra el valor de ESTA RECEPCIÓN, y con dos recepciones parciales
-- los gastos se cobraban dos veces.
--
--   10 unidades a 25 = 250, con 50 de gastos.
--     · en una entrega:  base 250, factor 1,20 → 10 u a 30 = 300   ✔
--     · en dos de 5:     base 125, factor 1,40 →  5 u a 35 = 175
--                        base 125, factor 1,40 →  5 u a 35 = 175
--                                                  total = 350      ✘
--
-- La corrección era que el denominador fuera la COMPRA entera
-- (`compra_items`), no la entrega (`recepcion_items`).
--
-- **Y la 042 lo deshizo.** Para meter la conversión de soles a dólares
-- reescribió `recepcionar_mercaderia` entera, partiendo de una versión
-- anterior a la 022, y volvió a poner `recepcion_items`. Comprobado contra la
-- definición VIVA el 25/09 — no contra el fichero, que ya se sabe que en este
-- proyecto el fichero no manda (§4 de CLAUDE.md).
--
-- Es la trampa de siempre con `create or replace`: se reescribe la función
-- entera, y todo lo que otra migración le había añadido desaparece sin ruido
-- si no se parte de la última. Aquí se perdió un arreglo de costo.
--
-- ---------------------------------------------------------------------------
-- Por qué nadie lo vio
-- ---------------------------------------------------------------------------
-- Porque con UNA sola recepción da exactamente lo mismo: el valor de la
-- entrega ES el valor de la compra. La prueba del ciclo de compras del mismo
-- 25/09 recibió cada compra de una vez y cuadró al céntimo. El kardex tampoco
-- lo delata: cada recepción cuadra consigo misma, y lo único que pasa es que
-- el costo promedio queda inflado. Se vende más caro o se cree ganar menos, y
-- nadie sabe por qué.
--
-- Y es justo el caso de Willy: una importación que llega en partes.
--
-- ---------------------------------------------------------------------------
-- Cómo se arregla
-- ---------------------------------------------------------------------------
-- Parcheando la definición VIVA —la de la 042, con su conversión de moneda—
-- y no reescribiéndola: reescribirla es exactamente cómo se perdió la 022.
-- ###########################################################################

do $$
declare
  v_def   text;
  v_viejo constant text :=
$v$    select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
      from recepcion_items ri where ri.recepcion_id = v_recepcion;$v$;
  v_nuevo constant text :=
$v$    -- EL DENOMINADOR ES LA COMPRA ENTERA, no esta entrega (022, perdido en
    -- la 042, repuesto en la 094). Con el valor de la entrega, dos recepciones
    -- parciales cobraban los gastos dos veces.
    select coalesce(sum(ci.cantidad * ci.costo_unitario), 0) into v_base
      from compra_items ci where ci.compra_id = v_compra;

    -- Compra sin importe: se cae al valor de la entrega, que es lo único que
    -- hay.
    if v_base = 0 then
      select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
        from recepcion_items ri where ri.recepcion_id = v_recepcion;
    end if;$v$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recepcionar_mercaderia';

  if v_def is null then
    raise exception '094: no existe recepcionar_mercaderia';
  end if;

  -- Los .sql del repo están en CRLF y la definición guardada trae los
  -- retornos de carro dentro (lección de la 091).
  v_def := replace(v_def, chr(13), '');

  if position('from compra_items ci where ci.compra_id = v_compra' in v_def) > 0 then
    raise notice '094: la recepción ya prorratea contra la compra entera; no se toca.';
  elsif position(v_viejo in v_def) = 0 then
    raise exception
      '094: la base del prorrateo no es la esperada. Míralo a mano: %',
      substring(v_def from greatest(position('into v_base' in v_def) - 250, 1) for 360);
  else
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end $$;

-- ###########################################################################
-- Centinela · UNA IMPORTACIÓN RECIBIDA EN DOS ENTREGAS, DE VERDAD
-- ###########################################################################
-- Es el único caso que delata el fallo, así que es el que se ejecuta. Compra
-- de 10 a 25 con 50 de gastos, recibida en dos de 5. Tiene que dar 300 y cada
-- unidad a 30. Con el fallo daba 350.
--
-- Todo dentro de un bloque que sale por excepción: compra, recepciones,
-- movimientos, stock y correlativos se deshacen solos (regla de la 091).
do $$
declare
  v_perfil  uuid;
  v_prov    uuid;
  v_prod    uuid;
  v_compra  uuid;
  v_antes   numeric := 0;
  v_despues numeric := 0;
  v_costos  numeric[];
  v_fallo   text;
begin
  select p.id into v_perfil
    from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.escribir
   where p.activo and pr.tabla = 'recepciones'
     and exists (select 1 from permisos_rol x
                  where x.rol = p.rol and x.tabla = 'compras' and x.escribir)
   limit 1;
  select id into v_prov from proveedores limit 1;
  -- Un producto SIN stock ni movimientos: así el valorizado de antes es cero
  -- y la cuenta no depende de lo que haya en el almacén.
  select p.id into v_prod
    from productos p
   where not exists (select 1 from movimientos_inventario m where m.producto_id = p.id)
   limit 1;

  if v_perfil is null or v_prov is null or v_prod is null then
    raise notice '094: faltan datos para el centinela; no corre.';
    return;
  end if;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);

    select coalesce(valorizado, 0) into v_antes from stock where producto_id = v_prod;
    v_antes := coalesce(v_antes, 0);

    v_compra := (public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov,
      'tipo', 'importacion',
      'moneda', 'USD',
      'afecto_igv', true,
      'gastos_importacion', 50,
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cantidad', 10, 'costo_unitario', 25))
    )) ->> 'id')::uuid;

    -- Dos entregas de 5.
    for i in 1..2 loop
      perform public.recepcionar_mercaderia(jsonb_build_object(
        'compra_id', v_compra,
        'proveedor_id', v_prov,
        'items', jsonb_build_array(jsonb_build_object(
          'producto_id', v_prod, 'cantidad', 5, 'costo_unitario', 25))
      ));
    end loop;

    select valorizado into v_despues from stock where producto_id = v_prod;
    select array_agg(costo_unitario order by creado_en) into v_costos
      from movimientos_inventario
     where producto_id = v_prod and referencia_tipo = 'recepcion';

    raise exception using message = '__094_DESHACER__';
  exception when others then
    if sqlerrm <> '__094_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  if v_fallo is not null then
    raise exception '094: el centinela se rompió: %', v_fallo;
  end if;

  if round(v_despues - v_antes, 2) <> 300 then
    raise exception
      '094: dos entregas de 5 valorizaron % en vez de 300. Los gastos se siguen cobrando dos veces. Costos: %',
      round(v_despues - v_antes, 2), v_costos;
  end if;

  if v_costos is null or array_length(v_costos, 1) <> 2
     or round(v_costos[1], 2) <> 30 or round(v_costos[2], 2) <> 30 then
    raise exception '094: cada unidad tenía que costar 30 en las dos entregas; salió %', v_costos;
  end if;

  raise notice '094: dos entregas de 5, cada una a 30.00, total 300. Los gastos entran una vez.';
end $$;
