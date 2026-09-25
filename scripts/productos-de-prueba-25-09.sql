-- ###########################################################################
-- DIEZ PRODUCTOS COMPLETOS, PARA PROBAR CON NÚMEROS DE VERDAD · 25/09/2026
-- ###########################################################################
--
-- Luis, 25/09: *«elige 10 productos, le damos costo de qué compró, venta ya
-- tiene, su precio mínimo y mercado, para hacer las pruebas reales de compra y
-- que todo se está guardando»*.
--
-- ---------------------------------------------------------------------------
-- Por qué DIEZ y no los 794
-- ---------------------------------------------------------------------------
-- Porque `precio_minimo` no es un aviso: es un **piso duro** que hace cumplir
-- el check `cotiz_item_respeta_piso` sobre el precio ya descontado. Un piso
-- inventado que se quede alto no avisa — **rechaza la cotización**, delante
-- del cliente y sin forma de saltárselo.
--
-- Y los propios datos de Willy dicen que no hay fórmula. El comentario de la
-- 002 lo deja escrito sobre las 7 filas que mandó: *«P.M. NO sigue ninguna
-- fórmula (va entre 9 % y 18 % sobre el costo, irregular): es un valor que él
-- pone a mano producto por producto»*.
--
-- Así que se completan DIEZ, apuntados, y el resto se rellena solo: el costo
-- entra con cada compra que se registre, que es como está diseñado.
--
-- ---------------------------------------------------------------------------
-- Cuáles, y por qué esos
-- ---------------------------------------------------------------------------
-- Los diez que más veces aparecen en sus 515 facturas reales. No es un
-- capricho: son los que va a usar para probar, los que tienen historial de
-- ventas que enseñar, y cubren rodamientos, chumaceras y fajas con precios de
-- $ 3.21 a $ 514.12.
--
-- ---------------------------------------------------------------------------
-- De dónde sale cada número
-- ---------------------------------------------------------------------------
-- **P.V.** — no se toca. Es el suyo, del Excel.
--
-- **P.C. (costo)** — dos ya lo traen del Excel y se respetan. A los otros se
-- les pone `P.V. / 1.20`, que es la fórmula de su propia plantilla (la 002 la
-- comprobó exacta en sus 7 filas: 3.26→3.92, 10.70→12.84, …) y el valor con
-- el que arranca `margen_objetivo_pct`.
--
-- **P.M. (piso)** — `costo × 1.05`. NO es el suyo; es un valor de prueba
-- elegido para que quede sitio donde descontar sin romper el check.
--
--   Ojo con lo que pasa si se elige mal, que es justo el argumento de arriba:
--   con `costo × 1.12` —el centro de su rango real— el 6204-2RSH sale a 3.23
--   contra un P.V. de 3.21. El piso quedaría POR ENCIMA del precio de venta y
--   la base rechazaría todas sus ventas de ese producto.
--
--   Por eso además se acota a `P.V.` con un `least`: un piso nunca puede
--   pasarse del precio de lista, y es la misma regla que ya aplica la ficha.
--
-- **P.Mercado** — `P.V. × 1.03`. Es referencial —*«cuánto cuesta en el
-- mercado, otras personas que venden casi por lo mismo»*— y no entra en
-- ningún cálculo. Valor de prueba.
--
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Quiénes son. Se marca en `atributos` para poder deshacerlo sin listas.
-- ---------------------------------------------------------------------------
with elegidos as (
  select p.id
    from comprobante_items ci
    join comprobantes c on c.id = ci.comprobante_id and c.serie = 'F002'
    join productos p on p.id = ci.producto_id
   where p.precio_venta > 0
   group by p.id
   order by count(distinct ci.comprobante_id) desc, sum(ci.cantidad) desc
   limit 10
)
update productos p
   set ultimo_costo = case
         -- El costo real del Excel manda. Solo se calcula donde no hay nada.
         when p.ultimo_costo > 0 then p.ultimo_costo
         else round(p.precio_venta / 1.20, 4)
       end,
       atributos = coalesce(p.atributos, '{}'::jsonb)
                   || jsonb_build_object('prueba_25_09', true)
 from elegidos e
where p.id = e.id;

-- El piso y el de mercado, ya con el costo puesto.
update productos p
   set precio_minimo  = least(round(p.ultimo_costo * 1.05, 2), p.precio_venta),
       precio_mercado = round(p.precio_venta * 1.03, 2)
 where (p.atributos ->> 'prueba_25_09')::boolean is true;

