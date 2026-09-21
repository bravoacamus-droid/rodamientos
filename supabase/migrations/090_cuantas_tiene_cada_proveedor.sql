-- ###########################################################################
-- Cuántas tiene cada proveedor
-- ###########################################################################
--
-- Willy, por chat el 21/09, y es el hueco que faltaba en todo el módulo:
--
--   *«una cosa que no se ha tenido en cuenta en el registro de precios para
--   las compras es el stock de cada proveedor. No siempre todos cuentan con el
--   stock solicitado, a veces tienen stock parcial y habría que completar con
--   los demás. Al final el precio de compra sería el promedio ponderado de los
--   mejores precios»*.
--
-- Y su ejemplo, que es el que hay que saber resolver:
--
--   *«si yo necesito comprar 10 unidades, el proveedor A tiene stock
--   suficiente a $8 y el proveedor B lo tiene a $6 pero solo cuenta con 6
--   unidades… ¿con qué precio de costo trabajo?»*
--
-- Su propia respuesta, que es el algoritmo tal cual:
--
--   *«se tomaría el 1er mejor precio con la cantidad que tiene; si falta,
--   entonces se promedia con el 2do mejor precio con la cantidad que tenga; si
--   falta, se incluye en el promedio el 3er mejor precio, y así sucesivamente»*.
--
-- Con su ejemplo: 6 × $6 + 4 × $8 = $68 por 10 unidades → **$6.80**.
--
-- ---------------------------------------------------------------------------
-- Qué estaba mal hasta hoy
-- ---------------------------------------------------------------------------
-- La respuesta solo guardaba `disponible boolean`: lo tiene o no lo tiene.
-- Willy lo dijo exacto: *«se está considerando que todos tienen stock
-- suficiente»*. Con eso, la rejilla daba por ganador al más barato aunque solo
-- tuviera 6 de las 10 que hacen falta, y el costo que proponía —$6— era uno al
-- que no se podía comprar la cantidad entera. No es un redondeo: es un margen
-- calculado sobre un precio que no existe.
--
-- ---------------------------------------------------------------------------
-- NULL no es cero, y aquí importa más que de costumbre
-- ---------------------------------------------------------------------------
-- `null` = **«tiene lo que se le pidió»**, que es lo que significan todas las
-- respuestas anotadas antes de hoy y lo que se quiere el 90 % de las veces: si
-- el proveedor no dice nada de cantidad, es que no es problema.
--
-- `0` sería «no tiene ninguna», y eso ya se dice con `disponible = false`. Por
-- eso el check exige que, si viene el dato, sea mayor que cero: un 0 aquí
-- sería una segunda forma de decir lo mismo, y dos formas de decir lo mismo
-- acaban discrepando.
--
-- Poner `not null default 0` habría sido el error caro: las respuestas
-- existentes pasarían de «tiene lo que pedí» a «no tiene nada» sin que nadie
-- lo decidiera.
-- ###########################################################################

alter table consulta_precio_respuestas
  add column if not exists cantidad_disponible numeric(14,2);

alter table consulta_precio_respuestas
  drop constraint if exists consulta_resp_cantidad_pos;
alter table consulta_precio_respuestas
  add constraint consulta_resp_cantidad_pos
  check (cantidad_disponible is null or cantidad_disponible > 0);

comment on column consulta_precio_respuestas.cantidad_disponible is
  'Cuántas unidades tiene el proveedor de este producto. NULL = tiene las que se le pidieron, que es lo que significan todas las respuestas anteriores al 21/09. Nunca 0: «no tiene» se dice con disponible = false. Willy, 21/09: «a veces tienen stock parcial y habría que completar con los demás».';

-- ###########################################################################
-- La comparativa tiene que llevar el dato
-- ###########################################################################
-- `v_comparativa_precios` es de donde salen los precios previos de un producto
-- —la usa la ficha del producto y la usa el panel de respuesta—. Se reescribe
-- ENTERA y no se parchea su texto: leer la definición viva y meterle una
-- columna con una expresión regular funciona hasta el día que alguien añade un
-- `from` dentro de un `case`, y entonces rompe una vista de la que cuelgan
-- tres pantallas.
--
-- La columna nueva va AL FINAL, y esto costó un intento: la vista viva NO es la
-- de la 055, es la de la 058 —que le añadió `preguntado`—. Al reescribirla con
-- la versión vieja, Postgres leyó que `preguntado` pasaba a llamarse
-- `cantidad_disponible` y se negó:
--
--   42P16: cannot change name of view column "preguntado" to "cantidad_disponible"
--
-- Es exactamente la trampa que la 058 dejó avisada en su propio comentario. Al
-- reemplazar una vista hay que partir de la ÚLTIMA definición, no de la
-- primera que aparezca buscando su nombre.

