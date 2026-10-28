-- ###########################################################################
-- 171 · ENTRAR CON UN NOMBRE DE USUARIO, ADEMÁS DEL CORREO
-- ###########################################################################
--
-- Luis, 29/10: *«aparte de ingresar por correo también pueda ingresar por
-- usuario. Cada uno puede cambiar su usuario y contraseña, menos el correo:
-- eso solo lo hace gerencia. Déjalo ahí para que gerencia pueda crear su
-- usuario y ya.»*
--
-- ---------------------------------------------------------------------------
-- El problema
-- ---------------------------------------------------------------------------
-- Supabase Auth solo sabe entrar con correo y contraseña. Un «usuario» es,
-- para él, otra forma de escribir el correo: el servidor tiene que traducir
-- «wfernandez» a «wfernandez@…» antes de llamar a `signInWithPassword`.
--
-- Esa traducción es justo lo que no puede quedar a la vista. Una función que
-- cualquiera pueda llamar con «¿de quién es este usuario?» es un enumerador
-- de cuentas: con la anon key —que va en el navegador por diseño— se sacaría
-- el correo de cada empleado probando nombres. Por eso:
--
--   · `correo_de_usuario(usuario)` es `security definer` y SOLO la ejecuta
--     `service_role`. Ni `anon` ni `authenticated`. La llama la Server Action
--     del login con el cliente admin, y su respuesta no sale nunca al
--     navegador: si no existe, el login contesta lo mismo que con una
--     contraseña mala.
--   · El correo lo saca de `auth.users` y no de `perfiles.email`: es el que
--     de verdad abre la puerta, y el de `perfiles` es una copia.
--
-- ---------------------------------------------------------------------------
-- Las reglas del usuario
-- ---------------------------------------------------------------------------
--   · De 3 a 30 caracteres, solo `a-z 0-9 . _ -`, en minúsculas. Sin «@»: un
--     usuario no puede parecer un correo, y así el login sabe qué es cada
--     cosa (con «@» es correo, sin «@» es usuario) y nadie puede ponerse como
--     usuario el correo de otro.
--   · Único sin distinguir mayúsculas. Se guarda en minúsculas igualmente: el
--     disparador lo normaliza para que un PATCH a mano no meta «WFernandez».
--   · Opcional. Quien no tenga sigue entrando con su correo.
--
-- ---------------------------------------------------------------------------
-- Quién cambia qué
-- ---------------------------------------------------------------------------
--   · Su propio usuario lo cambia cada uno: la política de la 144 ya le deja
--     escribir su fila, y la 077 le sigue impidiendo tocar `rol` y `activo`.
--   · El CORREO no. Hasta hoy nada impedía que un empleado se cambiara
--     `perfiles.email` con un PATCH (RLS decide filas, no columnas: §AK.3).
--     No le abría ninguna puerta —Auth no lee esa columna—, pero la pantalla
--     de Usuarios enseñaba un correo con el que no se entra. Desde hoy lo
--     cambia solo el servidor, que es lo que hace «Editar datos» de gerencia
--     con la clave de servicio, y a la vez en Auth y aquí.
--   · La bitácora (051) apunta también el usuario y el correo, no solo el rol.
-- ###########################################################################

alter table public.perfiles
  add column if not exists usuario text;

alter table public.perfiles
  drop constraint if exists perfiles_usuario_formato;
alter table public.perfiles
  add constraint perfiles_usuario_formato
  check (usuario is null or usuario ~ '^[a-z0-9._-]{3,30}$');

create unique index if not exists ux_perfiles_usuario
  on public.perfiles (lower(usuario)) where usuario is not null;

comment on column public.perfiles.usuario is
  'Nombre con el que también se entra, además del correo (171). De 3 a 30 caracteres, a-z 0-9 . _ -, en minúsculas y sin «@». Lo cambia cada uno en /perfil; gerencia, en Usuarios.';

-- ---------------------------------------------------------------------------
-- Disparador: normaliza el usuario y guarda el correo
-- ---------------------------------------------------------------------------
create or replace function public.tg_perfil_usuario_y_correo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- «  WFernandez » y «wfernandez» son el mismo: se guarda el segundo. Vacío
  -- es «no tengo».
  new.usuario := nullif(lower(btrim(new.usuario)), '');

  -- El correo, solo desde el servidor. Una sesión de empleado —incluida la de
  -- gerencia, que lo cambia desde «Editar datos» por el servidor— no lo toca
  -- con un PATCH: tiene que cambiar a la vez en Auth, y eso no lo hace el
  -- navegador.
  if tg_op = 'UPDATE'
     and new.email is distinct from old.email
     and coalesce(auth.role(), '') = 'authenticated' then
    raise exception
      'El correo con el que se entra lo cambia gerencia, desde Configuración › Usuarios.'
      using errcode = '42501';
  end if;

  return new;
end $$;

comment on function public.tg_perfil_usuario_y_correo() is
  'Pone el usuario en minúsculas y no deja que una sesión cambie el correo de perfiles (171). El correo lo cambia el servidor, a la vez en Auth.';

drop trigger if exists tg_perfil_usuario on public.perfiles;
create trigger tg_perfil_usuario
  before insert or update on public.perfiles
  for each row execute function public.tg_perfil_usuario_y_correo();

-- La bitácora: quién se puso qué usuario, y quién cambió un correo.
drop trigger if exists tg_bitacora_perfiles on public.perfiles;
create trigger tg_bitacora_perfiles
  after insert or delete or update on public.perfiles
  for each row execute function public.tg_bitacora('rol', 'activo', 'usuario', 'email');

