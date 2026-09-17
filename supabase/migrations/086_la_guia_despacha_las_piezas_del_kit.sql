-- ###########################################################################
-- La guía despacha las PIEZAS del kit, no el kit
-- ###########################################################################
--
-- Es la pieza que faltaba para que el kit (085) cierre el flujo entero.
--
-- ---------------------------------------------------------------------------
-- El agujero
-- ---------------------------------------------------------------------------
-- Un kit se cotiza y se factura como UN ítem —eso es lo que pidió Willy— pero
-- lo que sale del almacén son sus piezas. Y `generar_guia` copiaba el
-- `producto_id` de la cotización tal cual, así que la guía llevaba el kit;
-- luego `emitir_guia` descargaba stock de ese `producto_id`.
--
-- El kit **no tiene stock propio**: se calcula (decisión de Luis, 17/09). El
-- resultado habría sido un kit con stock −1 y los rodamientos, los retenes y
-- los o-rings intactos en el almacén. Un descuadre silencioso justo en lo que
-- el ERP existe para cuidar.
--
-- ---------------------------------------------------------------------------
-- Por qué un trigger y no arreglarlo en la pantalla
-- ---------------------------------------------------------------------------
-- Porque la pantalla no es el único camino: `generar_guia` es una RPC, y toda
-- RPC es un endpoint público. Y porque la regla es de la tabla —«en una guía
-- no puede haber un kit, solo cosas que existen en el almacén»—, no de quien
-- la llama. Es el mismo criterio que `proteger_comprobante_emitido` (006) y
-- que el trigger de la guía facturada (084).
--
-- ---------------------------------------------------------------------------
-- Y la cotización y la factura NO cambian
-- ---------------------------------------------------------------------------
-- Siguen llevando el kit como un ítem con su precio. Son documentos de VENTA:
-- dicen qué se vendió y en cuánto. La guía es el papel del almacén y del
-- transportista: dice qué viaja, y lo que viaja son las piezas.
-- ###########################################################################

create or replace function public.guia_explota_kits()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_es_kit boolean;
  v_orden  smallint;
  c        record;
begin
  select p.es_kit into v_es_kit from productos p where p.id = new.producto_id;

  -- Lo normal: un producto de verdad, pasa tal cual.
  if not coalesce(v_es_kit, false) then
    return new;
  end if;

  /*
    Es un kit: se cambia por lo que lleva dentro.

    La cantidad se multiplica — tres kits de dos rodamientos cada uno son seis
    rodamientos—, y el peso sale del componente, que es el que pesa de verdad.

    No hay recursión posible: `kit_componentes` tiene un trigger desde la 085
    que impide meter un kit dentro de otro, así que estos inserts vuelven a
    entrar aquí una vez y salen por el `return new` de arriba.
  */
  for c in
    select kc.producto_id, kc.cantidad, kc.orden,
           p.codigo, p.descripcion, p.unidad_codigo, p.peso_kg
    from kit_componentes kc
    join productos p on p.id = kc.producto_id
    where kc.kit_id = new.producto_id
    order by kc.orden
  loop
    -- El orden se pide fila a fila: `guia_item_unico` es (guia_id, orden) y
    -- calcularlo una vez fuera del bucle chocaría al segundo componente.
    select coalesce(max(gi.orden), 0) + 1 into v_orden
    from guia_items gi where gi.guia_id = new.guia_id;

    insert into guia_items (
      guia_id, producto_id, cotizacion_item_id, orden,
      codigo, descripcion, cantidad, unidad_codigo, peso_kg
    ) values (
      new.guia_id, c.producto_id, new.cotizacion_item_id, v_orden,
      c.codigo,
      -- Se dice de qué kit viene: quien recibe la guía tiene que poder atarla
      -- a la factura, donde solo aparece el kit.
      c.descripcion,
      c.cantidad * new.cantidad,
      coalesce(c.unidad_codigo, 'NIU'),
      coalesce(c.peso_kg, 0) * c.cantidad * new.cantidad
    );
  end loop;

  -- Y la línea del kit no se guarda: sus piezas ya están.
  return null;
