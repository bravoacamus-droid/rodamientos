-- ###########################################################################
-- 185 · «USUARIOS» Y «ROLES Y PERMISOS» EN LA MATRIZ, SOLO CON «VER»
-- ###########################################################################
--
-- Luis, 02/11, tras la 184: «¿qué más falta en roles? configuración, usuarios
-- y roles». Las dos pantallas iban fijas en el código para Gerencia y
-- Administración, sin fila en la matriz: Willy no podía decidir quién las ve.
--
-- Solo «Ver», a propósito. Crear usuarios, cambiar contraseñas y cambiar
-- permisos sigue siendo SOLO de Gerencia, fijo en las acciones y en la base:
-- un rol que pudiera cambiar permisos se daría todo a sí mismo, y uno que
-- pudiera dar de alta crearía a alguien de Gerencia. Eso no se abre desde una
-- casilla. Luis: «correcto, así lo quiere».
--
-- Nadie pierde nada: Administración, que ya las veía, recibe «Ver» en las dos.
-- ###########################################################################

insert into public.modulos (clave, nombre, ayuda, orden, acciones, tablas) values
  ('usuarios', 'Usuarios',
   'Ver quién entra al sistema y con qué rol. Dar de alta, cambiar contraseñas y editar: solo Gerencia.',
   146, array['ver'], array[]::text[]),
  ('roles', 'Roles y permisos',
   'Ver qué puede hacer cada rol. Cambiar los permisos: solo Gerencia.',
   147, array['ver'], array[]::text[])
on conflict (clave) do nothing;

insert into public.permisos (rol, modulo, accion) values
  ('admin', 'usuarios', 'ver'),
  ('admin', 'roles', 'ver')
on conflict do nothing;

-- Centinela: Administración las ve por la matriz, y sigue sin poder escribir.
do $$
declare
  v_admin uuid := (select id from perfiles where rol = 'admin' and activo limit 1);
  v_perm  jsonb;
begin
  if v_admin is null then return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
    v_perm := public.mis_permisos() -> 'permisos';
    if not (v_perm ? 'usuarios:ver' and v_perm ? 'roles:ver') then
      raise exception '185: admin no ve usuarios y roles: %', v_perm;
    end if;
    if public.puede_escribir('permisos') then
      raise exception '185: admin podría escribir permisos';
    end if;
    raise exception '__185_DESHACER__';
  exception when others then
    if sqlerrm <> '__185_DESHACER__' then raise; end if;
  end;
end $$;
