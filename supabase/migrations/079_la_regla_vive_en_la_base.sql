-- ###########################################################################
-- 079 · LA REGLA VIVE EN LA BASE, NO SOLO EN LA FUNCIÓN
-- ###########################################################################
--
-- Auditoría del 11/09, hallazgo 2 (§AK.4.1). Luis, al ver las tres decisiones:
-- *«claro, ayúdame a mejorar todo»*.
--
-- ---------------------------------------------------------------------------
-- El problema
-- ---------------------------------------------------------------------------
-- Las reglas de «hasta dónde se puede tocar un documento» están dentro de las
-- funciones: `anular_comprobante` exige gerencia y repone el stock,
-- `actualizar_cotizacion` (070) mira el estado y si ya hay guía o factura,
-- `corregir_confirmado` respeta los tres topes.
--
-- Pero el permiso de escritura es **por tabla y rol** (`permisos_rol`, 007), no
-- por función. Y quien puede llamar la función puede escribir la tabla
-- directamente por PostgREST. Mirando la matriz: `ventas` escribe
-- `cotizaciones`, `cotizacion_items`, `comprobantes` y `comprobante_items`.
--
-- Así que un vendedor, con una petición que no pasa por ninguna pantalla,
-- podía:
--
--   · poner `estado = 'anulado'` en una factura emitida — saltándose el rol de
--     gerencia Y, lo que de verdad duele, **sin reponer el stock** que esa
--     factura descargó: mercadería que sale del almacén y no vuelve al kardex;
--   · cambiar `cotizacion_items.valor_unitario` de una aprobada, por debajo
--     del precio mínimo y sin los tres topes;
--   · o anular una cotización ya facturada.
--
-- `trg_comprobante_inmutable` (006) cubre una parte, pero solo cuando el
-- comprobante está `aceptado` por SUNAT. Hoy no se declara nada —la GRE está
-- sin escribir y faltan las credenciales SOL— así que ese candado está
-- apagado justo ahora.
--
-- ---------------------------------------------------------------------------
-- Cómo se distingue una función de una petición directa
-- ---------------------------------------------------------------------------
-- Por `current_user`, y no hace falta nada más.
--
-- PostgREST atiende a un usuario con sesión haciendo `set role authenticated`.
-- Dentro de una función `security definer`, Postgres cambia el usuario actual
-- al DUEÑO de la función. O sea: si `current_user` sigue siendo
-- `authenticated`, esto NO viene de una de nuestras funciones — viene de una
-- petición directa contra la tabla.
--
-- El cliente de servicio (`service_role`) también pasa, y es deliberado: lo usa
-- el envío a SUNAT para escribir la respuesta del CDR.
--
-- ---------------------------------------------------------------------------
-- Lo que NO se rompe
-- ---------------------------------------------------------------------------
-- Se revisó una por una cada escritura directa que hace la aplicación:
--
--   · `comprobantes`: solo columnas de SUNAT (`estado_sunat`, `sunat_*`),
--     desde `facturacion/acciones/enviar.ts`. Siguen abiertas.
--   · `cotizaciones`: solo `estado`, desde `cambiarEstado`, y solo a
--     «enviada», «rechazada» o «anulada». Sigue funcionando, con las reglas
--     que la pantalla ya decía tener.
--   · `cotizacion_items` y `comprobante_items`: la aplicación **no los escribe
--     nunca** directamente. Solo las RPC.
-- ###########################################################################

/**
 * ¿Esto lo escribe una de nuestras funciones, o es una petición directa?
 *
 * `stable` y no `immutable`: depende de la sesión.
 */
create or replace function public.escribe_una_funcion()
returns boolean
language sql stable
set search_path = public, extensions
as $$ select current_user <> 'authenticated' $$;

comment on function public.escribe_una_funcion() is
  'Falso cuando la escritura llega directa a la tabla por PostgREST con una sesión de usuario. Dentro de una función security definer, current_user es el dueño de la función, no `authenticated`.';

-- ###########################################################################
-- 1 · El comprobante: identidad, importes y anulación, solo por RPC
-- ###########################################################################
create or replace function public.tg_comprobante_columnas_de_las_rpc()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.escribe_una_funcion() then
    return new;
  end if;

  if new.estado is distinct from old.estado then
    raise exception
      'El estado de un comprobante no se cambia a mano: anular repone el stock que descargó, y eso solo lo hace Gerencia desde la pantalla.'
      using errcode = '42501';
  end if;

  if new.total        is distinct from old.total
     or new.op_gravada is distinct from old.op_gravada
     or new.igv        is distinct from old.igv
     or new.cliente_id is distinct from old.cliente_id
     or new.tipo       is distinct from old.tipo
     or new.serie      is distinct from old.serie
     or new.correlativo is distinct from old.correlativo
     or new.fecha_emision is distinct from old.fecha_emision then
    raise exception
      'Los importes y la identidad de un comprobante no se modifican: se corrigen con una nota de crédito.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists tg_comprobante_solo_rpc on public.comprobantes;
