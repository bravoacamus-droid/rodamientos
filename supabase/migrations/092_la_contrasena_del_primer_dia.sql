-- ###########################################################################
-- 092 · LA CONTRASEÑA DEL PRIMER DÍA
-- ###########################################################################
--
-- Luis, 24/09, sobre el alta de usuarios: *«eso de las contraseñas ps se crea
-- una automáticamente y después ya cuando inician lo primero q le aparezca
-- como aviso o directo nomás antes de q vean todo pues le salga q tiene q
-- cambiar su contraseña antes de tocar cualquier cosa»*.
--
-- O sea: quien crea la cuenta no elige la contraseña, la recibe hecha y se la
-- pasa al empleado; y el empleado no ve el ERP hasta cambiarla.
--
-- Esta migración pone la marca que lo hace posible. La pantalla que la
-- obedece va en el mismo commit.
--
-- ---------------------------------------------------------------------------
-- Por qué las SEIS cuentas de hoy nacen SIN la marca
-- ---------------------------------------------------------------------------
-- Las seis se sembraron con `RODATECH_DEV_PASSWORD`, la misma para todas, y
-- el atajo de desarrollo de `/login` entra justamente con esa contraseña. Si
-- la marca se pusiera a `true` en todas, el primero que entrase tendría que
-- cambiarla — y al cambiarla **el atajo dejaría de funcionar**, que es la
-- única forma cómoda que hay hoy de probar el ERP.
--
-- Así que la columna se añade con default `false` (y eso rellena las filas que
-- ya existen), y DESPUÉS se le cambia el default a `true`. Resultado: las seis
-- de hoy siguen como están, y toda cuenta creada a partir de ahora nace
-- obligada a cambiarla.
--
-- **Voltear las seis es un paso de ENTREGA, no de ahora**, y va junto con
-- quitar `RODATECH_ATAJOS`, porque son el mismo problema:
--
--     update perfiles set debe_cambiar_contrasena = true;
--
-- ###########################################################################

alter table public.perfiles
  add column if not exists debe_cambiar_contrasena boolean not null default false;

alter table public.perfiles
  alter column debe_cambiar_contrasena set default true;

comment on column public.perfiles.debe_cambiar_contrasena is
  'La cuenta todavía usa la contraseña con la que se creó. Mientras esté en true el ERP no deja pasar de /perfil/contrasena. La limpia el servidor tras comprobar el cambio, nunca el navegador (092).';

-- ###########################################################################
-- Que la marca no se pueda quitar sin cambiar la contraseña
-- ###########################################################################
--
-- Sin esto la marca sería un adorno: la fila de `perfiles` es del propio
-- usuario y RLS le deja escribirla, así que bastaría un PATCH por REST
-- poniéndola en false para entrar sin tocar la contraseña.
--
-- El trigger deja que la quite cualquiera MENOS una sesión de empleado. La
-- Server Action que cambia la contraseña la limpia con `service_role`, y solo
-- después de que Supabase Auth haya confirmado el cambio — que es el único
-- momento en que la marca puede dejar de ser cierta.
--
-- Por qué un trigger y no una política: RLS decide FILAS, no COLUMNAS. Es
-- exactamente lo que se aprendió el 11/09 con el rol (§AK.3, corregido en
-- §AL.3), y la solución es la misma que la 077: un trigger, que además
-- `service_role` no se salta — por eso hay que dejarlo pasar a mano.
--
-- Hasta dónde llega, dicho claro: esto impide el atajo tonto y el accidente.
-- No convierte la pantalla en una frontera de seguridad — quien llega aquí ya
-- tiene credenciales válidas y sesión abierta. Lo que de verdad protege es que
-- la contraseña inicial sea distinta para cada uno y solo la conozca él.
create or replace function public.tg_perfil_marca_de_contrasena()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.debe_cambiar_contrasena is not distinct from old.debe_cambiar_contrasena then
    return new;
  end if;

  -- Ponerla es libre: gerencia puede obligar a alguien a cambiarla.
  if new.debe_cambiar_contrasena then
    return new;
  end if;

  -- Quitarla, solo desde el servidor. `auth.role()` es 'authenticated' en una
  -- sesión de empleado; con service_role, en una migración o en un script de
  -- mantenimiento, es otra cosa o es null.
  if coalesce(auth.role(), '') = 'authenticated' then
    raise exception
      'La marca de cambiar contraseña la quita el servidor al confirmar el cambio, no el navegador'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists tg_perfil_contrasena on public.perfiles;
create trigger tg_perfil_contrasena
  before update on public.perfiles
  for each row execute function public.tg_perfil_marca_de_contrasena();

-- ###########################################################################
-- Centinela · INTENTA QUITARLA COMO EMPLEADO, Y COMPRUEBA QUE NO LE DEJAN
-- ###########################################################################
-- Se ejecuta de verdad y se deshace, que es la regla que salió de la 091: un
-- centinela que solo mira el texto no distingue un trigger que existe de un
-- trigger que funciona. La 071 se aplicó «bien» durante seis días.
do $$
declare
  v_perfil uuid;
  v_dejo   boolean := false;   -- ¿coló el UPDATE del empleado?
  v_limpio boolean := false;   -- ¿dejó pasar al servidor?
begin
  select id into v_perfil from perfiles where activo limit 1;
  if v_perfil is null then
    raise notice '092: no hay perfiles; el centinela no corre.';
    return;
  end if;

  begin
    update perfiles set debe_cambiar_contrasena = true where id = v_perfil;

    -- 1 · Como empleado: tiene que rebotar.
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);
    begin
      update perfiles set debe_cambiar_contrasena = false where id = v_perfil;
      v_dejo := true;
    exception when insufficient_privilege then
      v_dejo := false;
    end;

    -- 2 · Sin sesión de empleado —como la Server Action con service_role—:
    --     tiene que pasar. Un candado que tampoco deja trabajar al servidor
    --     dejaría a todo el mundo encerrado en la pantalla de la contraseña.
    set local request.jwt.claims = '';
    update perfiles set debe_cambiar_contrasena = false where id = v_perfil;
    select not debe_cambiar_contrasena into v_limpio from perfiles where id = v_perfil;

    raise exception using message = '__092_DESHACER__';
  exception when others then
    if sqlerrm <> '__092_DESHACER__' then
      raise exception '092: el centinela se rompió: %', sqlerrm;
    end if;
  end;

  if v_dejo then
    raise exception '092: un empleado pudo quitarse la marca por su cuenta. El trigger no sirve.';
  end if;
  if not v_limpio then
    raise exception '092: el servidor TAMPOCO pudo quitarla; nadie podría salir de la pantalla.';
  end if;

  raise notice '092: la marca solo la quita el servidor. Comprobado ejecutando.';
end $$;
