-- ###########################################################################
-- 095 · COMPRAS: IMPORTACIÓN AÉREA O MARÍTIMA, Y LOS GASTOS DETALLADOS
-- ###########################################################################
--
-- Willy, 24/09 (§AO.4). Pidió partir compras en tres —local, aérea y
-- marítima— porque cada una lleva gastos distintos, y todos tienen que entrar
-- al costo: *«yo quiero registrar todos los gastos que he incurrido para que
-- me llegue esa mercadería acá, para así poder establecer cuál es mi costo
-- real puesto acá»*.
--
-- ---------------------------------------------------------------------------
-- Tres MODALIDADES, pero dos TIPOS
-- ---------------------------------------------------------------------------
-- No se añade un tercer valor a `tipo_compra`. Se añade la VÍA a la
-- importación, que es como lo dijo él mismo (32:28): *«compra local, compra
-- importación, y la importación se subdivide en aéreo y marítimo»*.
--
-- Y no es solo fidelidad a sus palabras: todo lo que ya cuelga de
-- `tipo = 'importacion'` —el módulo de importaciones, el tránsito, los
-- avisos de llegada— sigue funcionando sin tocarlo. Un tercer valor en el enum
-- habría obligado a revisar cada `where tipo = 'importacion'` del proyecto, y
-- el que se olvidara dejaría las marítimas fuera sin que nada avisara.
--
-- ---------------------------------------------------------------------------
-- Los gastos, detallados y en las tres
-- ---------------------------------------------------------------------------
--   · Local:     el transporte. *«Se le puede poner un gasto de transporte
--                también, porque es un gasto al final»*.
--   · Aérea:     el courier, y el desaduanaje que DHL cobra aparte.
--   · Marítima:  flete, aduana, ajuste de valor, almacenaje, levante,
--                agente, traslado. *«Hay un montón de cositas»*.
--
-- La tabla ya existía —`gastos_importacion`, concepto libre, desde la 002— y
-- la 022 ya la ató con un disparador que suma el detalle en
-- `compras.gastos_importacion`, que es lo que prorratea la recepción. Lo único
-- que faltaba era que el ALTA de la compra supiera escribir filas: pedía un
-- solo número. La pieza estaba, el camino no.
--
-- Por eso esta migración no toca el prorrateo ni el disparador: solo enseña a
-- `crear_compra` la vía y el detalle. El nombre de la columna —«gastos de
-- importación»— se queda aunque ahora también lleve el transporte de una
-- compra local: renombrarla toca vistas, RPC y tipos por un adjetivo.
-- ###########################################################################

alter table public.compras
  add column if not exists via_importacion text;

-- La vía solo tiene sentido en una importación. Una compra local con vía
-- sería un dato que no significa nada y que alguna pantalla acabaría
-- enseñando.
alter table public.compras drop constraint if exists compras_via_valida;
alter table public.compras add constraint compras_via_valida check (
  via_importacion is null
  or (tipo = 'importacion' and via_importacion in ('aerea', 'maritima'))
);

comment on column public.compras.via_importacion is
  'aerea | maritima, solo en importaciones (095). Null en local, y en las importaciones anteriores a la 095, que no la guardaban.';

-- ###########################################################################
-- `crear_compra` aprende la vía y el detalle de gastos
-- ###########################################################################
-- Parcheando la definición VIVA (la de la 044, con su moneda), no
-- reescribiéndola: reescribir es como la 042 se llevó por delante el arreglo
-- de la 022 (ver 094).
--
-- La columna nueva va AL FINAL de la lista de columnas Y al final de la de
-- valores. Es la lección de la 071, que puso la columna al final y el valor en
-- medio, y `estado` recibió un booleano durante seis días (ver 091).
do $$
declare
  v_def text;
  v_cols_viejo constant text := 'moneda, tipo_cambio' || chr(10) || '  ) values (';
  v_cols_nuevo constant text := 'moneda, tipo_cambio, via_importacion' || chr(10) || '  ) values (';
  v_vals_viejo constant text := '    v_tc' || chr(10) || '  ) returning id into v_compra;';
  v_vals_nuevo constant text :=
    '    v_tc,' || chr(10) ||
    '    -- La vía solo si es importación: en local se descarta aunque llegue.' || chr(10) ||
    $v$    case when v_tipo = 'importacion' then nullif(p_datos ->> 'via_importacion','') end$v$ || chr(10) ||
    '  ) returning id into v_compra;';
  v_ancla constant text := '  -- El dinero se calcula AQUÍ, nunca se acepta de quien llama.';
  v_gastos constant text :=
$v$  -- El DETALLE de gastos (095). Cada fila dispara `trg_gastos_importacion`
  -- (022), que deja en `compras.gastos_importacion` la SUMA del detalle — y esa
  -- suma es la que prorratea la recepción. Sin detalle, el número suelto que
  -- se haya mandado se queda como estaba, que es como funcionaba hasta hoy.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_datos -> 'gastos', '[]'::jsonb)) g
     where coalesce(nullif(g ->> 'monto','')::numeric, 0) < 0
  ) then
    raise exception 'Un gasto no puede ser negativo'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into gastos_importacion (compra_id, concepto, monto)
  select v_compra,
         left(trim(g ->> 'concepto'), 80),
         (g ->> 'monto')::numeric
    from jsonb_array_elements(coalesce(p_datos -> 'gastos', '[]'::jsonb)) g
   where coalesce(nullif(g ->> 'monto','')::numeric, 0) > 0
     and nullif(trim(g ->> 'concepto'), '') is not null;

