-- ###########################################################################
-- 051 · LA BITÁCORA, QUE LLEVABA CREADA Y VACÍA
-- ###########################################################################
--
-- De la auditoría del 31/08 (PENDIENTES §0.5). La tabla `actividad` existe
-- desde la 002, con su RLS y sus permisos, y **cero filas: ningún sitio
-- inserta en ella**.
--
-- En un ERP donde seis personas comparten roles y se emiten documentos
-- fiscales, «¿quién anuló esta factura?» es una pregunta que se va a hacer, y
-- hoy no tiene respuesta.
--
-- ---------------------------------------------------------------------------
-- Disparadores, y no llamadas desde cada sitio
-- ---------------------------------------------------------------------------
-- Una bitácora que hay que acordarse de escribir es una bitácora incompleta, y
-- una bitácora incompleta es peor que ninguna: da una respuesta que parece
-- completa. Con disparadores da igual por dónde entre el cambio —la pantalla,
-- un RPC, alguien con SQL en la mano—: queda anotado.
--
-- ---------------------------------------------------------------------------
-- Lo que NO se registra, que es la decisión que importa
-- ---------------------------------------------------------------------------
-- No se apunta todo. Un log que lo apunta todo no lo lee nadie: el día que de
-- verdad haga falta buscar quién anuló una factura, estaría enterrada bajo
-- diez mil filas de «alguien miró un producto».
--
-- Se apunta lo que **cambia dinero, stock o permisos**, y dentro de eso solo
-- los campos que importan. Cambiar la dirección de un cliente no entra;
-- cambiarle la línea de crédito, sí.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- El disparador
-- ---------------------------------------------------------------------------
-- Recibe en `TG_ARGV` los campos a vigilar. En un UPDATE solo escribe si
-- cambió alguno de ellos: sin eso, tocar `actualizado_en` llenaría la bitácora
-- de ruido.
create or replace function public.tg_bitacora()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_quien   uuid := auth.uid();
  v_nombre  text;
  v_accion  text;
  v_campo   text;
  v_antes   jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_cambio  boolean := false;
  v_id      uuid;
  v_desc    text;
begin
  select p.nombre into v_nombre from perfiles p where p.id = v_quien;

  if TG_OP = 'INSERT' then
    v_accion := 'creado';
    v_id := (to_jsonb(NEW) ->> 'id')::uuid;

  elsif TG_OP = 'DELETE' then
    v_accion := 'borrado';
    v_id := (to_jsonb(OLD) ->> 'id')::uuid;
    v_antes := to_jsonb(OLD);

  else
    v_id := (to_jsonb(NEW) ->> 'id')::uuid;
    -- Solo los campos vigilados, y solo los que de verdad cambiaron.
    foreach v_campo in array TG_ARGV loop
      if to_jsonb(OLD) -> v_campo is distinct from to_jsonb(NEW) -> v_campo then
        v_cambio := true;
        v_antes   := v_antes   || jsonb_build_object(v_campo, to_jsonb(OLD) -> v_campo);
        v_despues := v_despues || jsonb_build_object(v_campo, to_jsonb(NEW) -> v_campo);
      end if;
    end loop;

    if not v_cambio then return null; end if;
    v_accion := 'cambiado';
  end if;

  -- Una descripción legible sin abrir el JSON. Es lo que se lee en la lista, y
  -- lo que decide si la bitácora sirve para algo o hay que interpretarla.
  v_desc := case
    when TG_OP = 'INSERT' then 'Se creó'
    when TG_OP = 'DELETE' then 'Se borró'
    else (
      select string_agg(
               format('%s: %s → %s',
                      k,
                      coalesce(nullif(v_antes   ->> k, 'null'), '—'),
                      coalesce(nullif(v_despues ->> k, 'null'), '—')),
               ' · ' order by k)
        from jsonb_object_keys(v_despues) as k
    )
  end;

  insert into actividad (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, metadata)
  values (
    v_quien,
    -- El nombre se copia, no se deja para el join: si mañana ese perfil se
    -- borra, la bitácora tiene que seguir diciendo quién fue.
    coalesce(v_nombre, 'sistema'),
    v_accion,
    TG_TABLE_NAME,
    v_id,
    v_desc,
    jsonb_build_object('antes', v_antes, 'despues', v_despues)
  );

  return null;
end $$;

comment on function public.tg_bitacora() is
  'Apunta en `actividad` quién cambió qué. Recibe en TG_ARGV los campos a vigilar; en un UPDATE solo escribe si cambió alguno.';

