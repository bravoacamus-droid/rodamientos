-- ###########################################################################
-- 103 · FUERA perfiles.ultimo_acceso: una columna que nadie escribía
-- ###########################################################################
--
-- Revisión por módulos (02-05/10): la columna existía desde la 002 y NINGÚN
-- camino la escribía —ni el login, ni un trigger, ni una función—, así que las
-- seis cuentas salían «último acceso: nunca» aunque entran a diario. Es el
-- patrón de siempre (CLAUDE.md §2, «la pieza existe, el camino no»), al revés:
-- aquí lo que existía era la casilla y no quien la rellenara.
--
-- Supabase Auth SÍ lo apunta (auth.users.last_sign_in_at), y desde el 05/10
-- las pantallas de usuarios y de perfil lo leen de ahí. Luis, 05/10, con la
-- recomendación: una sola fuente de verdad. Escribirla también al entrar
-- sería guardar dos veces lo mismo, con el riesgo de que un día no cuadren.
--
-- Antes de quitarla se comprobó: ninguna vista, función, política ni trigger
-- la nombra; solo las dos consultas del código, que ya no la piden. Los
-- permisos de columna (UPDATE/SELECT para authenticated) se van con ella.
-- ###########################################################################

alter table perfiles drop column if exists ultimo_acceso;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'perfiles' and column_name = 'ultimo_acceso'
  ) then
    raise exception '103: la columna sigue ahí';
  end if;
  -- La tabla se sigue leyendo con lo que piden las pantallas.
  perform id, nombre, email, telefono, cargo, rol, activo from perfiles limit 1;
  raise notice '103: perfiles.ultimo_acceso quitada; el último acceso se lee de Auth.';
end $$;
