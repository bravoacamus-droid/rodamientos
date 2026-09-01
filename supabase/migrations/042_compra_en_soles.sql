-- ###########################################################################
-- 042 · LA COMPRA LOCAL VIENE EN SOLES
-- ###########################################################################
--
-- El agujero más caro encontrado hasta ahora, y no salió de una reunión: salió
-- de leer el esquema al diseñar el flujo de compras.
--
-- ---------------------------------------------------------------------------
-- Qué pasaba
-- ---------------------------------------------------------------------------
-- Todo el sistema es en dólares y a propósito. La cabecera de la 002 lo dice
-- en su línea 7: *«Moneda siempre USD → no hay tabla de tipo de cambio ni
-- columna moneda»*. Y para VENDER es verdad: Willy cotiza y factura en USD, y
-- `empresa` hasta tiene un check que lo obliga.
--
-- Pero él no compra en dólares. Willy, 01/09 (28:05):
--
--   *«— ¿Puede ser importación también?
--     — Compras locales, generalmente.»*
--
-- Y un proveedor de Lima factura en SOLES. No había dónde ponerlo. Quien
-- registrara la compra tenía dos opciones, las dos malas: convertir de cabeza,
-- o escribir el número que dice la factura. Si escribe el número:
--
--     rodamiento a S/ 15.20  →  se guarda como $ 15.20
--
-- El costo queda inflado unas 3,7 veces. Y no salta ningún error: el kardex lo
-- acepta, `productos.ultimo_costo` se actualiza con él, el margen del
-- formulario sale negativo, `v_valorizacion_inventario` da una cifra falsa y
-- el piso de venta que calcula el cotizador se vuelve absurdo. Todo con datos
-- que parecen normales.
--
-- Es el peor tipo de fallo: envenena despacio y solo se descubre cuando ya hay
-- meses de compras dentro.
--
-- ---------------------------------------------------------------------------
-- Cómo se arregla
-- ---------------------------------------------------------------------------
-- Se guarda lo que DICE LA FACTURA —el número en soles— más la moneda y el
-- tipo de cambio. La conversión a dólares ocurre en un solo sitio: al mover el
-- kardex, que es la única puerta por la que entra stock.
--
-- Escribir lo que se tiene delante siempre es menos trabajo y menos errores
-- que hacer una cuenta de cabeza. Y deja auditable de dónde salió el costo.
--
-- El check es la pieza que de verdad cierra el agujero: **una compra en soles
-- sin tipo de cambio no se puede guardar**. Antes el error era silencioso;
-- ahora es imposible.
--
-- `packages/consultas/src/tipo-cambio.ts` ya trae el de SUNAT, está probado y
-- no lo llamaba nadie. La pantalla lo va a usar para proponer el del día.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · La compra
-- ---------------------------------------------------------------------------
alter table compras
  add column if not exists moneda char(3) not null default 'USD';
alter table compras
  add column if not exists tipo_cambio numeric(9,4);

do $$ begin
  alter table compras add constraint compras_moneda_conocida
    check (moneda in ('USD','PEN'));
exception when duplicate_object then null; end $$;

-- EL check. En dólares no hay nada que convertir, así que el tipo de cambio
-- sobra y se exige null —guardar un 1.0000 invitaría a que alguien lo
-- multiplicara dos veces—. En soles es obligatorio y positivo.
do $$ begin
  alter table compras add constraint compras_tc_coherente check (
    (moneda = 'USD' and tipo_cambio is null)
    or (moneda <> 'USD' and tipo_cambio is not null and tipo_cambio > 0)
  );
exception when duplicate_object then null; end $$;

comment on column compras.moneda is
  'La moneda de la FACTURA DEL PROVEEDOR. Willy compra local (01/09, 28:05) y en Lima se factura en soles; vender sigue siendo siempre en USD.';
comment on column compras.tipo_cambio is
  'Soles por dólar el día de la compra. Obligatorio si la moneda no es USD, y prohibido si lo es: un 1.0000 guardado se acaba multiplicando dos veces.';

