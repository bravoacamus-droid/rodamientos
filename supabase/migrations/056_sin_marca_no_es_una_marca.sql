-- ###########################################################################
-- 056 · «SIN MARCA» NO ES UNA MARCA
-- ###########################################################################
--
-- Encontrado el 02/09 probando el comparador (055) contra la base real: se
-- anotó una compra y quedaron dos filas en `proveedor_marcas` diciendo que
-- esos proveedores «venden SIN MARCA».
--
-- ---------------------------------------------------------------------------
-- Por qué importa
-- ---------------------------------------------------------------------------
-- `proveedor_marcas` existe para UNA cosa: el filtro «¿quién me trae SKF?»,
-- que es la mitad de las veces que se abre el buscador de proveedores. La 046
-- lo llena solo, con cada compra, porque nadie se iba a sentar a rellenarlo
-- para 97 proveedores.
--
-- Pero **384 de los 790 productos del maestro son «SIN MARCA»** —el marcador
-- que se les pone a los que no la traen—. Con eso, en unos meses casi todos
-- los proveedores tendrían esa fila, «SIN MARCA» sería la opción más repetida
-- del filtro y buscar por marca dejaría de servir para nada.
--
-- No habría reventado nunca. Se habría ido degradando, que es peor: cuando
-- alguien se diera cuenta, el dato sucio llevaría meses acumulándose.
--
-- ---------------------------------------------------------------------------
-- Cómo se arregla
-- ---------------------------------------------------------------------------
-- Se parchea SOLO el insert de marcas dentro de
-- `anotar_productos_de_proveedor`, sobre la definición que haya en la base.
-- Misma técnica que la 018 y la 047, y por el mismo motivo: copiar aquí las 90
-- líneas de esa función la duplicaría, y la siguiente vez que alguien tocara
-- la 046 las dos versiones se separarían sin que nadie lo notara.
--
-- Se compara por NOMBRE y no por un id fijo: el marcador se creó al importar
-- el maestro y su uuid es distinto en cada base.
-- ###########################################################################

set search_path = public, extensions;

do $bloque$
declare
  v_def text;
  -- El cuerpo guardado lleva los saltos de línea con los que se aplicó la 046,
  -- así que el patrón va con `\s+` y no con texto literal.
  v_patron text :=
    'join\s+productos\s+pr\s+on\s+pr\.id\s*=\s*\(i\.valor\s*->>\s*''producto_id''\)::uuid\s+'
    || 'on\s+conflict\s+do\s+nothing;';
  v_nuevo text :=
    'join productos pr on pr.id = (i.valor ->> ''producto_id'')::uuid' || chr(10)
    || '    join marcas ma on ma.id = pr.marca_id' || chr(10)
    || '   where upper(btrim(ma.nombre)) <> ''SIN MARCA''' || chr(10)
    || '  on conflict do nothing;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'anotar_productos_de_proveedor';

  if v_def is null then
    raise exception 'No existe anotar_productos_de_proveedor: falta aplicar la 046';
  end if;

  -- Idempotente: si ya está parcheada, no se toca.
  if v_def like '%SIN MARCA%' then
    raise notice 'anotar_productos_de_proveedor ya ignora el marcador. Se omite.';
    return;
  end if;

  if v_def !~ v_patron then
    raise exception 'El insert de proveedor_marcas no encaja con lo esperado. Revisa la 046 antes de seguir.';
  end if;

  v_def := regexp_replace(v_def, v_patron, v_nuevo);
  execute v_def;

  -- Y se comprueba que el parche entró de verdad. Un `regexp_replace` que no
  -- encuentra nada devuelve el texto igual y no falla: sin esto, la migración
  -- diría que sí y no habría cambiado nada.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'anotar_productos_de_proveedor';
  if v_def not like '%SIN MARCA%' then
    raise exception 'El parche no llegó a aplicarse';
  end if;

  raise notice 'anotar_productos_de_proveedor deja de apuntar el marcador SIN MARCA.';
end $bloque$;

-- ---------------------------------------------------------------------------
-- Y se limpia lo que ya hubiera
-- ---------------------------------------------------------------------------
-- Hoy son dos filas de mis propias pruebas. Va escrito igual porque esta
-- migración se reaplica y porque el día que se aplique sobre una base que
-- lleve meses funcionando, ahí sí habrá cientos.
delete from proveedor_marcas pm
 using marcas m
 where m.id = pm.marca_id
   and upper(btrim(m.nombre)) = 'SIN MARCA';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien   uuid;
  v_prov    uuid;
  v_sin     uuid;
  v_con     uuid;
  v_marca   uuid;
  v_n       int;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select id into v_marca from marcas where upper(btrim(nombre)) = 'SIN MARCA' limit 1;
  select id into v_sin from productos where marca_id = v_marca and not archivado limit 1;
  select id into v_con from productos
   where marca_id is not null and marca_id <> v_marca and not archivado limit 1;
  select id into v_prov from proveedores where activo order by razon_social limit 1;

  if v_quien is null or v_sin is null or v_con is null or v_prov is null then
    raise notice 'Faltan datos para probarlo (perfil, marcador, dos productos, un proveedor). Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  -- Se anotan los dos de golpe: uno con marca y otro sin ella.
  perform public.anotar_productos_de_proveedor(
    v_prov,
    jsonb_build_array(jsonb_build_object('producto_id', v_sin),
                      jsonb_build_object('producto_id', v_con)),
    null, 'USD', null, false, 'ZZTEST 056');

  select count(*) into v_n from proveedor_marcas
   where proveedor_id = v_prov and marca_id = v_marca;
  if v_n <> 0 then
    raise exception 'Siguió apuntando SIN MARCA como si fuera una marca';
  end if;

  -- Y la de verdad sí tiene que quedar apuntada: el arreglo no puede haberse
  -- llevado por delante lo que esta tabla existe para hacer.
  select count(*) into v_n from proveedor_marcas
   where proveedor_id = v_prov and marca_id = (select marca_id from productos where id = v_con);
  if v_n <> 1 then
    raise exception 'Dejó de apuntar las marcas de verdad: %', v_n;
  end if;

  -- Limpieza.
  delete from proveedor_productos where proveedor_id = v_prov and notas = 'ZZTEST 056';
  delete from proveedor_marcas
   where proveedor_id = v_prov
     and marca_id = (select marca_id from productos where id = v_con);

  perform set_config('request.jwt.claims', '', true);

  raise notice 'El marcador SIN MARCA ya no ensucia el filtro «vende la marca».';
end $$;
