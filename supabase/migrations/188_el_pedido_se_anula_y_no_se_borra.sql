-- ###########################################################################
-- 188 · EL PEDIDO SE ANULA, NO SE BORRA
-- ###########################################################################
--
-- Luis, 04/11: *«el Sr. Willy eliminó el pedido dos, pero no se quedó en
-- pedidos como anulado; tiene que quedar… sería anular el pedido, para que
-- quede ahí registro. Entonces puedo hacer de nuevo la cotización, pero ya
-- sería la 3»*.
--
-- `eliminar_pedido` (135) BORRABA la fila: el PED-26-00002 desapareció sin
-- dejar rastro (sus órdenes OC02-00006 y 007 sí quedaron anuladas, con su
-- motivo). Y como `crear_pedido` numera con el máximo que existe, el
-- siguiente habría vuelto a ser el 00002: un mismo número para dos pedidos
-- distintos en dos días.
--
-- Ahora:
--   · `anular_pedido(id, motivo)` hace lo mismo que hacía eliminar —las
--     mismas reglas: el último, sin órdenes vivas, sin guía ni factura; la
--     cotización vuelve a «enviada» o se le resta lo repetido— pero el
--     pedido SE QUEDA, marcado `anulado`, con quién, cuándo, el motivo y
--     una foto de sus líneas (`lineas_anuladas`): la cotización se puede
--     editar después y lo que pidió no tiene que cambiar con ella.
--   · `eliminar_pedido` queda como sinónimo, para la pantalla vieja.
--   · El número sigue: el anulado cuenta para el máximo, así que el siguiente
--     es el 00003.
--   · Lo anulado no es vigente: no recibe órdenes, guías ni facturas, no
--     impide que la cotización se vuelva a aprobar (nace un pedido nuevo) y
--     no suma en `v_pedido_lineas` (sus líneas valen 0 ahí).
-- ###########################################################################

alter table public.pedidos
  add column if not exists anulado boolean not null default false,
  add column if not exists anulado_en timestamptz,
  add column if not exists anulado_por uuid references public.perfiles(id),
  add column if not exists motivo_anulacion text,
  add column if not exists lineas_anuladas jsonb;

comment on column public.pedidos.anulado is
  'Anulado en vez de borrado (188). Se queda en la lista con su motivo; no es vigente.';
comment on column public.pedidos.lineas_anuladas is
  'Lo que pedía al anularse: [{codigo, descripcion, cantidad, unidad_codigo, valor_unitario, descuento_pct, importe}] (188).';

-- ----------------------------------------------------------- Las líneas
-- Lo mismo que hasta hoy, con dos cambios: un pedido anulado no lleva nada,
-- y lo de un pedido anulado no se resta a los demás.
create or replace view public.v_pedido_lineas as
 select p.id as pedido_id,
    ci.id as cotizacion_item_id,
    ci.orden,
    ci.producto_id,
    ci.codigo,
    ci.descripcion,
    ci.unidad_codigo,
    ci.valor_unitario,
    ci.descuento_pct,
    q.cantidad,
    ci.costo_unitario,
    round(q.cantidad * ci.valor_unitario * (1::numeric - coalesce(ci.descuento_pct, 0::numeric) / 100.0), 2) as importe,
    round(q.cantidad * coalesce(ci.costo_unitario, 0::numeric), 2) as costo
   from pedidos p
     join cotizacion_items ci on ci.cotizacion_id = p.cotizacion_id
     left join pedido_items pi on pi.pedido_id = p.id and pi.cotizacion_item_id = ci.id
     cross join lateral (
       select case
                when p.anulado then 0::numeric
                when p.desde_aprobacion then greatest(
                  coalesce(ci.cantidad_aprobada, 0::numeric)
                  - coalesce((select sum(o2.cantidad)
                                from pedido_items o2
                                join pedidos o on o.id = o2.pedido_id
                               where o2.cotizacion_item_id = ci.id
                                 and o.id <> p.id
                                 and not o.anulado), 0::numeric),
                  0::numeric)
                else coalesce(pi.cantidad, 0::numeric)
              end as cantidad) q;

-- -------------------------------------------- Lo vigente no es lo anulado
create or replace function public.tg_pedido_vigente()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $function$
begin
  if new.cotizacion_id is not null and new.pedido_id is null then
    select id into new.pedido_id from pedidos
     where cotizacion_id = new.cotizacion_id
       and not anulado
     order by secuencia desc limit 1;
  end if;
  return new;
end $function$;

-- Al volver a aprobar una cotización con su pedido anulado, nace otro.
create or replace function public.tg_pedido_al_aprobar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.estado = 'aprobada'
     and old.estado not in ('aprobada', 'atendida')
     and not exists (select 1 from pedidos where cotizacion_id = new.id and not anulado) then
    perform public.crear_pedido(new.id, null, (coalesce(new.aprobada_en, now()) at time zone 'America/Lima')::date);
  end if;
  return null;
end $function$;