-- ---------------------------------------------------------------------------
-- 2 · La recepción
-- ---------------------------------------------------------------------------
-- Lleva las suyas y no las lee de la compra por dos razones. Una: puede no
-- haber compra —`recepciones.compra_id` es opcional desde la 002—. Dos: el
-- costo real es el de la factura que llega CON la mercadería, y puede venir a
-- otro tipo de cambio que el del día en que se pidió.
alter table recepciones
  add column if not exists moneda char(3) not null default 'USD';
alter table recepciones
  add column if not exists tipo_cambio numeric(9,4);

do $$ begin
  alter table recepciones add constraint recepciones_moneda_conocida
    check (moneda in ('USD','PEN'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table recepciones add constraint recepciones_tc_coherente check (
    (moneda = 'USD' and tipo_cambio is null)
    or (moneda <> 'USD' and tipo_cambio is not null and tipo_cambio > 0)
  );
exception when duplicate_object then null; end $$;

comment on column recepciones.moneda is
  'La moneda de los costos de ESTA recepción, que es la de la factura que llegó con la mercadería. Puede diferir de la compra si el proveedor facturó distinto.';

-- ---------------------------------------------------------------------------
-- 3 · La conversión, en un solo sitio
-- ---------------------------------------------------------------------------
create or replace function public.a_dolares(
  p_monto       numeric,
  p_moneda      char(3),
  p_tipo_cambio numeric
) returns numeric
language plpgsql immutable parallel safe
as $$
begin
  if p_monto is null then
    return null;
  end if;
  if coalesce(p_moneda, 'USD') = 'USD' then
    return p_monto;
  end if;
  -- Sin tipo de cambio NO se adivina y NO se devuelve el monto tal cual: eso
  -- es exactamente el fallo que esta migración arregla. Se rompe ruidosamente.
  if p_tipo_cambio is null or p_tipo_cambio <= 0 then
    raise exception 'Falta el tipo de cambio para convertir % desde %', p_monto, p_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  -- Cuatro decimales, como `costo_unitario`. Redondear a dos aquí perdería
  -- precisión en productos baratos comprados por cientos.
  return round(p_monto / p_tipo_cambio, 4);
end $$;

comment on function public.a_dolares(numeric, char, numeric) is
  'Lleva un monto a dólares, que es la moneda en la que vive todo el sistema. Falla si falta el tipo de cambio en vez de devolver el número sin convertir: devolverlo era el fallo.';

revoke execute on function public.a_dolares(numeric, char, numeric) from public, anon;
grant execute on function public.a_dolares(numeric, char, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4 · La recepción convierte antes de tocar el kardex
-- ---------------------------------------------------------------------------
-- Único cambio de fondo: el costo que va al movimiento pasa por `a_dolares`.
-- Y la recepción hereda moneda y tipo de cambio de su compra cuando no le
-- mandan otros, que es lo normal.
--
-- El factor de gastos NO se convierte, y es correcto: es un cociente entre dos
-- montos de la misma moneda, así que no tiene unidades.
create or replace function public.recepcionar_mercaderia(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_recepcion uuid;
  v_numero    text;
  v_compra    uuid := nullif(p_datos ->> 'compra_id','')::uuid;
  v_items     jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_gastos    numeric(14,2) := 0;
  v_base      numeric(14,2) := 0;
  v_factor    numeric(12,6) := 1;
  v_moneda    char(3);
  v_tc        numeric(9,4);
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño
  -- y SE SALTA las políticas de RLS. Sin esta comprobación, cualquier
  -- usuario con sesión podía llamarla por PostgREST y recepcionar mercadería
  -- sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado o
  -- stock movido.
  if not public.puede_escribir('recepciones') then
    raise exception 'Tu rol no puede recepcionar mercadería'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La recepción no tiene ítems' using errcode = 'invalid_parameter_value';
  end if;

  -- Moneda: lo que manden; si no, lo de la compra; si no hay compra, dólares.
  v_moneda := coalesce(
    nullif(p_datos ->> 'moneda','')::char(3),
    (select c.moneda from compras c where c.id = v_compra),
    'USD');
  v_tc := coalesce(
    nullif(p_datos ->> 'tipo_cambio','')::numeric,
    (select c.tipo_cambio from compras c where c.id = v_compra));

  -- Se comprueba ANTES de quemar el correlativo y de escribir nada. El check
  -- de la tabla diría lo mismo, pero tres sentencias más tarde.
  if v_moneda <> 'USD' and (v_tc is null or v_tc <= 0) then
    raise exception 'Una recepción en % necesita su tipo de cambio', v_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda = 'USD' then
    v_tc := null;
  end if;

  v_numero := public.siguiente_numero_interno('recepcion');

  insert into recepciones (numero, compra_id, proveedor_id, fecha, guia_proveedor, factura_proveedor, recibido_por, observaciones, moneda, tipo_cambio)
  values (
    v_numero, v_compra,
    coalesce(nullif(p_datos ->> 'proveedor_id','')::uuid, (select c.proveedor_id from compras c where c.id = v_compra)),
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    nullif(p_datos ->> 'guia_proveedor',''),
    nullif(p_datos ->> 'factura_proveedor',''),
    auth.uid(),
    nullif(p_datos ->> 'observaciones',''),
    v_moneda, v_tc
  ) returning id into v_recepcion;

  -- Los ítems se guardan EN LA MONEDA DE LA FACTURA, sin convertir: es el
  -- número que el operador tiene delante y contra el que se audita después.
  insert into recepcion_items (recepcion_id, producto_id, cantidad, costo_unitario)
  select v_recepcion,
         (i ->> 'producto_id')::uuid,
         (i ->> 'cantidad')::numeric,
         coalesce(nullif(i ->> 'costo_unitario','')::numeric, 0)
  from jsonb_array_elements(v_items) i;

  -- Gastos de importación: reparto SIMPLE por valor, no landed cost (§2.11).
  -- Willy compra por DHL; el courier y el despacho express se distribuyen
  -- proporcionalmente al valor de la línea y con eso basta.
  --
  -- El factor sale de dos montos de la MISMA moneda, así que es adimensional
  -- y se aplica igual antes o después de convertir.
  if v_compra is not null then
    select coalesce(c.gastos_importacion, 0) into v_gastos from compras c where c.id = v_compra;
    select coalesce(sum(ri.cantidad * ri.costo_unitario), 0) into v_base
      from recepcion_items ri where ri.recepcion_id = v_recepcion;
    if v_gastos > 0 and v_base > 0 then
      v_factor := 1 + (v_gastos / v_base);
    end if;
  end if;

  -- UN solo llamado al kardex para toda la recepción.
  --
  -- Y AQUÍ se convierte: el kardex, el costo promedio y `ultimo_costo` viven
  -- en dólares, y este es el único sitio por el que entra stock al sistema.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
        'producto_id',       ri.producto_id,
        'tipo',              'ingreso',
        'cantidad',          ri.cantidad,
        'costo_unitario',    public.a_dolares(round(ri.costo_unitario * v_factor, 4), v_moneda, v_tc),
        'referencia_tipo',   'recepcion',
        'referencia_id',     v_recepcion,
        'referencia_numero', v_numero,
        'motivo',            case when v_moneda = 'USD'
                                  then 'Recepción de mercadería'
                                  else 'Recepción de mercadería · ' || v_moneda || ' a ' || v_tc::text
                             end
      ) order by ri.producto_id)
     from recepcion_items ri where ri.recepcion_id = v_recepcion)
  );

  -- Avance de la compra.
  if v_compra is not null then
    update compra_items ci
       set cantidad_recibida = least(ci.cantidad, ci.cantidad_recibida + ri.cantidad)
      from recepcion_items ri
     where ri.recepcion_id = v_recepcion
       and ci.compra_id = v_compra
       and ci.producto_id = ri.producto_id;

    update compras c
       set estado = case
             when not exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida < x.cantidad)
               then 'recibida'::estado_compra
             when exists (select 1 from compra_items x where x.compra_id = c.id and x.cantidad_recibida > 0)
               then 'recibida_parcial'::estado_compra
             else c.estado end
     where c.id = v_compra;
  end if;

  return jsonb_build_object('id', v_recepcion, 'numero', v_numero,
                            'items', jsonb_array_length(v_items), 'factor_gastos', v_factor,
                            'moneda', v_moneda, 'tipo_cambio', v_tc);
