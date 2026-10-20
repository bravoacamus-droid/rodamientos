-- ###########################################################################
-- 144 · LO QUE ENCONTRÓ LA AUDITORÍA DE LA 143
-- ###########################################################################
--
-- La auditoría de seguridad de los roles y permisos (20/10) encontró cinco
-- cosas. La primera es anterior a la 143 y la dejaba sin efecto:
--
-- 1. **Administración podía hacerse gerencia.** `es_gerencia()` es
--    `tiene_rol('gerencia','admin')`, y de ella colgaban la política de
--    `perfiles` y el trigger de la 077 que vigila el rol. Un usuario de
--    administración mandaba un PATCH sobre su propia fila con
--    `rol = 'gerencia'`, la política le dejaba (su fila) y el trigger también
--    (para él `es_gerencia()` es verdad). Con eso pasaba `_solo_gerencia()` y
--    cambiaba permisos, roles y usuarios — justo lo que la 143 dice que es
--    solo de gerencia. Ahora el rol, el estado y las filas ajenas de
--    `perfiles` los toca solo `mi_rol() = 'gerencia'`.
--
-- 2. **Las funciones que eliminan o anulan preguntaban «¿escribe?»**, no
--    «¿elimina?»: quitarle Eliminar a un rol en la pantalla no le impedía
--    llamar a `eliminar_pedido` o `anular_compra` por RPC. Ahora preguntan
--    `puede(modulo, 'eliminar')`. Y las tablas con dinero —`pagos`, las
--    constancias de retención y sus archivos— piden «eliminar» para borrar:
--    borrar un cobro devuelve la factura a pendiente.
--
--    Las demás tablas siguen con escribir = crear, editar o eliminar (143):
--    corregir una cotización borra líneas, y eso es editar.
--
-- 3. `fallos` estaba abierto a todos por estar en las tablas «de todos»; antes
--    de la 143 era de gerencia y administración. Pasa a «Qué ha pasado», con
--    una acción «editar» (marcarlo revisado) que solo tiene administración.
--
-- 4. `roles`, `modulos` y `permisos` conservaban INSERT/UPDATE/DELETE para
--    `authenticated` por los privilegios por defecto. Hoy RLS lo para (solo
--    hay políticas de lectura), pero la primera política `for all` que
--    alguien añada abriría la escalada entera. Se quitan.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1 · perfiles: gerencia de verdad, no «gerencia o administración»
-- ---------------------------------------------------------------------------
drop policy if exists perfiles_admin_delete on perfiles;
drop policy if exists perfiles_admin_insert on perfiles;
drop policy if exists perfiles_propio_update on perfiles;
create policy perfiles_admin_delete on perfiles for delete to authenticated
  using ((select public.mi_rol()) = 'gerencia');
create policy perfiles_admin_insert on perfiles for insert to authenticated
  with check ((select public.mi_rol()) = 'gerencia');
create policy perfiles_propio_update on perfiles for update to authenticated
  using (id = (select auth.uid()) or (select public.mi_rol()) = 'gerencia')
  with check (id = (select auth.uid()) or (select public.mi_rol()) = 'gerencia');

-- ---------------------------------------------------------------------------
-- 2 · Reescribir las comprobaciones sobre la definición viva
-- ---------------------------------------------------------------------------
do $$
declare
  r record; v_def text; v_nueva text;
