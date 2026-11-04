-- ###########################################################################
-- 189 · LA UTILIDAD MÍNIMA DE UNA COTIZACIÓN
-- ###########################################################################
--
-- Willy, reunión del 04/11 (31:01): *«como regla… debe haber una utilidad
-- mínima de 20 dólares… según los montos: si son 100 dólares, 20 dólares como
-- mínimo; si es más, aumenta la utilidad»*. Y: *«lo que necesito es que me
-- muestres cuánto es la utilidad de un negocio en particular, para ver si
-- está bien o no… al momento de cotizar, para ver si puedo subir o bajar los
-- precios»*. Luis, 04/11: *«eso es dinámico, como lo dijo el Sr. Willy»*.
--
-- La regla tiene DOS cifras, y crece con la venta:
--
--   utilidad mínima = el mayor de (USD 20, 20 % de la venta sin IGV)
--
--   · USD 100 → 20 (las dos dan lo mismo: es el ejemplo de Willy)
--   · USD 500 → 100 («si es más, aumenta la utilidad»)
--   · USD 40  → 20 (el piso: un negocio chico no baja de 20)
--
-- Las dos van en `empresa` y se cambian en Datos de la empresa, porque la
-- frase de Willy da el ejemplo de 100 pero no la escala exacta por encima:
-- si la quiere en otro porcentaje, lo cambia él sin tocar código. Es un
-- AVISO al cotizar, no un bloqueo: él decide si sube el precio.
--
-- 20 y 20 son el valor por defecto de la REGLA, como el 18 del IGV, no un
-- dato del cliente.
-- ###########################################################################

alter table empresa
  add column if not exists utilidad_minima_usd numeric(12, 2) not null default 20
    check (utilidad_minima_usd >= 0),
  add column if not exists utilidad_minima_pct numeric(5, 2) not null default 20
    check (utilidad_minima_pct >= 0 and utilidad_minima_pct <= 100);

comment on column empresa.utilidad_minima_usd is
  'Piso de la utilidad de una cotización, USD (189). Willy, 04/11.';
comment on column empresa.utilidad_minima_pct is
  '% de la venta sin IGV que debe dejar de utilidad una cotización (189). Mínimo = mayor de los dos.';

do $$
begin
  if (select utilidad_minima_usd from empresa where id = 1) is null
     or (select utilidad_minima_pct from empresa where id = 1) is null then
    raise exception '189: la empresa no tiene la regla de utilidad mínima';
  end if;
  -- El centinela la ESCRIBE, comprueba los topes y deshace al salir.
  begin
    update empresa set utilidad_minima_usd = 35, utilidad_minima_pct = 25 where id = 1;
    if (select utilidad_minima_pct from empresa where id = 1) <> 25 then
      raise exception '189: la regla no se guardó';
    end if;
    begin
      update empresa set utilidad_minima_pct = 120 where id = 1;
      raise exception '189: aceptó un porcentaje de 120';
    exception when check_violation then null;
    end;
    raise exception '__189_DESHACER__';
  exception when others then
    if sqlerrm <> '__189_DESHACER__' then raise; end if;
  end;
  raise notice '189: utilidad mínima lista (USD 20 / 20 %%).';
end $$;