end $$;

comment on function public.recepcionar_mercaderia(jsonb) is
  'Crea la recepción, sus ítems y TODOS los movimientos de ingreso en una sola llamada. Es el único camino por el que entra stock, y por eso es donde se convierte a dólares lo que vino en soles.';

-- ---------------------------------------------------------------------------
-- 5 · El historial de precios de compra
-- ---------------------------------------------------------------------------
-- Willy, 01/09: *«sería bueno poner el último precio que compra, así con el
-- precio anterior haya historial y mejorar los precios»*.
--
-- El dato ya estaba —cada recepción deja su movimiento con costo y fecha— pero
-- no había forma de leerlo por producto y proveedor. `v_historial_precios`, que
-- ya existía, es de precios de VENTA a clientes: otra cosa.
--
-- Todo en DÓLARES, ya convertido, porque el sentido de la vista es comparar
-- una compra contra la anterior y en soles no serían comparables entre sí.
create or replace view v_precios_compra
with (security_invoker = true) as
select
  ri.producto_id,
  p.codigo,
  p.descripcion,
  r.id                      as recepcion_id,
  r.numero                  as documento,
  r.fecha,
  r.proveedor_id,
  pr.razon_social           as proveedor,
  r.moneda,
  r.tipo_cambio,
  ri.costo_unitario         as costo_moneda,
  public.a_dolares(ri.costo_unitario, r.moneda, r.tipo_cambio) as costo_usd,
  ri.cantidad,
  -- El costo de la compra ANTERIOR del mismo producto, para poder decir
  -- «subió un 12 %» sin que la pantalla tenga que hacer dos consultas.
  lag(public.a_dolares(ri.costo_unitario, r.moneda, r.tipo_cambio))
    over (partition by ri.producto_id order by r.fecha, r.numero) as costo_anterior_usd
