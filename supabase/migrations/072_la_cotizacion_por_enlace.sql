-- ###########################################################################
-- 072 · MANDAR LA COTIZACIÓN POR ENLACE
-- ###########################################################################
--
-- Luis, 08/09, sobre por qué el PDF no viaja por WhatsApp:
--
--   *«¿o se le manda un link que descargue automáticamente el PDF?»* — *«…
--   siempre y cuando ese PDF tenga un botón de descargar la cotización»*
--
-- Y tiene razón, porque el problema no tiene otra salida: ni `wa.me` ni
-- `mailto:` pueden adjuntar un archivo —ningún navegador lo permite— así que
-- hasta hoy el PDF se descargaba y se arrastraba al chat a mano.
--
-- Con un enlace, el cliente abre la cotización y se la descarga él.
--
-- ---------------------------------------------------------------------------
-- Por qué un token y no el id
-- ---------------------------------------------------------------------------
-- El `id` es un uuid y también sería imposible de adivinar, pero es el MISMO
-- identificador que usan las pantallas internas, los logs y las URLs de
-- trabajo. Un id que circula por WhatsApp deja de ser interno.
--
-- El token es un segundo identificador, solo para esto: se puede rotar sin
-- tocar nada más, y saber uno no dice nada del otro.
--
-- 32 caracteres hexadecimales = 128 bits, de `gen_random_uuid()`, que en
-- Postgres 13+ sale del generador criptográfico del sistema. No se adivina.
--
-- Sin caducidad: decisión de Luis, 08/09. Una cotización se mira semanas
-- después de mandarla —hay que comprar, importar, esperar— y un enlace muerto
-- obligaría a volver a mandarla justo cuando el cliente por fin la abre.
--
-- ---------------------------------------------------------------------------
-- La función decide QUÉ se ve, y por eso existe
-- ---------------------------------------------------------------------------
-- La alternativa era que la página pública leyera las tablas con la clave de
-- servicio, que salta RLS por completo. Funciona, y pone toda la seguridad en
-- que un `where` esté bien escrito hoy y siga estándolo dentro de un año.
--
-- Aquí la base decide: esta función devuelve UNA cotización, la del token, y
-- solo los campos que van en el papel. **No devuelve `costo_total` ni
-- `margen_pct` ni `costo_unitario`**, que es lo que no puede ver un cliente y
-- lo que un `select *` distraído habría mandado dentro del JSON.
--
-- Tampoco devuelve el teléfono ni el correo del cliente: son suyos, no hacen
-- falta para pintar el documento, y todo lo que no viaja no se puede filtrar.
-- ###########################################################################

set local search_path = public, extensions;

alter table cotizaciones
  add column if not exists token_publico text;

-- A las que ya existen. `where token_publico is null` la hace reentrante.
update cotizaciones
   set token_publico = replace(gen_random_uuid()::text, '-', '')
 where token_publico is null;

alter table cotizaciones
  alter column token_publico set default replace(gen_random_uuid()::text, '-', ''),
  alter column token_publico set not null;

-- Único: dos cotizaciones con el mismo token servirían la equivocada, y
-- además es el índice con el que se busca en cada visita.
create unique index if not exists cotizaciones_token_publico_idx
  on cotizaciones (token_publico);

comment on column cotizaciones.token_publico is
  'Identificador para el enlace que se le manda al cliente (072). Aparte del id a propósito: el id es interno y este viaja por WhatsApp. Se puede rotar sin tocar nada más.';