create trigger tg_comprobante_solo_rpc
  before update on public.comprobantes
  for each row
  execute function public.tg_comprobante_columnas_de_las_rpc();

-- ###########################################################################
-- 2 · Las líneas de un documento, solo por RPC
-- ###########################################################################
-- Ninguna pantalla las escribe directamente: las arman `emitir_comprobante`,
-- `actualizar_cotizacion` y `corregir_confirmado`, que son las que respetan el
-- precio mínimo, los topes y el recálculo de totales. Una línea escrita por
-- fuera deja la cabecera descuadrada respecto de sus propias líneas.
create or replace function public.tg_lineas_solo_rpc()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.escribe_una_funcion() then
    return coalesce(new, old);
  end if;

  raise exception
    'Las líneas de %  se cambian desde la pantalla del documento, que recalcula sus totales y respeta el precio mínimo.',
    tg_table_name
    using errcode = '42501';
end $$;

drop trigger if exists tg_cotizacion_items_solo_rpc on public.cotizacion_items;
create trigger tg_cotizacion_items_solo_rpc
  before insert or update or delete on public.cotizacion_items
  for each row
  execute function public.tg_lineas_solo_rpc();

drop trigger if exists tg_comprobante_items_solo_rpc on public.comprobante_items;
create trigger tg_comprobante_items_solo_rpc
  before insert or update or delete on public.comprobante_items
  for each row
  execute function public.tg_lineas_solo_rpc();

-- ###########################################################################
-- 3 · El estado de la cotización: las mismas reglas que dice la pantalla
-- ###########################################################################
-- Aquí NO se puede cerrar del todo, porque `cambiarEstado` sí escribe la tabla
-- directamente y es legítimo. Lo que se hace es escribir en la base las reglas
-- que esa acción dice tener, para que valgan también cuando no se pasa por
-- ella.
create or replace function public.tg_cotizacion_estado_valido()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.escribe_una_funcion() or new.estado is not distinct from old.estado then
    return new;
  end if;

  -- La misma lista cerrada que `DESTINOS` en gestionar.ts. «aprobada» y
  -- «atendida» las ponen sus RPC, que son las que mueven stock y correlativos.
  if new.estado not in ('enviada', 'rechazada', 'anulada') then
    raise exception
      'A % solo se llega desde su propia pantalla, no cambiando el estado a mano.', new.estado
      using errcode = '42501';
  end if;

  if old.estado in ('anulada', 'atendida') then
    raise exception
      'Una cotización en % ya está cerrada: no se le cambia el estado.', old.estado
      using errcode = '42501';
  end if;

  -- Y la regla que faltaba en todas partes: si ya salió mercadería o ya se
  -- facturó, la cotización dejó de ser un papel que se pueda mover.
  if exists (
    select 1 from guias_remision g
     where g.cotizacion_id = new.id and g.estado <> 'anulada'
  ) then
    raise exception
      'La cotización % ya tiene guía: no se le cambia el estado.', new.numero
      using errcode = '42501';
  end if;

  if exists (
    select 1 from comprobantes c
     where c.cotizacion_id = new.id and c.estado <> 'anulado'
  ) then
    raise exception
      'La cotización % ya está facturada: no se le cambia el estado.', new.numero
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists tg_cotizacion_estado on public.cotizaciones;
create trigger tg_cotizacion_estado
  before update on public.cotizaciones
  for each row
  execute function public.tg_cotizacion_estado_valido();

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Que los cuatro triggers existan y estén ENCENDIDOS. Un `disable trigger` de
-- paso en una migración futura dejaría el agujero abierto sin que nada fallara.
do $$
declare
  v_falta text;
begin
  select string_agg(x.nombre || ' en ' || x.tabla, ', ')
    into v_falta
    from (values
      ('tg_comprobante_solo_rpc',      'comprobantes'),
      ('tg_cotizacion_items_solo_rpc', 'cotizacion_items'),
      ('tg_comprobante_items_solo_rpc','comprobante_items'),
      ('tg_cotizacion_estado',         'cotizaciones')
    ) as x(nombre, tabla)
   where not exists (
     select 1
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = x.tabla
        and t.tgname  = x.nombre
        and t.tgenabled <> 'D'
   );

  if v_falta is not null then
    raise exception
      'Faltan o están desactivados: %. Sin ellos, cualquier rol con permiso de escritura salta las reglas del documento por REST.',
      v_falta;
  end if;
end $$;
