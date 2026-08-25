-- ###########################################################################
-- 018 · La guía también sale de una cotización YA FACTURADA
-- ###########################################################################
--
-- `generar_guia_desde_cotizacion()` solo aceptaba cotizaciones en `aprobada`.
-- Parece razonable hasta que se mira el ciclo real:
--
--   cotizar → aprobar → despachar (guía) → facturar
--
-- Facturar deja la cotización en **`atendida`**, y eso la sacaba para siempre
-- del alcance de la función. Con lo cual:
--
--   · Facturar antes de entregar —que es lo normal en una venta al crédito,
--     donde la factura sale con el pedido y la mercadería va después— dejaba
--     la venta SIN forma de emitir su guía. Y la guía es el único documento
--     por el que el stock sale del almacén, así que la mercadería salía sin
--     que el sistema se enterara.
--
--   · Un despacho PARCIAL con la factura en medio quedaba a medias: la
--     primera guía sí, se factura, y la segunda ya no se podía emitir.
--
-- La corrección: `atendida` significa «ya se facturó», no «ya se entregó
-- todo». Lo entregado se sabe por `guia_items`, que es donde se cuenta de
-- verdad — la función ya arrastra `cotizacion_item_id` justamente para eso.
--
-- Lo que se sigue rechazando no cambia: borrador, enviada, rechazada, vencida
-- y anulada. De una cotización que el cliente no ha aceptado no sale
-- mercadería.
--
-- Idempotente: solo reemplaza la comprobación de estado.

set search_path = public, extensions;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generar_guia_desde_cotizacion';

  if v_def is null then
    raise exception 'No existe generar_guia_desde_cotizacion: aplica antes 004_funciones.sql';
  end if;

  -- Se reescribe SOLO la línea de la comprobación, sobre la definición que
  -- haya en la base. Copiar la función entera aquí la duplicaría, y a la
  -- siguiente vez que alguien tocara 004 las dos versiones se separarían sin
  -- que nadie lo notara.
  if position('v_estado <> ''aprobada''' in v_def) = 0 then
    raise notice 'La comprobación ya estaba cambiada; no se toca nada.';
  else
    v_def := replace(
      v_def,
      'if v_estado <> ''aprobada'' then',
      'if v_estado not in (''aprobada'', ''atendida'') then'
    );
    v_def := replace(
      v_def,
      'Solo se genera guía desde una cotización aprobada (estado actual: %)',
      'Solo se genera guía desde una cotización aprobada o ya facturada (estado actual: %)'
    );
    execute v_def;
  end if;
end $$;

comment on function public.generar_guia_desde_cotizacion(jsonb) is
  'Crea la guía en borrador desde una cotización aprobada o ya facturada. `atendida` significa facturada, no entregada: lo entregado se cuenta en guia_items.';


-- ---------------------------------------------------------------------------
-- Centinela
-- ---------------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generar_guia_desde_cotizacion';

  if position('''aprobada'', ''atendida''' in v_def) = 0 then
    raise exception 'generar_guia_desde_cotizacion sigue rechazando las cotizaciones facturadas';
  end if;

  -- El control de rol tiene que seguir ahí después de reescribir la función.
  if v_def !~ 'puede_escribir|tiene_rol|es_gerencia' then
    raise exception 'generar_guia_desde_cotizacion se quedó sin control de rol';
  end if;
end $$;
