-- ###########################################################################
-- 046 · QUÉ VENDE CADA PROVEEDOR
-- ###########################################################################
--
-- Luis, 02/09: *«el proveedor no tiene qué marca o productos vende; aparte
-- que pueda editar también cuando va a comprar o cotizar esa compra, ahí
-- también pueda nutrir el sistema, o sea poner qué productos vende. La cosa
-- es ayudar»*.
--
-- ---------------------------------------------------------------------------
-- Qué había
-- ---------------------------------------------------------------------------
-- `proveedor_marcas` existe desde la 002 y tiene editor en la ficha, pero está
-- VACÍA: la lista que mandó Willy el 02/09 no traía marcas. Y de productos no
-- había nada — solo `productos.proveedor_id` (025), que es el proveedor
-- HABITUAL de un producto: uno solo, y en el sentido contrario.
--
-- Así que el ERP no puede contestar la pregunta con la que empieza cualquier
-- compra: **¿a quién le pido esto?**
--
-- ---------------------------------------------------------------------------
-- La idea: que no haya que teclearlo
-- ---------------------------------------------------------------------------
-- Un maestro que hay que mantener a mano no se mantiene. Pedirle a Willy que
-- se siente a escribir qué vende cada uno de sus 97 proveedores es pedirle
-- algo que no va a pasar, y con razón.
--
-- Pero él ya lo está diciendo cada vez que registra una compra. Comprarle diez
-- rodamientos SKF a Bearing Company ES la afirmación «Bearing Company vende
-- este producto, y de la marca SKF, y la última vez me lo dejó a tanto». Esto
-- lo apunta solo, con un disparador, para que ninguna pantalla tenga que
-- acordarse de hacerlo y para que valga también para las compras que se creen
-- por cualquier otro camino.
--
-- Queda además la puerta manual, para lo que todavía NO se le ha comprado:
-- «este me pasó precio de la lista de FAG». Eso no lo puede saber la base.
--
-- ---------------------------------------------------------------------------
-- Lo que esto desbloquea
-- ---------------------------------------------------------------------------
-- El comparador de proveedores (PENDIENTES §G, paso 5), que es lo siguiente
-- del plan de compras y hoy no tiene a quién preguntar. Con esta tabla, la
-- bandeja «Por comprar» puede decir «para el 6205 tienes tres proveedores; el
-- más barato la última vez fue este».
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- La tabla
-- ---------------------------------------------------------------------------
create table if not exists proveedor_productos (
  proveedor_id   uuid not null references proveedores(id) on delete cascade,
  producto_id    uuid not null references productos(id)   on delete cascade,

  -- Cuántas compras lo incluyeron. Es lo que separa «se lo compro siempre» de
  -- «se lo compré una vez y no volví», que ante dos precios parecidos decide.
  comprado_veces smallint not null default 0,
  ultima_compra  date,

  -- El último costo, en la moneda de SU factura y en dólares.
  --
  -- Los dos, no uno: en dólares para poder comparar entre proveedores, y en su
  -- moneda porque es la cifra que Willy reconoce cuando llama a preguntar. Un
  -- «4.05» no le dice nada de un proveedor que le factura S/ 15.20.
  --
  -- La historia completa vive en `v_precios_compra` (042). Esto es solo lo
  -- último, para no tener que ir a buscarlo.
  ultimo_costo       numeric(14,4),
  ultimo_costo_usd   numeric(14,4),
  moneda             char(3),

  -- Alguien lo puso a mano. Puede ser true a la vez que `comprado_veces > 0`:
  -- se declara primero y se compra después, y las dos cosas son verdad.
  declarado      boolean not null default false,
  notas          text,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  primary key (proveedor_id, producto_id),
  constraint prov_prod_veces_pos check (comprado_veces >= 0)
);

-- Para «¿quién vende esto?», que se pregunta desde la ficha del producto y
-- desde la bandeja. Sin él, esa consulta recorre la tabla entera.
create index if not exists ix_prov_prod_producto on proveedor_productos (producto_id);