-- ---------------------------------------------------------------------------
-- De usuario a correo. Solo para el servidor.
-- ---------------------------------------------------------------------------
create or replace function public.correo_de_usuario(p_usuario text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select u.email::text
    from public.perfiles p
    join auth.users u on u.id = p.id
   where p.usuario is not null
     and lower(p.usuario) = lower(btrim(coalesce(p_usuario, '')))
   limit 1
$$;

comment on function public.correo_de_usuario(text) is
  'El correo de Auth de quien tiene ese usuario, o null (171). SOLO service_role: abierta a anon o authenticated sería un enumerador de cuentas.';

revoke all on function public.correo_de_usuario(text) from public, anon, authenticated;
grant execute on function public.correo_de_usuario(text) to service_role;

-- ###########################################################################
-- Centinela: lo EJECUTA y lo deshace.
-- ###########################################################################
-- Pone un usuario de verdad, prueba el formato y la unicidad, y comprueba
-- como anon, como authenticated y como un empleado de ventas lo que cada uno
-- puede y no puede hacer.
do $$
declare
  v_ven   uuid;
  v_otro  uuid;
  v_correo text;
  v_guardado text;
  n int;
  v_malo text;
begin
  select id into v_ven  from perfiles where rol = 'ventas' and activo order by id limit 1;
  select id into v_otro from perfiles where id <> v_ven and activo order by id limit 1;
  if v_ven is null or v_otro is null then
    raise notice '171: sin dos usuarios activos; centinela omitido.';
    return;
  end if;
  select email into v_correo from auth.users where id = v_ven;

  begin
    -- Nadie la ejecuta salvo el servidor.
    if has_function_privilege('anon', 'public.correo_de_usuario(text)', 'execute') then
      raise exception '171: anon puede llamar a correo_de_usuario';
    end if;
    if has_function_privilege('authenticated', 'public.correo_de_usuario(text)', 'execute') then
      raise exception '171: authenticated puede llamar a correo_de_usuario';
    end if;
    if not has_function_privilege('service_role', 'public.correo_de_usuario(text)', 'execute') then
      raise exception '171: service_role no puede llamar a correo_de_usuario';
    end if;

    -- Se normaliza y se encuentra.
    update perfiles set usuario = '  Centinela.171 ' where id = v_ven;
    select usuario into v_guardado from perfiles where id = v_ven;
    if v_guardado is distinct from 'centinela.171' then
      raise exception '171: el usuario se guardó como «%»', v_guardado;
    end if;
    if public.correo_de_usuario('CENTINELA.171') is distinct from v_correo then
      raise exception '171: correo_de_usuario no devolvió el correo de Auth';
    end if;
    if public.correo_de_usuario('no.existe.171') is not null then
      raise exception '171: correo_de_usuario devolvió algo para un usuario que no existe';
    end if;

    -- Único sin distinguir mayúsculas.
    begin
      update perfiles set usuario = 'CENTINELA.171' where id = v_otro;
      raise exception '171: dos personas con el mismo usuario';
    exception when unique_violation then null;
    end;

    -- Formato: corto, largo, con espacio, con tilde y con «@» (el correo de otro).
    foreach v_malo in array array['ab', repeat('a', 31), 'con espacio', 'josé', v_correo] loop
      begin
        update perfiles set usuario = v_malo where id = v_otro;
        raise exception '171: aceptó el usuario «%»', v_malo;
      exception when check_violation then null;
      end;
    end loop;

    -- Como anon y como authenticated, la función no se deja llamar.
    perform set_config('role', 'anon', true);
    begin
      perform public.correo_de_usuario('centinela.171');
      raise exception '171: anon llamó a correo_de_usuario';
    exception when insufficient_privilege then null;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_ven, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.correo_de_usuario('centinela.171');
      raise exception '171: authenticated llamó a correo_de_usuario';
    exception when insufficient_privilege then null;
    end;

    -- Como ventas: su usuario sí; su correo, su rol y el usuario de otro, no.
    update perfiles set usuario = 'ventas.centinela.171' where id = v_ven;
    get diagnostics n = row_count;
    if n <> 1 then raise exception '171: ventas no pudo cambiar su propio usuario'; end if;

    begin
      update perfiles set email = 'otro.171@ejemplo.invalid' where id = v_ven;
      raise exception '171: ventas se cambió el correo';
    exception when insufficient_privilege then null;
    end;
    begin
      update perfiles set rol = 'gerencia' where id = v_ven;
      raise exception '171: ventas se ascendió';
    exception when insufficient_privilege then null;
    end;
    update perfiles set usuario = 'robado.171' where id = v_otro;
    get diagnostics n = row_count;
    if n > 0 then raise exception '171: ventas cambió el usuario de otra persona'; end if;
    perform set_config('role', 'postgres', true);

    -- Y el servidor (sin sesión de empleado) sí cambia un correo.
    perform set_config('request.jwt.claims', '', true);
    update perfiles set email = 'centinela.171@ejemplo.invalid' where id = v_ven;
    get diagnostics n = row_count;
    if n <> 1 then raise exception '171: el servidor no pudo cambiar un correo'; end if;

    raise exception '__171_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__171_DESHACER__' then raise; end if;
  end;
  raise notice '171: entrar con usuario aplicado.';
end $$;
