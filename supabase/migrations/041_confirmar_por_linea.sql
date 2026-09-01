-- ###########################################################################
-- 041 · EL CLIENTE CONFIRMA UNA PARTE, NO SIEMPRE TODO
-- ###########################################################################
--
-- Willy, 01/09 (29:05), describiendo lo que le pasa todos los días:
--
--   *«Al día siguiente ya me estarían confirmando, tal vez después de dos,
--   tres días, me están confirmando el total o parte de lo cotizado.»*
--
-- Hasta hoy `aprobar_cotizacion` marcaba el documento entero como 'aprobada' y
-- nada más. Así que de una cotización de seis ítems donde el cliente pidió
-- cuatro, el sistema creía que los seis estaban vendidos.
--
-- Eso no es un detalle de registro: es lo que rompe todo lo que viene detrás.
-- La bandeja «Por comprar» sale de restar lo confirmado menos el stock; si lo
-- confirmado son siempre los seis, Willy compraría dos rodamientos que nadie
-- le pidió, con su plata, para que se queden en el anaquel.
--
-- ---------------------------------------------------------------------------
-- Por qué una columna nueva y no reescribir `cantidad`
-- ---------------------------------------------------------------------------
-- Porque son dos hechos distintos y los dos hacen falta. `cantidad` es lo que
-- se COTIZÓ y va impreso en un PDF que el cliente tiene en su correo: pisarla
-- al confirmar reescribiría la historia y dejaría el documento sin cuadrar con
-- su propia copia.
--
-- `cantidad_aprobada` es lo que el cliente ACEPTÓ, y se escribe después.
--
-- Nace en null a propósito, y null significa «todavía no ha contestado». No se
-- puede usar 0 para eso: 0 es una respuesta —«esta línea no la quiero»— y son
-- dos situaciones que llevan a acciones opuestas. Con null, la cotización
-- pendiente no entra en la bandeja de compras; con 0, tampoco entra, pero
-- porque ya se descartó.

set search_path = public, extensions;

alter table cotizacion_items
  add column if not exists cantidad_aprobada numeric(14,2);

-- No se puede confirmar más de lo que se cotizó. Si el cliente quiere más, es
-- otra cotización con su precio, no un número editado a mano aquí — y sobre
-- todo: el importe impreso ya no cuadraría con lo que se va a facturar.
do $$ begin
  alter table cotizacion_items add constraint cotiz_item_aprobada_ok check (
    cantidad_aprobada is null
    or (cantidad_aprobada >= 0 and cantidad_aprobada <= cantidad)
  );
exception when duplicate_object then null; end $$;

comment on column cotizacion_items.cantidad_aprobada is
  'Lo que el cliente aceptó de esta línea. Null = todavía no contestó; 0 = contestó que esta no. `cantidad` no se toca: es lo que se imprimió y el cliente tiene esa copia.';

-- ---------------------------------------------------------------------------
-- aprobar_cotizacion, aceptando el detalle
-- ---------------------------------------------------------------------------
-- El parámetro es OPCIONAL y por defecto aprueba todo. Dos motivos:
--
--   · Es lo que pasa casi siempre. Obligar a enumerar seis líneas para decir
--     «me confirmaron las seis» es trabajo inventado.
--   · La firma vieja `aprobar_cotizacion(uuid)` se sigue pudiendo llamar. Hay
--     una pantalla llamándola hoy y no tiene por qué enterarse.
--
-- `create or replace` no vale aquí: añadir un parámetro con default crea una
-- SEGUNDA función con la misma firma para una llamada de un argumento, y
-- Postgres ya no sabría cuál elegir («function is not unique»). Hay que tirar
-- la vieja primero.
drop function if exists public.aprobar_cotizacion(uuid);

