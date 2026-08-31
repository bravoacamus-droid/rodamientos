-- ###########################################################################
-- 030 · BUSCAR CLIENTES DESDE LA COTIZACIÓN
-- ###########################################################################
--
-- El selector de cliente del constructor era un `<select>` con TODOS los
-- clientes activos dentro. Con los dos que hay hoy funciona; con la cartera
-- que Willy va a subir, no: el desplegable nativo no busca, solo salta a la
-- primera letra que teclees, y encima la lista entera viaja en el HTML de la
-- página.
--
-- Es exactamente el mismo problema que ya se resolvió para el catálogo en la
-- 011 y la 014, así que aquí va la misma solución: una función que busca y
-- ORDENA en Postgres, contra los índices que la tabla ya tiene desde la 002.
--
-- ---------------------------------------------------------------------------
-- Por qué hace falta ordenar, y no solo filtrar
-- ---------------------------------------------------------------------------
-- PostgREST sabe filtrar (`busqueda like '%…%'`) pero no sabe puntuar. Y en
-- una cartera peruana la mitad de las razones sociales terminan en «S.A.C.»:
-- teclear tres letras y recibir cuarenta filas por orden alfabético no es
-- buscar, es volver a la lista de antes con un paso extra.
--
-- El puntaje sale de cómo se busca a un cliente de verdad:
--
--   4 · el RUC o el DNI COMPLETO. Quien pega once dígitos ya sabe a quién
--       quiere; no le sirve que se lo ordenen por parecido.
--   3 · el documento por delante («2013…»), o el código del maestro.
--   2 · la razón social que EMPIEZA por lo tecleado. «FERRE» tiene que poner
--       «FERRETERÍA…» antes que «DISTRIBUIDORA FERRETERA…».
--   1 · lo tecleado aparece en algún sitio.
--   0 · solo se parece (trigrama). Es la red que salva los dedos gordos.
--
-- ---------------------------------------------------------------------------
-- Los desactivados también salen, y a propósito
-- ---------------------------------------------------------------------------
-- La consulta de hoy filtra `activo = true`. Suena razonable hasta que alguien
-- busca el RUC de un cliente desactivado, no encuentra nada, y lo da de alta
-- otra vez: entonces salta `ux_clientes_documento` y el alta se rechaza con un
-- mensaje que llega tarde y después de haber tecleado la ficha entera.
--
-- Salen marcados y al final. La pantalla no deja elegirlos, pero DICE que
-- existen, que es la diferencia entre «no está» y «está, reactívalo».
-- Los bloqueados ya se trataban así desde el principio.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Por qué esto empieza tirando las funciones
-- ---------------------------------------------------------------------------
-- Mismo caso que la 005 con sus vistas, y descubierto igual: reaplicando la
-- cadena entera. La 035 le AÑADE una columna de salida a las dos (`contactos`,
-- cuántas personas tiene el cliente), y `create or replace function` no admite
-- cambiar el tipo de retorno --error 42P13--. Así que reaplicar la versión
-- estrecha de aquí encima de la ancha de allí es justo lo que Postgres
-- prohíbe, y la cadena moría en el archivo 30 de 36.
--
-- Tirarlas primero lo arregla: en una pasada completa se recrean aquí en su
-- versión de la 030 y la 035 las vuelve a ensanchar, que es el orden correcto.
--
-- REGLA, que es la que dejó R10 aplicada a funciones: si una migración
-- POSTERIOR puede cambiar la firma de salida de una función, esta tiene que
-- tirarla antes de crearla. Si no, deja de poderse reaplicar la cadena — y con
-- ella dejan de correr todos los centinelas que vengan después.
-- Y por lo mismo, el cuerpo de aquí ya no nombra `clientes.contacto`: la 035
-- borra esa columna —los contactos pasan a ser una tabla, porque una empresa
-- tiene al de compras y al de logística— y una función `language sql` SÍ se
-- valida al crearse. Nombrarla dejaría este archivo imposible de reaplicar.
-- Aquí devuelve null y la 035 lo rellena de verdad.
drop function if exists public.buscar_clientes(text, int);
drop function if exists public.clientes_sugeridos(int);

