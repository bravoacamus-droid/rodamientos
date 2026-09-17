-- ###########################################################################
-- El descuento, dentro del kit
-- ###########################################################################
--
-- Luis, 17/09, mirando el kit recién hecho: *«falta poner esto, si va a haber
-- descuento o no»*.
--
-- Es la mitad que faltaba de la 087. Ahí se dijo que armar un kit ES cotizar,
-- y en una cotización el precio de una línea son DOS campos: el valor unitario
-- y el descuento. Willy, 16/09 (15:52), sobre la cotización: *«esa columna se
-- puede incluir o no según el caso»*. Aquí pasa igual.
--
-- ---------------------------------------------------------------------------
-- Por qué una COLUMNA y no bajar el precio y ya
-- ---------------------------------------------------------------------------
-- Porque un 20 % y un «23.17» no dicen lo mismo dentro de seis meses.
--
-- Un kit es recurrente —Willy tiene tres y *«se van a ir generando más según
-- las máquinas»*—, así que se vuelve a abrir. Si lo guardado es el número
-- final, el día que suba el precio de lista del rodamiento el kit se queda con
-- el precio viejo y hay que rehacer la cuenta a mano. Si lo guardado es el
-- descuento, el kit sigue al maestro Y conserva lo que se negoció:
--
--   precio_unitario = null  +  descuento_pct = 20   →  «el de lista, menos 20 %»
--
-- Ese es el caso que de verdad se quiere, y es el que el número final destruye.
--
-- ---------------------------------------------------------------------------
-- `not null default 0`, al revés que `precio_unitario`
-- ---------------------------------------------------------------------------
-- En la 087 el nulo hacía falta para distinguir «usa el de lista» de «va sin
-- cargo». Aquí no hay nada que distinguir: no tener descuento y tener un
-- descuento del 0 % son la misma cosa. Un nulo aquí solo sería un 0 con
-- disfraz, y obligaría a un `coalesce` en cada cuenta.
-- ###########################################################################

alter table kit_componentes
  add column if not exists descuento_pct numeric(5,2) not null default 0;

alter table kit_componentes
  drop constraint if exists kit_comp_descuento_rango;
alter table kit_componentes
  add constraint kit_comp_descuento_rango
  check (descuento_pct >= 0 and descuento_pct <= 100);

comment on column kit_componentes.descuento_pct is
  'Descuento de esta pieza DENTRO de este kit, en por ciento. Se guarda el porcentaje y no el precio ya rebajado para que el kit pueda seguir al precio de lista sin perder lo negociado. Luis, 17/09: «falta poner esto, si va a haber descuento o no».';

-- ###########################################################################
-- `kit_suma` cuenta sobre el NETO
-- ###########################################################################
-- Mismo redondeo que la cotización: a 4 decimales en el unitario y la suma
-- después. `redondear4` vive en el dominio de cotizaciones para la pantalla;
-- aquí se hace con `round(..., 4)` para que la base dé exactamente lo mismo
-- que enseñó el formulario. Si difieren, el kit se guarda con un precio y se
-- lee con otro.
create or replace function public.kit_suma(p_kit uuid)
returns table (venta numeric, costo numeric)
language sql stable security definer set search_path = public, extensions
as $$
  select
    -- `coalesce` y no `nullif` en el precio: un 0 puesto a mano es un precio
    -- válido —la pieza va sin cargo— y tiene que contar como 0, no caer al de
    -- lista (087).
    coalesce(
      sum(
        round(
          coalesce(kc.precio_unitario, p.precio_venta) * (1 - kc.descuento_pct / 100),
          4
        ) * kc.cantidad
      ),
      0
    ),
    -- El costo NO lleva descuento: lo que nos cuesta la pieza no cambia
    -- porque se la rebajemos al cliente. Si lo llevara, el margen del kit
    -- saldría siempre bonito, que es justo lo que no sirve.
    coalesce(sum(coalesce(nullif(p.costo_promedio, 0), p.ultimo_costo) * kc.cantidad), 0)
  from kit_componentes kc
  join productos p on p.id = kc.producto_id
  where kc.kit_id = p_kit;
$$;

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Ejecuta la función, no lee su fuente. La lección de la 082: un centinela que
-- mira el texto que la propia migración acaba de escribir siempre pasa.
do $$
declare
  v_kit    uuid;
  v_pieza  uuid;
  v_marca  uuid;
  v_fam    uuid;
  v_sub    uuid;
  v_venta  numeric;
  v_costo  numeric;
begin
  select id into v_marca from marcas limit 1;
  select f.id, sf.id into v_fam, v_sub
  from familias f join subfamilias sf on sf.familia_id = f.id limit 1;
  if v_marca is null or v_fam is null then return; end if;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id,
                         precio_venta, costo_promedio)
  values ('__CENT_PIEZA_DESC__', 'PIEZA', v_marca, v_fam, v_sub, 100, 60)
  returning id into v_pieza;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id, es_kit)
  values ('__CENT_KIT_DESC__', 'KIT', v_marca, v_fam, v_sub, true)
  returning id into v_kit;

  -- Recién puesto: sin descuento. 2 × 100 = 200.
  insert into kit_componentes (kit_id, producto_id, cantidad) values (v_kit, v_pieza, 2);
  select venta, costo into v_venta, v_costo from public.kit_suma(v_kit);
  if v_venta <> 200 then
    raise exception 'Sin descuento la suma debería ser 200 y es %', v_venta;
  end if;

  -- 20 % sobre el de lista, SIN precio propio: 2 × 80 = 160.
  update kit_componentes set descuento_pct = 20 where kit_id = v_kit;
  select venta, costo into v_venta, v_costo from public.kit_suma(v_kit);
  if v_venta <> 160 then
    raise exception 'Con 20%% sobre el de lista debería ser 160 y es %', v_venta;
  end if;

  -- Y el costo NO se mueve con el descuento: 2 × 60 = 120, antes y después.
  if v_costo <> 120 then
    raise exception 'El descuento no puede tocar el costo; debería ser 120 y es %', v_costo;
  end if;

  -- El descuento se aplica sobre el precio PROPIO cuando lo hay, no sobre el
  -- de lista: 2 × (50 − 10 %) = 90.
  update kit_componentes set precio_unitario = 50, descuento_pct = 10 where kit_id = v_kit;
  select venta into v_venta from public.kit_suma(v_kit);
  if v_venta <> 90 then
    raise exception 'El descuento va sobre el precio propio; debería ser 90 y es %', v_venta;
  end if;

  -- Fuera de rango, ni por arriba ni por abajo.
  begin
    update kit_componentes set descuento_pct = 120 where kit_id = v_kit;
    raise exception 'Un descuento del 120%% tendría que rebotar';
  exception when check_violation then null;
  end;

  delete from kit_componentes where kit_id = v_kit;
  delete from productos where id in (v_kit, v_pieza);
end $$;
