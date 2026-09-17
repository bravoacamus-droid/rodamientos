-- ###########################################################################
-- Cada pieza lleva SU precio dentro del kit
-- ###########################################################################
--
-- Luis, 17/09, armando uno: *«¿por qué no me sale el precio? Recuerda que él
-- puede variar el precio, igual como hacer una cotización es hacer un kit,
-- nomás que van a hacer un kit»*.
--
-- Y es exactamente eso. Armar un kit ES cotizar: se busca por código, se pone
-- una cantidad y **se pone un precio**. Tomar el precio de lista y no dejar
-- tocarlo obligaría a una de dos cosas, las dos malas:
--
--   · retocar el maestro para poder armar el kit —y eso cambiaría el precio de
--     esa pieza suelta para todo el mundo—; o
--   · cuadrar el total a mano en el precio del kit, perdiendo de dónde sale.
--
-- Willy lo dijo con otras palabras el 16/09 (13:14): *«hay que ingresar el
-- precio de cada uno para que te calcule el precio final»*. **Ingresar**, no
-- heredar.
--
-- ---------------------------------------------------------------------------
-- NULL y 0 no son lo mismo
-- ---------------------------------------------------------------------------
-- `null` = «usa el precio de lista del producto», que es lo que pasa hoy con
-- los kits que ya existen y lo que se quiere el 90 % de las veces.
-- `0`     = «esta pieza va sin cargo dentro del kit», que es una decisión.
--
-- Con un `not null default 0` no se podrían distinguir, y un kit con una junta
-- de regalo se leería igual que uno al que se le olvidó poner el precio.
-- ###########################################################################

alter table kit_componentes
  add column if not exists precio_unitario numeric(14,2);

alter table kit_componentes
  drop constraint if exists kit_comp_precio_pos;
alter table kit_componentes
  add constraint kit_comp_precio_pos check (precio_unitario is null or precio_unitario >= 0);

comment on column kit_componentes.precio_unitario is
  'Lo que vale esta pieza DENTRO de este kit. NULL = usa el precio de lista del producto. 0 = va sin cargo, que es una decisión distinta de no haberlo puesto. Luis, 17/09: «él puede variar el precio, igual como hacer una cotización es hacer un kit».';

-- `kit_suma` usa el precio del componente cuando lo hay.
create or replace function public.kit_suma(p_kit uuid)
returns table (venta numeric, costo numeric)
language sql stable security definer set search_path = public, extensions
as $$
  select
    -- `coalesce` y no `nullif`: un 0 puesto a mano es un precio válido —la
    -- pieza va sin cargo— y tiene que contar como 0, no caer al de lista.
    coalesce(sum(coalesce(kc.precio_unitario, p.precio_venta) * kc.cantidad), 0),
    coalesce(sum(coalesce(nullif(p.costo_promedio, 0), p.ultimo_costo) * kc.cantidad), 0)
  from kit_componentes kc
  join productos p on p.id = kc.producto_id
  where kc.kit_id = p_kit;
$$;

-- ###########################################################################
-- Centinela
-- ###########################################################################
do $$
declare
  v_kit   uuid;
  v_pieza uuid;
  v_marca uuid;
  v_fam   uuid;
  v_sub   uuid;
  v_venta numeric;
begin
  select id into v_marca from marcas limit 1;
  select f.id, sf.id into v_fam, v_sub
  from familias f join subfamilias sf on sf.familia_id = f.id limit 1;
  if v_marca is null or v_fam is null then return; end if;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id, precio_venta)
  values ('__CENT_PIEZA_PRECIO__', 'PIEZA', v_marca, v_fam, v_sub, 100)
  returning id into v_pieza;

  insert into productos (codigo, descripcion, marca_id, familia_id, subfamilia_id, es_kit)
  values ('__CENT_KIT_PRECIO__', 'KIT', v_marca, v_fam, v_sub, true)
  returning id into v_kit;

  -- Sin precio propio: manda el de lista. 2 × 100 = 200.
  insert into kit_componentes (kit_id, producto_id, cantidad) values (v_kit, v_pieza, 2);
  select venta into v_venta from public.kit_suma(v_kit);
  if v_venta <> 200 then
    raise exception 'Sin precio propio la suma debería ser 200 y es %', v_venta;
  end if;

  -- Con precio propio: manda el suyo. 2 × 70 = 140.
  update kit_componentes set precio_unitario = 70 where kit_id = v_kit;
  select venta into v_venta from public.kit_suma(v_kit);
  if v_venta <> 140 then
    raise exception 'Con precio propio la suma debería ser 140 y es %', v_venta;
  end if;

  -- Y un 0 puesto a mano es un precio, no un «no puesto».
  update kit_componentes set precio_unitario = 0 where kit_id = v_kit;
  select venta into v_venta from public.kit_suma(v_kit);
  if v_venta <> 0 then
    raise exception 'Un precio de 0 tiene que valer 0, y dio %', v_venta;
  end if;

  delete from kit_componentes where kit_id = v_kit;
  delete from productos where id in (v_kit, v_pieza);
end $$;
