-- ###########################################################################
-- 044 · LA COMPRA SE REGISTRA CON SU MONEDA
-- ###########################################################################
--
-- La 042 abrió el hueco en la tabla y puso el check que impide guardar soles
-- sin tipo de cambio. Esta es la que deja que la pantalla los mande: sin ella,
-- `crear_compra` seguiría insertando siempre en dólares y el arreglo de la 042
-- serviría solo para quien escribiera SQL a mano.
--
-- Se redefine la función entera —`create or replace` no admite parches— con
-- dos cambios sobre la de la 016:
--
--   · `moneda` y `tipo_cambio` en el insert, con `coalesce` a USD/null, así
--     que quien no los mande obtiene el comportamiento de siempre.
--   · La comprobación va ANTES de quemar el correlativo. El check de la tabla
--     diría lo mismo, pero después de gastar un número de compra que ya no
--     vuelve.
--
-- Lo que NO cambia, y conviene dejarlo dicho: `subtotal`, `igv` y `total` se
-- quedan EN LA MONEDA DE LA COMPRA. No se convierten aquí a propósito — son
-- las cifras que hay que cuadrar contra la factura que el proveedor entregó,
-- y una factura en soles se cuadra en soles. La conversión a dólares ocurre en
-- la recepción, que es donde el costo entra al kardex (042).

set search_path = public, extensions;

