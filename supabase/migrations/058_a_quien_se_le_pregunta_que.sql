-- ###########################################################################
-- 058 · A QUIÉN SE LE PREGUNTA QUÉ
-- ###########################################################################
--
-- Luis, 03/09: *«cada producto es de diferente proveedor, no el mismo. Cada
-- producto puede tener hasta 5 proveedores; se les va a enviar a los 5 un
-- mensaje preguntando el precio, y se va a registrar para tener historial»*.
--
-- ---------------------------------------------------------------------------
-- Lo que la 055 daba por supuesto
-- ---------------------------------------------------------------------------
-- Que a todos los proveedores de una ronda se les pregunta por TODOS los
-- productos. `consulta_precio_proveedores` no tiene ninguna relación con los
-- ítems: es la ronda entera contra cada proveedor.
--
-- Y eso es falso en el caso normal de Rodatech. Un pedido con dos líneas —unas
-- chapas SKF y un retén— tiene dos juegos de proveedores distintos: al de
-- retenes se le estaba mandando un mensaje pidiéndole chapas que no vende, y
-- su columna en la rejilla salía con un hueco que se leía como «no contestó».
--
-- Son tres cosas distintas y hasta ahora solo se distinguían dos:
--
--   · **no se le preguntó** — no vende eso, y no tiene por qué contestar;
--   · **se le preguntó y no ha contestado** — hay que perseguirle;
--   · **contestó que no lo tiene** — cerrado, y no se le vuelve a preguntar.
--
-- Confundir la primera con la segunda hace dos daños: manda mensajes que
-- molestan, y llena la rejilla de huecos que parecen deudas pendientes.
--
-- ---------------------------------------------------------------------------
-- Una ronda, no varias
-- ---------------------------------------------------------------------------
-- La alternativa era abrir una consulta por producto. Es más simple de
-- programar y parte el historial en pedazos: «¿a quién le pregunté por lo del
-- pedido de ACEROS CHILCA?» dejaría de tener una respuesta.
--
-- Así que la ronda sigue siendo una —lo que se preguntó, de una vez— y esta
-- tabla dice qué le tocó a cada uno. El mensaje de cada proveedor lleva solo
-- sus productos, que es lo que pidió Luis.
-- ###########################################################################

set search_path = public, extensions;

create table if not exists consulta_precio_asignaciones (
  consulta_proveedor_id uuid not null
    references consulta_precio_proveedores(id) on delete cascade,
  item_id uuid not null
    references consulta_precio_items(id) on delete cascade,

  primary key (consulta_proveedor_id, item_id)
);

create index if not exists ix_consulta_asignaciones_item
  on consulta_precio_asignaciones (item_id);

comment on table consulta_precio_asignaciones is
  'Qué productos se le preguntaron a cada proveedor de la ronda. Sin esto se preguntaba a todos por todo, y a un proveedor de retenes se le pedía precio de rodamientos.';

-- ---------------------------------------------------------------------------
-- Las rondas que ya existen: a todos, todo
-- ---------------------------------------------------------------------------
-- Es lo que significaban antes de que esta tabla existiera. Rellenarlo ahora
-- evita que el dominio tenga que tratar «sin filas» como un caso especial para
-- siempre.
insert into consulta_precio_asignaciones (consulta_proveedor_id, item_id)
select cp.id, i.id
  from consulta_precio_proveedores cp
  join consulta_precio_items i on i.consulta_id = cp.consulta_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Nace después de la 006, así que su bucle no la tocó: RLS activo y cero
-- políticas significa que nadie lee. Es la quinta vez (046, 049, 054, 055).
alter table consulta_precio_asignaciones enable row level security;

drop policy if exists "lectura_autenticados" on consulta_precio_asignaciones;
create policy "lectura_autenticados" on consulta_precio_asignaciones
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on consulta_precio_asignaciones;
create policy "escritura_insert" on consulta_precio_asignaciones
  for insert to authenticated
  with check ((select public.puede_escribir('compras')));

drop policy if exists "escritura_delete" on consulta_precio_asignaciones;
create policy "escritura_delete" on consulta_precio_asignaciones
  for delete to authenticated
  using ((select public.puede_escribir('compras')));

