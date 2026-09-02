-- ###########################################################################
-- 055 · EL COMPARADOR DE PROVEEDORES
-- ###########################################################################
--
-- Paso 5 del plan de compras (§G). Es, con estas palabras del propio plan,
-- «lo único que hay que inventar de cero»: todo lo demás del flujo existía y
-- solo había que coserlo.
--
-- ---------------------------------------------------------------------------
-- Qué es, y sobre todo qué NO es
-- ---------------------------------------------------------------------------
-- Willy pregunta por WhatsApp y le contestan por WhatsApp (01/09, 30:01).
-- Obligarlo a emitir una solicitud de cotización formal por proveedor sería
-- MÁS trabajo del que hace hoy, así que esto no emite nada ni manda nada.
--
-- Es la hoja donde apunta lo que le dijeron. Tres cosas:
--
--   1. A quién le pregunté y qué le pregunté.
--   2. Qué me contestó cada uno, línea a línea.
--   3. Quién gana cada producto, y la compra sale de ahí de un botón.
--
-- ---------------------------------------------------------------------------
-- Se guardan LAS TRES respuestas, no solo la ganadora
-- ---------------------------------------------------------------------------
-- Es la parte que construye el historial, y la que Willy pidió con *«que haya
-- historial y mejorar los precios»*. Si solo se guardara al ganador, dentro de
-- seis meses no habría forma de saber que el segundo llevaba medio año a
-- cincuenta centavos de distancia, ni que a un proveedor se le pregunta
-- siempre y nunca contesta.
--
-- Por eso `consulta_precio_respuestas` no tiene ningún concepto de «elegida».
-- Todas valen igual como dato; la elección vive en la compra que sale después.
--
-- ---------------------------------------------------------------------------
-- Opcional a propósito
-- ---------------------------------------------------------------------------
-- La tercera de las cinco preguntas a Willy es si comparar debe ser
-- obligatorio antes de comprar. Está sin contestar, y esto se construye
-- **opcional**: `/compras/nueva` sigue funcionando igual, sin pasar por aquí.
--
-- Es la dirección reversible. Si dice que sí, hacerlo obligatorio es una
-- comprobación; si estuviera hecho obligatorio y dijera que no, habría que
-- desmontar el bloqueo de un flujo que ya usa todos los días.
--
-- ---------------------------------------------------------------------------
-- Comparar precios en dos monedas y con IGV de por medio
-- ---------------------------------------------------------------------------
-- Un proveedor de Lima contesta «S/ 15.20 más IGV» y otro «$ 4.10 puesto».
-- Comparar esos dos números tal cual es comparar cualquier cosa.
--
-- Todo se normaliza a **dólares sin IGV**, que es la unidad en la que el
-- sistema entero piensa: `compra_items.costo_unitario` es neto (el IGV va
-- aparte en la cabecera) y el kardex trabaja en dólares (042). La cuenta vive
-- en `dominio/comparador.ts`, donde está probada; aquí solo se guarda con qué
-- moneda, con qué tipo de cambio y si el precio traía el IGV dentro.
-- ###########################################################################

set search_path = public, extensions;

