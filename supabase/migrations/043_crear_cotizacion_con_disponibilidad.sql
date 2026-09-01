-- ###########################################################################
-- 043 · LA COTIZACIÓN SE GUARDA CON LA DISPONIBILIDAD DE CADA ÍTEM
-- ###########################################################################
--
-- La 040 añadió las columnas; esta es la que las llena. Sin ella, la pantalla
-- podría dejar elegir «exterior 15 días» y al guardar se perdería en silencio,
-- que es la peor de las dos opciones posibles.
--
-- Se redefine la función entera porque `create or replace` no admite tocar un
-- trozo. Es la de la 035 —con su control de rol y su comprobación de que el
-- contacto pertenece al cliente, que no se tocan— más tres campos:
--
--   · `mostrar_disponibilidad` en la cabecera
--   · `disponibilidad` y `dias_entrega` en cada ítem
--
-- Los tres con `coalesce` a lo de antes, así que un llamador que no los mande
-- —el duplicado de una cotización vieja, una prueba— sigue funcionando y
-- obtiene exactamente el comportamiento anterior.

set search_path = public, extensions;

create or replace function public.crear_cotizacion(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_serie    text := coalesce(nullif(p_datos ->> 'serie',''),
                              (select serie from series_documento where tipo='cotizacion' and predeterminada and activo limit 1),
                              'COT1');
  v_corr     integer := public.siguiente_correlativo('cotizacion', v_serie);
  v_items    jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_contacto uuid := nullif(p_datos ->> 'contacto_id','')::uuid;
  v_nombre   text := nullif(p_datos ->> 'contacto','');
  v_cliente  uuid := (p_datos ->> 'cliente_id')::uuid;
begin
  -- Control de rol. Va lo PRIMERO: validar a media función deja un correlativo
  -- quemado o stock movido.
  if not public.puede_escribir('cotizaciones') then
    raise exception 'Tu rol no puede emitir una cotización'
      using errcode = 'insufficient_privilege';
  end if;

  -- El contacto tiene que ser DE ESTE CLIENTE. Sin esto, quien llame por
  -- PostgREST puede dirigir la cotización de un cliente al comprador de otro,
  -- y el nombre saldría impreso en el PDF que se manda.
  if v_contacto is not null then
    if not exists (
      select 1 from cliente_contactos cc
       where cc.id = v_contacto and cc.cliente_id = v_cliente
    ) then
      raise exception 'El contacto elegido no pertenece a ese cliente'
        using errcode = 'foreign_key_violation';
    end if;
    -- El nombre que se imprime sale de la ficha si no vino puesto.
    if v_nombre is null then
      select cc.nombre into v_nombre from cliente_contactos cc where cc.id = v_contacto;
    end if;
  end if;

  insert into cotizaciones (
    serie, correlativo, cliente_id, fecha, validez_dias, orden_compra_cliente,
    mostrar_descuento, mostrar_disponibilidad, vendedor_id, contacto, contacto_id,
    condiciones, observaciones, tiempo_entrega, estado
  ) values (
    v_serie, v_corr,
    v_cliente,
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    coalesce(nullif(p_datos ->> 'validez_dias','')::smallint, 15),
    nullif(p_datos ->> 'orden_compra_cliente',''),
    coalesce((p_datos ->> 'mostrar_descuento')::boolean, false),
    coalesce((p_datos ->> 'mostrar_disponibilidad')::boolean, false),
    coalesce(nullif(p_datos ->> 'vendedor_id','')::uuid, auth.uid()),
    v_nombre,
    v_contacto,
    nullif(p_datos ->> 'condiciones',''),
    nullif(p_datos ->> 'observaciones',''),
    nullif(p_datos ->> 'tiempo_entrega',''),
    coalesce(nullif(p_datos ->> 'estado','')::estado_cotizacion, 'borrador')
  ) returning id into v_id;

  insert into cotizacion_items (
    cotizacion_id, producto_id, orden, codigo, marca, descripcion,
    cantidad, unidad_codigo, valor_unitario, descuento_pct, costo_unitario,
    precio_minimo_ref, entrega, disponibilidad, dias_entrega
  )
  select v_id,
         nullif(i.value ->> 'producto_id','')::uuid,
         i.ord::smallint,
         i.value ->> 'codigo',
         nullif(i.value ->> 'marca',''),
         i.value ->> 'descripcion',
         (i.value ->> 'cantidad')::numeric,
         coalesce(nullif(i.value ->> 'unidad_codigo',''), 'NIU'),
         (i.value ->> 'valor_unitario')::numeric,
         coalesce((i.value ->> 'descuento_pct')::numeric, 0),
         coalesce((i.value ->> 'costo_unitario')::numeric, 0),
         coalesce(
           (select p.precio_minimo from productos p
             where p.id = nullif(i.value ->> 'producto_id','')::uuid),
           0),
         nullif(i.value ->> 'entrega',''),
         coalesce(nullif(i.value ->> 'disponibilidad','')::disponibilidad_item, 'inmediata'),
         -- El plazo solo tiene sentido si no es inmediata. Se fuerza aquí y no
         -- se confía en el llamador: el check de la tabla rechazaría la fila
         -- entera, y perder una cotización de seis líneas porque una traía un
         -- plazo sobrante sería un mal negocio.
         case
           when coalesce(nullif(i.value ->> 'disponibilidad','')::disponibilidad_item, 'inmediata') = 'inmediata'
             then null
           else nullif(i.value ->> 'dias_entrega','')::smallint
         end
    from jsonb_array_elements(v_items) with ordinality as i(value, ord);

  return jsonb_build_object('ok', true, 'id', v_id,
                            'numero', v_serie || '-' || lpad(v_corr::text, 8, '0'));
end $$;

comment on function public.crear_cotizacion(jsonb) is
  'Crea la cotización y sus líneas en una llamada. Desde la 043 guarda también la disponibilidad de cada ítem —inmediata, exterior o fabricación— y si la columna se imprime.';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Se emite una cotización de verdad, se comprueba y se borra. Es la única
-- forma de saber que los tres campos llegan hasta la tabla: leer la definición
-- de la función no prueba que el insert cuadre.
do $$
declare
  v_r        jsonb;
  v_id       uuid;
  v_quien    uuid;
  v_cliente  uuid;
  v_disp     disponibilidad_item;
  v_dias     smallint;
  v_mostrar  boolean;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select c.id into v_cliente from clientes c where c.activo limit 1;
  if v_quien is null or v_cliente is null then
    raise notice 'Sin perfil de gerencia o sin clientes: no se puede probar la emisión. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  v_r := public.crear_cotizacion(jsonb_build_object(
    'cliente_id', v_cliente,
    'mostrar_disponibilidad', true,
    'items', jsonb_build_array(
      jsonb_build_object('codigo','ZZTEST-1','descripcion','ZZTEST inmediato',
                         'cantidad',1,'valor_unitario',10),
      jsonb_build_object('codigo','ZZTEST-2','descripcion','ZZTEST exterior',
                         'cantidad',2,'valor_unitario',20,
                         'disponibilidad','exterior'),
      jsonb_build_object('codigo','ZZTEST-3','descripcion','ZZTEST fabricacion 30d',
                         'cantidad',3,'valor_unitario',30,
                         'disponibilidad','fabricacion','dias_entrega',30),
      -- El caso sucio: inmediata CON plazo. Tiene que entrar con el plazo
      -- borrado, no reventar la cotización entera.
      jsonb_build_object('codigo','ZZTEST-4','descripcion','ZZTEST inmediato con plazo',
                         'cantidad',1,'valor_unitario',40,
                         'disponibilidad','inmediata','dias_entrega',8)
    )
  ));
  v_id := (v_r ->> 'id')::uuid;

  select mostrar_disponibilidad into v_mostrar from cotizaciones where id = v_id;
  if not v_mostrar then
    raise exception 'La casilla de la columna no se guardó';
  end if;

  select disponibilidad into v_disp from cotizacion_items
   where cotizacion_id = v_id and codigo = 'ZZTEST-1';
  if v_disp is distinct from 'inmediata' then
    raise exception 'Un ítem sin disponibilidad no nació inmediato: %', v_disp;
  end if;

  select disponibilidad, dias_entrega into v_disp, v_dias from cotizacion_items
   where cotizacion_id = v_id and codigo = 'ZZTEST-2';
  if v_disp is distinct from 'exterior' or v_dias is not null then
    raise exception 'El exterior sin plazo propio debería quedar en null, no en %', v_dias;
  end if;

  select disponibilidad, dias_entrega into v_disp, v_dias from cotizacion_items
   where cotizacion_id = v_id and codigo = 'ZZTEST-3';
  if v_disp is distinct from 'fabricacion' or v_dias is distinct from 30 then
    raise exception 'El plazo propio de la línea no se guardó: % / %', v_disp, v_dias;
  end if;

  select dias_entrega into v_dias from cotizacion_items
   where cotizacion_id = v_id and codigo = 'ZZTEST-4';
  if v_dias is not null then
    raise exception 'Un ítem inmediato conservó un plazo de % días', v_dias;
  end if;

  delete from cotizaciones where id = v_id;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'crear_cotizacion guarda la disponibilidad, respeta el plazo propio y limpia el sobrante.';
end $$;
