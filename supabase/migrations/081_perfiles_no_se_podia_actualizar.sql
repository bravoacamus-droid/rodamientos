-- ###########################################################################
-- 081 · A `perfiles` NO SE LE PODÍA ESCRIBIR. NUNCA.
-- ###########################################################################
--
-- Encontrado el 15/09 probando en pantalla la nueva página «Mi perfil»: se
-- guardaba, el servidor respondía 200, y el teléfono seguía vacío.
--
-- ---------------------------------------------------------------------------
-- Qué pasaba
-- ---------------------------------------------------------------------------
-- La 002 reparte el trigger `tocar_actualizado_en` sobre nueve tablas:
--
--   'empresa','perfiles','productos','clientes','proveedores','compras',
--   'cotizaciones','guias_remision','comprobantes'
--
-- El trigger hace una sola cosa: `new.actualizado_en := now()`. Y las nueve
-- tablas tienen esa columna… menos `perfiles`, que nunca la tuvo.
--
-- En PL/pgSQL, asignar a un campo que el registro no tiene no es un aviso: es
-- un error en tiempo de ejecución.
--
--   ERROR 42703: record "new" has no field "actualizado_en"
--
-- O sea que **cualquier UPDATE sobre `perfiles` ha fallado desde la 002**.
-- Cambiar el rol de alguien desde Configuración → Usuarios: fallaba.
-- Desactivar a quien se va: fallaba. Y como nadie lo había probado con los
-- ojos, no lo sabíamos.
--
-- ---------------------------------------------------------------------------
-- Y una corrección al hallazgo «crítico» del 11/09
-- ---------------------------------------------------------------------------
-- La auditoría dijo —y yo se lo dije a Luis con alarma— que cualquier empleado
-- podía ascenderse a gerencia con un PATCH a PostgREST sobre su propia fila.
-- La lectura de las políticas era correcta: RLS lo permitía.
--
-- Pero **no era explotable**, y por esto mismo: ese PATCH se habría estrellado
-- contra el 42703 igual que el nuestro. El agujero estaba abierto y tapiado
-- por detrás, por accidente y sin que nadie lo supiera.
--
-- Eso NO quita la 077: un candado que existe por accidente no es un candado, y
-- esta migración arregla precisamente el accidente. A partir de hoy `perfiles`
-- sí se puede escribir — y lo único que impide el ascenso es el trigger de la
-- 077, que ahora pasa a hacer el trabajo de verdad.
--
-- El orden importa y por eso esta va DESPUÉS: primero el candado, luego abrir
-- la puerta.
--
-- ---------------------------------------------------------------------------
-- Por qué añadir la columna y no quitar el trigger
-- ---------------------------------------------------------------------------
-- Quitar `perfiles` de la lista habría arreglado el error igual de bien. Pero
-- la columna sirve: la bitácora (051) apunta QUIÉN cambió un rol, y esto dice
-- CUÁNDO se tocó la ficha aunque el cambio no pasara por la bitácora. Y deja
-- las nueve tablas iguales, que es una cosa menos que recordar.
-- ###########################################################################

alter table public.perfiles
  add column if not exists actualizado_en timestamptz not null default now();

comment on column public.perfiles.actualizado_en is
  'Cuándo se tocó esta ficha por última vez. La pone el trigger trg_perfiles_actualizado, que existía desde la 002 apuntando a una columna que no existía: cualquier UPDATE sobre perfiles fallaba con 42703.';

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- No comprueba solo `perfiles`: comprueba **la clase entera de fallo**. Si
-- mañana alguien mete otra tabla en la lista de la 002 y se olvida la columna,
-- la migración que lo haga revienta aquí en vez de dejar esa tabla de solo
-- lectura en silencio durante meses.
do $$
declare
  v_rotas text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_rotas
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'public'
     and p.proname = 'tocar_actualizado_en'
     and not t.tgisinternal
     and not exists (
       select 1
         from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'actualizado_en'
     );

  if v_rotas is not null then
    raise exception
      'Estas tablas llevan el trigger de actualizado_en y NO tienen la columna, así que ningún UPDATE sobre ellas puede funcionar: %',
      v_rotas;
  end if;
end $$;

-- Y que de verdad se pueda escribir. Se toca una ficha y se deja como estaba:
-- lo que se comprueba es que el UPDATE no reviente, no el dato.
do $$
declare
  v_id     uuid;
  v_nombre text;
begin
  select id, nombre into v_id, v_nombre from public.perfiles limit 1;

  if v_id is null then
    raise notice '081: no hay perfiles todavía; la escritura queda sin probar.';
    return;
  end if;

  begin
    update public.perfiles set nombre = v_nombre where id = v_id;
  exception when others then
    raise exception '081: perfiles sigue sin dejarse escribir: %', sqlerrm;
  end;
end $$;