-- ---------------------------------------------------------------------------
-- Crear la ronda, ahora con reparto
-- ---------------------------------------------------------------------------
-- `proveedores` admite dos formas:
--
--   ["uuid", "uuid"]                        → a todos, todo (como antes)
--   [{"proveedor_id":"…","productos":[…]}]  → a cada uno lo suyo
--
-- La primera se conserva porque es lo que manda la pantalla cuando de verdad
-- se pregunta lo mismo a todos, que también pasa.
create or replace function public.crear_consulta_precio(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id     uuid;
  v_numero text;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_provs  jsonb := coalesce(p_datos -> 'proveedores', '[]'::jsonb);
  v_detallado boolean;
begin
  -- Va lo primero: es `security definer` y se salta RLS.
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede pedir precios'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'No hay ningún producto que preguntar'
      using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(v_provs) = 0 then
    raise exception 'Hay que elegir a quién preguntarle'
      using errcode = 'invalid_parameter_value';
  end if;

  if (select count(distinct i ->> 'producto_id') from jsonb_array_elements(v_items) i)
     <> jsonb_array_length(v_items) then
    raise exception 'Hay un producto repetido en la lista'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Qué forma trae la lista de proveedores.
  v_detallado := jsonb_typeof(v_provs -> 0) = 'object';

  insert into consultas_precio (fecha, nota, creado_por)
  values (coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
          nullif(p_datos ->> 'nota',''),
          auth.uid())
  returning id, numero into v_id, v_numero;

  insert into consulta_precio_items (consulta_id, producto_id, orden, cantidad)
  select v_id,
         (i.valor ->> 'producto_id')::uuid,
         i.orden::smallint,
         (i.valor ->> 'cantidad')::numeric
    from jsonb_array_elements(v_items) with ordinality as i(valor, orden);

  if v_detallado then
    insert into consulta_precio_proveedores (consulta_id, proveedor_id)
    select v_id, (p ->> 'proveedor_id')::uuid
      from jsonb_array_elements(v_provs) p
    on conflict (consulta_id, proveedor_id) do nothing;

    -- A cada uno, lo suyo.
    insert into consulta_precio_asignaciones (consulta_proveedor_id, item_id)
    select cp.id, it.id
      from jsonb_array_elements(v_provs) p
      join consulta_precio_proveedores cp
        on cp.consulta_id = v_id and cp.proveedor_id = (p ->> 'proveedor_id')::uuid
      join jsonb_array_elements_text(p -> 'productos') prod on true
      join consulta_precio_items it
        on it.consulta_id = v_id and it.producto_id = (prod.value)::uuid
    on conflict do nothing;

    -- Un proveedor sin nada asignado no tiene a qué contestar, y su columna
    -- en la rejilla sería una columna vacía que no dice nada.
    if exists (
      select 1 from consulta_precio_proveedores cp
       where cp.consulta_id = v_id
         and not exists (select 1 from consulta_precio_asignaciones a
                          where a.consulta_proveedor_id = cp.id)
    ) then
      raise exception 'Hay un proveedor sin ningún producto asignado'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    insert into consulta_precio_proveedores (consulta_id, proveedor_id)
    select v_id, (value)::uuid
      from jsonb_array_elements_text(v_provs)
    on conflict (consulta_id, proveedor_id) do nothing;

    insert into consulta_precio_asignaciones (consulta_proveedor_id, item_id)
    select cp.id, it.id
      from consulta_precio_proveedores cp
      join consulta_precio_items it on it.consulta_id = cp.consulta_id
     where cp.consulta_id = v_id
    on conflict do nothing;
  end if;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end $$;

comment on function public.crear_consulta_precio(jsonb) is
  'Abre una ronda de precios: qué se pregunta y a quién, con el reparto de qué producto le toca a cada proveedor. No manda nada.';

revoke execute on function public.crear_consulta_precio(jsonb) from public, anon;
grant execute on function public.crear_consulta_precio(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La rejilla, con la tercera categoría
-- ---------------------------------------------------------------------------
-- `preguntado` es lo que faltaba: sin él, «no se le preguntó» y «no ha
-- contestado» eran el mismo hueco.
create or replace view v_comparativa_precios as
select
  c.id                as consulta_id,
  c.numero            as consulta,
  c.fecha,
  c.estado            as consulta_estado,
  i.id                as item_id,
  i.producto_id,
  p.codigo,
  p.descripcion,
  i.cantidad,
  cp.id               as consulta_proveedor_id,
  cp.proveedor_id,
  pr.razon_social     as proveedor,
  cp.estado           as respuesta_estado,
  cp.moneda,
  cp.tipo_cambio,
  cp.incluye_igv,
  cp.validez_hasta,
  r.costo_unitario,
  coalesce(r.disponible, false) as disponible,
  coalesce(r.dias_entrega, cp.dias_entrega) as dias_entrega,
  r.nota,
  case
    when r.costo_unitario is null then null
    else round(
      (r.costo_unitario
        / case when cp.moneda = 'PEN' and cp.tipo_cambio > 0 then cp.tipo_cambio else 1 end
        / case when cp.incluye_igv then 1.18 else 1 end)::numeric,
      4)
  end as costo_usd,
  -- Va la ÚLTIMA a propósito. `create or replace view` no puede reordenar ni
  -- renombrar columnas: metida en medio, Postgres lo lee como que `costo_usd`
  -- pasa a llamarse `preguntado` y se niega. Mismo caso que `atendido` en la
  -- 047, y el error que da no lo dice.
  (a.item_id is not null) as preguntado
from consultas_precio c
join consulta_precio_items i on i.consulta_id = c.id
join productos p on p.id = i.producto_id
join consulta_precio_proveedores cp on cp.consulta_id = c.id
join proveedores pr on pr.id = cp.proveedor_id
left join consulta_precio_asignaciones a
       on a.consulta_proveedor_id = cp.id and a.item_id = i.id
left join consulta_precio_respuestas r
       on r.consulta_proveedor_id = cp.id and r.item_id = i.id;

comment on view v_comparativa_precios is
  'La rejilla del comparador. `preguntado` distingue «no se le preguntó» de «no ha contestado»: sin eso, el proveedor que no vende ese producto parecía que debía una respuesta.';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien  uuid;
  v_pa     uuid;
  v_pb     uuid;
  v_p1     uuid;
  v_p2     uuid;
  v_r      jsonb;
  v_id     uuid;
  v_n      int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select id into v_pa from proveedores where activo order by razon_social limit 1;
  select id into v_pb from proveedores where activo and id <> v_pa order by razon_social limit 1;
  select id into v_p1 from productos where not archivado order by codigo limit 1;
  select id into v_p2 from productos where not archivado and id <> v_p1 order by codigo limit 1;

  if v_quien is null or v_pb is null or v_p2 is null then
    raise notice 'Faltan datos para probarlo. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  -- 1 · Separado: a cada proveedor su producto. Es el caso de Luis.
  v_r := public.crear_consulta_precio(jsonb_build_object(
    'nota', 'ZZTEST separado',
    'items', jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 5),
      jsonb_build_object('producto_id', v_p2, 'cantidad', 10)),
    'proveedores', jsonb_build_array(
      jsonb_build_object('proveedor_id', v_pa, 'productos', jsonb_build_array(v_p1::text)),
      jsonb_build_object('proveedor_id', v_pb, 'productos', jsonb_build_array(v_p2::text)))));
  v_id := (v_r ->> 'id')::uuid;

  select count(*) into v_n from consulta_precio_asignaciones a
    join consulta_precio_proveedores cp on cp.id = a.consulta_proveedor_id
   where cp.consulta_id = v_id;
  if v_n <> 2 then
    raise exception 'El reparto separado dejó % asignaciones y esperaba 2', v_n;
  end if;

  -- Y la rejilla dice que a cada uno solo se le preguntó lo suyo.
  select count(*) into v_n from v_comparativa_precios
   where consulta_id = v_id and preguntado;
  if v_n <> 2 then
    raise exception 'La rejilla marca % celdas preguntadas y esperaba 2', v_n;
  end if;
  select count(*) into v_n from v_comparativa_precios
   where consulta_id = v_id and not preguntado;
  if v_n <> 2 then
    raise exception 'La rejilla no marcó las 2 celdas que NO se preguntaron: %', v_n;
  end if;

  delete from consultas_precio where id = v_id;

  -- 2 · Junto: la forma antigua sigue valiendo, y asigna todo a todos.
  v_r := public.crear_consulta_precio(jsonb_build_object(
    'nota', 'ZZTEST junto',
    'items', jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 5),
      jsonb_build_object('producto_id', v_p2, 'cantidad', 10)),
    'proveedores', jsonb_build_array(v_pa::text, v_pb::text)));
  v_id := (v_r ->> 'id')::uuid;

  select count(*) into v_n from v_comparativa_precios
   where consulta_id = v_id and preguntado;
  if v_n <> 4 then
    raise exception 'La forma «a todos, todo» marcó % celdas y esperaba 4', v_n;
  end if;

  delete from consultas_precio where id = v_id;

  -- 3 · Un proveedor sin nada asignado no entra: su columna estaría vacía.
  begin
    v_r := public.crear_consulta_precio(jsonb_build_object(
      'nota', 'ZZTEST vacio',
      'items', jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1)),
      'proveedores', jsonb_build_array(
        jsonb_build_object('proveedor_id', v_pa, 'productos', jsonb_build_array()))));
    raise exception 'Dejó crear una ronda con un proveedor sin productos';
  exception when invalid_parameter_value then null;
  end;

  delete from consultas_precio where nota like 'ZZTEST%';
  perform set_config('request.jwt.claims', '', true);

  raise notice 'La ronda reparte qué producto le toca a cada proveedor, y la rejilla distingue lo no preguntado.';
end $$;
