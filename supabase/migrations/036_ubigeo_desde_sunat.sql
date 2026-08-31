-- ###########################################################################
-- 036 · EL UBIGEO SE APRENDE DE SUNAT EN VEZ DE INVENTARSE
-- ###########################################################################
--
-- Willy, 31/08 (7:23), mirando el alta de cliente:
--
--   «Aquí en el ubigeo, que es el distrito, debería traer, aquí tenemos que
--    tener todos los distritos y provincias, departamentos.»
--
-- Tenía razón y el problema estaba diagnosticado desde el 28/08: `ubigeo` trae
-- 64 distritos de los ~1.890 del Perú. La 007 cargó Lima Metropolitana, el
-- Callao y una capital por departamento, y dejó escrito que el padrón completo
-- del INEI iría en un archivo que nunca se escribió.
--
-- El parche del 28/08 fue que el guardado DESCARTA el distrito desconocido en
-- vez de rechazar el alta entera. Funciona —la dirección, que es lo que hace
-- falta para la guía, sí se conserva— pero el cliente de Trujillo se queda sin
-- distrito y nadie se entera.
--
-- ---------------------------------------------------------------------------
-- Lo que cambió: resulta que el dato lo teníamos
-- ---------------------------------------------------------------------------
-- La consulta de RUC devuelve las cuatro cosas, no solo el nombre del
-- distrito. Comprobado contra la respuesta real que hay en `consultas_cache`:
--
--     "ubigeo": "150130", "distrito": "SAN BORJA",
--     "provincia": "LIMA", "departamento": "LIMA"
--
-- Y el código viene en el MISMO formato de seis dígitos que usa esta tabla
-- —150130 es San Borja, 150122 Miraflores, 200101 Piura—. O sea que cada vez
-- que alguien pulsa «Traer datos» sobre un RUC, SUNAT nos está regalando una
-- fila del padrón, y la estábamos tirando a la basura.
--
-- Esta migración deja de tirarla. La tabla APRENDE: el distrito que no está se
-- da de alta con lo que respondió SUNAT, y a partir de ahí existe para todos.
--
-- ---------------------------------------------------------------------------
-- Por qué esto no es inventarse el padrón, que era la línea roja
-- ---------------------------------------------------------------------------
-- El 28/08 quedó escrito que el padrón NO se inventa, porque ese código viaja
-- en un documento que SUNAT valida y equivocarlo es un rechazo. Sigue en pie.
--
-- La diferencia es la fuente: aquí el código no lo deduce nadie, lo dice SUNAT
-- sobre ese contribuyente concreto. Es la autoridad que después va a validar
-- el documento diciendo de antemano qué espera leer.
--
-- Lo que NO arregla: los distritos a los que Willy despacha pero de los que
-- todavía no ha consultado ningún RUC siguen sin estar. La tabla se llena por
-- uso, no de golpe. **El padrón completo del INEI sigue pendiente** y sigue
-- siendo la solución de verdad; esto es lo que se puede hacer hoy sin él, y
-- deja de perder datos buenos mientras tanto.
--
-- ---------------------------------------------------------------------------
-- Y por qué hace falta una función, si bastaría un insert
-- ---------------------------------------------------------------------------
-- Porque hoy NADIE puede escribir en `ubigeo`. La 006 le puso RLS con
-- `puede_escribir('ubigeo')`, pero la 007 nunca le dio filas en `permisos_rol`
-- a esa tabla: la política existe y siempre dice que no. Ese es el motivo real
-- de que el parche del 28/08 tuviera que descartar en vez de dar de alta.
--
-- Se podría arreglar dándole roles a `ubigeo` en `permisos_rol`, y entonces
-- cualquiera con sesión podría escribir cualquier cosa en una tabla de
-- referencia. Mejor una puerta estrecha: una función que solo acepta un código
-- de seis dígitos con sus tres nombres, y que **nunca pisa una fila que ya
-- exista**.
--
-- Eso último importa: la 007 cargó los 64 con acentos y capitalización de
-- verdad («Miraflores», «Áncash»); SUNAT los devuelve en mayúsculas y sin
-- tildes («MIRAFLORES»). Si la función sobrescribiera, la primera consulta de
-- un RUC limeño degradaría el padrón bueno que ya hay.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · De dónde salió cada fila
-- ---------------------------------------------------------------------------
-- Sin esto no hay forma de distinguir las 64 revisadas a mano de las que fue
-- dejando SUNAT, y esa distinción va a hacer falta el día que se cargue el
-- padrón del INEI: las de origen `sunat` son las que hay que contrastar.
alter table ubigeo
  add column if not exists origen text not null default 'seed';