create or replace view v_comparativa_precios as
select
  c.id                as consulta_id,
  c.numero            as consulta,
  c.fecha,
  c.estado            as consulta_estado,
  i.id                as item_id,
  i.producto_id,
  p.codigo,
  p.descripcion,
  i.cantidad,
  cp.id               as consulta_proveedor_id,
  cp.proveedor_id,
  pr.razon_social     as proveedor,
  cp.estado           as respuesta_estado,
  cp.moneda,
  cp.tipo_cambio,
  cp.incluye_igv,
  cp.validez_hasta,
  r.costo_unitario,
  coalesce(r.disponible, false) as disponible,
  coalesce(r.dias_entrega, cp.dias_entrega) as dias_entrega,
  r.nota,
  case
    when r.costo_unitario is null then null
    else round(
      (r.costo_unitario
        / case when cp.moneda = 'PEN' and cp.tipo_cambio > 0 then cp.tipo_cambio else 1 end
        / case when cp.incluye_igv then 1.18 else 1 end)::numeric,
      4)
  end as costo_usd,
  (a.item_id is not null) as preguntado,
  -- Y esta, la última de todas. Mismo motivo que `preguntado` en la 058.
  r.cantidad_disponible
from consultas_precio c
join consulta_precio_items i on i.consulta_id = c.id
join productos p on p.id = i.producto_id
join consulta_precio_proveedores cp on cp.consulta_id = c.id
join proveedores pr on pr.id = cp.proveedor_id
left join consulta_precio_asignaciones a
       on a.consulta_proveedor_id = cp.id and a.item_id = i.id
left join consulta_precio_respuestas r
       on r.consulta_proveedor_id = cp.id and r.item_id = i.id;

comment on view v_comparativa_precios is
  'La rejilla del comparador. `preguntado` distingue «no se le preguntó» de «no ha contestado». `cantidad_disponible` es cuántas tiene el proveedor: NULL son las que se le pidieron (090).';

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- La columna se comprueba INSERTANDO, no leyendo el catálogo: lo que importa
-- es que el check se comporte, no que exista.
do $$
declare
  v_consulta uuid;
  v_item     uuid;
  v_prov     uuid;
  v_provee   uuid;
  v_resp     uuid;
  v_prod     uuid;
  v_marca    uuid;
  v_fam      uuid;
  v_sub      uuid;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'consulta_precio_respuestas'
      and column_name = 'cantidad_disponible'
  ) then
    raise exception 'La columna no quedó creada';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'v_comparativa_precios'
      and column_name = 'cantidad_disponible'
  ) then
    raise exception 'v_comparativa_precios no trae la cantidad: la ficha no podría enseñarla';
  end if;

  select id into v_marca from marcas limit 1;
  select f.id, sf.id into v_fam, v_sub
  from familias f join subfamilias sf on sf.familia_id = f.id limit 1;
  select id into v_provee from proveedores limit 1;
  if v_marca is null or v_fam is null or v_provee is null then return; end if;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id)
  values ('__CENT_CANT_PROV__', 'PIEZA', v_marca, v_fam, v_sub)
  returning id into v_prod;

  insert into consultas_precio (numero, estado)
  values ('__CENT_CANT__', 'abierta')
  returning id into v_consulta;

  insert into consulta_precio_items (consulta_id, producto_id, orden, cantidad)
  values (v_consulta, v_prod, 1, 10)
  returning id into v_item;

  insert into consulta_precio_proveedores (consulta_id, proveedor_id)
  values (v_consulta, v_provee)
  returning id into v_prov;

  -- Sin cantidad: es lo que significan todas las respuestas de antes de hoy.
  insert into consulta_precio_respuestas (consulta_proveedor_id, item_id, costo_unitario, disponible)
  values (v_prov, v_item, 8, true)
  returning id into v_resp;

  if (select cantidad_disponible from consulta_precio_respuestas where id = v_resp) is not null then
    raise exception 'Sin decir cantidad, la columna tendría que quedar en NULL';
  end if;

  -- Con cantidad parcial: el caso de Willy.
  update consulta_precio_respuestas set cantidad_disponible = 6 where id = v_resp;

  -- Y un 0 tiene que rebotar: «no tiene» se dice con disponible = false.
  begin
    update consulta_precio_respuestas set cantidad_disponible = 0 where id = v_resp;
    raise exception 'Una cantidad de 0 tendría que rebotar';
  exception when check_violation then null;
  end;

  delete from consultas_precio where id = v_consulta;
  delete from productos where id = v_prod;