comment on table proveedor_productos is
  'Qué vende cada proveedor. Se llena solo con cada compra (disparador) y a mano para lo que todavía no se le ha comprado. Es de donde va a salir el comparador de proveedores.';

-- ---------------------------------------------------------------------------
-- Anotar
-- ---------------------------------------------------------------------------
-- Un solo sitio donde se escribe, lo llame el disparador o lo llame la
-- pantalla. Si hubiera dos, un día uno se olvidaría de rellenar las marcas.
create or replace function public.anotar_productos_de_proveedor(
  p_proveedor  uuid,
  p_items      jsonb,                    -- [{producto_id, costo_unitario?}]
  p_fecha      date    default null,
  p_moneda     char(3) default 'USD',
  p_tipo_cambio numeric default null,
  -- true  → viene de una compra: suma una vez y pisa el costo
  -- false → lo declara una persona: no suma, y solo pone costo si no había
  p_comprado   boolean default true,
  p_notas      text    default null
)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int := 0;
begin
  -- `security definer`, así que se salta RLS: la comprobación de rol va aquí.
  --
  -- Vale con poder registrar compras O con poder editar proveedores. Comprarle
  -- algo a alguien ES decir que lo vende: exigir además permiso sobre el
  -- maestro de proveedores haría fallar la compra de quien solo compra.
  if not (public.puede_escribir('compras') or public.puede_escribir('proveedores')) then
    raise exception 'Tu rol no puede anotar qué vende un proveedor'
      using errcode = 'insufficient_privilege';
  end if;

  if p_proveedor is null or p_items is null or jsonb_array_length(p_items) = 0 then
    return 0;
  end if;

  with entrada as (
    select distinct on ((i.valor ->> 'producto_id')::uuid)
           (i.valor ->> 'producto_id')::uuid            as producto_id,
           nullif(i.valor ->> 'costo_unitario','')::numeric as costo
      from jsonb_array_elements(p_items) as i(valor)
     where nullif(i.valor ->> 'producto_id','') is not null
     -- La misma compra puede traer el mismo producto en dos líneas; ON
     -- CONFLICT no puede tocar la misma fila dos veces en una sentencia.
     order by (i.valor ->> 'producto_id')::uuid, costo nulls last
  )
  insert into proveedor_productos as pp (
    proveedor_id, producto_id, comprado_veces, ultima_compra,
    ultimo_costo, ultimo_costo_usd, moneda, declarado, notas
  )
  select p_proveedor,
         e.producto_id,
         case when p_comprado then 1 else 0 end,
         case when p_comprado then coalesce(p_fecha, current_date) end,
         e.costo,
         case when e.costo is null then null
              else public.a_dolares(e.costo, p_moneda, p_tipo_cambio) end,
         case when e.costo is null then null else p_moneda end,
         not p_comprado,
         p_notas
    from entrada e
    -- Un producto que no existe no se anota. Puede llegar por la puerta
    -- manual, y la clave foránea abortaría el lote entero.
   where exists (select 1 from productos pr where pr.id = e.producto_id)
  on conflict (proveedor_id, producto_id) do update set
    comprado_veces = pp.comprado_veces + case when p_comprado then 1 else 0 end,
    ultima_compra  = case when p_comprado then coalesce(p_fecha, current_date)
                          else pp.ultima_compra end,
    -- Una compra manda sobre lo declarado: es un hecho contra una intención.
    -- Una declaración NO pisa un costo que ya existe.
    ultimo_costo   = case when p_comprado then coalesce(excluded.ultimo_costo, pp.ultimo_costo)
                          else coalesce(pp.ultimo_costo, excluded.ultimo_costo) end,
    ultimo_costo_usd = case when p_comprado then coalesce(excluded.ultimo_costo_usd, pp.ultimo_costo_usd)
                            else coalesce(pp.ultimo_costo_usd, excluded.ultimo_costo_usd) end,
    moneda         = case when p_comprado then coalesce(excluded.moneda, pp.moneda)
                          else coalesce(pp.moneda, excluded.moneda) end,
    declarado      = pp.declarado or excluded.declarado,
    notas          = coalesce(excluded.notas, pp.notas),
    actualizado_en = now();

  get diagnostics v_n = row_count;

  -- Y la marca, sola. Es el punto de todo esto: el filtro «vende la marca» del
  -- listado de proveedores lleva desde la 002 sin nada que filtrar, y nadie va
  -- a sentarse a rellenarlo para 97 proveedores.
  insert into proveedor_marcas (proveedor_id, marca_id)
  select distinct p_proveedor, pr.marca_id
    from jsonb_array_elements(p_items) as i(valor)
    join productos pr on pr.id = (i.valor ->> 'producto_id')::uuid
  on conflict do nothing;

  return v_n;