from recepcion_items ri
join recepciones r    on r.id = ri.recepcion_id
join productos p      on p.id = ri.producto_id
left join proveedores pr on pr.id = r.proveedor_id
where not r.anulada;

comment on view v_precios_compra is
  'A cuánto se compró cada producto, cuándo y a quién, con el costo de la vez anterior al lado. Todo en dólares ya convertidos: en soles no serían comparables entre sí.';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok  boolean;
  v_val numeric;
begin
  -- La conversión.
  if public.a_dolares(15.20, 'PEN', 3.7500) is distinct from 4.0533 then
    raise exception 'a_dolares convierte mal: % en vez de 4.0533',
      public.a_dolares(15.20, 'PEN', 3.7500);
  end if;
  if public.a_dolares(15.20, 'USD', null) is distinct from 15.20 then
    raise exception 'a_dolares toca un monto que ya estaba en dólares';
  end if;
  if public.a_dolares(null, 'PEN', 3.75) is not null then
    raise exception 'a_dolares inventa un monto donde no había ninguno';
  end if;

  -- EL caso: soles sin tipo de cambio tiene que ROMPER, no devolver 15.20.
  -- Devolverlo era exactamente el fallo.
  begin
    v_val := public.a_dolares(15.20, 'PEN', null);
    raise exception 'a_dolares devolvió % para soles sin tipo de cambio; tenía que fallar', v_val;
  exception when invalid_parameter_value then null;
  end;

  -- Y la base tampoco deja guardar esa compra.
  begin
    insert into compras (numero, proveedor_id, moneda, tipo_cambio)
    values ('ZZTEST-042', (select id from proveedores limit 1), 'PEN', null);
    raise exception 'La base aceptó una compra en soles sin tipo de cambio';
  exception
    when check_violation then null;
    when not_null_violation then null;  -- no hay proveedores todavía: el check ni se llegó a probar
  end;

  -- En dólares, el tipo de cambio tiene que sobrar.
  select exists (
    select 1 from pg_constraint
     where conname = 'compras_tc_coherente' and conrelid = 'compras'::regclass
  ) into v_ok;
  if not v_ok then
    raise exception 'Falta el check que impide una compra en soles sin tipo de cambio';
  end if;

  perform 1 from v_precios_compra limit 1;

  raise notice 'La compra en soles ya no puede entrar sin tipo de cambio, y el kardex sigue siendo en dólares.';
end $$;
