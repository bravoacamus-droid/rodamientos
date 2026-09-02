-- ###########################################################################
-- 050 · LAS FICHAS DE UNOS PROVEEDORES CONCRETOS
-- ###########################################################################
--
-- Sale de un fallo, y conviene contarlo entero porque la lección es la buena.
--
-- La pantalla de compra ahora propone a quién comprarle: unos botones con los
-- proveedores que ya venden lo que se está comprando (§K). Al pulsar uno hay
-- que dejarlo elegido, y el selector espera una ficha completa —marcas,
-- condición de pago, cuántas compras lleva—.
--
-- Yo le pasé media ficha con un `as ProveedorOpcion`, o sea, mintiéndole al
-- compilador. **La pantalla se cayó entera** al pulsar el botón:
-- `Cannot read properties of undefined (reading 'length')`, porque el selector
-- fue a contar las marcas y no había ninguna lista que contar.
--
-- El `as` no arregla nada: apaga el aviso. Lo que hacía falta era traer la
-- ficha de verdad, y para eso hace falta esta función.
--
-- ---------------------------------------------------------------------------
-- Por qué una función y no una consulta desde la aplicación
-- ---------------------------------------------------------------------------
-- Porque `ProveedorOpcion` no es una fila de `proveedores`: lleva las marcas
-- agregadas, cuántas compras se le han hecho y cuándo fue la última. Eso ya lo
-- sabe armar `proveedores_sugeridos` (033), y armarlo otra vez en TypeScript
-- daría dos versiones de la misma forma que un día se separarían.
--
-- Es la misma consulta con otro filtro: en vez de «los últimos ocho», «estos
-- de aquí».
-- ###########################################################################

set search_path = public, extensions;

create or replace function public.proveedores_por_id(p_ids uuid[])
returns table (
  id                uuid,
  codigo            text,
  tipo_documento    tipo_documento_identidad,
  numero_documento  text,
  razon_social      text,
  tipo              tipo_compra,
  pais              text,
  direccion         text,
  contacto          text,
  telefono          text,
  whatsapp          text,
  email             text,
  dias_pago         smallint,
  lead_time_dias    smallint,
  activo            boolean,
  marcas            text[],
  compras           int,
  ultima_compra     date,
  puntaje           int
)
language sql stable security definer set search_path = public, extensions
as $$
  with historial as (
    select c.proveedor_id, count(*)::int as veces, max(c.fecha) as ultima
      from compras c
     where c.estado <> 'anulada'
     group by c.proveedor_id
  ),
  sus_marcas as (
    select pm.proveedor_id,
           array_agg(m.nombre order by m.orden, m.nombre) as nombres
      from proveedor_marcas pm
      join marcas m on m.id = pm.marca_id
     group by pm.proveedor_id
  )
  select p.id, p.codigo, p.tipo_documento, p.numero_documento, p.razon_social,
         p.tipo, p.pais, p.direccion, p.contacto, p.telefono, p.whatsapp,
         p.email, p.dias_pago, p.lead_time_dias, p.activo,
         coalesce(sm.nombres, array[]::text[]),
         coalesce(h.veces, 0), h.ultima, 0
    from proveedores p
    left join historial h   on h.proveedor_id = p.id
    left join sus_marcas sm on sm.proveedor_id = p.id
   where p.id = any(p_ids)
   -- Se limita aunque el llamador mande la lista: `any()` con un array enorme
   -- es una forma barata de pedir media base desde el navegador.
   limit 50;
$$;

comment on function public.proveedores_por_id(uuid[]) is
  'Las fichas completas de unos proveedores concretos, con la misma forma que proveedores_sugeridos. Para poder proponer a quién comprarle sin inventarse media ficha.';

revoke execute on function public.proveedores_por_id(uuid[]) from public, anon;
grant execute on function public.proveedores_por_id(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Lo que hay que demostrar es que devuelve LA MISMA FORMA que
-- `proveedores_sugeridos`. Si se separaran, el selector volvería a recibir
-- media ficha y a caerse, que es justo el fallo que esto viene a cerrar.
do $$
declare
  v_quien uuid;
  v_id    uuid;
  v_a     text[];
  v_b     text[];
  v_fila  record;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select p.id into v_id from proveedores p limit 1;
  if v_quien is null or v_id is null then
    raise notice 'Sin perfil de gerencia o sin proveedores: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  -- Las columnas, una a una y en orden.
  select array_agg(a.attname::text order by a.attnum) into v_a
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, modo, attnum)
      on a.modo = 't'
   where n.nspname = 'public' and p.proname = 'proveedores_por_id';

  select array_agg(a.attname::text order by a.attnum) into v_b
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, modo, attnum)
      on a.modo = 't'
   where n.nspname = 'public' and p.proname = 'proveedores_sugeridos';

  if v_a is distinct from v_b then
    raise exception 'proveedores_por_id devuelve % y proveedores_sugeridos %', v_a, v_b;
  end if;

  -- Y que de verdad trae la ficha, con las marcas como lista y no como null:
  -- ese null era el que tumbaba la pantalla.
  select * into v_fila from public.proveedores_por_id(array[v_id]);
  if v_fila.id is distinct from v_id then
    raise exception 'No devolvió el proveedor pedido';
  end if;
  if v_fila.marcas is null then
    raise exception 'Las marcas llegaron en null; tienen que ser una lista vacía';
  end if;

  -- Un id que no existe no devuelve nada, no revienta.
  if exists (select 1 from public.proveedores_por_id(array[gen_random_uuid()])) then
    raise exception 'Devolvió algo para un id inventado';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'proveedores_por_id devuelve la misma ficha que el selector espera.';
end $$;