end $$;

comment on function public.anotar_productos_de_proveedor(uuid, jsonb, date, char, numeric, boolean, text) is
  'Apunta que un proveedor vende estos productos, y de paso sus marcas. La llama el disparador de cada compra y la pantalla de la ficha.';

revoke execute on function public.anotar_productos_de_proveedor(uuid, jsonb, date, char, numeric, boolean, text) from public, anon;
grant execute on function public.anotar_productos_de_proveedor(uuid, jsonb, date, char, numeric, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Olvidar
-- ---------------------------------------------------------------------------
create or replace function public.olvidar_producto_de_proveedor(
  p_proveedor uuid,
  p_producto  uuid
)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_veces smallint;
begin
  if not (public.puede_escribir('compras') or public.puede_escribir('proveedores')) then
    raise exception 'Tu rol no puede editar qué vende un proveedor'
      using errcode = 'insufficient_privilege';
  end if;

  select comprado_veces into v_veces
    from proveedor_productos
   where proveedor_id = p_proveedor and producto_id = p_producto;

  if v_veces is null then return false; end if;

  -- Lo que se le compró de verdad NO se borra. No es una preferencia: es un
  -- hecho con una compra detrás, y quitarlo de aquí dejaría la ficha diciendo
  -- que no lo vende mientras el kardex dice que lo trajo él.
  if v_veces > 0 then
    raise exception 'A este proveedor ya se le compró este producto % vez(ces); eso es historia y no se quita de la ficha', v_veces
      using errcode = 'restrict_violation';
  end if;

  delete from proveedor_productos
   where proveedor_id = p_proveedor and producto_id = p_producto;
  return true;
end $$;

comment on function public.olvidar_producto_de_proveedor(uuid, uuid) is
  'Quita de la ficha un producto DECLARADO a mano. Se niega si hubo compras: eso es historia.';

revoke execute on function public.olvidar_producto_de_proveedor(uuid, uuid) from public, anon;
grant execute on function public.olvidar_producto_de_proveedor(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- El disparador: la compra enseña
-- ---------------------------------------------------------------------------
-- POR SENTENCIA y no por fila. `crear_compra` mete todas las líneas en un solo
-- INSERT; con un disparador por fila serían N llamadas y N upserts para lo que
-- es una sola afirmación sobre un proveedor.
create or replace function public.tg_aprender_de_compra()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_compra uuid;
  c        record;
begin
  -- Una sentencia puede traer líneas de más de una compra (una carga masiva),
  -- así que se agrupa por compra en vez de suponer que solo hay una.
  for v_compra in select distinct compra_id from nuevas loop
    select co.proveedor_id, co.fecha, co.moneda, co.tipo_cambio into c
      from compras co where co.id = v_compra;
    if c.proveedor_id is null then continue; end if;

    perform public.anotar_productos_de_proveedor(
      c.proveedor_id,
      (select jsonb_agg(jsonb_build_object(
                'producto_id', n.producto_id,
                'costo_unitario', n.costo_unitario))
         from nuevas n where n.compra_id = v_compra and n.producto_id is not null),
      c.fecha, c.moneda, c.tipo_cambio, true, null);
  end loop;

  return null;
end $$;

drop trigger if exists tg_compra_items_aprender on compra_items;
create trigger tg_compra_items_aprender
  after insert on compra_items
  referencing new table as nuevas
  for each statement execute function public.tg_aprender_de_compra();

-- ---------------------------------------------------------------------------
-- Y la recepción corrige el costo
-- ---------------------------------------------------------------------------
-- Lo que se pactó al comprar y lo que acaba diciendo la factura no siempre
-- coinciden. Para comparar proveedores manda lo segundo, que es lo que se
-- pagó. No suma una compra más: es la misma.
create or replace function public.tg_corregir_costo_de_proveedor()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_rec record;
  r     record;
begin
  for r in select distinct recepcion_id from nuevas loop
    select re.proveedor_id, re.moneda, re.tipo_cambio, re.fecha
      into v_rec
      from recepciones re where re.id = r.recepcion_id and not re.anulada;
    if v_rec.proveedor_id is null then continue; end if;

    update proveedor_productos pp
       set ultimo_costo     = n.costo_unitario,
           ultimo_costo_usd = public.a_dolares(n.costo_unitario, v_rec.moneda, v_rec.tipo_cambio),
           moneda           = v_rec.moneda,
           actualizado_en   = now()
      from (select producto_id, max(costo_unitario) as costo_unitario
              from nuevas
             where recepcion_id = r.recepcion_id and producto_id is not null
             group by producto_id) n
     where pp.proveedor_id = v_rec.proveedor_id
       and pp.producto_id  = n.producto_id;
  end loop;

  return null;
end $$;

drop trigger if exists tg_recepcion_items_costo on recepcion_items;
create trigger tg_recepcion_items_costo
  after insert on recepcion_items
  referencing new table as nuevas
  for each statement execute function public.tg_corregir_costo_de_proveedor();

-- ---------------------------------------------------------------------------
-- Quién vende cada producto
-- ---------------------------------------------------------------------------
create or replace view v_proveedores_de_producto
with (security_invoker = true) as
select
  pp.producto_id,
  pp.proveedor_id,
  pv.razon_social      as proveedor,
  pv.codigo            as proveedor_codigo,
  pv.activo            as proveedor_activo,
  pv.lead_time_dias,
  pv.dias_pago,
  pp.comprado_veces,
  pp.ultima_compra,
  pp.ultimo_costo,
  pp.ultimo_costo_usd,
  pp.moneda,
  pp.declarado,
  pp.notas,
  -- El que está puesto como habitual en la ficha del producto (025). Se marca
  -- para poder enseñarlo primero sin que la pantalla tenga que ir a buscarlo.
  (pr.proveedor_id = pp.proveedor_id) as es_habitual
from proveedor_productos pp
join proveedores pv on pv.id = pp.proveedor_id
join productos   pr on pr.id = pp.producto_id;

comment on view v_proveedores_de_producto is
  'A quién se le puede pedir cada producto, con lo que cobró la última vez. Alimenta la ficha del producto y el comparador de proveedores.';

-- ---------------------------------------------------------------------------
-- Rellenar con lo que ya está comprado
-- ---------------------------------------------------------------------------
-- Hoy no hay ninguna compra, así que esto no mueve nada. Va igual porque la
-- migración tiene que dejar la tabla coherente con la base SE APLIQUE CUANDO
-- SE APLIQUE, y una que solo funciona sobre una base vacía es una trampa.
do $$
declare
  v_n int;
begin
  insert into proveedor_productos (
    proveedor_id, producto_id, comprado_veces, ultima_compra,
    ultimo_costo, ultimo_costo_usd, moneda
  )
  select co.proveedor_id,
         ci.producto_id,
         count(*)::smallint,
         max(co.fecha),
         -- El costo de la compra MÁS RECIENTE, no el mayor ni el promedio.
         (array_agg(ci.costo_unitario order by co.fecha desc, co.numero desc))[1],
         public.a_dolares(
           (array_agg(ci.costo_unitario order by co.fecha desc, co.numero desc))[1],
           (array_agg(co.moneda        order by co.fecha desc, co.numero desc))[1],
           (array_agg(co.tipo_cambio   order by co.fecha desc, co.numero desc))[1]),
         (array_agg(co.moneda order by co.fecha desc, co.numero desc))[1]
    from compra_items ci
    join compras co on co.id = ci.compra_id
   where co.estado <> 'anulada' and ci.producto_id is not null
   group by co.proveedor_id, ci.producto_id
  on conflict (proveedor_id, producto_id) do nothing;

  get diagnostics v_n = row_count;

  insert into proveedor_marcas (proveedor_id, marca_id)
  select distinct pp.proveedor_id, pr.marca_id
    from proveedor_productos pp join productos pr on pr.id = pp.producto_id
  on conflict do nothing;

  raise notice 'Rellenadas % líneas de proveedor_productos desde las compras existentes.', v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien uuid;
  v_prov  uuid;
  v_prod  uuid;
  v_marca uuid;
  v_r     jsonb;
  v_fila  record;
  v_n     int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select p.id, p.marca_id into v_prod, v_marca from productos p limit 1;
  if v_quien is null or v_prod is null then
    raise notice 'Sin perfil de gerencia o sin productos: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  insert into proveedores (codigo, razon_social, tipo_documento, numero_documento)
  values ('ZZTESTPROV046', 'ZZTEST PROVEEDOR 046', 'RUC', '20100070970')
  on conflict do nothing;
  select id into v_prov from proveedores where codigo = 'ZZTESTPROV046';
  delete from proveedor_marcas where proveedor_id = v_prov;

  -- 1 · Una compra en soles enseña sola, y el costo queda en las dos monedas.
  v_r := public.crear_compra(jsonb_build_object(
    'proveedor_id', v_prov, 'moneda', 'PEN', 'tipo_cambio', 3.7500,
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'cantidad', 4, 'costo_unitario', 15.00))));

  select * into v_fila from proveedor_productos
   where proveedor_id = v_prov and producto_id = v_prod;

  if v_fila is null then
    raise exception 'La compra no dejó anotado que el proveedor vende el producto';
  end if;
  if v_fila.comprado_veces <> 1 then
    raise exception 'comprado_veces quedó en % y esperaba 1', v_fila.comprado_veces;
  end if;
  if v_fila.ultimo_costo is distinct from 15.0000 then
    raise exception 'El costo no se guardó en la moneda de la factura: %', v_fila.ultimo_costo;
  end if;
  if v_fila.ultimo_costo_usd is distinct from 4.0000 then
    raise exception 'El costo en dólares salió % y esperaba 4.0000', v_fila.ultimo_costo_usd;
  end if;

  -- 2 · Y la marca se rellenó sola, que es la mitad del punto.
  if v_marca is not null then
    select count(*) into v_n from proveedor_marcas
     where proveedor_id = v_prov and marca_id = v_marca;
    if v_n <> 1 then
      raise exception 'La marca del producto no llegó a proveedor_marcas';
    end if;
  end if;

  -- 3 · Una segunda compra suma, no duplica.
  perform public.crear_compra(jsonb_build_object(
    'proveedor_id', v_prov,
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'cantidad', 1, 'costo_unitario', 4.50))));

  select * into v_fila from proveedor_productos
   where proveedor_id = v_prov and producto_id = v_prod;
  if v_fila.comprado_veces <> 2 then
    raise exception 'La segunda compra no sumó: quedó en %', v_fila.comprado_veces;
  end if;
  if v_fila.ultimo_costo is distinct from 4.5000 or v_fila.moneda <> 'USD' then
    raise exception 'La segunda compra no pisó el costo: % %', v_fila.ultimo_costo, v_fila.moneda;
  end if;

  -- 4 · Lo comprado NO se puede quitar de la ficha.
  begin
    perform public.olvidar_producto_de_proveedor(v_prov, v_prod);
    raise exception 'Dejó borrar un producto que sí se le compró';
  exception when restrict_violation then null;
  end;

  -- 5 · Lo declarado a mano sí, y no inventa un número de compras.
  perform public.anotar_productos_de_proveedor(
    v_prov,
    jsonb_build_array(jsonb_build_object('producto_id',
      (select id from productos where id <> v_prod limit 1))),
    null, 'USD', null, false, 'Me pasó su lista');

  select comprado_veces, declarado into v_fila
    from proveedor_productos
   where proveedor_id = v_prov and producto_id <> v_prod;
  if v_fila.comprado_veces <> 0 or not v_fila.declarado then
    raise exception 'Lo declarado a mano quedó mal: veces=% declarado=%',
      v_fila.comprado_veces, v_fila.declarado;
  end if;

  if not public.olvidar_producto_de_proveedor(
       v_prov, (select producto_id from proveedor_productos
                 where proveedor_id = v_prov and producto_id <> v_prod limit 1)) then
    raise exception 'No dejó quitar un producto declarado a mano';
  end if;

  -- Limpieza.
  delete from compras where proveedor_id = v_prov;
  delete from proveedor_productos where proveedor_id = v_prov;
  delete from proveedor_marcas where proveedor_id = v_prov;
  delete from proveedores where id = v_prov;
  perform set_config('request.jwt.claims', '', true);


  -- Y se borra el rastro que esta prueba dejó en la bitácora (051). Estas
  -- migraciones se reaplican, y una bitácora que acumula documentos de
  -- prueba deja de servir para lo que se hizo.
  delete from actividad
   where entidad in ('compras')
     and creado_en > now() - interval '2 minutes';

  raise notice 'La compra enseña qué vende el proveedor, y la marca se rellena sola.';