create or replace function public.aprobar_cotizacion(
  p_id     uuid,
  p_lineas jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_estado    estado_cotizacion;
  v_fila      jsonb;
  v_item      uuid;
  v_cant      numeric(14,2);
  v_tocadas   int := 0;
  v_confirmadas int;
begin
  -- Control de rol. Es `security definer`: se salta RLS, así que sin esto
  -- cualquiera con sesión aprueba cotizaciones por PostgREST. Va lo PRIMERO.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede aprobar una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  select estado into v_estado from cotizaciones where id = p_id for update;
  if v_estado is null then
    raise exception 'Cotización % no existe', p_id using errcode = 'no_data_found';
  end if;
  if v_estado not in ('borrador','enviada') then
    raise exception 'La cotización está en estado % y no se puede aprobar', v_estado
      using errcode = 'check_violation';
  end if;

  if p_lineas is null then
    -- Confirmación completa: cada línea se aprueba por lo que se cotizó.
    update cotizacion_items
       set cantidad_aprobada = cantidad
     where cotizacion_id = p_id;
  else
    -- Confirmación parcial. Se parte de CERO y se sube lo que el cliente dijo:
    -- al revés —dejar lo no mencionado en su cantidad— una línea que se
    -- olvidara de listar se daría por vendida en silencio, que es justo el
    -- fallo que esta migración viene a arreglar.
    update cotizacion_items set cantidad_aprobada = 0 where cotizacion_id = p_id;

    for v_fila in select * from jsonb_array_elements(p_lineas) loop
      v_item := nullif(v_fila ->> 'item_id','')::uuid;
      v_cant := coalesce((v_fila ->> 'cantidad')::numeric, 0);

      if v_item is null then
        raise exception 'Una de las líneas llegó sin item_id'
          using errcode = 'invalid_parameter_value';
      end if;

      update cotizacion_items
         set cantidad_aprobada = v_cant
       where id = v_item and cotizacion_id = p_id;

      if not found then
        -- Una línea de OTRA cotización. Sin esta comprobación se aceptaría en
        -- silencio y el total confirmado saldría mal sin que nadie lo notara.
        raise exception 'La línea % no pertenece a esta cotización', v_item
          using errcode = 'foreign_key_violation';
      end if;
      v_tocadas := v_tocadas + 1;
    end loop;

    if v_tocadas = 0 then
      raise exception 'No llegó ninguna línea confirmada. Para aprobarla entera, no mandes el detalle.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  select count(*) into v_confirmadas
    from cotizacion_items
   where cotizacion_id = p_id and coalesce(cantidad_aprobada, 0) > 0;

  -- Cero líneas confirmadas no es una aprobación, es un rechazo. Y decirlo
  -- importa: una cotización «aprobada» sin nada dentro se quedaría esperando
  -- una guía que nunca se va a emitir.
  if v_confirmadas = 0 then
    raise exception 'No confirmaron ninguna línea. Si el cliente dijo que no, márcala como rechazada.'
      using errcode = 'check_violation';
  end if;

  update cotizaciones
     set estado = 'aprobada', aprobada_en = now(), aprobada_por = auth.uid()
   where id = p_id;

  return jsonb_build_object(
    'id', p_id,
    'estado', 'aprobada',
    'lineas_confirmadas', v_confirmadas,
    'parcial', p_lineas is not null
  );
end $$;

comment on function public.aprobar_cotizacion(uuid, jsonb) is
  'Aprueba la cotización. Sin detalle confirma todas las líneas por su cantidad cotizada; con detalle confirma solo lo que llega y pone el resto en 0. Willy (29:05): «me están confirmando el total o parte de lo cotizado».';

revoke execute on function public.aprobar_cotizacion(uuid, jsonb) from public, anon;
grant execute on function public.aprobar_cotizacion(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lo confirmado que todavía no se ha entregado
-- ---------------------------------------------------------------------------
-- La materia prima de la bandeja «Por comprar». Se deja aquí, con el resto del
-- cambio, para que la pantalla que venga después no tenga que reconstruir
-- ninguna de estas reglas por su cuenta.
create or replace view v_comprometido
with (security_invoker = true) as
select
  ci.producto_id,
  ci.cotizacion_id,
  ci.id                      as item_id,
  q.numero                   as cotizacion,
  q.fecha,
  q.cliente_id,
  cl.razon_social            as cliente,
  ci.codigo,
  ci.descripcion,
  ci.marca,
  ci.disponibilidad,
  coalesce(ci.dias_entrega, public.dias_por_defecto(ci.disponibilidad)) as dias_entrega,
  ci.cantidad                as cotizado,
  ci.cantidad_aprobada       as comprometido,
  ci.costo_unitario          as costo_referencia,
  coalesce(s.cantidad, 0)    as stock,
  -- Lo que falta para poder entregarlo. `greatest(...,0)` porque tener de
  -- sobra no es un número negativo que comprar.
  greatest(ci.cantidad_aprobada - coalesce(s.cantidad, 0), 0) as falta
from cotizacion_items ci
join cotizaciones q on q.id = ci.cotizacion_id
join clientes cl    on cl.id = q.cliente_id
left join stock s   on s.producto_id = ci.producto_id
where q.estado = 'aprobada'
  and ci.producto_id is not null
  and coalesce(ci.cantidad_aprobada, 0) > 0;

comment on view v_comprometido is
  'Líneas confirmadas por el cliente que siguen pendientes de entregar, con lo que falta contra el stock. Es de donde sale la bandeja «Por comprar».';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_n     int;
  v_cols  int;
begin
  -- Nada de lo ya cotizado queda confirmado por accidente: null es «no ha
  -- contestado», y ninguna de las cotizaciones existentes lo ha hecho.
  select count(*) into v_n from cotizacion_items where cantidad_aprobada is not null;
  if v_n > 0 then
    raise exception '% líneas quedaron confirmadas sin que nadie las confirmara', v_n;
  end if;

  -- La firma de un argumento tiene que haber desaparecido: si quedaran las
  -- dos, una llamada de un solo parámetro sería ambigua y fallaría en
  -- producción, no aquí.
  select count(*) into v_n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'aprobar_cotizacion';
  if v_n <> 1 then
    raise exception 'Hay % versiones de aprobar_cotizacion; tiene que quedar una', v_n;
  end if;

  -- Y esa que queda tiene que seguir aceptando la llamada vieja de un
  -- argumento, que es la que hace la pantalla de hoy.
  select pronargdefaults into v_cols
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'aprobar_cotizacion';
  if coalesce(v_cols, 0) < 1 then
    raise exception 'aprobar_cotizacion ya no se puede llamar con un solo argumento';
  end if;

  perform 1 from v_comprometido limit 1;

  raise notice 'Confirmación por línea lista, y v_comprometido ya sabe qué falta para entregar.';
end $$;