-- ---------------------------------------------------------------------------
-- Dónde se engancha
-- ---------------------------------------------------------------------------
-- La lista es corta a propósito. Cada tabla lleva los campos por los que
-- alguien va a preguntar algún día.
do $$
declare
  v_t     text;
  v_campos text;
  -- tabla → campos vigilados en UPDATE
  v_donde text[][] := array[
    -- El dinero que sale hacia SUNAT. «Quién anuló esta factura» es la
    -- pregunta que abrió todo esto.
    array['comprobantes', 'estado,estado_sunat,motivo_anulacion,total'],
    -- Lo que se le promete y se le cobra a un cliente.
    array['cotizaciones', 'estado,total'],
    -- El compromiso con el proveedor y su dinero.
    array['compras', 'estado,total,moneda,tipo_cambio'],
    -- La entrada de mercadería: si se anula, el kardex ya se movió.
    array['recepciones', 'anulada,total'],
    -- El botón que Willy pidió «que se use con cuidado» (26:49).
    array['ajustes_inventario', 'estado'],
    -- Quién puede hacer qué. Un cambio aquí cambia lo que puede hacer todo el
    -- mundo, y es el que menos huella deja por su cuenta.
    array['permisos_rol', 'escribir'],
    array['perfiles', 'rol,activo'],
    -- El crédito de un cliente: decide si se le puede seguir vendiendo.
    array['clientes', 'linea_credito,dias_credito,bloqueado,activo'],
    -- Y los precios del maestro, que deciden a cuánto se vende.
    array['productos', 'precio_venta,precio_minimo,archivado']
  ];
  v_fila text[];
begin
  foreach v_fila slice 1 in array v_donde loop
    v_t := v_fila[1];
    v_campos := v_fila[2];

    if to_regclass('public.' || quote_ident(v_t)) is null then
      raise notice 'Bitácora: se omite %, no existe', v_t;
      continue;
    end if;

    execute format('drop trigger if exists tg_bitacora_%1$s on public.%1$I', v_t);
    execute format(
      'create trigger tg_bitacora_%1$s
         after insert or update or delete on public.%1$I
         for each row execute function public.tg_bitacora(%2$s)',
      v_t,
      -- Los campos van como argumentos sueltos y entrecomillados.
      (select string_agg(quote_literal(c), ', ') from unnest(string_to_array(v_campos, ',')) as c)
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- La bitácora no se edita
-- ---------------------------------------------------------------------------
-- Es append-only, como el kardex. Una bitácora que se puede corregir no sirve
-- de prueba de nada, y el rol que borrara sus huellas sería justo el que hay
-- que vigilar.
drop policy if exists "escritura_update" on actividad;
drop policy if exists "escritura_delete" on actividad;

do $$
declare v_n int;
begin
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'actividad'
     and cmd in ('UPDATE', 'DELETE');
  if v_n > 0 then
    raise exception 'La bitácora quedó con % políticas de escritura; tiene que ser append-only', v_n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien uuid;
  v_id    uuid;
  v_n     int;
  v_fila  record;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select p.id into v_id from productos p limit 1;
  if v_quien is null or v_id is null then
    raise notice 'Sin perfil de gerencia o sin productos: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  delete from actividad where entidad = 'productos' and entidad_id = v_id;

  -- 1 · Un cambio VIGILADO se apunta, con quién y con el antes y el después.
  update productos set precio_venta = precio_venta + 1 where id = v_id;

  select * into v_fila from actividad
   where entidad = 'productos' and entidad_id = v_id
   order by id desc limit 1;

  if v_fila is null then
    raise exception 'El cambio de precio no se apuntó en la bitácora';
  end if;
  if v_fila.usuario_id is distinct from v_quien then
    raise exception 'La bitácora no guardó quién fue';
  end if;
  if v_fila.usuario_nombre is null then
    raise exception 'La bitácora no guardó el nombre de quien fue';
  end if;
  if v_fila.descripcion not like 'precio_venta:%' then
    raise exception 'La descripción no dice qué cambió: %', v_fila.descripcion;
  end if;

  -- 2 · Un cambio NO vigilado no ensucia la bitácora. Es la decisión que hace
  -- que esto se pueda leer dentro de un año.
  select count(*) into v_n from actividad where entidad = 'productos' and entidad_id = v_id;
  update productos set ubicacion = coalesce(ubicacion, '') || 'x' where id = v_id;
  if (select count(*) from actividad where entidad = 'productos' and entidad_id = v_id) <> v_n then
    raise exception 'Un cambio no vigilado acabó en la bitácora';
  end if;

  -- 3 · Y no se puede editar ni borrar lo apuntado.
  begin
    update actividad set descripcion = 'no fui yo' where id = v_fila.id;
    raise exception 'La bitácora se dejó editar';
  exception when insufficient_privilege then null;
    when others then
      -- Con RLS, un UPDATE sin política no falla: no afecta a ninguna fila.
      if (select descripcion from actividad where id = v_fila.id) = 'no fui yo' then
        raise exception 'La bitácora se dejó editar';
      end if;
  end;

  -- Limpieza: se deshace el producto y se borran las filas de la prueba.
  update productos set precio_venta = precio_venta - 1,
                       ubicacion = nullif(left(ubicacion, length(ubicacion) - 1), '')
   where id = v_id;
  delete from actividad where entidad = 'productos' and entidad_id = v_id;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'La bitácora apunta lo que importa, dice quién fue y no se deja editar.';
end $$;