$v$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'crear_compra';

  if v_def is null then
    raise exception '095: no existe crear_compra';
  end if;

  v_def := replace(v_def, chr(13), '');

  if position('via_importacion' in v_def) > 0 then
    raise notice '095: crear_compra ya conoce la vía; no se toca.';
    return;
  end if;

  if position(v_cols_viejo in v_def) = 0 then
    raise exception '095: la lista de columnas no es la esperada: %',
      substring(v_def from greatest(position('tipo_cambio' in v_def) - 200, 1) for 300);
  end if;
  if position(v_vals_viejo in v_def) = 0 then
    raise exception '095: el final de los valores no es el esperado: %',
      substring(v_def from greatest(position('returning id into v_compra' in v_def) - 200, 1) for 260);
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception '095: no encuentro dónde meter los gastos';
  end if;

  v_def := replace(v_def, v_cols_viejo, v_cols_nuevo);
  v_def := replace(v_def, v_vals_viejo, v_vals_nuevo);
  v_def := replace(v_def, v_ancla, v_gastos || v_ancla);

  execute v_def;
end $$;

-- ###########################################################################
-- Centinela · LAS TRES MODALIDADES, DE VERDAD, Y UNA RECEPCIÓN
-- ###########################################################################
-- Se ejecuta y se deshace (regla de la 091). Comprueba lo que podría salir
-- mal de verdad, no que el texto contenga palabras:
--
--   1 · Marítima con dos gastos: la vía llega a SU columna, el detalle se
--       guarda en filas, y la suma queda en la compra.
--   2 · Local con vía de mentira: la vía se descarta, el transporte entra.
--   3 · Recibir la marítima: el costo por unidad lleva los gastos una vez.
do $$
declare
  v_perfil uuid; v_prov uuid; v_prod uuid;
  v_mar uuid; v_loc uuid;
  r_mar record; r_loc record;
  v_filas int; v_costo numeric;
  v_fallo text;
begin
  select p.id into v_perfil
    from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.escribir and pr.tabla = 'recepciones'
   where p.activo
     and exists (select 1 from permisos_rol x where x.rol = p.rol and x.tabla = 'compras' and x.escribir)
   limit 1;
  select id into v_prov from proveedores limit 1;
  select p.id into v_prod from productos p
   where not exists (select 1 from movimientos_inventario m where m.producto_id = p.id)
   limit 1;

  if v_perfil is null or v_prov is null or v_prod is null then
    raise notice '095: faltan datos para el centinela; no corre.';
    return;
  end if;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);

    -- 1 · Marítima: 10 a 20 = 200, con 100 de flete y 50 de aduana.
    v_mar := (public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov, 'tipo', 'importacion', 'via_importacion', 'maritima',
      'moneda', 'USD', 'afecto_igv', false,
      'gastos', jsonb_build_array(
        jsonb_build_object('concepto', 'Flete marítimo', 'monto', 100),
        jsonb_build_object('concepto', 'Derechos de aduana', 'monto', 50),
        jsonb_build_object('concepto', 'Vacío', 'monto', 0)),
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cantidad', 10, 'costo_unitario', 20))
    )) ->> 'id')::uuid;

    select tipo::text as tipo, via_importacion as via, gastos_importacion as g, estado::text as e
      into r_mar from compras where id = v_mar;
    select count(*) into v_filas from gastos_importacion where compra_id = v_mar;

    -- 2 · Local con una vía que no le toca, y 15 de transporte.
    v_loc := (public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov, 'tipo', 'local', 'via_importacion', 'aerea',
      'moneda', 'USD',
      'gastos', jsonb_build_array(jsonb_build_object('concepto', 'Transporte', 'monto', 15)),
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cantidad', 1, 'costo_unitario', 5))
    )) ->> 'id')::uuid;
    select tipo::text as tipo, via_importacion as via, gastos_importacion as g
      into r_loc from compras where id = v_loc;

    -- 3 · Recibir la marítima entera.
    perform public.recepcionar_mercaderia(jsonb_build_object(
      'compra_id', v_mar, 'proveedor_id', v_prov,
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod, 'cantidad', 10, 'costo_unitario', 20))
    ));
    select costo_unitario into v_costo from movimientos_inventario
     where producto_id = v_prod and referencia_tipo = 'recepcion'
     order by creado_en desc limit 1;

    raise exception using message = '__095_DESHACER__';
  exception when others then
    if sqlerrm <> '__095_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  if v_fallo is not null then
    raise exception '095: el centinela se rompió: %', v_fallo;
  end if;

  if r_mar.tipo <> 'importacion' or r_mar.via is distinct from 'maritima' then
    raise exception '095: la marítima quedó como tipo=% vía=%', r_mar.tipo, r_mar.via;
  end if;
  if r_mar.e <> 'registrada' then
    raise exception '095: la vía se coló en otra columna: estado=%', r_mar.e;
  end if;
  if v_filas <> 2 then
    raise exception '095: se guardaron % gastos y tenían que ser 2 (el de monto 0 no cuenta)', v_filas;
  end if;
  if r_mar.g <> 150 then
    raise exception '095: la compra suma % de gastos y tenían que ser 150', r_mar.g;
  end if;

  if r_loc.via is not null then
    raise exception '095: una compra LOCAL guardó vía «%»', r_loc.via;
  end if;
  if r_loc.g <> 15 then
    raise exception '095: el transporte de la local suma % y tenía que ser 15', r_loc.g;
  end if;

  -- 200 de mercadería + 150 de gastos = 350, entre 10 unidades = 35.
  if round(v_costo, 2) <> 35 then
    raise exception '095: la unidad marítima costó % y tenía que costar 35', v_costo;
  end if;

  raise notice '095: marítima con vía y dos gastos (150), local sin vía con transporte (15), y la unidad recibida a 35.00.';
end $$;
