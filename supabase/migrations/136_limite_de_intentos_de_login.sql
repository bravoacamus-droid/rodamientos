-- ###########################################################################
-- 136 · LÍMITE DE INTENTOS DE INICIO DE SESIÓN
-- ###########################################################################
--
-- Revisión de producción del 15/10. El login va por Server Action, así que
-- Supabase ve TODOS los intentos desde la IP del servidor: su límite por IP
-- se reparte entre los seis empleados (un script los deja fuera a todos) y
-- no hay ninguno por cuenta. Luis: *«que login funcione correctamente…
-- que no haya problemas de seguridad»*.
--
--   · `intentos_login`: cada intento fallido, por correo y por IP real
--     (`x-forwarded-for`). Sin políticas: solo la toca el servidor con la
--     clave de servicio.
--   · `login_espera(correo, ip)`: cuántos segundos faltan para poder volver
--     a probar. 5 fallos de un correo en 15 minutos, o 30 de una IP, cierran
--     la puerta hasta que el más viejo de la ventana caduque.
--   · `login_registrar(correo, ip, exito)`: apunta el fallo; un acierto
--     borra los fallos de ese correo.
--
-- Y de paso, `perfiles_lectura` deja de ser `using (true)`: un usuario
-- desactivado (sin rol) solo lee su propia fila, no los correos y teléfonos
-- de los demás.
-- ###########################################################################

create table if not exists intentos_login (
  id        bigserial primary key,
  correo    text not null,
  ip        text,
  creado_en timestamptz not null default now()
);
create index if not exists ix_intentos_login_correo on intentos_login (correo, creado_en desc);
create index if not exists ix_intentos_login_ip on intentos_login (ip, creado_en desc);

alter table intentos_login enable row level security;
revoke all on intentos_login from anon, authenticated;
revoke all on sequence intentos_login_id_seq from anon, authenticated;

comment on table intentos_login is
  'Inicios de sesión fallidos (136), para el límite por correo y por IP. Solo los escribe el servidor.';

create or replace function public.login_espera(p_correo text, p_ip text)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ventana constant interval := interval '15 minutes';
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_espera  int := 0;
  v_hasta   timestamptz;
begin
  -- El 5.º fallo más reciente del correo: hasta que salga de la ventana.
  select creado_en + v_ventana into v_hasta
    from intentos_login
   where correo = v_correo and creado_en > now() - v_ventana
   order by creado_en desc
   offset 4 limit 1;
  if v_hasta is not null then
    v_espera := greatest(v_espera, ceil(extract(epoch from v_hasta - now()))::int);
  end if;

  if nullif(p_ip, '') is not null then
    select creado_en + v_ventana into v_hasta
      from intentos_login
     where ip = p_ip and creado_en > now() - v_ventana
     order by creado_en desc
     offset 29 limit 1;
    if v_hasta is not null then
      v_espera := greatest(v_espera, ceil(extract(epoch from v_hasta - now()))::int);
    end if;
  end if;

  return greatest(v_espera, 0);
end $$;

create or replace function public.login_registrar(p_correo text, p_ip text, p_exito boolean)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_correo text := lower(trim(coalesce(p_correo, '')));
begin
  if p_exito then
    delete from intentos_login where correo = v_correo;
  else
    insert into intentos_login (correo, ip) values (left(v_correo, 200), left(nullif(p_ip, ''), 100));
  end if;
  -- Limpieza barata: lo de más de un día ya no cuenta para nada.
  delete from intentos_login where creado_en < now() - interval '1 day';
end $$;

revoke all on function public.login_espera(text, text) from public, anon, authenticated;
revoke all on function public.login_registrar(text, text, boolean) from public, anon, authenticated;
grant execute on function public.login_espera(text, text) to service_role;
grant execute on function public.login_registrar(text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Perfiles: los desactivados solo se leen a sí mismos.
-- ---------------------------------------------------------------------------
drop policy if exists perfiles_lectura on perfiles;
create policy perfiles_lectura on perfiles for select to authenticated
  using ((select public.mi_rol()) is not null or id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Centinela: lo EJECUTA y lo deshace.
-- ---------------------------------------------------------------------------
do $$
declare
  i int;
begin
  begin
    for i in 1..4 loop
      perform public.login_registrar('Centinela@Prueba.invalid ', '203.0.113.9', false);
    end loop;
    if public.login_espera('centinela@prueba.invalid', '198.51.100.1') <> 0 then
      raise exception '136: cerró la puerta con 4 fallos';
    end if;
    perform public.login_registrar('centinela@prueba.invalid', '203.0.113.9', false);
    if public.login_espera(' CENTINELA@prueba.invalid', '198.51.100.1') not between 890 and 900 then
      raise exception '136: con 5 fallos no espera ~15 min (%)', public.login_espera('centinela@prueba.invalid', null);
    end if;
    perform public.login_registrar('centinela@prueba.invalid', '203.0.113.9', true);
    if public.login_espera('centinela@prueba.invalid', null) <> 0 then
      raise exception '136: el acierto no limpió los fallos';
    end if;
    for i in 1..30 loop
      perform public.login_registrar('otro' || i || '@prueba.invalid', '203.0.113.9', false);
    end loop;
    if public.login_espera('nuevo@prueba.invalid', '203.0.113.9') = 0 then
      raise exception '136: 30 fallos de una IP no la cierran';
    end if;
    raise exception '__136_DESHACER__';
  exception when others then
    if sqlerrm <> '__136_DESHACER__' then raise; end if;
  end;
  raise notice '136: límite por correo (5) y por IP (30) en 15 min; el acierto limpia; deshecho limpio.';
end $$;
