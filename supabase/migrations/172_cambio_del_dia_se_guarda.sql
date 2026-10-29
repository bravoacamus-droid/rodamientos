-- 172 · El tipo de cambio que se trae de SUNAT se guarda para siempre
--
-- El problema. Desde la 149, `tipos_cambio_sunat` tiene el cambio de cada día
-- (783 días cargados el 23/10), pero solo lo escribía `emitir_comprobante`.
-- Lo que traían la cotización, la compra o la cobranza se quedaba en la caché
-- del paquete de consultas, que guarda «hoy» y «la fecha X» como dos claves
-- distintas: el 27/10 se pidió dos veces el mismo día a Decolecta.
--
-- Luis, 29/10: «si hace una petición pero no guardó, que se guarde en caché,
-- así trae sin hacer una petición nueva».
--
-- Ahora `consultarTipoCambio` busca primero aquí, y lo que trae de Decolecta
-- lo deja aquí con esta función. La tabla sigue cerrada a escritura directa
-- (149): la función valida el rango y no pisa un día que ya esté.

create or replace function public.guardar_cambio_sunat(p_fecha date, p_compra numeric, p_venta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() is null then
    raise exception 'Sin sesión' using errcode = 'insufficient_privilege';
  end if;
  if p_fecha is null or p_fecha > current_date + 1
     or p_venta is null or p_venta not between 2 and 8
     or (p_compra is not null and p_compra not between 2 and 8) then
    return; -- un dato raro no se guarda; quien llama ya tiene su número
  end if;
  insert into tipos_cambio_sunat (fecha, compra, venta, origen)
  values (p_fecha, round(p_compra, 3), round(p_venta, 3), 'decolecta')
  on conflict (fecha) do update
     set compra = coalesce(tipos_cambio_sunat.compra, excluded.compra);
end $$;

revoke all on function public.guardar_cambio_sunat(date, numeric, numeric) from public, anon;
grant execute on function public.guardar_cambio_sunat(date, numeric, numeric) to authenticated;

-- Centinela: guarda, no pisa la venta de un día que ya está, rechaza un
-- disparate y sin sesión no escribe. Deshace.
do $$
declare
  v_gerencia uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_gerencia, 'role', 'authenticated')::text, true);
    perform public.guardar_cambio_sunat('1990-02-01', 3.40, 3.45);
    perform public.guardar_cambio_sunat('1990-02-01', 3.90, 3.99);
    if (select venta from tipos_cambio_sunat where fecha = '1990-02-01') is distinct from 3.45 then
      raise exception '172: pisó la venta de un día que ya estaba';
    end if;
    perform public.guardar_cambio_sunat('1990-02-02', null, 35);
    if exists (select 1 from tipos_cambio_sunat where fecha = '1990-02-02') then
      raise exception '172: guardó un cambio de 35';
    end if;
    perform set_config('request.jwt.claims', '', true);
    begin
      perform public.guardar_cambio_sunat('1990-02-03', 3.4, 3.5);
      raise exception '172: sin sesión escribió';
    exception when insufficient_privilege then null;
    end;
    raise exception '__172_DESHACER__';
  exception when others then
    if sqlerrm <> '__172_DESHACER__' then raise; end if;
  end;
end $$;
