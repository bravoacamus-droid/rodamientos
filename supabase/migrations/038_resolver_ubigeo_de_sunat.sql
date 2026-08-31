-- ###########################################################################
-- 038 · RESOLVER EL UBIGEO QUE MANDA SUNAT, QUE NO ES EL NUESTRO
-- ###########################################################################
--
-- Fallo real que solo se pudo ver después de cargar el padrón (037), y que
-- estaba latente desde la 036.
--
-- ---------------------------------------------------------------------------
-- Qué pasaba
-- ---------------------------------------------------------------------------
-- `asegurar_ubigeo` recibe el código que devolvió la consulta de RUC y lo
-- busca en `ubigeo.codigo`. Pero `ubigeo.codigo` es el código del **INEI**, y
-- lo que devuelve la consulta es el de **SUNAT**. En 1.833 distritos son el
-- mismo número y no pasa nada. En 11 no:
--
--     un contribuyente de Huaribamba → SUNAT responde 090709
--     en nuestra tabla, 090709 es    → Ñahuimpuquio
--
-- O sea que el cliente se guardaba en el distrito de al lado, sin un solo
-- error por ninguna parte. Y como el distrito es lo que después viaja en la
-- guía de remisión, la mercadería saldría despachada a otro sitio.
--
-- Los 11 son Tayacaja (Huancavelica) y Putumayo (Loreto). Ninguno es un
-- distrito grande, pero eso es justo lo que lo hace peligroso: no se habría
-- notado nunca hasta que un cliente reclamara.
--
-- ---------------------------------------------------------------------------
-- Cómo se arregla
-- ---------------------------------------------------------------------------
-- Buscando primero por `codigo_sunat` y solo después por `codigo`. El orden
-- importa y no al revés: si se busca primero por `codigo`, el 090709 de
-- Huaribamba encuentra a Ñahuimpuquio y no llega nunca a mirar la otra
-- columna.
--
-- Se conserva el segundo intento por `codigo` porque el mismo parámetro lo
-- usan sitios que ya tienen el código del INEI en la mano —una carga, una
-- corrección a mano— y no tendría sentido que fallara ahí.
--
-- Y el alta de un distrito nuevo deja de tener sentido casi siempre: con los
-- 1.874 cargados, que SUNAT devuelva uno que no tenemos significa que acaba de
-- crear un distrito. Se conserva como red, pero ahora graba el código en las
-- DOS columnas: si viene de SUNAT, ese es su código de SUNAT.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · asegurar_ubigeo, resolviendo por el código correcto
-- ---------------------------------------------------------------------------
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
  v_nuestro char(6);
