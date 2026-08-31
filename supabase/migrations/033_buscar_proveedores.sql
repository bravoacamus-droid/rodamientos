-- ###########################################################################
-- 033 · BUSCAR PROVEEDORES DESDE LA COMPRA Y LA RECEPCIÓN
-- ###########################################################################
--
-- La otra mitad de la 030. Aquella cambió el selector de CLIENTE por una caja
-- que busca; los dos de PROVEEDOR se quedaron como estaban, y quedó anotado en
-- PENDIENTES §6 que con el Excel de proveedores de Willy iban a doler.
--
-- Duelen ya, y peor de lo que decía el aviso:
--
--   · `proveedoresActivos()` de compras trae la lista con `.limit(500)`.
--   · `proveedoresParaSelector()` de recepciones NO TIENE LÍMITE, así que se
--     come el tope por defecto de PostgREST sin decirlo.
--
-- Los dos truncan EN SILENCIO. Un desplegable que se corta no avisa: el
-- proveedor 501 simplemente no existe, y quien lo busca concluye que no está
-- dado de alta y lo crea otra vez. Entonces salta `ux_proveedores_documento`
-- --si tecleó el RUC-- o no salta nada y hay dos fichas del mismo proveedor
-- con códigos distintos, que es lo que de verdad cuesta arreglar después.
--
-- ---------------------------------------------------------------------------
-- 1 · Lo que `proveedores` no tenía y `clientes` sí
-- ---------------------------------------------------------------------------
-- La 002 le dio a `clientes` tres columnas de búsqueda (`busqueda`,
-- `busq_documento`, `busq_razon_social`) y a `proveedores` solo la primera.
-- Con una sola no se puede puntuar: `busqueda` mezcla código, documento y
-- razón social en un mismo texto, así que «20100» encuentra al proveedor cuyo
-- RUC empieza así Y al que lleva ese número en el código, sin poder
-- distinguirlos. Aquí van las dos que faltaban, con sus índices.
--
-- ---------------------------------------------------------------------------
-- 2 · Un proveedor se busca por MARCA, y eso es propio del negocio
-- ---------------------------------------------------------------------------
-- Es la diferencia real con el selector de cliente, y por eso esto no es la
-- 030 con otro nombre. A un cliente se le busca por nombre o por RUC. A un
-- proveedor se le busca muchas veces por lo que vende: «¿quién me trae SKF?».
--
-- `proveedor_marcas` ya guarda esa relación desde la 002 y no la usaba nadie.
-- Ahora teclear una marca devuelve a quien la provee — por debajo de los que
-- se LLAMAN así, que es el orden correcto: «SKF DEL PERÚ SAC» va antes que el
-- distribuidor que además vende SKF.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Columnas e índices de búsqueda
-- ---------------------------------------------------------------------------
alter table proveedores
  add column if not exists busq_documento text
    generated always as (coalesce(numero_documento, '')) stored;

alter table proveedores
  add column if not exists busq_razon_social text
    generated always as (public.normalizar_texto(razon_social)) stored;

create index if not exists ix_proveedores_razon_trgm
  on proveedores using gin (busq_razon_social extensions.gin_trgm_ops);

-- `text_pattern_ops` es lo que hace que `like '2010%'` use el índice: el
-- operador por defecto depende de la intercalación y no sirve para prefijos.
create index if not exists ix_proveedores_documento_prefijo
  on proveedores (busq_documento text_pattern_ops)
  where numero_documento is not null;