-- ---------------------------------------------------------------------------
-- 1 · buscar_clientes — la caja del selector
-- ---------------------------------------------------------------------------
-- `stable` y no `volatile`: solo lee. Por eso el centinela de la 013 no le
-- exige guardián de rol — de quién puede ver qué se ocupa RLS sobre `clientes`,
-- igual que en cualquier lectura de la tabla.
--
-- `cotizaciones` y `ultima_cotizacion` van en el resultado porque son el dato
-- que distingue a dos clientes con nombre parecido: el que ya se le cotizó
-- tres veces este mes es casi siempre el que se busca.
create or replace function public.buscar_clientes(
  p_q     text,
  p_limit int default 20
) returns table (
  id                uuid,
  codigo            text,
  tipo_documento    tipo_documento_identidad,
  numero_documento  text,
  razon_social      text,
  nombre_comercial  text,
  contacto          text,
  telefono          text,
  whatsapp          text,
  email             text,
  condicion_pago    condicion_pago,
  dias_credito      smallint,
  linea_credito     numeric,
  bloqueado         boolean,
  motivo_bloqueo    text,
  activo            boolean,
  cotizaciones      int,
  ultima_cotizacion date,
  puntaje           int
)
language sql stable security definer set search_path = public, extensions
as $$
  with q as (
    select public.normalizar_texto(coalesce(p_q, ''))         as texto,
           -- Solo los dígitos: quien pega un RUC de la web lo trae con
           -- espacios o con guiones, y `busq_documento` guarda el número pelado.
           regexp_replace(coalesce(p_q, ''), '\D', '', 'g')    as digitos,
           public.normalizar_codigo(coalesce(p_q, ''))         as codigo
  ),
  -- El corte se hace ANTES de contar cotizaciones: si no, una búsqueda de dos
  -- letras agregaría el historial de media cartera para enseñar veinte filas.
  elegidos as (
    select c.id,
           case
             when q.digitos <> '' and c.busq_documento = q.digitos                then 4
             when q.digitos <> '' and c.busq_documento like q.digitos || '%'      then 3
             when q.codigo is not null
                  and public.normalizar_codigo(c.codigo) = q.codigo               then 3
             when q.texto <> '' and c.busq_razon_social like q.texto || '%'       then 2
             when q.texto <> '' and c.busqueda like '%' || q.texto || '%'         then 1
             else 0
           end                                                as puntaje,
           similarity(c.busq_razon_social, q.texto)           as parecido,
           c.activo, c.bloqueado, c.razon_social
      from clientes c
     cross join q
     where q.texto = ''
        or c.busqueda like '%' || q.texto || '%'
        or (q.digitos <> '' and c.busq_documento like q.digitos || '%')
        or c.busq_razon_social % q.texto
     order by
       -- Un desactivado nunca se pone por delante de uno con el que sí se
       -- puede trabajar, por bien que coincida.
       c.activo desc,
       c.bloqueado asc,
       puntaje desc,
       parecido desc,
       c.razon_social
     limit greatest(p_limit, 1)
  ),
  historial as (
    select ct.cliente_id,
           count(*)::int  as veces,
           max(ct.fecha)  as ultima
      from cotizaciones ct
     where ct.cliente_id in (select id from elegidos)
     group by ct.cliente_id
  )
  select c.id, c.codigo, c.tipo_documento, c.numero_documento,
         c.razon_social, c.nombre_comercial,
         -- El contacto lo rellena la 035, que es donde deja de ser una columna
         -- de `clientes` para pasar a ser su propia tabla. Aquí va null y no
         -- `c.contacto` por una razón concreta: una función `language sql` SÍ
         -- se valida al crearse, así que nombrar una columna que la 035 borra
         -- impide volver a aplicar este archivo. Ver la cabecera.
         null::text, c.telefono,
         c.whatsapp, c.email, c.condicion_pago, c.dias_credito,
         c.linea_credito, c.bloqueado, c.motivo_bloqueo, c.activo,
         coalesce(h.veces, 0), h.ultima, e.puntaje
    from elegidos e
    join clientes c        on c.id = e.id
    left join historial h  on h.cliente_id = e.id
   order by e.activo desc, e.bloqueado asc, e.puntaje desc,
            e.parecido desc, e.razon_social;
$$;

comment on function public.buscar_clientes(text, int) is
  'Caja de búsqueda del selector de cliente. Busca por RUC/DNI, código y razón social a la vez, y ORDENA: documento completo > prefijo de documento o código > razón social que empieza por lo tecleado > contiene > se parece. Los desactivados salen marcados y al final, para que buscar un RUC dado de baja no termine en un alta duplicada.';

