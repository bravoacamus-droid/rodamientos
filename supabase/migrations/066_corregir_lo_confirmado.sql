-- ###########################################################################
-- 066 · CORREGIR LO CONFIRMADO
-- ###########################################################################
--
-- Willy, 07/09 (15:58):
--
--   *«O si quiere… donde estaba ahí, si quiso o no quiso, donde estaba la
--   cantidad, cambiarlo, porque en sí la mayoría que va a cambiar es la
--   cantidad. Pero una vez que ya fue aceptada la cotización, ¿ya no se puede
--   modificar?»* — *«sí, pues, también creo que tiene que tener esa opción»* —
--   *«mientras que no se facture»* — *«sí, mientras que no se facture se puede
--   manejar»*.
--
-- ---------------------------------------------------------------------------
-- Por qué no vale `aprobar_cotizacion`
-- ---------------------------------------------------------------------------
-- Esa exige estar en `borrador` o `enviada` y lo hace bien: aprobar es pasar
-- de «lo ofrecí» a «me lo compraron», y eso ocurre una vez. Lo que pide Willy
-- es otra cosa —el cliente ya confirmó y ahora dice «que sean 8 y no 10»— y
-- merece su propia puerta, con sus propios límites.
--
-- ---------------------------------------------------------------------------
-- Los tres topes, y por qué
-- ---------------------------------------------------------------------------
--   1. **Solo en `aprobada`.** En `atendida` ya se facturó, y una factura
--      emitida no se corrige bajando la cantidad del pedido del que salió: eso
--      se arregla con una nota de crédito.
--
--   2. **Nunca por encima de lo cotizado.** Confirmar 12 de un pedido de 10 no
--      es una corrección, es una venta nueva — con su precio, que puede no ser
--      el mismo. Para eso se cotiza otra vez.
--
--   3. **Nunca por debajo de lo que YA SALIÓ o YA SE FACTURÓ.** Es el
--      importante. Si se despacharon 6 y alguien confirma 4, el pedido diría
--      que se vendieron 4 y el almacén que salieron 6, y esos 2 no los
--      reclama nadie nunca. La bandeja «por comprar» se calcula de esta
--      resta, así que un número más bajo que lo entregado la deja pidiendo
--      cantidades negativas.
--
-- Bajar a CERO una línea que no ha salido sí vale: es «esta no la quiso», que
-- es justo el caso que él describió — *«si solamente me confirma el primer
-- ítem nomás»*.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.corregir_confirmado(
  p_id     uuid,
  p_lineas jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_estado    estado_cotizacion;
  v_item      uuid;
  v_cant      numeric;
  v_pedido    numeric;
  v_atendida  numeric;
  v_salido    numeric;
  v_piso      numeric;
  v_codigo    text;
  v_cambios   int := 0;
  r           jsonb;
begin
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede tocar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  select estado into v_estado from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado <> 'aprobada' then
    raise exception 'Solo se corrige un pedido confirmado y sin facturar (está en %)', v_estado
      using errcode = 'check_violation';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No llegó ninguna línea que corregir' using errcode = 'check_violation';
  end if;

  for r in select * from jsonb_array_elements(p_lineas) loop
    v_item := nullif(r ->> 'item_id','')::uuid;
    v_cant := coalesce((r ->> 'cantidad')::numeric, 0);

    if v_item is null then
      raise exception 'Una de las líneas llegó sin item_id' using errcode = 'check_violation';
    end if;
    if v_cant < 0 then
      raise exception 'Una cantidad no puede ser negativa' using errcode = 'check_violation';
    end if;

    select i.cantidad, i.cantidad_atendida, i.codigo
      into v_pedido, v_atendida, v_codigo
      from cotizacion_items i
     where i.id = v_item and i.cotizacion_id = p_id
     for update;

    if not found then
      raise exception 'La línea % no es de esta cotización', v_item
        using errcode = 'check_violation';
    end if;

    -- Lo que ya salió del almacén con una guía emitida. Las anuladas no
    -- cuentan: su mercadería volvió.
    select coalesce(sum(gi.cantidad), 0) into v_salido
      from guia_items gi
      join guias_remision g on g.id = gi.guia_id
     where gi.cotizacion_item_id = v_item
       and g.estado <> 'anulada';

    v_piso := greatest(coalesce(v_atendida, 0), coalesce(v_salido, 0));

    if v_cant > v_pedido then
      raise exception 'En % no se puede confirmar más de lo cotizado (% sobre %)',
        v_codigo, v_cant, v_pedido using errcode = 'check_violation';
    end if;

    if v_cant < v_piso then
      raise exception 'En % ya salieron o se facturaron % unidades: no se puede bajar a %',
        v_codigo, v_piso, v_cant using errcode = 'check_violation';
    end if;

    update cotizacion_items
       set cantidad_aprobada = v_cant
     where id = v_item;

    v_cambios := v_cambios + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lineas', v_cambios);
end;
$$;

comment on function public.corregir_confirmado(uuid, jsonb) is
  'Ajusta las cantidades confirmadas de un pedido YA aprobado y sin facturar. Willy 07/09: «mientras que no se facture se puede manejar». Nunca por encima de lo cotizado —eso sería una venta nueva— ni por debajo de lo que ya salió con guía o ya se facturó, porque la bandeja «por comprar» se calcula de esa resta y quedaría pidiendo cantidades negativas.';

revoke all on function public.corregir_confirmado(uuid, jsonb) from public;
grant execute on function public.corregir_confirmado(uuid, jsonb) to authenticated;
