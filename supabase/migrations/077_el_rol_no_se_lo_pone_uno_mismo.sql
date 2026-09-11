-- ###########################################################################
-- 077 · EL ROL NO SE LO PONE UNO MISMO
-- ###########################################################################
--
-- Auditoría de seguridad del 11/09. El hallazgo más grave del ERP hasta hoy, y
-- es de una sola línea.
--
-- ---------------------------------------------------------------------------
-- El problema
-- ---------------------------------------------------------------------------
-- La 006 dejó esta política sobre `perfiles`:
--
--   -- Cada quien edita su propia ficha; el rol solo lo cambia admin/gerencia.
--   create policy "perfiles_propio_update" on public.perfiles
--     for update to authenticated
--     using (id = (select auth.uid()) or (select public.es_gerencia()))
--     with check (id = (select auth.uid()) or (select public.es_gerencia()));
--
-- El comentario dice una cosa y la política hace otra. RLS decide QUÉ FILAS se
-- pueden escribir, no QUÉ COLUMNAS: «edita su propia ficha» incluye la columna
-- `rol`. Y el grant de la misma migración es global:
--
--   grant insert, update, delete on all tables in schema public to authenticated;
--
-- O sea que cualquier empleado —ventas, almacén, cobranzas— manda un PATCH a
-- PostgREST sobre su propia fila con `rol = 'gerencia'` y a partir del
-- siguiente request es gerencia en toda la aplicación y en toda la base:
-- ajustes de inventario, anulación de comprobantes, configuración de SUNAT.
-- La anon key viaja en el bundle del navegador por diseño y su JWT está en su
-- cookie: no hace falta tocar el ERP ni conocer nada. Es una petición HTTP.
--
-- Y `cambiarUsuario` —la pantalla de configuración— sí lo comprobaba bien: rol
-- de gerencia, y prohibido cambiarse a uno mismo. Su comentario incluso
-- reconocía el agujero a medias: *«RLS no puede impedirlo: la política de
-- perfiles deja a gerencia escribir cualquier fila, incluida la suya»*. Lo que
-- no decía es que se la deja a TODOS. El caso número veinticinco del patrón de
-- esta casa: la puerta puesta y el cable sin conectar.
--
-- La bitácora (051) ya vigila `perfiles(rol, activo)`, pero la bitácora
-- APUNTA; no impide. Con esto, el ascenso quedaba registrado a nombre de quien
-- lo hizo... y hecho.
--
-- ---------------------------------------------------------------------------
-- Por qué un trigger y no un grant por columnas
-- ---------------------------------------------------------------------------
-- `grant update (col, col, …)` es lo canónico, pero aquí obligaría a listar
-- todas las columnas de `perfiles` menos dos, y cada columna nueva que se
-- añada en el futuro nacería sin permiso y rompería la pantalla de perfil en
-- silencio. Un trigger dice la regla en positivo —«estas dos, solo gerencia»—
-- y sobrevive a las columnas que vengan.
--
-- Además el trigger cubre un caso que el grant no: `service_role` salta RLS y
-- los grants, pero NO los triggers. Un script de mantenimiento que cambie un
-- rol a ciegas también se topa con esto.
--
-- ---------------------------------------------------------------------------
-- Lo que NO cambia
-- ---------------------------------------------------------------------------
-- · Cada quien sigue editando su propia ficha: nombre, teléfono, lo que sea.
-- · Gerencia sigue cambiando roles desde `/configuracion`, que usa la sesión
--   del usuario, así que `es_gerencia()` responde que sí.
-- · El alta de un usuario nuevo va por INSERT (`trg_usuario_nuevo`, 004), y
--   esto es un trigger de UPDATE: no lo toca.
-- ###########################################################################

create or replace function public.tg_perfil_solo_gerencia_cambia_el_rol()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Si no se tocan las dos columnas de mando, no hay nada que discutir.
  if new.rol is not distinct from old.rol
     and new.activo is not distinct from old.activo then
    return new;
  end if;

  if public.es_gerencia() then
    return new;
  end if;

  -- El mensaje se le enseña a una persona: que diga qué hacer, no qué falló.
  raise exception
    'El rol y el estado de un usuario solo los cambia gerencia, desde Configuración.'
    using errcode = '42501';
end $$;

comment on function public.tg_perfil_solo_gerencia_cambia_el_rol() is
  'Impide que alguien se ascienda escribiendo su propia fila de perfiles. RLS '
  'decide filas, no columnas; esto decide las dos columnas que mandan.';

drop trigger if exists tg_perfil_rol on public.perfiles;
create trigger tg_perfil_rol
  before update on public.perfiles
  for each row
  execute function public.tg_perfil_solo_gerencia_cambia_el_rol();

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Que el trigger exista y esté ENCENDIDO. Un `alter table … disable trigger`
-- de paso, en una migración futura, dejaría el agujero abierto otra vez sin
-- que nada fallara.
do $$
declare
  v_estado char;
begin
  select t.tgenabled into v_estado
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'perfiles'
     and t.tgname = 'tg_perfil_rol';

  if v_estado is null then
    raise exception
      'Falta tg_perfil_rol en perfiles: cualquier usuario podría ascenderse a gerencia';
  end if;

  if v_estado = 'D' then
    raise exception
      'tg_perfil_rol está desactivado: cualquier usuario podría ascenderse a gerencia';
  end if;
end $$;