begin
  for r in
    select * from (values
      ('public.tg_perfil_solo_gerencia_cambia_el_rol()', 'if public.es_gerencia() then',
                                                         'if public.mi_rol() = ''gerencia'' then'),
      ('public.eliminar_pedido(uuid)',          'if not public.puede_escribir(''cotizaciones'') then',
                                                'if not public.puede(''cotizaciones'',''eliminar'') then'),
      ('public.anular_compra(uuid, text)',      'if not public.puede_escribir(''compras'') then',
                                                'if not public.puede(''compras'',''eliminar'') then'),
      ('public.eliminar_zona(uuid)',            'if not public.puede_escribir(''clientes'') then',
                                                'if not public.puede(''clientes'',''eliminar'') then'),
      ('public.eliminar_rubro(uuid)',           'if not public.puede_escribir(''clientes'') then',
                                                'if not public.puede(''clientes'',''eliminar'') then')
    ) t(fn, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_nueva := replace(v_def, r.viejo, r.nuevo);
    if v_nueva = v_def then raise exception '144: no encontré la comprobación de %', r.fn; end if;
    execute v_nueva;
  end loop;
end $$;

-- Borrar dinero pide «eliminar» de cobranzas.
drop policy if exists escritura_delete on pagos;
create policy escritura_delete on pagos for delete to authenticated
  using ((select public.puede('cobranzas', 'eliminar')));
drop policy if exists cr_delete on comprobante_retenciones;
create policy cr_delete on comprobante_retenciones for delete to authenticated
  using ((select public.puede('cobranzas', 'eliminar')));
drop policy if exists cr_borrado on storage.objects;
create policy cr_borrado on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes-retencion' and (select public.puede('cobranzas', 'eliminar')));
drop policy if exists voucher_borrado on storage.objects;
create policy voucher_borrado on storage.objects for delete to authenticated
  using (bucket_id = 'vouchers-cobro' and (select public.puede('cobranzas', 'eliminar')));

-- Y borrar un cliente o un proveedor entero, «eliminar» de su módulo.
drop policy if exists escritura_delete on clientes;
create policy escritura_delete on clientes for delete to authenticated
  using ((select public.puede('clientes', 'eliminar')));
drop policy if exists escritura_delete on proveedores;
create policy escritura_delete on proveedores for delete to authenticated
  using ((select public.puede('proveedores', 'eliminar')));

-- ---------------------------------------------------------------------------
-- 3 · fallos: de «Qué ha pasado», y marcarlo revisado es editar
-- ---------------------------------------------------------------------------
create or replace function public._tabla_de_todos(p_tabla text)
returns boolean language sql immutable as $$
  select p_tabla = any (array['alertas','actividad','consultas_cache','consultas_cuota','consultas_log'])
$$;

update modulos set acciones = array['ver','editar'], tablas = array['fallos'],
       ayuda = 'La bitácora de lo que se hizo en el sistema. Editar es marcar un fallo como revisado.'
 where clave = 'bitacora';
insert into permisos (rol, modulo, accion) values ('admin', 'bitacora', 'editar') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4 · Las tablas de permisos se escriben solo por sus funciones
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on roles, modulos, permisos from authenticated;

-- ---------------------------------------------------------------------------
-- Centinela: como ADMIN intenta ascenderse y borrar un cobro; como VENTAS
-- intenta eliminar un pedido. Todo debe rebotar. Deshace.
-- ---------------------------------------------------------------------------
do $$
declare v_adm uuid; v_ven uuid; n int;
begin
  select id into v_adm from perfiles where rol = 'admin' and activo limit 1;
  select id into v_ven from perfiles where rol = 'ventas' and activo limit 1;
  if v_adm is null or v_ven is null then raise notice '144: sin admin o ventas; centinela omitido.'; return; end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      update perfiles set rol = 'gerencia' where id = v_adm;
      raise exception '144: administración se ascendió';
    exception when insufficient_privilege then null;
    end;
    update perfiles set activo = false where rol = 'gerencia';
    get diagnostics n = row_count;
    if n > 0 then raise exception '144: administración desactivó a gerencia'; end if;
    perform set_config('role', 'postgres', true);

    -- Ventas: le quitamos «eliminar» y debe rebotar en la función.
    delete from permisos where rol = 'ventas' and modulo = 'cotizaciones' and accion = 'eliminar';
    perform set_config('request.jwt.claims', json_build_object('sub', v_ven, 'role', 'authenticated')::text, true);
    begin
      perform public.eliminar_pedido(gen_random_uuid());
      raise exception '144: ventas eliminó sin permiso';
    exception when insufficient_privilege then null;
              when others then
                if sqlerrm like '144:%' then raise; end if;
                -- Cualquier otro error (p. ej. «no existe») es que pasó la puerta.
                if sqlstate <> '42501' then raise exception '144: eliminar_pedido no preguntó «eliminar»: %', sqlerrm; end if;
    end;
    if public.puede_escribir('fallos') then raise exception '144: ventas escribe fallos'; end if;
    raise exception '__144_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__144_DESHACER__' then raise; end if;
  end;
  raise notice '144: auditoría aplicada.';
end $$;
