-- ###########################################################################
-- 184 · EL TABLERO Y «SUNAT Y NUMERACIÓN» EN LA MATRIZ DE PERMISOS
-- ###########################################################################
--
-- Luis, 02/11: «en los roles falta poner ahí si [el] rol puede ver todos los
-- reportes y el tablero… [Willy] me dijo admin puede ver todos los demás
-- menos reporte y la tabla [el tablero], y también la configuración de la
-- empresa; lo demás sí puede verlo».
--
-- Dos cosas no se podían decir en «Roles y permisos»:
--
--   · El TABLERO no era un módulo: se abría siempre, para todos.
--   · «Datos de la empresa» y las SERIES iban en el mismo módulo
--     (`configuracion`). Quitarle a Administración los datos de la empresa le
--     quitaba también editar las series de «SUNAT y numeración», que Willy sí
--     quiere que vea. Se separan: `numeracion` se queda las series y los
--     motivos; `configuracion` los datos fiscales y las cuentas para cobrar.
--
-- Nadie pierde nada al aplicarla: quien tenía `configuracion` recibe lo mismo
-- en `numeracion`, y todos los roles reciben «Ver» en el tablero, que es lo
-- que tenían de hecho. Lo de Administración se cambia aparte (son datos de
-- Willy, no estructura) o desde la pantalla.
-- ###########################################################################

insert into public.modulos (clave, nombre, ayuda, orden, acciones, tablas) values
  ('tablero', 'Tablero',
   'La portada: cómo va el negocio, lo vendido y lo que hay que atender.',
   5, array['ver'], array[]::text[]),
  ('numeracion', 'SUNAT y numeración',
   'Las series de los documentos y sus números. El certificado y la clave SOL los guarda solo Gerencia.',
   145, array['ver','editar'], array['series_documento','motivos_traslado','motivos_nota'])
on conflict (clave) do nothing;

update public.modulos
   set nombre = 'Datos de la empresa',
       ayuda  = 'Datos fiscales, logo y cuentas para cobrar.',
       tablas = array['empresa','cuentas_bancarias']
 where clave = 'configuracion';

update public.modulos
   set ayuda = 'Todos los reportes: ventas por cliente, cotizado y ganado, lo facturado, lo comprado y el Excel para el contador.'
 where clave = 'reportes';

-- Lo que había, se conserva.
insert into public.permisos (rol, modulo, accion)
select rol, 'numeracion', accion from public.permisos
 where modulo = 'configuracion' and accion in ('ver','editar')
on conflict do nothing;

insert into public.permisos (rol, modulo, accion)
select clave, 'tablero', 'ver' from public.roles where clave <> 'gerencia'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Centinela: con el rol de Administración, ejecuta lo que decide la base
-- ---------------------------------------------------------------------------
do $$
declare
  v_perm jsonb;
begin
  if (select tablas from modulos where clave = 'numeracion') @> array['series_documento'] is not true
     or (select tablas from modulos where clave = 'configuracion') @> array['series_documento'] then
    raise exception '184: las series no pasaron a «numeracion»';
  end if;

  begin
    -- Admin sin «Datos de la empresa»: sigue pudiendo escribir series, no la empresa.
    delete from permisos where rol = 'admin' and modulo = 'configuracion';
    insert into permisos values ('admin', 'numeracion', 'editar') on conflict do nothing;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select id from perfiles where rol = 'admin' and activo limit 1))::text, true);
    if (select id from perfiles where rol = 'admin' and activo limit 1) is null then
      raise exception '__184_DESHACER__';
    end if;
    if not public.puede_escribir('series_documento') then
      raise exception '184: admin perdió las series';
    end if;
    if public.puede_escribir('empresa') then
      raise exception '184: admin sigue escribiendo la empresa';
    end if;
    v_perm := public.mis_permisos() -> 'permisos';
    if not v_perm ? 'tablero:ver' then
      raise exception '184: el tablero no sale en mis_permisos: %', v_perm;
    end if;
    raise exception '__184_DESHACER__';
  exception when others then
    if sqlerrm <> '__184_DESHACER__' then raise; end if;
  end;
end $$;
