-- ###########################################################################
-- 028 · CREAR FAMILIAS, SUBFAMILIAS Y TIPOS DESDE LA PANTALLA
-- ###########################################################################
--
-- Willy, 26/08 (10:40):
--
--   «¿Qué pasa si se trata de un producto nuevo que nunca he comercializado,
--    con otra línea de negocio? Digamos que nos pide unos pernos que no están
--    en rodamientos. Habría que crear. Entonces, en cada clasificación tendría
--    que haber la opción de crear una nueva familia o sub-familia.»
--
-- Hasta ahora los tres niveles se cargaban por migración
-- (`008_taxonomia_rodatech.sql`) y no había forma de añadir uno sin desplegar.
-- Para un negocio que crece hacia otras líneas, eso significa que el producto
-- no se puede dar de alta el día que el cliente lo pide.
--
-- ---------------------------------------------------------------------------
-- El detalle que obliga a hacerlo en la base y no en la aplicación
-- ---------------------------------------------------------------------------
-- Las tres tablas tienen `codigo` NOT NULL con formato `^[A-Z0-9_-]{2,20}$` y
-- **único en toda la tabla**, no por familia. O sea que al crear «RODAMIENTOS
-- CÓNICOS» hay que inventar un código válido, comprobar que no exista y
-- guardarlo sin que otra sesión gane la carrera entre la comprobación y el
-- insert. Eso es una transacción, no dos llamadas desde el navegador.
--
-- ---------------------------------------------------------------------------
-- Crear lo que ya existe NO es un error
-- ---------------------------------------------------------------------------
-- Si alguien teclea «PERNOS» y ya hay una familia PERNOS, se devuelve LA QUE
-- HAY en lugar de fallar. Quien está dando de alta un producto no quiere una
-- lección sobre duplicados: quiere seguir. Y el resultado es el mismo que
-- esperaba — su producto acaba en la familia PERNOS.
--
-- La comparación es por `nombre_norm`, que ya ignora tildes, mayúsculas y
-- signos: «Rodamiento Cónico» y «RODAMIENTOS CONICOS» no son lo mismo, pero
-- «Pernos» y «PERNOS» sí.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- El código, a partir del nombre
-- ---------------------------------------------------------------------------
create or replace function public.codigo_catalogo(
  p_nombre text,
  p_tabla  regclass
) returns text
language plpgsql stable
as $$
declare
  v_base   text;
  v_codigo text;
  v_existe boolean;
  v_n      int := 0;
begin
  -- Sin tildes, en mayúsculas, y solo lo que admite el check. Los espacios
  -- pasan a guion bajo para que «RODAMIENTOS CONICOS» siga siendo legible en
  -- vez de convertirse en un pegote.
  v_base := regexp_replace(
              upper(public.normalizar_texto(coalesce(p_nombre, ''))),
              '[^A-Z0-9]+', '_', 'g');
  v_base := btrim(v_base, '_');
  v_base := left(v_base, 16);   -- deja sitio para el sufijo

  -- El check exige DOS caracteres como mínimo. Un nombre de una sola letra, o
  -- todo signos, se queda sin base utilizable.
  if length(v_base) < 2 then
    v_base := 'CAT';
  end if;

  v_codigo := v_base;
  loop
    execute format('select exists (select 1 from %s where codigo = $1)', p_tabla)
      into v_existe using v_codigo;
    exit when not v_existe;

    v_n := v_n + 1;
    if v_n > 999 then
      raise exception 'No se pudo generar un código libre para «%»', p_nombre;
    end if;
    v_codigo := v_base || '_' || v_n::text;
  end loop;

  return v_codigo;
end $$;

comment on function public.codigo_catalogo(text, regclass) is
  'Código válido y libre a partir de un nombre. `codigo` es único en toda la tabla, no por familia, así que hay que comprobarlo antes de insertar.';