-- ---------------------------------------------------------- Anular
create or replace function public.anular_pedido(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_ped    record;
  v_ult    int;
  v_estado estado_cotizacion;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_lineas jsonb;
begin
  if not public.puede('cotizaciones','eliminar') then
    raise exception 'Tu rol no puede anular pedidos' using errcode = 'insufficient_privilege';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Di por qué se anula el pedido' using errcode = 'check_violation';
  end if;

  select * into v_ped from pedidos where id = p_id for update;
  if v_ped.id is null then
    raise exception 'El pedido no existe' using errcode = 'no_data_found';
  end if;
  if v_ped.anulado then
    raise exception 'El pedido % ya está anulado', v_ped.numero using errcode = 'check_violation';
  end if;
  perform 1 from cotizaciones where id = v_ped.cotizacion_id for update;

  select max(secuencia) into v_ult from pedidos where cotizacion_id = v_ped.cotizacion_id and not anulado;
  if v_ped.secuencia <> v_ult then
    raise exception 'Solo se puede anular el último pedido de la cotización'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from compras where pedido_id = p_id and estado <> 'anulada') then
    raise exception 'El pedido % ya tiene órdenes de compra: anúlalas antes de anularlo', v_ped.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from guias_remision where pedido_id = p_id and estado <> 'anulada') then
    raise exception 'El pedido % ya tiene guía: anúlala antes de anularlo', v_ped.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comprobantes where pedido_id = p_id and estado <> 'anulado') then
    raise exception 'El pedido % ya está facturado: no se puede anular', v_ped.numero
      using errcode = 'check_violation';
  end if;

  -- La foto de lo que pedía, ANTES de deshacer la aprobación.
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', l.codigo, 'descripcion', l.descripcion, 'cantidad', l.cantidad,
           'unidad_codigo', l.unidad_codigo, 'valor_unitario', l.valor_unitario,
           'descuento_pct', l.descuento_pct, 'importe', l.importe) order by l.orden), '[]'::jsonb)
    into v_lineas
    from v_pedido_lineas l
   where l.pedido_id = p_id and l.cantidad > 0;

  update pedidos
     set anulado = true,
         anulado_en = now(),
         anulado_por = auth.uid(),
         motivo_anulacion = left(v_motivo, 300),
         lineas_anuladas = v_lineas
   where id = p_id;

  if v_ped.desde_aprobacion then
    -- El que nació al aprobar: se deshace la aprobación.
    update cotizacion_items set cantidad_aprobada = null where cotizacion_id = v_ped.cotizacion_id;
    update cotizaciones
       set estado = 'enviada', aprobada_en = null, aprobada_por = null
     where id = v_ped.cotizacion_id;
    v_estado := 'enviada';
  else
    -- Uno repetido: lo suyo sale de lo confirmado.
    update cotizacion_items ci
       set cantidad_aprobada = greatest(coalesce(ci.cantidad_aprobada, ci.cantidad) - pi.cantidad, 0)
      from pedido_items pi
     where pi.pedido_id = p_id and pi.cotizacion_item_id = ci.id;
    update cotizaciones q
       set estado = case
             when not exists (
               select 1 from cotizacion_items ci
                where ci.cotizacion_id = q.id
                  and ci.cantidad_atendida < coalesce(ci.cantidad_aprobada, ci.cantidad))
             then 'atendida'::estado_cotizacion
             else 'aprobada'::estado_cotizacion
           end
     where q.id = v_ped.cotizacion_id
    returning estado into v_estado;
  end if;

  return jsonb_build_object('cotizacion_id', v_ped.cotizacion_id, 'numero', v_ped.numero, 'estado', v_estado);
end $function$;

comment on function public.anular_pedido(uuid, text) is
  'Anula el último pedido de una cotización sin órdenes vivas, guía ni factura (188). Se queda en la lista con su motivo y sus líneas; la cotización vuelve atrás.';

revoke all on function public.anular_pedido(uuid, text) from public, anon;
grant execute on function public.anular_pedido(uuid, text) to authenticated;

