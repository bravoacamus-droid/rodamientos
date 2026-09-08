-- ###########################################################################
-- 070 · EDITAR TAMBIÉN LA APROBADA, MIENTRAS NO SEA UN COMPROMISO
-- ###########################################################################
--
-- La 069 dejó editar solo `borrador` y `enviada`, y lo argumentó así:
--
--   *«Una cotización `aprobada` es lo que el cliente ACEPTÓ. Cambiarle un
--   precio después es reescribir un acuerdo.»*
--
-- El argumento es bueno y estaba incompleto. Luis, 08/09:
--
--   *«si la cotización fue aprobada puede seguir editando la cotización
--   siempre y cuando todavía no se haga las compras de los productos o se
--   hizo la guía»*
--
-- Y tiene razón sobre el terreno: entre que el cliente dice que sí y que sale
-- la mercadería pueden pasar semanas —hay que comprar, importar, esperar—, y
-- en ese hueco el cliente llama para añadir dos rodamientos más. Hasta hoy la
-- única salida era clonar: un número nuevo para el cliente por añadir una
-- línea, y la vieja viva por ahí.
--
-- ---------------------------------------------------------------------------
-- Dónde está de verdad el límite
-- ---------------------------------------------------------------------------
-- El corte NO es el estado: es si el documento ya comprometió a alguien.
-- Es la misma regla que rige la cotización, el pedido, la guía y la recepción
-- —hasta donde todavía no es un compromiso de nadie— y aquí son dos hechos
-- duros, los dos comprobables:
--
--   · **Hay guía.** La mercadería salió del almacén. `guia_items` apunta a las
--     líneas, y editar las borra y las reinserta.
--   · **Hay algo facturado** (`cantidad_atendida > 0`). A partir de ahí no se
--     corrige bajando una cantidad: se corrige con una nota de crédito.
--
-- Las dos comprobaciones YA estaban en la 069 —entraron como «el cinturón
-- además del tirante», por si algún día se despachaba sin pasar por
-- `aprobada`—. Lo único que cambia es que ahora son la puerta y no el
-- cinturón.
--
-- ---------------------------------------------------------------------------
-- Lo de las compras se AVISA, no se bloquea. Y por qué
-- ---------------------------------------------------------------------------
-- Luis pide además que no se pueda editar si ya se compraron los productos.
-- No se puede comprobar aquí, y conviene decirlo claro en vez de fingir que
-- sí: **no existe vínculo entre una compra y la cotización que la motivó**.
-- `compra_items` guarda `producto_id`, y la bandeja «Por comprar» agrupa por
-- PRODUCTO precisamente porque una compra junta lo que esperan varios
-- clientes.
--
-- Así que «este código está en una compra abierta» no significa «se compró
-- para este pedido»: puede ser reposición de almacén o el pedido de otro. Con
-- 790 productos, bloquear por eso cerraría la edición casi siempre, y por una
-- razón que Willy no puede ver ni deshacer — que es la peor clase de bloqueo.
--
-- El aviso va en la pantalla de edición, con el número de compra delante, y
-- decide quien está mirando. La regla dura se queda en los dos hechos que la
-- base sí sabe.
--
-- ---------------------------------------------------------------------------
-- `cantidad_aprobada` se reescribe, y esto es lo que había que no romper
-- ---------------------------------------------------------------------------
-- `v_comprometido` filtra por `coalesce(cantidad_aprobada,0) - atendida > 0`.
-- La 069 no inserta esa columna —en un borrador todavía no hay nada aprobado,
-- así que null es correcto—, pero al editar una APROBADA ese null la dejaría
-- en cero: el pedido desaparecería de la bandeja «Por comprar» y de «Listos
-- para entregar» sin que nada fallara, y el cliente se quedaría esperando.
--
-- Editando una aprobada, lo que se está tecleando ES lo acordado ahora, así
-- que la línea nueva nace con `cantidad_aprobada = cantidad`.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.actualizar_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id      uuid;
  v_estado  estado_cotizacion;
  v_colgado int;
  v_n       int;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede editar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := nullif(p_datos ->> 'id','')::uuid;
  if v_id is null then
    raise exception 'Falta el id de la cotización' using errcode = 'check_violation';
  end if;

  select estado into v_estado from cotizaciones where id = v_id for update;
  if v_estado is null then
    raise exception 'La cotización no existe' using errcode = 'no_data_found';
  end if;

  -- `aprobada` entra desde la 070. Las cerradas siguen fuera: en `atendida`,
  -- `rechazada`, `vencida` y `anulada` no queda nada que acordar.
  if v_estado not in ('borrador', 'enviada', 'aprobada') then
    raise exception 'Una cotización en % ya no se edita', v_estado
      using errcode = 'check_violation';
  end if;

  -- La mercadería ya salió. Borrar las líneas dejaría la guía apuntando a un
  -- ítem que no existe, y sobre todo: lo que salió, salió.
  select count(*) into v_colgado
    from guia_items gi
    join cotizacion_items ci on ci.id = gi.cotizacion_item_id
   where ci.cotizacion_id = v_id;
  if v_colgado > 0 then
    raise exception 'Esta cotización ya tiene mercadería despachada: no se puede editar'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_colgado
    from cotizacion_items
   where cotizacion_id = v_id and coalesce(cantidad_atendida, 0) > 0;
  if v_colgado > 0 then
    raise exception 'Esta cotización ya tiene líneas facturadas: no se puede editar'
      using errcode = 'check_violation';
  end if;

  update cotizaciones set
    cliente_id             = coalesce(nullif(p_datos ->> 'cliente_id','')::uuid, cliente_id),
    validez_dias           = coalesce(nullif(p_datos ->> 'validez_dias','')::int, validez_dias),
    tiempo_entrega         = nullif(p_datos ->> 'tiempo_entrega',''),
    orden_compra_cliente   = nullif(p_datos ->> 'orden_compra_cliente',''),
    contacto               = nullif(p_datos ->> 'contacto',''),
    condiciones            = nullif(p_datos ->> 'condiciones',''),
    observaciones          = nullif(p_datos ->> 'observaciones',''),
    mostrar_descuento      = coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    mostrar_disponibilidad = coalesce((p_datos ->> 'mostrar_disponibilidad')::boolean, false)
  where id = v_id;

  delete from cotizacion_items where cotizacion_id = v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    disponibilidad, dias_entrega, cantidad_aprobada
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         (i.value ->> 'orden')::int,
         i.value ->> 'codigo',
         nullif(i.value ->> 'marca',''),
         i.value ->> 'descripcion',
         (i.value ->> 'cantidad')::numeric,
         i.value ->> 'unidad_codigo',
         (i.value ->> 'valor_unitario')::numeric,
         coalesce((i.value ->> 'descuento_pct')::numeric, 0),
         coalesce((i.value ->> 'costo_unitario')::numeric, 0),
         coalesce(nullif(i.value ->> 'disponibilidad','')::disponibilidad_item, 'inmediata'),
         nullif(i.value ->> 'dias_entrega','')::int,
         -- Editando una aprobada, lo tecleado ES lo acordado ahora. En
         -- borrador y enviada sigue siendo null: todavía no hay nada aceptado
         -- y un número aquí haría que el pedido saliera en «Por comprar»
         -- antes de que el cliente dijera que sí.
         case when v_estado = 'aprobada'
              then (i.value ->> 'cantidad')::numeric
              else null end
    from jsonb_array_elements(p_datos -> 'items') i;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'La cotización no puede quedarse sin líneas'
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'lineas', v_n);
end;
$$;