-- ---------------------------------------------------------------------------
-- 1 · buscar_proveedores
-- ---------------------------------------------------------------------------
-- `stable` y solo lectura, así que el centinela de la 013 no le pide guardián
-- de rol: quién ve qué lo decide RLS sobre `proveedores`, como en cualquier
-- otra lectura de la tabla.
--
-- El puntaje, de más específico a menos:
--
--   5 · el RUC COMPLETO. Quien pega once dígitos ya sabe a quién quiere.
--   4 · el documento por delante, o el código del maestro.
--   3 · la razón social EMPIEZA por lo tecleado.
--   2 · la razón social lo contiene en algún sitio.
--   1 · vende esa marca. Cierto, pero menos específico que llamarse así.
--   0 · solo se parece (trigrama). La red que salva los dedos gordos.
--
-- `compras` y `ultima_compra` viajan en el resultado por el mismo motivo que
-- las cotizaciones en la 030: son lo que distingue a dos proveedores de nombre
-- parecido. `dias_pago` y `lead_time_dias` porque la pantalla los enseña al
-- elegir y no merecen un segundo viaje.
create or replace function public.buscar_proveedores(
  p_q     text,
  p_limit int default 20
) returns table (
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
  with q as (
    select public.normalizar_texto(coalesce(p_q, ''))      as texto,
           -- Solo los dígitos: un RUC pegado de la web de SUNAT viene con
           -- espacios o guiones, y `busq_documento` guarda el número pelado.
           regexp_replace(coalesce(p_q, ''), '\D', '', 'g') as digitos,
           public.normalizar_codigo(coalesce(p_q, ''))      as codigo
  ),
  -- Quién vende lo tecleado. Se resuelve aparte y una sola vez: meterlo en el
  -- `case` como subconsulta correlacionada lo ejecutaría por fila candidata.
  por_marca as (
    select distinct pm.proveedor_id
      from proveedor_marcas pm
      join marcas m on m.id = pm.marca_id
     cross join q
     where q.texto <> ''
       and m.activo
       and public.normalizar_texto(m.nombre) like '%' || q.texto || '%'
  ),
  -- El corte va ANTES de contar compras y juntar marcas: si no, una búsqueda
  -- de dos letras agregaría el historial de medio maestro para pintar veinte
  -- filas.
  elegidos as (
    select p.id,
           case
             when q.digitos <> '' and p.busq_documento = q.digitos            then 5
             when q.digitos <> '' and p.busq_documento like q.digitos || '%'  then 4
             when q.codigo <> ''
                  and public.normalizar_codigo(p.codigo) = q.codigo           then 4
             when q.texto <> '' and p.busq_razon_social like q.texto || '%'   then 3
             when q.texto <> ''
                  and p.busq_razon_social like '%' || q.texto || '%'          then 2
             when p.id in (select proveedor_id from por_marca)                then 1
             else 0
           end                                             as puntaje,
           similarity(p.busq_razon_social, q.texto)        as parecido,
           p.activo, p.razon_social
      from proveedores p
     cross join q
     where q.texto = ''
        or p.busqueda like '%' || q.texto || '%'
        or (q.digitos <> '' and p.busq_documento like q.digitos || '%')
        or p.id in (select proveedor_id from por_marca)
        or p.busq_razon_social % q.texto
     order by
       -- Un dado de baja nunca se pone por delante de uno con el que sí se
       -- puede trabajar, por bien que coincida.
       p.activo desc,
       puntaje desc,
       parecido desc,
       p.razon_social
     limit greatest(p_limit, 1)
  ),
  historial as (
    select c.proveedor_id,
           count(*)::int as veces,
           max(c.fecha)  as ultima
      from compras c
     where c.proveedor_id in (select id from elegidos)
       and c.estado <> 'anulada'
     group by c.proveedor_id
  ),
  sus_marcas as (
    select pm.proveedor_id,
           array_agg(m.nombre order by m.orden, m.nombre) as nombres
      from proveedor_marcas pm
      join marcas m on m.id = pm.marca_id
     where pm.proveedor_id in (select id from elegidos)
     group by pm.proveedor_id
  )
  select p.id, p.codigo, p.tipo_documento, p.numero_documento, p.razon_social,
         p.tipo, p.pais, p.direccion, p.contacto, p.telefono, p.whatsapp,
         p.email, p.dias_pago, p.lead_time_dias, p.activo,
         coalesce(sm.nombres, array[]::text[]),
         coalesce(h.veces, 0), h.ultima, e.puntaje
    from elegidos e
    join proveedores p      on p.id = e.id
    left join historial h   on h.proveedor_id = e.id
    left join sus_marcas sm on sm.proveedor_id = e.id
   order by e.activo desc, e.puntaje desc, e.parecido desc, e.razon_social;
$$;

comment on function public.buscar_proveedores(text, int) is
  'Caja de búsqueda del selector de proveedor de compras y recepciones. Busca por RUC, código, razón social y MARCA a la vez, y ordena: documento completo > prefijo o código > razón social que empieza > contiene > vende esa marca > se parece. Los dados de baja salen marcados y al final, para que buscar uno inactivo no termine en una ficha duplicada.';

-- ---------------------------------------------------------------------------
-- 2 · proveedores_sugeridos — qué enseñar con la caja vacía
-- ---------------------------------------------------------------------------
-- Los últimos a los que se compró. Sin compras todavía cae al alfabético, así
-- que la lista no sale vacía nunca — que es justo el estado de hoy.
create or replace function public.proveedores_sugeridos(
  p_limit int default 8
) returns table (
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
   where p.activo
   order by h.ultima desc nulls last, p.razon_social
   limit greatest(p_limit, 1);
$$;

comment on function public.proveedores_sugeridos(int) is
  'Los últimos proveedores a los que se compró, para que el selector enseñe algo útil antes de teclear. Cae al orden alfabético cuando todavía no hay compras.';

-- ---------------------------------------------------------------------------
-- 3 · Permisos
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.buscar_proveedores(text, int)',
    'public.proveedores_sugeridos(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- LLAMA a las funciones, no comprueba que existan. Es la regla que dejó la
-- 031: `consultas_reservar_cuota` existía desde la 003 y estaba rota, porque
-- plpgsql no valida el cuerpo al crearlo. Estas dos son `language sql` y sí se
-- validan al crearse, pero el ORDEN --que es lo que se está construyendo
-- aquí-- no lo comprueba nadie salvo ejecutándolas.
do $$
declare
  v_norte   uuid;
  v_sur     uuid;
  v_marca   uuid;
  v_primero uuid;
  v_n       int;
  v_marcas  text[];
begin
  -- Con la caja vacía no revienta y no devuelve el maestro entero.
  select count(*) into v_n from public.buscar_proveedores('', 5);
  if v_n > 5 then raise exception 'buscar_proveedores no respeta el límite'; end if;

  select count(*) into v_n from public.proveedores_sugeridos(5);
  if v_n > 5 then raise exception 'proveedores_sugeridos no respeta el límite'; end if;

  -- Basura entre los dígitos: llega de lo que teclee cualquiera.
  select count(*) into v_n from public.buscar_proveedores('%_'' or 1=1 --', 5);

  insert into proveedores (codigo, tipo_documento, numero_documento, razon_social)
  values ('ZZTEST033A', 'RUC', '20999999881', 'ZZTEST IMPORTACIONES DEL NORTE SAC')
  returning id into v_norte;

  insert into proveedores (codigo, tipo_documento, numero_documento, razon_social)
  values ('ZZTEST033B', 'RUC', '20999999882', 'ZZTEST IMPORTACIONES DEL SUR SAC')
  returning id into v_sur;

  -- El documento COMPLETO le gana a la razón social que empieza igual.
  select b.id into v_primero from public.buscar_proveedores('20999999882', 10) b limit 1;
  if v_primero is distinct from v_sur then
    raise exception 'buscar_proveedores no pone primero el documento exacto';
  end if;

  -- Con guiones y espacios, como se pega desde la web de SUNAT.
  select b.id into v_primero from public.buscar_proveedores('20-999999 882', 10) b limit 1;
  if v_primero is distinct from v_sur then
    raise exception 'buscar_proveedores no aguanta un documento con separadores';
  end if;

  -- Por código del maestro.
  select b.id into v_primero from public.buscar_proveedores('ZZTEST033A', 10) b limit 1;
  if v_primero is distinct from v_norte then
    raise exception 'buscar_proveedores no encuentra por código';
  end if;

  -- Por MARCA, que es lo propio de esta función. El del norte vende ZZTESTMARCA
  -- y ninguno de los dos se llama así, así que solo puede salir por la marca.
  insert into marcas (nombre) values ('ZZTESTMARCA') returning id into v_marca;
  insert into proveedor_marcas (proveedor_id, marca_id) values (v_norte, v_marca);

  select b.id, b.marcas into v_primero, v_marcas
    from public.buscar_proveedores('ZZTESTMARCA', 10) b limit 1;
  if v_primero is distinct from v_norte then
    raise exception 'buscar_proveedores no encuentra por marca';
  end if;
  if not ('ZZTESTMARCA' = any(v_marcas)) then
    raise exception 'buscar_proveedores no devuelve las marcas del proveedor';
  end if;

  -- Y quien se LLAMA como la marca va por delante de quien solo la vende.
  update proveedores set razon_social = 'ZZTESTMARCA PERU SAC' where id = v_sur;
  select b.id into v_primero from public.buscar_proveedores('ZZTESTMARCA', 10) b limit 1;
  if v_primero is distinct from v_sur then
    raise exception 'buscar_proveedores pone la marca por delante del nombre';
  end if;
  update proveedores set razon_social = 'ZZTEST IMPORTACIONES DEL SUR SAC' where id = v_sur;

  -- Un dado de baja no le gana a uno activo que coincide igual de bien...
  update proveedores set activo = false where id = v_norte;
  select b.id into v_primero from public.buscar_proveedores('ZZTEST IMPORTACIONES', 10) b limit 1;
  if v_primero = v_norte then
    raise exception 'buscar_proveedores pone un inactivo por delante de uno activo';
  end if;

  -- ...pero SÍ aparece, que es la mitad del asunto: si no, se da de alta otra vez.
  if not exists (
    select 1 from public.buscar_proveedores('ZZTEST IMPORTACIONES', 10) b where b.id = v_norte
  ) then
    raise exception 'buscar_proveedores esconde los inactivos';
  end if;

  -- Y los sugeridos no los ofrecen nunca.
  if exists (select 1 from public.proveedores_sugeridos(100) s where s.id = v_norte) then
    raise exception 'proveedores_sugeridos ofrece un proveedor dado de baja';
  end if;

  delete from proveedor_marcas where marca_id = v_marca;
  delete from marcas where id = v_marca;
  delete from proveedores where id in (v_norte, v_sur);

  raise notice 'Proveedores: búsqueda ordenada por documento, código, razón social y marca.';
end $$;
