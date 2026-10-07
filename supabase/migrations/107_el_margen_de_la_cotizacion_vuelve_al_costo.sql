-- ###########################################################################
-- 107 · EL MARGEN GUARDADO EN LA COTIZACIÓN VUELVE A IR SOBRE EL COSTO
-- ###########################################################################
--
-- Luis, 07/10, con la COT1-000005 de COFACO: la ficha decía «Margen al
-- costo 44,1 % · USD 410,72 de utilidad», y Willy echó la cuenta:
--
--     venta 931,58 − utilidad 410,72 = costo 520,86
--     410,72 / 520,86 = 78,85 %      ← lo que él espera, y lo que el sistema promete
--     410,72 / 931,58 = 44,09 %      ← lo que salía
--
-- La 023 (26/08, Willy: *«lo que me interesa saber es el margen con respecto
-- al costo»*) cambió esta función para dividir entre el costo. Pero la que
-- corría en la base el 07/10 era la de la **004**, la vieja, que divide entre
-- la venta. Las demás piezas de la 023 —las dos vistas— sí estaban: lo que
-- volvió atrás fue solo esta función. Lo más probable es que alguien
-- reaplicara la 004 después de la 023 (`create or replace` pisa en silencio),
-- que es exactamente el riesgo del CLAUDE.md §4: el script no lleva registro
-- de lo aplicado.
--
-- Comprobado el 07/10 antes de escribir esto: es la ÚNICA función de la base
-- que divide el margen entre la venta. Las vistas (`v_ventas_mensuales`,
-- `v_top_productos`, `v_productos_stock`) y las funciones de informes
-- (`serie_ventas`, `top_productos_rango`, `top_clientes_rango`) van sobre el
-- costo.
--
-- La utilidad en dinero (USD 410,72) estaba bien: no cambia con la fórmula.
-- Cambia solo el porcentaje.
--
-- Y el centinela, esta vez, EJECUTA el trigger (CLAUDE.md §2): el de la 023
-- comprobaba las cuentas con números sueltos, y por eso no se habría enterado
-- de que la función volvió a ser la vieja.
-- ###########################################################################

create or replace function public.recalcular_totales_cotizacion()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id  uuid := coalesce(new.cotizacion_id, old.cotizacion_id);
  v_sub numeric(14,2);
  v_desc numeric(14,2);
  v_costo numeric(14,2);
  v_igv_pct numeric(5,2);
begin
  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;

  select coalesce(sum(ci.importe), 0),
         coalesce(sum(round(ci.cantidad * ci.valor_unitario * ci.descuento_pct / 100.0, 2)), 0),
         coalesce(sum(round(ci.cantidad * ci.costo_unitario, 2)), 0)
    into v_sub, v_desc, v_costo
    from cotizacion_items ci where ci.cotizacion_id = v_id;

  update cotizaciones c
     set subtotal        = v_sub,
         descuento_total = v_desc,
         igv             = round(v_sub * v_igv_pct / 100.0, 2),
         total           = v_sub + round(v_sub * v_igv_pct / 100.0, 2),
         costo_total     = v_costo,
         -- Sobre el COSTO (023, 107). Sin costo cargado se guarda 0: es «no
         -- se sabe», y un 100 % le diría al vendedor que está regalando
         -- margen cuando lo que falta es el dato.
         margen_pct      = case when v_costo > 0
                                then round((v_sub - v_costo) / v_costo * 100, 2)
                                else 0 end,
         actualizado_en  = now()
   where c.id = v_id;
  return null;
end $$;

revoke execute on function public.recalcular_totales_cotizacion() from anon, authenticated;


-- Las ya guardadas. Solo `margen_pct`: ni subtotal, ni IGV, ni total, ni
-- costo se mueven. `actualizado_en` SÍ cambia, porque lo pone el trigger
-- general de la tabla: el 07/10 las tres cotizaciones quedaron con esa fecha.
update cotizaciones c
   set margen_pct = case when c.costo_total > 0
                         then round((c.subtotal - c.costo_total) / c.costo_total * 100, 2)
                         else 0 end
 where c.margen_pct is distinct from
       (case when c.costo_total > 0
             then round((c.subtotal - c.costo_total) / c.costo_total * 100, 2)
             else 0 end);


-- ---------------------------------------------------------------------------
-- Centinela: dispara el trigger de verdad sobre una línea real y mira el
-- resultado. Todo dentro de un bloque que sale por excepción, así que la
-- línea y su cotización quedan como estaban.
-- ---------------------------------------------------------------------------
do $$
declare
  v_item   uuid;
  v_cot    uuid;
  v_sub    numeric;
  v_costo  numeric;
  v_pct    numeric;
begin
  select ci.id, ci.cotizacion_id into v_item, v_cot
    from cotizacion_items ci
    join cotizaciones c on c.id = ci.cotizacion_id
   where c.costo_total > 0
   limit 1;

  if v_item is null then
    raise notice '107: ninguna cotización con costo para probar el trigger; se aplica sin él.';
  else
    begin
      -- Un update que no cambia nada, pero que dispara el trigger.
      update cotizacion_items set cantidad = cantidad where id = v_item;
      select subtotal, costo_total, margen_pct into v_sub, v_costo, v_pct
        from cotizaciones where id = v_cot;
      if v_pct <> round((v_sub - v_costo) / v_costo * 100, 2) then
        raise exception '107: el trigger guardó % y sobre el costo es %',
          v_pct, round((v_sub - v_costo) / v_costo * 100, 2);
      end if;
      raise exception '__107_DESHACER__';
    exception when others then
      if sqlerrm <> '__107_DESHACER__' then raise; end if;
    end;
  end if;

  -- Ninguna cotización con el margen viejo guardado.
  if exists (
    select 1 from cotizaciones c
     where c.costo_total > 0
       and c.margen_pct <> round((c.subtotal - c.costo_total) / c.costo_total * 100, 2)
  ) then
    raise exception '107: quedan cotizaciones con el margen sobre la venta';
  end if;

  raise notice '107: el margen de la cotización vuelve a ir sobre el costo, probado con el trigger.';
end $$;