-- ---------------------------------------------------------------------------
-- 1 · Familia
-- ---------------------------------------------------------------------------
create or replace function public.crear_familia(p_nombre text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id     uuid;
  v_codigo text;
begin
  -- Quien mantiene el maestro de productos mantiene su clasificación: no tiene
  -- sentido dejar dar de alta un producto y no la familia donde va.
  if not public.puede_escribir('productos') then
    raise exception 'Tu rol no puede crear familias'
      using errcode = 'insufficient_privilege';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'El nombre de la familia es demasiado corto'
      using errcode = 'invalid_parameter_value';
  end if;

  select f.id into v_id from familias f
   where f.nombre_norm = public.normalizar_codigo(v_nombre);

  if v_id is not null then
    -- Ya existía. Se devuelve con `creada: false` para que la pantalla pueda
    -- decir «ya estaba» en vez de fingir que la acaba de crear.
    return (select jsonb_build_object(
              'id', f.id, 'nombre', f.nombre, 'codigo', f.codigo, 'creada', false)
            from familias f where f.id = v_id);
  end if;

  v_codigo := public.codigo_catalogo(v_nombre, 'familias'::regclass);

  insert into familias (codigo, nombre, orden)
  values (v_codigo, upper(v_nombre),
          -- Al final de la lista: las que vinieron del catálogo del cliente
          -- tienen su orden pensado y una nueva no debería colarse en medio.
          (select coalesce(max(orden), 100) + 10 from familias))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'nombre', upper(v_nombre),
                            'codigo', v_codigo, 'creada', true);
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Sub-familia
-- ---------------------------------------------------------------------------
create or replace function public.crear_subfamilia(
  p_familia uuid,
  p_nombre  text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id     uuid;
  v_codigo text;
begin
  if not public.puede_escribir('productos') then
    raise exception 'Tu rol no puede crear sub-familias'
      using errcode = 'insufficient_privilege';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'El nombre de la sub-familia es demasiado corto'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from familias where id = p_familia) then
    raise exception 'La familia no existe' using errcode = 'invalid_parameter_value';
  end if;

  -- El único es por (familia, nombre): dos familias distintas SÍ pueden tener
  -- una sub-familia que se llame igual.
  select s.id into v_id from subfamilias s
   where s.familia_id = p_familia
     and s.nombre_norm = public.normalizar_codigo(v_nombre);

  if v_id is not null then
    return (select jsonb_build_object(
              'id', s.id, 'nombre', s.nombre, 'codigo', s.codigo, 'creada', false)
            from subfamilias s where s.id = v_id);
  end if;

  v_codigo := public.codigo_catalogo(v_nombre, 'subfamilias'::regclass);

  insert into subfamilias (familia_id, codigo, nombre, orden)
  values (p_familia, v_codigo, upper(v_nombre),
          (select coalesce(max(orden), 100) + 10 from subfamilias where familia_id = p_familia))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'nombre', upper(v_nombre),
                            'codigo', v_codigo, 'creada', true);
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Tipo (la «descripción» del catálogo del cliente)
-- ---------------------------------------------------------------------------
create or replace function public.crear_tipo(
  p_subfamilia uuid,
  p_nombre     text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_id      uuid;
  v_codigo  text;
  v_familia uuid;
begin
  if not public.puede_escribir('productos') then
    raise exception 'Tu rol no puede crear descripciones'
      using errcode = 'insufficient_privilege';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'El nombre de la descripción es demasiado corto'
      using errcode = 'invalid_parameter_value';
  end if;

  -- `tipos` guarda TAMBIÉN la familia, y la clave ajena es compuesta
  -- —(subfamilia_id, familia_id)— justamente para que no se pueda apuntar a
  -- una sub-familia de otra familia. Así que la familia no se pide: se
  -- deduce, que es la única forma de que no pueda llegar equivocada.
  select s.familia_id into v_familia from subfamilias s where s.id = p_subfamilia;
  if v_familia is null then
    raise exception 'La sub-familia no existe' using errcode = 'invalid_parameter_value';
  end if;

  select t.id into v_id from tipos t
   where t.subfamilia_id = p_subfamilia
     and t.nombre_norm = public.normalizar_codigo(v_nombre);

  if v_id is not null then
    return (select jsonb_build_object(
              'id', t.id, 'nombre', t.nombre, 'codigo', t.codigo, 'creada', false)
            from tipos t where t.id = v_id);
  end if;

  v_codigo := public.codigo_catalogo(v_nombre, 'tipos'::regclass);

  insert into tipos (subfamilia_id, familia_id, codigo, nombre, orden)
  values (p_subfamilia, v_familia, v_codigo, upper(v_nombre),
          (select coalesce(max(orden), 100) + 10 from tipos where subfamilia_id = p_subfamilia))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'nombre', upper(v_nombre),
                            'codigo', v_codigo, 'creada', true);
end $$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.crear_familia(text)',
    'public.crear_subfamilia(uuid, text)',
    'public.crear_tipo(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;

  -- El generador de códigos es un ayudante interno: se llama desde las tres de
  -- arriba, que ya validan rol. Abierto por su cuenta no hace daño —es
  -- `stable` y no escribe— pero la superficie que no existe no hay que
  -- auditarla (misma razón que en la 012).
  revoke execute on function public.codigo_catalogo(text, regclass) from public, anon, authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
begin
  -- El código sale válido a partir de nombres reales, incluidos los raros.
  if public.codigo_catalogo('Rodamientos Cónicos', 'familias'::regclass) !~ '^[A-Z0-9_-]{2,20}$' then
    raise exception 'El código generado no cumple el formato de la tabla';
  end if;
  if public.codigo_catalogo('¡!¿?', 'familias'::regclass) !~ '^[A-Z0-9_-]{2,20}$' then
    raise exception 'Un nombre sin letras utilizables rompe el generador';
  end if;
  if length(public.codigo_catalogo(repeat('RODAMIENTO', 8), 'familias'::regclass)) > 20 then
    raise exception 'El código generado se pasa de 20 caracteres';
  end if;

  -- Y un nombre que YA existe devuelve un código distinto, no el mismo.
  if exists (select 1 from familias limit 1) then
    if public.codigo_catalogo((select nombre from familias limit 1), 'familias'::regclass)
       = (select codigo from familias limit 1) then
      raise exception 'El generador devolvió un código ya ocupado';
    end if;
  end if;

  -- Las tres validan rol: son security definer, volátiles y abiertas a
  -- `authenticated`, o sea la combinación que vigila el centinela de la 013.
  if pg_get_functiondef('public.crear_familia(text)'::regprocedure) !~* 'puede_escribir' then
    raise exception 'crear_familia no valida rol';
  end if;
  if pg_get_functiondef('public.crear_subfamilia(uuid, text)'::regprocedure) !~* 'puede_escribir' then
    raise exception 'crear_subfamilia no valida rol';
  end if;
  if pg_get_functiondef('public.crear_tipo(uuid, text)'::regprocedure) !~* 'puede_escribir' then
    raise exception 'crear_tipo no valida rol';
  end if;

  raise notice 'Catálogos: familia, sub-familia y descripción se crean desde la pantalla.';
end $$;