-- ###########################################################################
-- CENTINELA · que ninguno quede con el piso por encima de su precio
-- ###########################################################################
-- Es el fallo que este guion existe para no cometer: un piso mal puesto no
-- avisa, bloquea la venta.
do $$
declare v_mal int; v_n int; v_sin_costo int;
begin
  select count(*) into v_n from productos where (atributos ->> 'prueba_25_09')::boolean is true;
  select count(*) into v_mal from productos
   where (atributos ->> 'prueba_25_09')::boolean is true
     and precio_minimo > precio_venta;
  select count(*) into v_sin_costo from productos
   where (atributos ->> 'prueba_25_09')::boolean is true
     and ultimo_costo <= 0;

  if v_n <> 10 then
    raise exception 'Se marcaron % productos, no 10.', v_n;
  end if;
  if v_mal > 0 then
    raise exception '% productos con el piso POR ENCIMA del precio de venta. Bloquearían la venta.', v_mal;
  end if;
  if v_sin_costo > 0 then
    raise exception '% productos quedaron sin costo: el margen saldría vacío.', v_sin_costo;
  end if;

  raise notice 'Diez productos completos y coherentes.';
end $$;

-- ###########################################################################
-- DESHACER
-- ###########################################################################
-- Devuelve los diez a como estaban: sin piso, sin precio de mercado y sin
-- costo — SALVO los dos que traían costo real del Excel, que no se tocaron al
-- ponerlo y tampoco se tocan al quitarlo.
--
-- Los costos reales del Excel, por si hiciera falta comprobarlo a mano:
--   6207-2Z/C3 → 6.0100      6204-2RSH → 2.8800
--
--     update productos
--        set precio_minimo  = 0,
--            precio_mercado = 0,
--            ultimo_costo   = case codigo
--                               when '6207-2Z/C3' then 6.0100
--                               when '6204-2RSH'  then 2.8800
--                               else 0 end,
--            atributos      = atributos - 'prueba_25_09'
--      where (atributos ->> 'prueba_25_09')::boolean is true;

-- ###########################################################################
-- LO QUE SE CREÓ PROBANDO, EL 25/09
-- ###########################################################################
-- Prueba completa del ciclo de compras, pedida por Luis. Todo con los diez
-- productos de arriba. Va aquí y no en otro guion porque sin estos productos
-- no existirían.
--
--   CMP-26-00001 · local · AUTOLAND · 10 KR52PPA a 36.00      → REC-26-00001
--   CMP-26-00002 · local · MARCO PERUANA · 10 KR52PPA a 42.00 → REC-26-00002
--   CMP-26-00003 · importación · AUTOLAND · 10 UCF208D1 a 25.00
--                  + 50.00 de gastos, DHL, tracking 7712345678 → REC-26-00003
--   COT1-000001  · ACEROS CHILCA · 1 UCF208D1 a 29.53
--
-- Stock que dejaron: KR52PPA 20 uds (valorizado 780), UCF208D1 10 (300).
--
-- Para deshacerlo: las compras se ANULAN por la RPC, que repone el stock y
-- deja el motivo escrito. Borrarlas a mano dejaría el kardex mintiendo.
--
--     select public.anular_compra(id, 'Prueba del ciclo de compras (25/09).')
--       from compras where numero in ('CMP-26-00001','CMP-26-00002','CMP-26-00003');
--
--     delete from cotizacion_items where cotizacion_id in
--       (select id from cotizaciones where numero = 'COT1-000001');
--     delete from cotizaciones where numero = 'COT1-000001';

-- ###########################################################################
-- Y LAS TRES MODALIDADES DEL REDISEÑO (095), EL MISMO 25/09
-- ###########################################################################
--   CMP-26-00004 · marítima · AUTOLAND · 20 H414249/10 a 130.00
--                  flete 300 + aduana 120 + almacenaje 40 + levante 25 = 485
--                  Maersk, BL MAEU240917001 → REC-26-00004 · unidad a 154.25
--   CMP-26-00005 · local · MARCO PERUANA · 50 B-42 a 5.00
--                  + 10 de transporte → REC-26-00005 · unidad a 5.20
--   CMP-26-00006 · aérea · AUTOLAND · 10 UCF209D1 a 24.00
--                  courier 40 + desaduanaje 20, DHL → REC-26-00006 · unidad a 30.00
--
-- Se deshacen igual que las de arriba, anulándolas por la RPC:
--
--     select public.anular_compra(id, 'Prueba de las tres modalidades (25/09).')
--       from compras where numero in ('CMP-26-00004','CMP-26-00005','CMP-26-00006');
--
-- Ojo: «Maersk» queda en el desplegable de couriers mientras exista la
-- CMP-26-00004, porque la lista sale de las compras registradas. Al anularla
-- NO se va —anular no borra la fila—; si molesta, se borra la compra.