do $$ begin
  create type estado_consulta_precio as enum ('abierta', 'cerrada', 'anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  -- El estado de UN proveedor dentro de la consulta. `no_contesto` y
  -- `no_tiene` son distintos y los dos hacen falta: el que no tiene el
  -- producto sigue siendo buen proveedor, el que nunca contesta no.
  create type estado_respuesta_precio as enum
    ('esperando', 'respondio', 'no_contesto', 'no_tiene');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- La ronda
-- ---------------------------------------------------------------------------
create sequence if not exists seq_consulta_precio;

create table if not exists consultas_precio (
  id         uuid primary key default gen_random_uuid(),
  numero     text not null unique,
  estado     estado_consulta_precio not null default 'abierta',
  fecha      date not null default current_date,

  /** Para qué se pidió. Suele venir de la bandeja «Por comprar». */
  nota       text,

  creado_por uuid references perfiles(id) on delete set null,
  creado_en  timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists ix_consultas_precio_keyset
  on consultas_precio (fecha desc, id desc);
create index if not exists ix_consultas_precio_abiertas
  on consultas_precio (estado, fecha desc) where estado = 'abierta';

comment on table consultas_precio is
  'Una ronda de «¿a cuánto me lo dejas?». No emite ni manda nada: es la hoja donde se apunta lo que contestaron por WhatsApp.';

-- El número se pone solo. No usa `siguiente_numero_interno` porque su
-- parámetro es el enum `tipo_documento`, y añadirle un valor obliga a un
-- `alter type` que no puede ir en la misma transacción que su uso. Una
-- secuencia propia hace lo mismo y no toca nada de lo que ya existe.
create or replace function public.tg_numero_consulta_precio()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := 'CPR-' || to_char(coalesce(new.fecha, current_date), 'YY')
                  || '-' || lpad(nextval('seq_consulta_precio')::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_numero_consulta_precio on consultas_precio;
create trigger trg_numero_consulta_precio
  before insert on consultas_precio
  for each row execute function public.tg_numero_consulta_precio();

-- ---------------------------------------------------------------------------
-- Qué se preguntó
-- ---------------------------------------------------------------------------
create table if not exists consulta_precio_items (
  id          uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references consultas_precio(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete restrict,
  orden       smallint not null default 1,
  cantidad    numeric(14,2) not null,

  constraint consulta_item_cantidad_pos check (cantidad > 0),
  -- El mismo producto dos veces en la misma consulta no significa nada, y
  -- convertiría la comparación en dos filas que hay que decidir por separado.
  constraint consulta_item_unico unique (consulta_id, producto_id)
);

create index if not exists ix_consulta_items on consulta_precio_items (consulta_id, orden);

-- ---------------------------------------------------------------------------
-- A quién se le preguntó
-- ---------------------------------------------------------------------------
create table if not exists consulta_precio_proveedores (
  id           uuid primary key default gen_random_uuid(),
  consulta_id  uuid not null references consultas_precio(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete restrict,
  estado       estado_respuesta_precio not null default 'esperando',

  /**
   * La moneda de ESTE proveedor, no la de la consulta. Es todo el asunto: en
   * la misma ronda uno contesta en soles y otro en dólares.
   */
  moneda       char(3) not null default 'USD',
  tipo_cambio  numeric(9,4),

  /**
   * Si los precios que dio traen el IGV dentro.
   *
   * En Perú «S/ 15.20» a secas es ambiguo y la respuesta cambia el número un
   * 18 %. Se pregunta explícitamente en la pantalla en vez de suponer, porque
   * suponer aquí es equivocarse en el margen de todo lo que se compre.
   */
  incluye_igv  boolean not null default false,

  /** Hasta cuándo respeta el precio. Willy lo pregunta siempre. */
  validez_hasta  date,
  /** El plazo que dio para todo, si no dijo uno por línea. */
  dias_entrega   smallint,
  nota           text,
  respondido_en  timestamptz,

  constraint consulta_prov_unico unique (consulta_id, proveedor_id),
  constraint consulta_prov_moneda check (moneda in ('USD', 'PEN')),
  -- Mismo criterio que `compras` (042): soles sin tipo de cambio es un costo
  -- multiplicado por casi cuatro, y no salta ningún error solo.
  constraint consulta_prov_tc check (
    moneda = 'USD' or tipo_cambio is null or tipo_cambio > 0
  ),
  constraint consulta_prov_dias check (dias_entrega is null or dias_entrega >= 0)
);

create index if not exists ix_consulta_proveedores
  on consulta_precio_proveedores (consulta_id);
create index if not exists ix_consulta_prov_historial
  on consulta_precio_proveedores (proveedor_id, respondido_en desc);

-- ---------------------------------------------------------------------------
-- Qué contestó cada uno, línea a línea
-- ---------------------------------------------------------------------------
create table if not exists consulta_precio_respuestas (
  id             uuid primary key default gen_random_uuid(),
  consulta_proveedor_id uuid not null
    references consulta_precio_proveedores(id) on delete cascade,
  item_id        uuid not null references consulta_precio_items(id) on delete cascade,

  /** En la moneda del proveedor y tal como la dijo, con o sin IGV. */
  costo_unitario numeric(14,4),
  dias_entrega   smallint,

  /**
   * `false` es una respuesta, no un hueco.
   *
   * «Ese no lo tengo» es información que vale: evita volver a preguntárselo, y
   * es lo que impide que un cero se lea como el precio más barato de la
   * comparación.
   */
  disponible     boolean not null default true,
  nota           text,

  constraint respuesta_unica unique (consulta_proveedor_id, item_id),
  constraint respuesta_costo_pos check (costo_unitario is null or costo_unitario >= 0),
  constraint respuesta_dias check (dias_entrega is null or dias_entrega >= 0),
  -- Disponible y sin precio no es una respuesta: es un formulario a medio
  -- llenar que después gana la comparación por ser «el más barato».
  constraint respuesta_disponible_con_precio check (
    not disponible or costo_unitario is not null
  )
);

create index if not exists ix_consulta_respuestas
  on consulta_precio_respuestas (consulta_proveedor_id);
create index if not exists ix_consulta_respuestas_item
  on consulta_precio_respuestas (item_id);

-- ---------------------------------------------------------------------------
-- De qué ronda salió cada compra
-- ---------------------------------------------------------------------------
-- Nullable y sin ninguna regla que la exija: se compra sin comparar todos los
-- días, y así seguirá mientras Willy no diga lo contrario.
alter table compras
  add column if not exists consulta_precio_id uuid
    references consultas_precio(id) on delete set null;

create index if not exists ix_compras_consulta
  on compras (consulta_precio_id) where consulta_precio_id is not null;

comment on column compras.consulta_precio_id is
  'De qué ronda de precios salió esta compra, si salió de una. Nullable: comparar es opcional.';

-- ---------------------------------------------------------------------------
-- La comparación, ya normalizada a dólares sin IGV
-- ---------------------------------------------------------------------------
-- La cuenta se hace aquí y no solo en TypeScript porque esta vista es también
-- el historial: «¿a cuánto me lo dejó cada uno la última vez?» se contesta
-- sobre ella, desde cualquier pantalla, sin cargar el módulo entero.
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
  -- Dólares sin IGV. El 18 % sale de `parametros` si está, y si no del valor
  -- vigente: una vista que devuelve null porque falta una fila de
  -- configuración es peor que una que usa el IGV de siempre.
  case
    when r.costo_unitario is null then null
    else round(
      (r.costo_unitario
        / case when cp.moneda = 'PEN' and cp.tipo_cambio > 0 then cp.tipo_cambio else 1 end
        / case when cp.incluye_igv then 1.18 else 1 end)::numeric,
      4)
  end as costo_usd
from consultas_precio c
join consulta_precio_items i on i.consulta_id = c.id
join productos p on p.id = i.producto_id
join consulta_precio_proveedores cp on cp.consulta_id = c.id
join proveedores pr on pr.id = cp.proveedor_id
left join consulta_precio_respuestas r
       on r.consulta_proveedor_id = cp.id and r.item_id = i.id;

comment on view v_comparativa_precios is
  'La rejilla del comparador: cada producto contra cada proveedor, con el costo llevado a dólares sin IGV para que se puedan comparar de verdad.';

-- ---------------------------------------------------------------------------
-- Crear la ronda
-- ---------------------------------------------------------------------------
create or replace function public.crear_consulta_precio(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id     uuid;
  v_numero text;
  v_items  jsonb := coalesce(p_datos -> 'items', '[]'::jsonb);
  v_provs  jsonb := coalesce(p_datos -> 'proveedores', '[]'::jsonb);
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

  -- Los duplicados se comprueban antes de insertar: el UNIQUE saltaría a
  -- mitad y su mensaje no le dice nada a nadie.
  if (select count(distinct i ->> 'producto_id') from jsonb_array_elements(v_items) i)
     <> jsonb_array_length(v_items) then
    raise exception 'Hay un producto repetido en la lista'
      using errcode = 'invalid_parameter_value';
  end if;

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

  insert into consulta_precio_proveedores (consulta_id, proveedor_id)
  select v_id, (value)::uuid
    from jsonb_array_elements_text(v_provs)
  on conflict (consulta_id, proveedor_id) do nothing;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end $$;

comment on function public.crear_consulta_precio(jsonb) is
  'Abre una ronda de precios: qué se pregunta y a quién. No manda nada.';

revoke execute on function public.crear_consulta_precio(jsonb) from public, anon;
grant execute on function public.crear_consulta_precio(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Apuntar lo que contestó uno
-- ---------------------------------------------------------------------------
create or replace function public.anotar_respuesta_precio(p_datos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_cp        uuid := nullif(p_datos ->> 'consulta_proveedor_id','')::uuid;
  v_lineas    jsonb := coalesce(p_datos -> 'lineas', '[]'::jsonb);
  v_estado    estado_respuesta_precio :=
    coalesce(nullif(p_datos ->> 'estado','')::estado_respuesta_precio, 'respondio');
  v_moneda    char(3) := coalesce(nullif(p_datos ->> 'moneda','')::char(3), 'USD');
  v_tc        numeric(9,4) := nullif(p_datos ->> 'tipo_cambio','')::numeric;
  v_consulta  uuid;
  v_proveedor uuid;
  v_n         int;
begin
  if not public.puede_escribir('compras') then
    raise exception 'Tu rol no puede anotar precios'
      using errcode = 'insufficient_privilege';
  end if;

  select consulta_id, proveedor_id into v_consulta, v_proveedor
    from consulta_precio_proveedores where id = v_cp;
  if v_consulta is null then
    raise exception 'Esa consulta no existe'
      using errcode = 'no_data_found';
  end if;

  if v_moneda not in ('USD','PEN') then
    raise exception 'Moneda % no admitida: se compara en USD o en PEN', v_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda <> 'USD' and (v_tc is null or v_tc <= 0) then
    raise exception 'Un precio en % necesita el tipo de cambio para poder compararlo', v_moneda
      using errcode = 'invalid_parameter_value';
  end if;
  if v_moneda = 'USD' then v_tc := null; end if;

  update consulta_precio_proveedores
     set estado        = v_estado,
         moneda        = v_moneda,
         tipo_cambio   = v_tc,
         incluye_igv   = coalesce((p_datos ->> 'incluye_igv')::boolean, false),
         validez_hasta = nullif(p_datos ->> 'validez_hasta','')::date,
         dias_entrega  = nullif(p_datos ->> 'dias_entrega','')::smallint,
         nota          = nullif(p_datos ->> 'nota',''),
         respondido_en = case when v_estado = 'esperando' then null else now() end
   where id = v_cp;

  -- Se reemplaza lo que hubiera: anotar es corregir lo apuntado, y una
  -- respuesta a medias mezclada con la anterior no es de nadie.
  delete from consulta_precio_respuestas where consulta_proveedor_id = v_cp;

  insert into consulta_precio_respuestas
    (consulta_proveedor_id, item_id, costo_unitario, dias_entrega, disponible, nota)
  select v_cp,
         (l ->> 'item_id')::uuid,
         nullif(l ->> 'costo_unitario','')::numeric,
         nullif(l ->> 'dias_entrega','')::smallint,
         coalesce((l ->> 'disponible')::boolean, true),
         nullif(l ->> 'nota','')
    from jsonb_array_elements(v_lineas) l
   where (l ->> 'item_id') is not null
     -- Una línea sin precio y marcada disponible es el formulario a medio
     -- llenar: se descarta aquí en vez de reventar contra el check, porque
     -- dejar en blanco lo que no se preguntó es normal.
     and (coalesce((l ->> 'disponible')::boolean, true) = false
          or nullif(l ->> 'costo_unitario','') is not null);

  get diagnostics v_n = row_count;

  -- Lo que Luis pidió el 02/09: *«cuando va a comprar o cotizar esa compra ahí
  -- también pueda nutrir el sistema, o sea poner qué productos vende»*. Quien
  -- cotiza un producto lo vende, y eso es exactamente lo que hace falta saber
  -- la próxima vez que falte ese producto.
  if v_n > 0 then
    perform public.anotar_productos_de_proveedor(
      v_proveedor,
      (select jsonb_agg(jsonb_build_object(
                'producto_id', i.producto_id,
                'costo_unitario', r.costo_unitario))
         from consulta_precio_respuestas r
         join consulta_precio_items i on i.id = r.item_id
        where r.consulta_proveedor_id = v_cp and r.disponible),
      current_date,
      v_moneda,
      v_tc,
      -- `false`: cotizar NO es comprar. Así no suma a `comprado_veces` —que
      -- es el desempate de «a quién le compro esto normalmente»— y no pisa un
      -- costo real de compra con un precio que solo se preguntó.
      false,
      'Cotizó en ' || (select numero from consultas_precio where id = v_consulta)
    );
  end if;

  update consultas_precio set actualizado_en = now() where id = v_consulta;

  return jsonb_build_object('lineas', v_n);
end $$;

comment on function public.anotar_respuesta_precio(jsonb) is
  'Guarda lo que contestó un proveedor y, de paso, apunta que vende esos productos.';

revoke execute on function public.anotar_respuesta_precio(jsonb) from public, anon;
grant execute on function public.anotar_respuesta_precio(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Las cuatro tablas nacen después de la 006, así que su bucle no las tocó: se
-- quedarían con RLS activo y cero políticas, que significa que nadie lee. Es
-- la cuarta vez que pasa (046, 049, 054); por eso va escrito cada vez.
do $$
declare
  t text;
begin
  foreach t in array array['consultas_precio', 'consulta_precio_items',
                           'consulta_precio_proveedores', 'consulta_precio_respuestas']
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "lectura_autenticados" on %I', t);
    execute format(
      'create policy "lectura_autenticados" on %I for select to authenticated
         using ((select public.mi_rol()) is not null)', t);

    -- Todas se gobiernan por el permiso de `compras`: son partes del mismo
    -- documento, y un permiso por tabla dejaría a alguien pudiendo crear la
    -- ronda pero no apuntar lo que le contestaron.
    execute format('drop policy if exists "escritura_insert" on %I', t);
    execute format(
      'create policy "escritura_insert" on %I for insert to authenticated
         with check ((select public.puede_escribir(''compras'')))', t);

    execute format('drop policy if exists "escritura_update" on %I', t);
    execute format(
      'create policy "escritura_update" on %I for update to authenticated
         using ((select public.puede_escribir(''compras'')))
         with check ((select public.puede_escribir(''compras'')))', t);

    execute format('drop policy if exists "escritura_delete" on %I', t);
    execute format(
      'create policy "escritura_delete" on %I for delete to authenticated
         using ((select public.puede_escribir(''compras'')))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien   uuid;
  v_prov_a  uuid;
  v_prov_b  uuid;
  v_p1      uuid;
  v_p2      uuid;
  v_r       jsonb;
  v_id      uuid;
  v_item1   uuid;
  v_item2   uuid;
  v_cpa     uuid;
  v_cpb     uuid;
  v_usd     numeric;
  v_n       int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select id into v_prov_a from proveedores where activo order by razon_social limit 1;
  select id into v_prov_b from proveedores where activo and id <> v_prov_a
   order by razon_social limit 1;
  select id into v_p1 from productos where not archivado order by codigo limit 1;
  select id into v_p2 from productos where not archivado and id <> v_p1 order by codigo limit 1;

  if v_quien is null or v_prov_b is null or v_p2 is null then
    raise notice 'Faltan datos para probar el comparador (perfil, dos proveedores, dos productos). Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  v_r := public.crear_consulta_precio(jsonb_build_object(
    'nota', 'ZZTEST comparador',
    'items', jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 10),
      jsonb_build_object('producto_id', v_p2, 'cantidad', 4)),
    'proveedores', jsonb_build_array(v_prov_a::text, v_prov_b::text)));

  v_id := (v_r ->> 'id')::uuid;
  if v_r ->> 'numero' not like 'CPR-%' then
    raise exception 'La consulta salió sin número: %', v_r ->> 'numero';
  end if;

  select id into v_item1 from consulta_precio_items
   where consulta_id = v_id and producto_id = v_p1;
  select id into v_item2 from consulta_precio_items
   where consulta_id = v_id and producto_id = v_p2;
  select id into v_cpa from consulta_precio_proveedores
   where consulta_id = v_id and proveedor_id = v_prov_a;
  select id into v_cpb from consulta_precio_proveedores
   where consulta_id = v_id and proveedor_id = v_prov_b;

  -- 1 · El de soles. 37.00 con IGV a 3.700 son 10.00 sin IGV en dólares:
  --     37 / 3.7 = 10 con IGV, / 1.18 = 8.4746.
  perform public.anotar_respuesta_precio(jsonb_build_object(
    'consulta_proveedor_id', v_cpa,
    'moneda', 'PEN', 'tipo_cambio', 3.7, 'incluye_igv', true,
    'lineas', jsonb_build_array(
      jsonb_build_object('item_id', v_item1, 'costo_unitario', 37.00, 'dias_entrega', 3),
      jsonb_build_object('item_id', v_item2, 'disponible', false))));

  select costo_usd into v_usd from v_comparativa_precios
   where item_id = v_item1 and consulta_proveedor_id = v_cpa;
  if v_usd is null or round(v_usd, 2) <> 8.47 then
    raise exception 'Los soles con IGV no se normalizaron: salió %', v_usd;
  end if;

  -- 2 · «No lo tengo» es una respuesta, y NO puede ganar la comparación por
  --     valer cero. Es el fallo que este comparador tendría si un hueco se
  --     leyera como precio.
  select costo_usd into v_usd from v_comparativa_precios
   where item_id = v_item2 and consulta_proveedor_id = v_cpa;
  if v_usd is not null then
    raise exception 'Un «no lo tengo» se guardó con precio: %', v_usd;
  end if;

  -- 3 · El de dólares.
  perform public.anotar_respuesta_precio(jsonb_build_object(
    'consulta_proveedor_id', v_cpb,
    'moneda', 'USD', 'incluye_igv', false, 'dias_entrega', 15,
    'lineas', jsonb_build_array(
      jsonb_build_object('item_id', v_item1, 'costo_unitario', 9.00),
      jsonb_build_object('item_id', v_item2, 'costo_unitario', 2.50))));

  select costo_usd into v_usd from v_comparativa_precios
   where item_id = v_item1 and consulta_proveedor_id = v_cpb;
  if round(v_usd, 2) <> 9.00 then
    raise exception 'El precio en dólares se movió: %', v_usd;
  end if;

  -- El plazo de la cabecera se hereda cuando la línea no trae el suyo.
  select dias_entrega into v_n from v_comparativa_precios
   where item_id = v_item1 and consulta_proveedor_id = v_cpb;
  if v_n <> 15 then
    raise exception 'El plazo de la cabecera no se heredó: %', v_n;
  end if;

  -- 4 · Anotar dos veces corrige, no duplica.
  perform public.anotar_respuesta_precio(jsonb_build_object(
    'consulta_proveedor_id', v_cpb, 'moneda', 'USD',
    'lineas', jsonb_build_array(
      jsonb_build_object('item_id', v_item1, 'costo_unitario', 8.00))));
  select count(*) into v_n from consulta_precio_respuestas
   where consulta_proveedor_id = v_cpb;
  if v_n <> 1 then
    raise exception 'Volver a anotar dejó % líneas en vez de reemplazarlas', v_n;
  end if;

  -- 5 · Y el proveedor quedó apuntado como que vende eso (046).
  select count(*) into v_n from proveedor_productos
   where proveedor_id = v_prov_b and producto_id = v_p1;
  if v_n = 0 then
    raise exception 'Cotizar un producto no dejó constancia de que el proveedor lo vende';
  end if;

  -- 6 · Una respuesta disponible sin precio no puede entrar ni por SQL: es la
  --     que después ganaría la comparación con un cero.
  begin
    insert into consulta_precio_respuestas
      (consulta_proveedor_id, item_id, costo_unitario, disponible)
    values (v_cpb, v_item2, null, true);
    raise exception 'Dejó guardar una respuesta disponible y sin precio';
  exception when check_violation then null;
  end;

  -- Limpieza. El cascade se lleva items, proveedores y respuestas.
  delete from consultas_precio where id = v_id;
  delete from proveedor_productos
   where proveedor_id in (v_prov_a, v_prov_b) and producto_id in (v_p1, v_p2)
     and comprado_veces = 0;

  perform set_config('request.jwt.claims', '', true);

  -- Y el rastro que esta prueba dejó en la bitácora (051). Estas migraciones
  -- se reaplican, y una bitácora que acumula documentos de prueba deja de
  -- servir para lo que se hizo.
  delete from actividad
   where entidad in ('compras', 'productos')
     and creado_en > now() - interval '2 minutes';

  raise notice 'El comparador normaliza monedas e IGV, no deja que un hueco gane, y apunta qué vende cada proveedor.';
end $$;