alter table ubigeo
  drop constraint if exists ubigeo_origen_ok;
alter table ubigeo
  add constraint ubigeo_origen_ok check (origen in ('seed', 'sunat', 'inei'));

comment on column ubigeo.origen is
  'seed = los 64 de la 007, revisados a mano. sunat = aprendido de una consulta de RUC (036). inei = padrón oficial completo, cuando se cargue.';

-- ---------------------------------------------------------------------------
-- 2 · asegurar_ubigeo
-- ---------------------------------------------------------------------------
-- Devuelve el código si la fila queda utilizable, o null si lo que llegó no
-- sirve. Null y no una excepción a propósito: quien la llama está guardando un
-- cliente, y un distrito ilegible no puede tumbar el alta entera. Es la misma
-- decisión que tomó el parche del 28/08, solo que ahora casi nunca hace falta.
create or replace function public.asegurar_ubigeo(
  p_codigo       text,
  p_departamento text,
  p_provincia    text,
  p_distrito     text
) returns char(6)
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_codigo char(6);
begin
  -- Seis dígitos o nada. `regexp_replace` porque alguna respuesta trae el
  -- código con espacios alrededor.
  v_codigo := nullif(regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'), '');
  if v_codigo is null or v_codigo !~ '^[0-9]{6}$' then
    return null;
  end if;

  -- Si ya está, se devuelve y NO se toca. Ver la cabecera: las 64 de la 007
  -- están mejor escritas que lo que devuelve SUNAT.
  --
  -- Este camino va ANTES del control de rol a propósito, y es el 95 % de las
  -- llamadas: resolver un código que ya existe es una LECTURA, y `ubigeo` la
  -- puede leer cualquiera con sesión. Pedir permiso de escritura para leer
  -- haría que un vendedor sin permisos de maestro no pudiera ni guardar un
  -- cliente de Miraflores.
  if exists (select 1 from ubigeo u where u.codigo = v_codigo) then
    return v_codigo;
  end if;

  -- Para dar de alta hacen falta los tres nombres. Un código suelto sin
  -- provincia no sirve para nada: la guía los imprime.
  if coalesce(btrim(p_departamento), '') = ''
     or coalesce(btrim(p_provincia), '') = ''
     or coalesce(btrim(p_distrito), '') = '' then
    return null;
  end if;

  -- Y AQUÍ sí, justo antes de escribir. Lo llaman el alta de cliente y la de
  -- proveedor, así que basta con poder escribir cualquiera de las dos.
  if not (public.puede_escribir('clientes') or public.puede_escribir('proveedores')) then
    raise exception 'Tu rol no puede dar de alta clientes ni proveedores'
      using errcode = 'insufficient_privilege';
  end if;

  insert into ubigeo (codigo, departamento, provincia, distrito, origen)
  values (v_codigo, btrim(p_departamento), btrim(p_provincia), btrim(p_distrito), 'sunat')
  -- Dos altas a la vez del mismo distrito: la segunda no es un error.
  on conflict (codigo) do nothing;

  return v_codigo;
end $$;

comment on function public.asegurar_ubigeo(text, text, text, text) is
  'Da de alta el distrito que devolvió la consulta de RUC si no lo teníamos, y devuelve su código. Nunca pisa una fila existente: los 64 de la 007 están escritos con acentos y SUNAT los devuelve en mayúsculas sin tildes. Devuelve null si el código no es de seis dígitos o si faltan nombres, para que un distrito ilegible no tumbe el alta del cliente.';

revoke execute on function public.asegurar_ubigeo(text, text, text, text) from public, anon;
grant execute on function public.asegurar_ubigeo(text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3 · Los departamentos y provincias que ya se pueden ofrecer
-- ---------------------------------------------------------------------------
-- Willy quiere ver departamento, provincia y distrito. Los tres están en la
-- tabla desde la 002 —la estructura nunca fue el problema, solo faltaban
-- filas— pero no había forma de listarlos en cascada.
--
-- Es honesto sobre lo que hay: lo que devuelve son los departamentos y
-- provincias DE LAS FILAS CARGADAS, no los 25 y 196 del Perú. Mientras el
-- padrón esté incompleto, la pantalla tiene que decirlo en vez de fingir.
create or replace function public.ubigeo_departamentos()
returns table (departamento text, distritos int)
language sql stable security definer set search_path = public, extensions
as $$
  select u.departamento, count(*)::int
    from ubigeo u
   group by u.departamento
   order by u.departamento;
$$;

create or replace function public.ubigeo_provincias(p_departamento text)
returns table (provincia text, distritos int)
language sql stable security definer set search_path = public, extensions
as $$
  select u.provincia, count(*)::int
    from ubigeo u
   where public.normalizar_texto(u.departamento) = public.normalizar_texto(coalesce(p_departamento, ''))
   group by u.provincia
   order by u.provincia;
$$;

create or replace function public.ubigeo_distritos(p_departamento text, p_provincia text)
returns table (codigo char(6), distrito text, origen text)
language sql stable security definer set search_path = public, extensions
as $$
  select u.codigo, u.distrito, u.origen
    from ubigeo u
   where public.normalizar_texto(u.departamento) = public.normalizar_texto(coalesce(p_departamento, ''))
     and public.normalizar_texto(u.provincia)    = public.normalizar_texto(coalesce(p_provincia, ''))
   order by u.distrito;
$$;

comment on function public.ubigeo_departamentos() is
  'Los departamentos que hay CARGADOS, con cuántos distritos tiene cada uno. No son los 25 del Perú mientras el padrón del INEI siga pendiente, y la cuenta está ahí para que la pantalla pueda decirlo.';

do $$
declare f text;
begin
  foreach f in array array[
    'public.ubigeo_departamentos()',
    'public.ubigeo_provincias(text)',
    'public.ubigeo_distritos(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- LLAMA a la función, incluida la ruta de escritura, que es la que no había
-- forma de ejecutar antes de esta migración. Regla de la 031.
do $$
declare
  v_cod    char(6);
  v_nombre text;
  v_origen text;
  v_n      int;
  v_quien  uuid;
begin
  -- Para probar la ESCRITURA hay que ser alguien: `puede_escribir` mira
  -- `auth.uid()`, y en una migración no hay sesión. Se toma prestada la
  -- identidad de un perfil real de gerencia poniendo la claim que lee
  -- `auth.uid()`, con `is_local => true` para que muera con esta sentencia.
  --
  -- Es la única forma de que el centinela ejecute de verdad el camino que
  -- importa. La alternativa —comprobar que la función existe— es exactamente
  -- lo que dejó `consultas_reservar_cuota` rota dos meses (ver 031).
  select p.id into v_quien
    from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  if v_quien is null then
    raise exception 'No hay ningún perfil de gerencia activo con quien probar asegurar_ubigeo';
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text,
                     true);

  -- Un código que ya existe se devuelve tal cual y no se toca. «Miraflores»
  -- con minúsculas y tilde tiene que seguir escrito así después de que SUNAT
  -- lo mande en mayúsculas.
  select u.distrito into v_nombre from ubigeo u where u.codigo = '150122';
  if v_nombre is null then
    raise exception 'Falta el ubigeo 150122 de la 007; el centinela no puede comprobar nada';
  end if;

  v_cod := public.asegurar_ubigeo('150122', 'LIMA', 'LIMA', 'MIRAFLORES');
  if v_cod is distinct from '150122' then
    raise exception 'asegurar_ubigeo no devuelve el código que ya existía: %', v_cod;
  end if;

  select u.distrito, u.origen into v_nombre, v_origen from ubigeo u where u.codigo = '150122';
  if v_nombre <> 'Miraflores' then
    raise exception 'asegurar_ubigeo pisó un distrito ya cargado: quedó «%»', v_nombre;
  end if;
  if v_origen <> 'seed' then
    raise exception 'asegurar_ubigeo cambió el origen de una fila de la 007: %', v_origen;
  end if;

  -- Uno que no existe se da de alta, marcado como venido de SUNAT.
  delete from ubigeo where codigo = '999999';
  v_cod := public.asegurar_ubigeo('999999', 'ZZTESTDEPTO', 'ZZTESTPROV', 'ZZTESTDIST');
  if v_cod is distinct from '999999' then
    raise exception 'asegurar_ubigeo no dio de alta el distrito nuevo: %', v_cod;
  end if;
  select u.origen into v_origen from ubigeo u where u.codigo = '999999';
  if v_origen <> 'sunat' then
    raise exception 'El distrito aprendido no quedó marcado como sunat: %', v_origen;
  end if;

  -- Y llamarla otra vez no es un error.
  v_cod := public.asegurar_ubigeo('999999', 'ZZTESTDEPTO', 'ZZTESTPROV', 'ZZTESTDIST');
  if v_cod is distinct from '999999' then
    raise exception 'asegurar_ubigeo falla al repetirse';
  end if;

  -- Basura: devuelve null en vez de reventar, que es lo que salva el alta.
  if public.asegurar_ubigeo('15013', 'LIMA', 'LIMA', 'X') is not null then
    raise exception 'asegurar_ubigeo aceptó un código de cinco dígitos';
  end if;
  if public.asegurar_ubigeo(null, 'LIMA', 'LIMA', 'X') is not null then
    raise exception 'asegurar_ubigeo aceptó un código nulo';
  end if;
  if public.asegurar_ubigeo('888888', 'LIMA', '', 'X') is not null then
    raise exception 'asegurar_ubigeo dio de alta un distrito sin provincia';
  end if;
  if exists (select 1 from ubigeo where codigo = '888888') then
    raise exception 'asegurar_ubigeo escribió pese a devolver null';
  end if;

  -- La cascada encuentra lo recién aprendido.
  select count(*) into v_n from public.ubigeo_provincias('ZZTESTDEPTO');
  if v_n <> 1 then raise exception 'ubigeo_provincias no ve el departamento aprendido'; end if;

  select d.codigo into v_cod
    from public.ubigeo_distritos('zztestdepto', 'ZZTESTPROV') d limit 1;
  if v_cod is distinct from '999999' then
    raise exception 'ubigeo_distritos no aguanta diferencias de mayúsculas';
  end if;

  delete from ubigeo where codigo = '999999';

  -- Y que los departamentos siguen saliendo, con su cuenta.
  select count(*) into v_n from public.ubigeo_departamentos();
  if v_n < 1 then raise exception 'ubigeo_departamentos no devuelve nada'; end if;

  -- Y sin sesión NO se puede dar de alta, que es la mitad que protege la tabla
  -- de referencia. Se comprueba al final para no dejar la claim puesta.
  perform set_config('request.jwt.claims', '', true);
  begin
    v_cod := public.asegurar_ubigeo('777777', 'ZZTESTDEPTO', 'ZZTESTPROV', 'ZZTESTDIST');
    raise exception 'asegurar_ubigeo dejó escribir sin sesión';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from ubigeo where codigo = '777777') then
    raise exception 'asegurar_ubigeo escribió sin sesión';
  end if;

  -- Pero LEER un código que ya existe sí, sin permisos de maestro: es el 95 %
  -- de las llamadas y no puede depender del rol.
  if public.asegurar_ubigeo('150122', 'LIMA', 'LIMA', 'MIRAFLORES') is distinct from '150122' then
    raise exception 'asegurar_ubigeo exige permiso de escritura para resolver un código que ya existe';
  end if;

  raise notice 'Ubigeo: la tabla aprende de SUNAT y no pisa lo que ya estaba bien escrito.';
end $$;
