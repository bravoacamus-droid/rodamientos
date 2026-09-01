-- ###########################################################################
-- 040 · CUÁNDO PUEDE ENTREGARSE CADA ÍTEM
-- ###########################################################################
--
-- Willy, 01/09 (7:23):
--
--   *«Una cotización de seis ítems: tres son de entrada inmediata y dos son de
--   importación, para entrar en quince días o en treinta. ¿Cómo indicaría eso
--   dentro de la proforma?»*
--
-- Y a los dos minutos (8:19) él mismo dio la forma:
--
--   *«Generalmente se coloca una columna adicional, así como marca, precios.
--   Una columna donde se pone por defecto todo inmediato, y lo que no es
--   inmediato tiene la opción a editarlo, a colocar el plazo.»*
--
-- ---------------------------------------------------------------------------
-- Por qué es una columna estructurada y no el texto que ya había
-- ---------------------------------------------------------------------------
-- `cotizacion_items.entrega` existe desde la 002 como `text` libre y NUNCA se
-- usó: no hay una sola pantalla que lo escriba. Se podría haber reciclado,
-- pero texto libre no sirve para lo que viene después.
--
-- Lo que viene después es la bandeja «Por comprar»: para saber qué hay que
-- pedir, el sistema tiene que poder preguntar «dame las líneas confirmadas que
-- NO son inmediatas». Con texto libre eso es imposible — «15 días», «15d»,
-- «quincena» y «Quince dias» son la misma cosa para una persona y cuatro cosas
-- distintas para un `where`.
--
-- Así que enum de tres valores, que son exactamente los tres que él nombró, y
-- los días aparte. La columna `entrega` se queda donde está, sin tocar: no
-- estorba y borrar una columna nunca usada no gana nada.
--
-- ---------------------------------------------------------------------------
-- Los plazos por defecto
-- ---------------------------------------------------------------------------
-- Exterior 15 días y fabricación 3 los dijo él (12:02 y 12:37). El de la
-- compra LOCAL —que es la más frecuente— no lo dijo, y no me lo invento: sale
-- del enum como `inmediata`, que es «lo tengo, sale hoy». Cuando confirme el
-- plazo local se añade el cuarto valor. Está anotado en PENDIENTES §G.

set search_path = public, extensions;

do $$ begin
  create type disponibilidad_item as enum ('inmediata', 'exterior', 'fabricacion');
exception when duplicate_object then null; end $$;

comment on type disponibilidad_item is
  'Cuándo puede entregarse un ítem cotizado. Los tres los nombró Willy el 01/09 (13:00): «inmediato, exterior y fabricación».';

-- ---------------------------------------------------------------------------
-- 1 · La columna en el ítem
-- ---------------------------------------------------------------------------
alter table cotizacion_items
  add column if not exists disponibilidad disponibilidad_item not null default 'inmediata';

-- Los días concretos. Null = «usa el plazo por defecto de su tipo», que es lo
-- normal; se escribe solo cuando el proveedor dio una fecha distinta.
--
-- Con `inmediata` tiene que ser null: «inmediato en 8 días» no significa nada,
-- y dejarlo pasar imprimiría una contradicción en el PDF del cliente.
alter table cotizacion_items
  add column if not exists dias_entrega smallint;

do $$ begin
  alter table cotizacion_items add constraint cotiz_item_dias_ok check (
    (disponibilidad = 'inmediata' and dias_entrega is null)
    or (disponibilidad <> 'inmediata' and (dias_entrega is null or dias_entrega between 1 and 365))
  );
exception when duplicate_object then null; end $$;

comment on column cotizacion_items.disponibilidad is
  'Inmediata (hay stock), exterior (importación) o fabricación. Es también lo que alimenta la bandeja «Por comprar»: lo que no es inmediato hay que pedirlo.';
comment on column cotizacion_items.dias_entrega is
  'Los días de ESTA línea, cuando el proveedor dio uno distinto del habitual. Null = el plazo por defecto de su tipo. Siempre null en «inmediata».';

-- ---------------------------------------------------------------------------
-- 2 · La casilla que decide si la columna se imprime
-- ---------------------------------------------------------------------------
-- Mismo patrón exacto que `mostrar_descuento` (002), y por el mismo motivo que
-- dijo él: *«esa columna se puede incluir o no, según el caso, porque rara vez
-- es importación; por lo general todo es de entrada inmediata»* (8:38).
--
-- Nace en `false`: una columna que dice «Inmediata» seis veces seguidas es
-- ruido en un documento que el cliente compara contra el de la competencia.
alter table cotizaciones
  add column if not exists mostrar_disponibilidad boolean not null default false;

comment on column cotizaciones.mostrar_disponibilidad is
  'Si el PDF dibuja la columna de disponibilidad. Willy (8:38): «se puede incluir o no según el caso, porque rara vez es importación». Igual que mostrar_descuento.';

-- ---------------------------------------------------------------------------
-- 3 · Los plazos por defecto, en un solo sitio
-- ---------------------------------------------------------------------------
-- Función y no constante repartida por el código: el PDF, la pantalla y la
-- futura bandeja de compras tienen que decir el mismo número, y el día que
-- Willy diga «el exterior ya son 20 días» se cambia aquí y no en tres sitios.
create or replace function public.dias_por_defecto(p_disp disponibilidad_item)
returns smallint
language sql immutable parallel safe
as $$
  select case p_disp
           when 'inmediata'   then null::smallint
           when 'exterior'    then 15::smallint
           when 'fabricacion' then 3::smallint
         end;
$$;

comment on function public.dias_por_defecto(disponibilidad_item) is
  'Plazo habitual de cada tipo. Exterior 15 y fabricación 3 los dio Willy el 01/09. Un ítem puede pisarlo con dias_entrega.';

revoke execute on function public.dias_por_defecto(disponibilidad_item) from public, anon;
grant execute on function public.dias_por_defecto(disponibilidad_item) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  if public.dias_por_defecto('exterior') is distinct from 15 then
    raise exception 'El plazo por defecto de exterior no es 15';
  end if;
  if public.dias_por_defecto('fabricacion') is distinct from 3 then
    raise exception 'El plazo por defecto de fabricación no es 3';
  end if;
  if public.dias_por_defecto('inmediata') is not null then
    raise exception 'Lo inmediato no puede tener plazo: es lo que significa inmediato';
  end if;

  -- Lo que ya estaba cotizado nace como inmediato, que es lo que era: se
  -- cotizó contra lo que había.
  select count(*) into v_n from cotizacion_items where disponibilidad <> 'inmediata';
  if v_n > 0 then
    raise exception '% ítems ya existentes quedaron con una disponibilidad que nadie eligió', v_n;
  end if;

  -- Y ninguna cotización vieja estrena la columna en el PDF sin que nadie la
  -- haya pedido.
  select count(*) into v_n from cotizaciones where mostrar_disponibilidad;
  if v_n > 0 then
    raise exception '% cotizaciones estrenarían la columna sin haberla pedido', v_n;
  end if;

  raise notice 'Disponibilidad: tres valores por ítem, y la columna del PDF apagada hasta que se pida.';
end $$;