-- La pantalla vieja llama a `eliminar_pedido`: ahora anula.
create or replace function public.eliminar_pedido(p_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select public.anular_pedido(p_id, 'Anulado desde «Eliminar pedido»');
$function$;

-- El tablero: un pedido anulado no es una venta.
create or replace view public.v_ventas_concretadas as
SELECT p.id AS pedido_id,
    p.numero,
    p.cotizacion_id,
    p.cliente_id,
    p.fecha,
    (COALESCE(l.venta, (0)::numeric))::numeric(14,2) AS venta,
    (COALESCE(l.costo, (0)::numeric))::numeric(14,2) AS costo,
    ((p.secuencia > 1) OR (NOT p.desde_aprobacion)) AS es_repeticion,
    'pedido'::text AS origen
   FROM (pedidos p
     LEFT JOIN LATERAL ( SELECT sum(vl.importe) AS venta,
            sum(vl.costo) AS costo
           FROM v_pedido_lineas vl
          WHERE (vl.pedido_id = p.id)) l ON (true))
  WHERE (NOT p.anulado)
UNION ALL
 SELECT NULL::uuid AS pedido_id,
    c.numero,
    c.id AS cotizacion_id,
    c.cliente_id,
    COALESCE(((c.aprobada_en AT TIME ZONE 'America/Lima'::text))::date, c.fecha) AS fecha,
    (COALESCE(c.subtotal, (0)::numeric))::numeric(14,2) AS venta,
    (COALESCE(( SELECT sum(round((
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM pedidos p2
                      WHERE (p2.cotizacion_id = c.id))) THEN ci.cantidad
                    ELSE COALESCE(ci.cantidad_aprobada, ci.cantidad)
                END * COALESCE(ci.costo_unitario, (0)::numeric)), 2)) AS sum
           FROM cotizacion_items ci
          WHERE (ci.cotizacion_id = c.id)), (0)::numeric))::numeric(14,2) AS costo,
    false AS es_repeticion,
    'historico'::text AS origen
   FROM cotizaciones c
  WHERE ((c.estado = ANY (ARRAY['aprobada'::estado_cotizacion, 'atendida'::estado_cotizacion])) AND (NOT (EXISTS ( SELECT 1
           FROM pedidos p
          WHERE ((p.cotizacion_id = c.id) AND p.desde_aprobacion)))));

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA y se deshace: aprobar crea el pedido; anularlo lo deja anulado
-- con sus líneas y la cotización en «enviada»; aprobar otra vez crea OTRO
-- pedido con el número siguiente; y las líneas del anulado valen 0.
do $$
declare
  v_ger  uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
  v_cli  uuid := (select id from clientes limit 1);
  v_prod uuid := (select id from productos where not archivado and not es_kit limit 1);
  v_cot uuid; v_p1 record; v_p2 record; v_n1 int; v_n2 int;
begin
  if v_ger is null or v_cli is null or v_prod is null then
    raise notice '188: faltan datos; el centinela no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    insert into cotizaciones (serie, correlativo, cliente_id, estado, fecha)
    values ('ZZ188', 999999, v_cli, 'enviada', current_date) returning id into v_cot;
    insert into cotizacion_items (cotizacion_id, producto_id, orden, codigo, descripcion, cantidad, unidad_codigo, valor_unitario)
    values (v_cot, v_prod, 1, 'ZZ1', 'x', 4, 'NIU', 10);

    update cotizacion_items set cantidad_aprobada = 4 where cotizacion_id = v_cot;
    update cotizaciones set estado = 'aprobada', aprobada_en = now() where id = v_cot;
    select * into v_p1 from pedidos where cotizacion_id = v_cot;
    if v_p1.id is null then raise exception '188: aprobar no creó el pedido'; end if;
    v_n1 := substring(v_p1.numero from '(\d+)$')::int;

    perform public.anular_pedido(v_p1.id, 'prueba del centinela');
    select * into v_p1 from pedidos where id = v_p1.id;
    if v_p1.id is null or not v_p1.anulado then raise exception '188: el pedido no quedó anulado'; end if;
    if jsonb_array_length(v_p1.lineas_anuladas) <> 1 or (v_p1.lineas_anuladas -> 0 ->> 'cantidad')::numeric <> 4 then
      raise exception '188: la foto de las líneas no es la esperada: %', v_p1.lineas_anuladas;
    end if;
    if (select estado from cotizaciones where id = v_cot) <> 'enviada' then
      raise exception '188: la cotización no volvió a enviada';
    end if;
    if exists (select 1 from v_pedido_lineas where pedido_id = v_p1.id and cantidad > 0) then
      raise exception '188: el pedido anulado sigue sumando líneas';
    end if;

    update cotizacion_items set cantidad_aprobada = 4 where cotizacion_id = v_cot;
    update cotizaciones set estado = 'aprobada', aprobada_en = now() where id = v_cot;
    select * into v_p2 from pedidos where cotizacion_id = v_cot and not anulado;
    if v_p2.id is null then raise exception '188: aprobar otra vez no creó otro pedido'; end if;
    v_n2 := substring(v_p2.numero from '(\d+)$')::int;
    if v_n2 <> v_n1 + 1 or v_p2.secuencia <> 2 then
      raise exception '188: el nuevo es % (secuencia %) y se esperaba el número siguiente a %', v_p2.numero, v_p2.secuencia, v_p1.numero;
    end if;
    if (select sum(cantidad) from v_pedido_lineas where pedido_id = v_p2.id) <> 4 then
      raise exception '188: el pedido nuevo no lleva sus 4';
    end if;

    raise exception '__188_DESHACER__';
  exception when others then
    if sqlerrm <> '__188_DESHACER__' then raise; end if;
  end;
  raise notice '188: anular deja el pedido con su foto, la cotización vuelve atrás y el siguiente número sigue; deshecho limpio.';
end $$;