create or replace function public.crear_compra(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_compra    uuid;
  v_numero    text;
  v_items     jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_proveedor uuid  := nullif(p_datos ->> 'proveedor_id','')::uuid;
  v_tipo      tipo_compra := coalesce(nullif(p_datos ->> 'tipo','')::tipo_compra, 'local');
  v_afecto    boolean := coalesce((p_datos ->> 'afecto_igv')::boolean, true);
  v_igv_pct   numeric(5,2);
  v_sub       numeric(14,2) := 0;
  v_igv       numeric(14,2) := 0;
  v_moneda    char(3) := coalesce(nullif(p_datos ->> 'moneda','')::char(3), 'USD');
  v_tc        numeric(9,4) := nullif(p_datos ->> 'tipo_cambio','')::numeric;
begin
  -- Control de rol.
  --
  -- Es `security definer`, así que se ejecuta con los privilegios del dueño y
  -- SE SALTA las políticas de RLS. Sin esta comprobación, cualquier usuario
  -- con sesión podría crear compras por PostgREST sin pasar por la aplicación.
  --
  -- Va lo PRIMERO: validar a media función deja un correlativo quemado.
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede registrar compras'
      using errcode = 'insufficient_privilege';
  end if;

  if v_proveedor is null then
    raise exception 'La compra necesita un proveedor'
      using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La compra no tiene ítems'
      using errcode = 'invalid_parameter_value';
  end if;

  -- La moneda, antes de gastar el correlativo. El mensaje dice qué falta; el
  -- check de la tabla solo diría «viola compras_tc_coherente».
  if v_moneda not in ('USD','PEN') then
    raise exception 'Moneda % no admitida: la compra es en USD o en PEN', v_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda <> 'USD' and (v_tc is null or v_tc <= 0) then
    raise exception 'Una compra en % necesita el tipo de cambio del día', v_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  -- En dólares no hay nada que convertir. Se limpia en vez de rechazar: que la
  -- pantalla deje un tipo de cambio escrito al cambiar de moneda es normal, y
  -- tumbar la compra por eso sería castigar un descuido inofensivo.
  if v_moneda = 'USD' then
    v_tc := null;
  end if;

  -- Dos líneas del mismo producto harían saltar el UNIQUE
  -- (compra_id, producto_id) a mitad del INSERT, con un error de restricción
  -- que no le dice nada a nadie. Se comprueba antes, con su mensaje.
  if (select count(distinct i ->> 'producto_id') from jsonb_array_elements(v_items) i)
     <> jsonb_array_length(v_items) then
    raise exception 'Hay un producto repetido en dos líneas de la compra'
      using errcode = 'invalid_parameter_value';
  end if;

  v_numero := public.siguiente_numero_interno('compra');

  insert into compras (
    numero, proveedor_id, tipo, fecha, fecha_estimada,
    documento_proveedor, guia_proveedor, gastos_importacion,
    tracking, courier, comprador_id, observaciones, moneda, tipo_cambio
  ) values (
    v_numero,
    v_proveedor,
    v_tipo,
    coalesce(nullif(p_datos ->> 'fecha','')::date, current_date),
    nullif(p_datos ->> 'fecha_estimada','')::date,
    nullif(p_datos ->> 'documento_proveedor',''),
    nullif(p_datos ->> 'guia_proveedor',''),
    coalesce(nullif(p_datos ->> 'gastos_importacion','')::numeric, 0),
    nullif(p_datos ->> 'tracking',''),
    nullif(p_datos ->> 'courier',''),
    auth.uid(),
    nullif(p_datos ->> 'observaciones',''),
    v_moneda,
    v_tc
  ) returning id into v_compra;

  insert into compra_items (compra_id, producto_id, orden, cantidad, unidad_codigo, costo_unitario)
  select v_compra,
         (i.valor ->> 'producto_id')::uuid,
         i.orden::smallint,
         (i.valor ->> 'cantidad')::numeric,
         coalesce(
           nullif(i.valor ->> 'unidad_codigo',''),
           (select p.unidad_codigo from productos p where p.id = (i.valor ->> 'producto_id')::uuid),
           'NIU'
         ),
         coalesce(nullif(i.valor ->> 'costo_unitario','')::numeric, 0)
  from jsonb_array_elements(v_items) with ordinality as i(valor, orden);

  -- El dinero se calcula AQUÍ, nunca se acepta de quien llama.
  --
  -- `compra_items.importe` es una columna generada —round(cantidad × costo, 2)—
  -- así que sumarla es sumar exactamente lo que la base considera verdad. Un
  -- total que viniera del navegador sería un total que el navegador puede
  -- mentir.
  --
  -- Todo esto queda en la MONEDA DE LA COMPRA: son las cifras que se cuadran
  -- contra la factura del proveedor, y una factura en soles se cuadra en soles.
  select coalesce(sum(ci.importe), 0) into v_sub
    from compra_items ci where ci.compra_id = v_compra;

  select coalesce(igv_porcentaje, 18.00) into v_igv_pct from empresa where id = 1;

  -- El IGV NO forma parte del costo del inventario: es crédito fiscal
  -- recuperable, y `costo_unitario` viaja neto hasta el kardex. Se guarda
  -- aparte para poder cuadrar contra la factura del proveedor.
  --
  -- Una importación normalmente llega sin IGV peruano en la factura del
  -- proveedor de fuera —se paga en aduana—, así que el afecto lo decide quien
  -- registra, no el tipo de compra.
  if v_afecto then
    v_igv := round(v_sub * v_igv_pct / 100.0, 2);
  end if;

  update compras
     set subtotal = v_sub,
         igv      = v_igv,
         total    = v_sub + v_igv
   where id = v_compra;

  return jsonb_build_object(
    'id', v_compra,
    'numero', v_numero,
    'items', jsonb_array_length(v_items),
    'subtotal', v_sub,
    'igv', v_igv,
    'total', v_sub + v_igv,
    'moneda', v_moneda,
    'tipo_cambio', v_tc
  );
end $$;

comment on function public.crear_compra(jsonb) is
  'Crea la compra y sus ítems en una sola llamada, y calcula el dinero desde los ítems, en la moneda de la factura del proveedor. NO mueve stock: eso lo hace la recepción, que es donde se convierte a dólares.';

-- ---------------------------------------------------------------------------
-- Lo que falta por recibir de una compra
-- ---------------------------------------------------------------------------
-- Para el botón «Recibir» que abre la recepción con las cantidades ya puestas.
-- Willy, 01/09 (28:13): *«usted ya hizo la compra, ya tiene la boleta, tiene su
-- factura en la mano; entonces esos cinco productos, cambiar el stock y ya, no
-- hacerlo tan engorroso»*.
--
-- Hasta hoy había que ir a Recepciones, buscar la compra y teclear las líneas
-- otra vez. Están todas aquí.
create or replace function public.pendiente_de_recibir(p_compra uuid)
returns table (
  producto_id    uuid,
  codigo         text,
  descripcion    text,
  marca          text,
  unidad_codigo  text,
  pedido         numeric,
  recibido       numeric,
  pendiente      numeric,
  costo_unitario numeric
)
language sql stable security invoker set search_path = public, extensions
as $$
  select ci.producto_id,
         p.codigo,
         p.descripcion,
         m.nombre,
         ci.unidad_codigo,
         ci.cantidad,
         ci.cantidad_recibida,
         ci.cantidad - ci.cantidad_recibida,
         ci.costo_unitario
    from compra_items ci
    join productos p on p.id = ci.producto_id
    left join marcas m on m.id = p.marca_id
   where ci.compra_id = p_compra
     and ci.cantidad_recibida < ci.cantidad
   order by ci.orden;
$$;

comment on function public.pendiente_de_recibir(uuid) is
  'Las líneas de una compra que todavía no han llegado, con lo que falta de cada una y su costo. Alimenta el botón «Recibir» desde la ficha de la compra.';

-- `security invoker`: es una lectura y tiene que respetar RLS. Que alguien de
-- almacén vea lo pendiente de una compra es correcto; que lo vea saltándose
-- las políticas, no.
revoke execute on function public.pendiente_de_recibir(uuid) from public, anon;
grant execute on function public.pendiente_de_recibir(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien uuid;
  v_prov  uuid;
  v_prod  uuid;
  v_r     jsonb;
  v_id    uuid;
  v_n     int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select p.id into v_prod  from productos p limit 1;
  if v_quien is null or v_prod is null then
    raise notice 'Sin perfil de gerencia o sin productos: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  -- Un proveedor de usar y tirar: hoy no hay ninguno en la base.
  insert into proveedores (codigo, razon_social, tipo_documento, numero_documento)
  values ('ZZTESTPROV044', 'ZZTEST PROVEEDOR 044', 'RUC', '20100070970')
  on conflict do nothing;
  select id into v_prov from proveedores where codigo = 'ZZTESTPROV044';

  -- Soles sin tipo de cambio: tiene que fallar ANTES de gastar correlativo.
  begin
    v_r := public.crear_compra(jsonb_build_object(
      'proveedor_id', v_prov, 'moneda', 'PEN',
      'items', jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'costo_unitario', 15.20))));
    raise exception 'crear_compra aceptó una compra en soles sin tipo de cambio';
  exception when invalid_parameter_value then null;
  end;

  -- Con tipo de cambio, entra y conserva las cifras EN SOLES.
  v_r := public.crear_compra(jsonb_build_object(
    'proveedor_id', v_prov, 'moneda', 'PEN', 'tipo_cambio', 3.7520, 'afecto_igv', false,
    'items', jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 2, 'costo_unitario', 15.20))));
  v_id := (v_r ->> 'id')::uuid;

  if (v_r ->> 'subtotal')::numeric is distinct from 30.40 then
    raise exception 'El subtotal se convirtió cuando no debía: % (esperaba 30.40 en soles)', v_r ->> 'subtotal';
  end if;
  if (select moneda from compras where id = v_id) is distinct from 'PEN' then
    raise exception 'La moneda no se guardó';
  end if;

  -- Lo pendiente de recibir sale entero, porque no ha llegado nada.
  select count(*) into v_n from public.pendiente_de_recibir(v_id);
  if v_n <> 1 then
    raise exception 'pendiente_de_recibir devolvió % líneas, esperaba 1', v_n;
  end if;
  if (select pendiente from public.pendiente_de_recibir(v_id)) is distinct from 2 then
    raise exception 'pendiente_de_recibir no descuenta bien lo recibido';
  end if;

  -- Y en dólares el tipo de cambio se limpia solo en vez de tumbar la compra.
  v_r := public.crear_compra(jsonb_build_object(
    'proveedor_id', v_prov, 'moneda', 'USD', 'tipo_cambio', 3.75,
    'items', jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'costo_unitario', 4))));
  if (select tipo_cambio from compras where id = (v_r ->> 'id')::uuid) is not null then
    raise exception 'Una compra en dólares se guardó con tipo de cambio';
  end if;

  delete from compras where proveedor_id = v_prov;
  delete from proveedores where id = v_prov;
  perform set_config('request.jwt.claims', '', true);


  -- Y se borra el rastro que esta prueba dejó en la bitácora (051). Estas
  -- migraciones se reaplican, y una bitácora que acumula documentos de
  -- prueba deja de servir para lo que se hizo.
  delete from actividad
   where entidad in ('compras')
     and creado_en > now() - interval '2 minutes';

  raise notice 'crear_compra respeta la moneda de la factura, y pendiente_de_recibir sabe qué falta.';
end $$;