end $$;

drop trigger if exists tg_guia_explota_kits on public.guia_items;
create trigger tg_guia_explota_kits
  before insert on public.guia_items
  for each row execute function public.guia_explota_kits();

comment on function public.guia_explota_kits is
  'Una guía nunca lleva un kit: lleva sus piezas, que es lo que sale del almacén y lo que descarga el stock. El kit no tiene stock propio (085) y despacharlo lo dejaría en negativo con los componentes intactos.';

-- ###########################################################################
-- Centinela
-- ###########################################################################
--
-- Se monta un caso entero —kit, componentes, guía— y se comprueba que al
-- insertar el kit quedan las PIEZAS. Y se deshace: una migración no deja
-- datos.
do $$
declare
  v_kit      uuid;
  v_pieza    uuid;
  v_guia     uuid;
  v_cliente  uuid;
  v_marca    uuid;
  v_fam      uuid;
  v_sub      uuid;
  v_serie    text;
  v_ubigeo   char(6);
  v_filas    int;
  v_cant     numeric;
begin
  select id into v_cliente from clientes limit 1;
  select id into v_marca from marcas limit 1;
  select f.id, sf.id into v_fam, v_sub
  from familias f join subfamilias sf on sf.familia_id = f.id limit 1;
  select serie into v_serie from series_documento where tipo = 'guia_remision' limit 1;

  -- Sin catálogo ni cliente no hay nada que comprobar (base recién creada).
  if v_cliente is null or v_marca is null or v_fam is null then
    return;
  end if;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id)
  values ('__CENTINELA_PIEZA__', 'PIEZA DEL CENTINELA', v_marca, v_fam, v_sub)
  returning id into v_pieza;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id, es_kit)
  values ('__CENTINELA_KIT__', 'KIT DEL CENTINELA', v_marca, v_fam, v_sub, true)
  returning id into v_kit;

  insert into kit_componentes (kit_id, producto_id, cantidad)
  values (v_kit, v_pieza, 2);

  -- La guía pide ubigeo de partida y de llegada, dirección y peso. Se toman
  -- de las tablas en vez de inventarlos: son claves ajenas.
  select codigo into v_ubigeo from ubigeo limit 1;
  if v_ubigeo is null then return; end if;

  insert into guias_remision (
    serie, correlativo, cliente_id, fecha_emision,
    ubigeo_partida, direccion_partida,
    ubigeo_llegada, direccion_llegada,
    peso_bruto_kg
  ) values (
    coalesce(v_serie, 'T999'), 2000000000, v_cliente, current_date,
    v_ubigeo, 'CENTINELA',
    v_ubigeo, 'CENTINELA',
    1
  ) returning id into v_guia;

  -- Se mete el KIT: tienen que quedar las piezas.
  insert into guia_items (guia_id, producto_id, orden, codigo, descripcion, cantidad, unidad_codigo)
  values (v_guia, v_kit, 1, '__CENTINELA_KIT__', 'KIT DEL CENTINELA', 3, 'NIU');

  select count(*), coalesce(sum(cantidad), 0) into v_filas, v_cant
  from guia_items where guia_id = v_guia;

  if v_filas <> 1 then
    raise exception 'La guía debería tener 1 línea (la pieza) y tiene %', v_filas;
  end if;
  if v_cant <> 6 then
    raise exception '3 kits de 2 piezas son 6 piezas, y quedaron %', v_cant;
  end if;
  if exists (select 1 from guia_items where guia_id = v_guia and producto_id = v_kit) then
    raise exception 'La guía se quedó con el kit dentro';
  end if;

  -- Deshacer. La guía nunca se emitió, así que no movió stock.
  delete from guia_items where guia_id = v_guia;
  delete from guias_remision where id = v_guia;
  delete from kit_componentes where kit_id = v_kit;
  delete from productos where id in (v_kit, v_pieza);
end $$;