comment on function public.actualizar_cotizacion(jsonb) is
  'Reescribe una cotización entera —cabecera y líneas— mientras no comprometa a nadie: en BORRADOR, ENVIADA o APROBADA sin guía y sin nada facturado. Luis 08/09: «si la cotización fue aprobada puede seguir editando siempre y cuando todavía no se haga la guía». Editando una aprobada, `cantidad_aprobada` se reescribe con la cantidad nueva: sin eso el pedido desaparecería de «Por comprar» y de «Listos para entregar», porque `v_comprometido` filtra por esa columna.';

revoke all on function public.actualizar_cotizacion(jsonb) from public;
grant execute on function public.actualizar_cotizacion(jsonb) to authenticated;

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Que la puerta se abrió para `aprobada`, y que las dos que importan siguen
-- cerradas. Sin esto, un `create or replace` posterior podría volver a la
-- condición de la 069 y nadie se enteraría hasta que Willy no pudiera editar.
do $$
declare
  v_fuente text;
begin
  select pg_get_functiondef(p.oid) into v_fuente
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'actualizar_cotizacion';

  if v_fuente not like '%''borrador'', ''enviada'', ''aprobada''%' then
    raise exception 'La 070 no abrió la edición a las aprobadas';
  end if;

  if v_fuente not like '%mercadería despachada%' then
    raise exception 'La 070 se dejó por el camino el corte de la guía';
  end if;

  if v_fuente not like '%líneas facturadas%' then
    raise exception 'La 070 se dejó por el camino el corte de lo facturado';
  end if;

  if v_fuente not like '%cantidad_aprobada%' then
    raise exception 'La 070 no reescribe cantidad_aprobada: el pedido se volvería invisible';
  end if;
end $$;