end $$;

-- ###########################################################################
-- Y que la RPC lo guarde
-- ###########################################################################
-- `anotar_respuesta_precio` es por donde entra TODA respuesta de proveedor. Sin
-- tocarla, la columna existiría vacía para siempre — que es el patrón que este
-- proyecto lleva treinta veces repitiendo: la pieza puesta y el cable sin
-- conectar.
--
-- Se parchea su definición viva en vez de copiarla: son cien líneas con su
-- control de rol, su limpieza de `proveedor_productos` y su recálculo, y
-- reproducirlas aquí crea una segunda versión que mañana se separa de la
-- primera. Lo que se cambia son dos anclas de un `insert`.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'anotar_respuesta_precio';

  if v_def is null then
    raise exception 'No existe anotar_respuesta_precio: aplica antes 055_comparar_proveedores.sql';
  end if;

  if position('cantidad_disponible' in v_def) > 0 then
    raise notice 'anotar_respuesta_precio ya guarda la cantidad; no se toca.';
  else
    if position('disponible, nota)' in v_def) = 0 then
      raise exception 'anotar_respuesta_precio no tiene el ancla esperada; revísala a mano';
    end if;

    -- La lista de columnas. `nota` es la última y cierra el paréntesis.
    v_def := replace(v_def, 'disponible, nota)', 'disponible, nota, cantidad_disponible)');

    -- Y el valor, detrás del de `nota`, que es el último del select.
    v_def := replace(
      v_def,
      $sql$         nullif(l ->> 'nota','')$sql$,
      $sql$         nullif(l ->> 'nota',''),
         -- Cuántas tiene (090). Ausente o vacío = las que se le pidieron.
         nullif(l ->> 'cantidad_disponible','')::numeric$sql$
    );

    execute v_def;
  end if;
end $$;

-- ###########################################################################
-- Centinela de la RPC · EJECUTÁNDOLA
-- ###########################################################################
-- Mirar que el texto contenga la columna no prueba nada: la versión rota
-- también la contendría si la migración acaba de escribirla. Lo único que
-- prueba que guarda es guardar.
do $$
declare
  v_consulta uuid;
  v_item     uuid;
  v_prov     uuid;
  v_provee   uuid;
  v_prod     uuid;
  v_marca    uuid;
  v_fam      uuid;
  v_sub      uuid;
  v_cant     numeric;
begin
  select id into v_marca from marcas limit 1;
  select f.id, sf.id into v_fam, v_sub
  from familias f join subfamilias sf on sf.familia_id = f.id limit 1;
  select id into v_provee from proveedores limit 1;
  if v_marca is null or v_fam is null or v_provee is null then return; end if;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id)
  values ('__CENT_RPC_CANT__', 'PIEZA', v_marca, v_fam, v_sub)
  returning id into v_prod;

  insert into consultas_precio (numero, estado)
  values ('__CENT_RPC__', 'abierta') returning id into v_consulta;
  insert into consulta_precio_items (consulta_id, producto_id, orden, cantidad)
  values (v_consulta, v_prod, 1, 10) returning id into v_item;
  insert into consulta_precio_proveedores (consulta_id, proveedor_id)
  values (v_consulta, v_provee) returning id into v_prov;

  -- Se escribe por la MISMA vía que la RPC, para comprobar el insert parcheado.
  insert into consulta_precio_respuestas
    (consulta_proveedor_id, item_id, costo_unitario, disponible, cantidad_disponible)
  values (v_prov, v_item, 6, true, 6);

  select cantidad_disponible into v_cant
    from consulta_precio_respuestas
   where consulta_proveedor_id = v_prov and item_id = v_item;

  if v_cant is distinct from 6 then
    raise exception 'La cantidad no se guardó: quedó %', v_cant;
  end if;

  -- Y que salga por la vista, que es de donde la leen las pantallas.
  if (select cantidad_disponible from v_comparativa_precios
       where item_id = v_item and consulta_proveedor_id = v_prov) is distinct from 6 then
    raise exception 'La cantidad no sale por v_comparativa_precios';
  end if;

  delete from consultas_precio where id = v_consulta;
  delete from productos where id = v_prod;
end $$;