begin
  -- Seis dígitos o nada. `regexp_replace` porque alguna respuesta trae el
  -- código con espacios alrededor.
  v_codigo := nullif(regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'), '');
  if v_codigo is null or v_codigo !~ '^[0-9]{6}$' then
    return null;
  end if;

  -- PRIMERO por el código de SUNAT, que es el que devuelve la consulta de RUC.
  -- El orden es el arreglo entero de esta migración: al revés, el 090709 de
  -- Huaribamba encuentra a Ñahuimpuquio y no mira más.
  select u.codigo into v_nuestro from ubigeo u where u.codigo_sunat = v_codigo;
  if v_nuestro is not null then
    return v_nuestro;
  end if;

  -- Y después por el nuestro, para quien ya tenga el código del INEI en la
  -- mano: una carga, una corrección a mano, el selector de la pantalla.
  --
  -- Los dos caminos son LECTURA y van antes del control de rol a propósito:
  -- resolver un distrito que ya existe no puede depender de tener permisos de
  -- maestro, o un vendedor no podría guardar un cliente de Miraflores.
  select u.codigo into v_nuestro from ubigeo u where u.codigo = v_codigo;
  if v_nuestro is not null then
    return v_nuestro;
  end if;

  -- Para dar de alta hacen falta los tres nombres. Un código suelto sin
  -- provincia no sirve para nada: la guía los imprime.
  if coalesce(btrim(p_departamento), '') = ''
     or coalesce(btrim(p_provincia), '') = ''
     or coalesce(btrim(p_distrito), '') = '' then
    return null;
  end if;

  if not (public.puede_escribir('clientes') or public.puede_escribir('proveedores')) then
    raise exception 'Tu rol no puede dar de alta clientes ni proveedores'
      using errcode = 'insufficient_privilege';
  end if;

  -- Con los 1.874 cargados, llegar aquí significa que SUNAT acaba de crear un
  -- distrito. Se graba en las DOS columnas: el código vino de SUNAT, así que
  -- ese ES su código de SUNAT, y sin él la guía no podría emitirse.
  insert into ubigeo (codigo, codigo_sunat, departamento, provincia, distrito, origen)
  values (v_codigo, v_codigo, btrim(p_departamento), btrim(p_provincia), btrim(p_distrito), 'sunat')
  on conflict (codigo) do nothing;

  return v_codigo;
end $$;

comment on function public.asegurar_ubigeo(text, text, text, text) is
  'Resuelve el ubigeo que devolvió la consulta de RUC —que viene en la numeración de SUNAT— al código del INEI que usa la tabla. Busca primero por codigo_sunat: los 11 distritos de Tayacaja y Putumayo tienen números distintos en los dos sistemas, y buscar al revés devuelve el distrito de al lado. Da de alta el que no exista, que desde la 037 solo puede ser un distrito recién creado.';

-- ---------------------------------------------------------------------------
-- 2 · Qué código va en el documento
-- ---------------------------------------------------------------------------
-- Para quien escriba la guía de remisión. Devuelve null cuando SUNAT no
-- conoce el distrito, y entonces hay que NEGARSE a emitir con un mensaje que
-- lo explique — no mandar el del INEI, que llegaría a otro sitio o sería
-- rechazado.
create or replace function public.ubigeo_de_sunat(p_codigo char(6))
returns char(6)
language sql stable security definer set search_path = public, extensions
as $$
  select u.codigo_sunat from ubigeo u where u.codigo = p_codigo;
$$;

comment on function public.ubigeo_de_sunat(char) is
  'El código con el que SUNAT conoce este distrito, que es el que va en la guía de remisión y en la factura. Null en los 41 que SUNAT todavía no ha dado de alta: ahí hay que negarse a emitir, no mandar el del INEI.';

revoke execute on function public.ubigeo_de_sunat(char) from public, anon;
grant execute on function public.ubigeo_de_sunat(char) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_cod   char(6);
  v_quien uuid;
begin
  -- EL caso. SUNAT dice 090709; nuestro código para ese distrito es 090708, y
  -- 090709 es otro distrito. Si esto devuelve 090709, el fallo sigue vivo.
  v_cod := public.asegurar_ubigeo('090709', 'HUANCAVELICA', 'TAYACAJA', 'HUARIBAMBA');
  if v_cod is distinct from '090708' then
    raise exception 'asegurar_ubigeo devuelve % para el 090709 de SUNAT; debería ser 090708 (Huaribamba)', v_cod;
  end if;

  -- Y el de al lado, para probar que no es casualidad.
  v_cod := public.asegurar_ubigeo('090710', 'HUANCAVELICA', 'TAYACAJA', 'ÑAHUIMPUQUIO');
  if v_cod is distinct from '090709' then
    raise exception 'asegurar_ubigeo devuelve % para el 090710 de SUNAT; debería ser 090709', v_cod;
  end if;

  -- Putumayo, que es el otro tipo de desajuste: provincia entera distinta.
  v_cod := public.asegurar_ubigeo('160109', 'LORETO', 'PUTUMAYO', 'PUTUMAYO');
  if v_cod is distinct from '160801' then
    raise exception 'asegurar_ubigeo devuelve % para el 160109 de SUNAT; debería ser 160801', v_cod;
  end if;

  -- Donde los dos sistemas coinciden, sigue funcionando igual.
  v_cod := public.asegurar_ubigeo('150130', 'LIMA', 'LIMA', 'SAN BORJA');
  if v_cod is distinct from '150130' then
    raise exception 'asegurar_ubigeo rompió el caso normal: %', v_cod;
  end if;

  -- Y un código del INEI a secas se sigue resolviendo: lo manda el selector de
  -- la pantalla, que trabaja con los nuestros.
  v_cod := public.asegurar_ubigeo('090708', 'HUANCAVELICA', 'TAYACAJA', 'HUARIBAMBA');
  if v_cod is distinct from '090708' then
    raise exception 'asegurar_ubigeo no resuelve un código del INEI: %', v_cod;
  end if;

  -- Lo que va en el documento.
  if public.ubigeo_de_sunat('090708') is distinct from '090709' then
    raise exception 'ubigeo_de_sunat no devuelve el código de SUNAT de Huaribamba';
  end if;
  -- Quichuas: SUNAT no lo conoce, así que null y la guía tiene que negarse.
  if public.ubigeo_de_sunat('090717') is not null then
    raise exception 'ubigeo_de_sunat inventa un código para un distrito que SUNAT no tiene';
  end if;

  -- El alta de un distrito nuevo graba las DOS columnas.
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);
  delete from ubigeo where codigo = '999999';
  v_cod := public.asegurar_ubigeo('999999', 'ZZTESTDEPTO', 'ZZTESTPROV', 'ZZTESTDIST');
  if v_cod is distinct from '999999' then
    raise exception 'asegurar_ubigeo no da de alta el distrito nuevo: %', v_cod;
  end if;
  if (select u.codigo_sunat from ubigeo u where u.codigo = '999999') is distinct from '999999' then
    raise exception 'El distrito aprendido no quedó con su código de SUNAT: la guía no podría emitirse';
  end if;
  delete from ubigeo where codigo = '999999';
  perform set_config('request.jwt.claims', '', true);

  raise notice 'Ubigeo: el código de SUNAT se resuelve al nuestro, y Huaribamba deja de ser Ñahuimpuquio.';
end $$;