-- ###########################################################################
-- Lo que ve quien abre el enlace
-- ###########################################################################
create or replace function public.cotizacion_por_token(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'numero',                 q.numero,
    'fecha',                  q.fecha,
    'estado',                 q.estado,
    'validez_dias',           q.validez_dias,
    'tiempo_entrega',         q.tiempo_entrega,
    'orden_compra_cliente',   q.orden_compra_cliente,
    'contacto',               q.contacto,
    'condiciones',            q.condiciones,
    'observaciones',          q.observaciones,
    'mostrar_descuento',      q.mostrar_descuento,
    'mostrar_disponibilidad', q.mostrar_disponibilidad,
    'subtotal',               q.subtotal,
    'descuento_total',        q.descuento_total,
    'igv',                    q.igv,
    'total',                  q.total,
    'vendedor',               p.nombre,
    'cliente', jsonb_build_object(
      'razon_social',    cl.razon_social,
      'numero_documento', cl.numero_documento,
      'tipo_documento',  cl.tipo_documento,
      'direccion',       cl.direccion,
      -- El contacto sale de la COTIZACIÓN (`q.contacto`, arriba) y no del
      -- cliente: `clientes` no tiene esa columna —la persona de contacto vive
      -- en su propia tabla— y para el papel manda el que se escribió en el
      -- documento, que es a quién va dirigido ESTA vez.
      'condicion_pago',  cl.condicion_pago,
      'dias_credito',    cl.dias_credito
    ),
    'lineas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'orden',          ci.orden,
          'codigo',         ci.codigo,
          'marca',          ci.marca,
          'descripcion',    ci.descripcion,
          'cantidad',       ci.cantidad,
          'unidad_codigo',  ci.unidad_codigo,
          'valor_unitario', ci.valor_unitario,
          'descuento_pct',  ci.descuento_pct,
          'disponibilidad', ci.disponibilidad,
          'dias_entrega',   ci.dias_entrega
        ) order by ci.orden
      )
      from cotizacion_items ci
     where ci.cotizacion_id = q.id
    ), '[]'::jsonb)
  )
  from cotizaciones q
  join clientes cl on cl.id = q.cliente_id
  left join perfiles p on p.id = q.vendedor_id
  -- El token completo y exacto. Nada de `like`: un prefijo permitiría
  -- adivinarlo a trozos, que es como se rompen estos esquemas.
  where q.token_publico = p_token
    -- Una anulada no se enseña: el cliente vería un precio que ya no
    -- sostenemos, y el enlace se mandó cuando el documento estaba vivo.
    and q.estado <> 'anulada';
$$;

comment on function public.cotizacion_por_token(text) is
  'La cotización que hay detrás de un enlace público (072), para que el cliente la vea y se la descargue. Devuelve SOLO lo que va impreso: sin costo_total, sin margen_pct, sin costo_unitario y sin el teléfono ni el correo del cliente. Lo que no viaja no se puede filtrar.';

-- `anon` es quien la llama: el que abre el enlace no tiene sesión, y ese es
-- justo el punto. La función es `security definer` y filtra por token, así que
-- este permiso no abre las tablas, solo esta puerta.
revoke all on function public.cotizacion_por_token(text) from public;
grant execute on function public.cotizacion_por_token(text) to anon, authenticated;

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Lo que se comprueba es lo que NO sale. Un `select *` metido aquí de buena fe
-- dentro de seis meses mandaría el margen al cliente sin que nada fallara.
do $$
declare
  v_def   text;
  v_token text;
  v_json  jsonb;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cotizacion_por_token';

  if v_def like '%margen_pct%' then
    raise exception 'cotizacion_por_token expone margen_pct: eso no lo puede ver un cliente';
  end if;
  if v_def like '%costo_total%' or v_def like '%costo_unitario%' then
    raise exception 'cotizacion_por_token expone costos: eso no lo puede ver un cliente';
  end if;

  -- Y que de verdad devuelva algo con un token real, si hay alguna.
  select token_publico into v_token from cotizaciones
   where estado <> 'anulada' limit 1;

  if v_token is not null then
    select public.cotizacion_por_token(v_token) into v_json;
    if v_json is null or v_json ->> 'numero' is null then
      raise exception 'cotizacion_por_token no devolvió la cotización de un token válido';
    end if;
    -- Un token que no existe no puede devolver nada.
    if public.cotizacion_por_token('no-existe-este-token') is not null then
      raise exception 'cotizacion_por_token devuelve algo con un token inventado';
    end if;
  end if;
end $$;