-- ---------------------------------------------------------------------------
-- 2 · clientes_sugeridos — qué enseñar con la caja vacía
-- ---------------------------------------------------------------------------
-- Un buscador que no enseña nada hasta que teclees obliga a saber a quién
-- buscas. Casi siempre se sabe; cuando no —«el de Trujillo, el que cotizamos
-- la semana pasada»— lo que sirve es la lista de los últimos cotizados.
--
-- Sin cotizaciones todavía (que es el estado de hoy) cae al orden alfabético,
-- así que la lista nunca sale vacía.
create or replace function public.clientes_sugeridos(
  p_limit int default 8
) returns table (
  id                uuid,
  codigo            text,
  tipo_documento    tipo_documento_identidad,
  numero_documento  text,
  razon_social      text,
  nombre_comercial  text,
  contacto          text,
  telefono          text,
  whatsapp          text,
  email             text,
  condicion_pago    condicion_pago,
  dias_credito      smallint,
  linea_credito     numeric,
  bloqueado         boolean,
  motivo_bloqueo    text,
  activo            boolean,
  cotizaciones      int,
  ultima_cotizacion date,
  puntaje           int
)
language sql stable security definer set search_path = public, extensions
as $$
  with historial as (
    select ct.cliente_id, count(*)::int as veces, max(ct.fecha) as ultima
      from cotizaciones ct
     group by ct.cliente_id
  )
  select c.id, c.codigo, c.tipo_documento, c.numero_documento,
         c.razon_social, c.nombre_comercial,
         -- El contacto lo rellena la 035, que es donde deja de ser una columna
         -- de `clientes` para pasar a ser su propia tabla. Aquí va null y no
         -- `c.contacto` por una razón concreta: una función `language sql` SÍ
         -- se valida al crearse, así que nombrar una columna que la 035 borra
         -- impide volver a aplicar este archivo. Ver la cabecera.
         null::text, c.telefono,
         c.whatsapp, c.email, c.condicion_pago, c.dias_credito,
         c.linea_credito, c.bloqueado, c.motivo_bloqueo, c.activo,
         coalesce(h.veces, 0), h.ultima, 0
    from clientes c
    left join historial h on h.cliente_id = c.id
   where c.activo and not c.bloqueado
   order by h.ultima desc nulls last, c.razon_social
   limit greatest(p_limit, 1);
$$;

comment on function public.clientes_sugeridos(int) is
  'Los últimos cotizados, para que el selector de cliente enseñe algo útil antes de teclear. Cae al orden alfabético cuando todavía no hay cotizaciones.';

-- ---------------------------------------------------------------------------
-- 3 · Permisos
-- ---------------------------------------------------------------------------
-- Las dos leen `clientes`, que es lo que cualquier usuario con sesión ya puede
-- consultar tabla a tabla. `anon` no: el selector vive detrás del login.
do $$
declare f text;
begin
  foreach f in array array[
    'public.buscar_clientes(text, int)',
    'public.clientes_sugeridos(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_id      uuid;
  v_otro    uuid;
  v_primero uuid;
  v_n       int;
begin
  -- Con la caja vacía no revienta y no devuelve la tabla entera.
  select count(*) into v_n from public.buscar_clientes('', 5);
  if v_n > 5 then raise exception 'buscar_clientes no respeta el límite'; end if;

  select count(*) into v_n from public.clientes_sugeridos(5);
  if v_n > 5 then raise exception 'clientes_sugeridos no respeta el límite'; end if;

  -- Basura entre los dígitos: llega de la URL de un navegador, así que hay que
  -- suponer lo peor. No debe reventar ni ensanchar la búsqueda.
  select count(*) into v_n from public.buscar_clientes('%_'' or 1=1 --', 5);

  -- Y el ordenamiento, contra dos clientes de mentira que se borran después.
  -- Es lo único que no se puede comprobar leyendo: que el documento COMPLETO
  -- le gane a la razón social que empieza igual.
  insert into clientes (codigo, tipo_documento, numero_documento, razon_social)
  values ('ZZTEST030A', 'RUC', '20999999991', 'ZZTEST RODAMIENTOS DEL NORTE SAC')
  returning id into v_id;

  insert into clientes (codigo, tipo_documento, numero_documento, razon_social)
  values ('ZZTEST030B', 'RUC', '20999999992', 'ZZTEST RODAMIENTOS DEL SUR SAC')
  returning id into v_otro;

  select id into v_primero from public.buscar_clientes('20999999992', 10) limit 1;
  if v_primero is distinct from v_otro then
    raise exception 'buscar_clientes no pone primero el documento exacto';
  end if;

  -- Con guiones y espacios, como se pega desde la web de SUNAT.
  select id into v_primero from public.buscar_clientes('20-999999 992', 10) limit 1;
  if v_primero is distinct from v_otro then
    raise exception 'buscar_clientes no aguanta un documento con separadores';
  end if;

  -- Y por código del maestro.
  select id into v_primero from public.buscar_clientes('ZZTEST030A', 10) limit 1;
  if v_primero is distinct from v_id then
    raise exception 'buscar_clientes no encuentra por código';
  end if;

  -- Un desactivado no puede ganarle a uno activo que coincide igual de bien.
  update clientes set activo = false where id = v_id;
  select id into v_primero from public.buscar_clientes('ZZTEST RODAMIENTOS', 10) limit 1;
  if v_primero = v_id then
    raise exception 'buscar_clientes pone un desactivado por delante de uno activo';
  end if;

  -- Pero SÍ aparece: es la mitad del asunto.
  if not exists (select 1 from public.buscar_clientes('ZZTEST RODAMIENTOS', 10) where id = v_id) then
    raise exception 'buscar_clientes esconde los desactivados';
  end if;

  -- Y los sugeridos no los ofrecen nunca.
  if exists (select 1 from public.clientes_sugeridos(100) where id = v_id) then
    raise exception 'clientes_sugeridos ofrece un cliente desactivado';
  end if;

  delete from clientes where id in (v_id, v_otro);

  raise notice 'Clientes: búsqueda ordenada por documento, código y razón social.';
end $$;
