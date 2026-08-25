-- ###########################################################################
-- 016 · COMPRAS · registrar y anular
-- ###########################################################################
--
-- El otro extremo del abastecimiento. Las tablas `compras` y `compra_items`
-- existían desde la 002, pero NO había ninguna función para crear una compra:
-- era el único documento del sistema sin su RPC, y por eso el camino
-- «recepción contra compra» estaba escrito y probado pero no se podía
-- ejercitar desde la aplicación.
--
-- Lo que esta migración NO hace, a propósito: mover stock. Willy fue explícito
-- (25:21), *"el stock se mueve al recibir la mercadería"*. Comprar es un
-- compromiso, no una entrada de almacén. El kardex no se entera de una compra
-- hasta que `recepcionar_mercaderia()` la consume.
--
-- Idempotente. Se puede volver a aplicar sin efectos.

-- ---------------------------------------------------------------------------
-- Motivo de anulación
-- ---------------------------------------------------------------------------
-- `compras.estado` ya tenía 'anulada', pero no había dónde escribir POR QUÉ.
-- Un documento anulado sin motivo es un agujero en la auditoría: dentro de seis
-- meses nadie recuerda si fue un error de tecleo o que el proveedor no sirvió.
alter table compras add column if not exists motivo_anulacion text;

comment on column compras.motivo_anulacion is
  'Por qué se anuló. Obligatorio al anular: un documento anulado sin motivo no se puede auditar.';


-- ---------------------------------------------------------------------------
-- crear_compra
-- ---------------------------------------------------------------------------
-- Contrato del jsonb:
--   { "proveedor_id": uuid, "tipo": "local|importacion",
--     "fecha": date|null, "fecha_estimada": date|null,
--     "documento_proveedor": text|null, "guia_proveedor": text|null,
--     "gastos_importacion": number|null, "tracking": text|null,
--     "courier": text|null, "observaciones": text|null,
--     "afecto_igv": boolean,
--     "items": [{ "producto_id": uuid, "cantidad": number,
--                 "costo_unitario": number, "unidad_codigo": text|null }] }
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
    tracking, courier, comprador_id, observaciones
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
    nullif(p_datos ->> 'observaciones','')
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
    'total', v_sub + v_igv
  );
end $$;

comment on function public.crear_compra(jsonb) is
  'Crea la compra y sus ítems en una sola llamada, y calcula el dinero desde los ítems. NO mueve stock: eso lo hace la recepción.';


-- ---------------------------------------------------------------------------
-- anular_compra
-- ---------------------------------------------------------------------------
create or replace function public.anular_compra(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_estado    estado_compra;
  v_numero    text;
  v_recibido  numeric(14,2);
begin
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede anular compras'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hay que decir por qué se anula la compra'
      using errcode = 'invalid_parameter_value';
  end if;

  select estado, numero into v_estado, v_numero from compras where id = p_id;
  if v_estado is null then
    raise exception 'La compra no existe' using errcode = 'no_data_found';
  end if;
  if v_estado = 'anulada' then
    raise exception 'La compra % ya estaba anulada', v_numero
      using errcode = 'invalid_parameter_value';
  end if;

  -- Si algo ya entró al almacén, la compra NO se anula.
  --
  -- Anularla dejaría el kardex apuntando a un documento que dice que nunca
  -- existió, y el stock seguiría ahí. Deshacer una entrada de mercadería es un
  -- ajuste de inventario, con su motivo y su responsable — que es justamente
  -- la pantalla que ya existe para eso.
  select coalesce(sum(cantidad_recibida), 0) into v_recibido
    from compra_items where compra_id = p_id;

  if v_recibido > 0 then
    raise exception 'La compra % ya tiene mercadería recibida: corrígela con un ajuste de inventario, no anulándola', v_numero
      using errcode = 'invalid_parameter_value';
  end if;

  update compras
     set estado           = 'anulada',
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;

  return jsonb_build_object('id', p_id, 'numero', v_numero);
end $$;

comment on function public.anular_compra(uuid, text) is
  'Anula una compra sin recibir. Si ya entró mercadería se niega: eso se corrige con un ajuste de inventario.';


-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- Ambas son de escritura y ya comprueban el rol por dentro; se exponen a
-- `authenticated` como el resto de funciones de negocio. La 013 vuelve a
-- comprobar al aplicar que ninguna función volátil quede sin control de rol.
grant execute on function public.crear_compra(jsonb)          to authenticated;
grant execute on function public.anular_compra(uuid, text)    to authenticated;


-- ---------------------------------------------------------------------------
-- Centinela
-- ---------------------------------------------------------------------------
do $$
declare v_falta text;
begin
  select string_agg(p.proname, ', ')
    into v_falta
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('crear_compra','anular_compra')
     and pg_get_functiondef(p.oid) !~ 'puede_escribir|tiene_rol|es_gerencia';

  if v_falta is not null then
    raise exception 'Funciones de compras sin control de rol: %', v_falta;
  end if;
end $$;