end $$;

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
-- La tabla nace DESPUÉS de la 006, así que su bucle no la tocó. Se quedó con
-- RLS activo y CERO políticas, que en Postgres significa que nadie lee nada:
-- la ficha del proveedor habría salido siempre vacía sin ningún error a la
-- vista, porque PostgREST devuelve una lista vacía, no un 403.
--
-- Se repiten aquí las cuatro políticas de la 006 tal cual, en vez de inventar
-- otras: una tabla con reglas propias es una tabla que un día se comporta
-- distinta de las demás sin que nadie sepa por qué.
alter table proveedor_productos enable row level security;

drop policy if exists "lectura_autenticados" on proveedor_productos;
create policy "lectura_autenticados" on proveedor_productos
  for select to authenticated
  using ((select public.mi_rol()) is not null);

drop policy if exists "escritura_insert" on proveedor_productos;
create policy "escritura_insert" on proveedor_productos
  for insert to authenticated
  with check ((select public.puede_escribir('proveedor_productos')));

drop policy if exists "escritura_update" on proveedor_productos;
create policy "escritura_update" on proveedor_productos
  for update to authenticated
  using ((select public.puede_escribir('proveedor_productos')))
  with check ((select public.puede_escribir('proveedor_productos')));

drop policy if exists "escritura_delete" on proveedor_productos;
create policy "escritura_delete" on proveedor_productos
  for delete to authenticated
  using ((select public.puede_escribir('proveedor_productos')));

-- Los mismos roles que ya pueden tocar `proveedores` y `proveedor_marcas`.
insert into permisos_rol (tabla, rol, escribir, nota) values
  ('proveedor_productos', 'gerencia', true, 'acceso total'),
  ('proveedor_productos', 'admin',    true, 'acceso total'),
  ('proveedor_productos', 'compras',  true, 'abastecimiento')
on conflict (tabla, rol) do update set escribir = excluded.escribir;

-- `permisos_rol` está vigilada por la bitácora (051), así que este INSERT
-- deja filas diciendo que «el sistema» tocó los permisos, y una más por cada
-- reaplicación. Se borran: la bitácora sirve para saber quién CAMBIÓ los
-- permisos, no para contar que se instalaron.
delete from actividad
 where entidad = 'permisos_rol'
   and creado_en > now() - interval '1 minute';

do $$
declare v_n int;
begin
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'proveedor_productos';
  if v_n <> 4 then
    raise exception 'proveedor_productos se quedó con % políticas y necesita 4', v_n;
  end if;
  raise notice 'proveedor_productos con RLS y sus cuatro políticas.';
end $$;
