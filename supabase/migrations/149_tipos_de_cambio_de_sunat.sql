-- ###########################################################################
-- 149 · EL CAMBIO DE SUNAT DE CADA DÍA, GUARDADO UNA VEZ (23/10)
-- ###########################################################################
--
-- La 148 guarda en cada factura en dólares el cambio de su día. Pero el
-- contador también lleva las COMPRAS en soles, y de 17 compras en dólares
-- ninguna tiene cambio: el campo `tipo_cambio` de la compra es el que se
-- teclea para una compra en soles (128), y en dólares se queda vacío.
--
-- En vez de pedir otra vez a SUNAT el mismo día para cada documento, el
-- cambio de cada día se guarda aquí una vez, y el Excel del contador lo
-- busca por fecha. Lo llenan:
--
--   · `emitir_comprobante`, con el que le llega en `tipo_cambio_sunat`.
--   · La carga del histórico, por SQL directo (no es dato del cliente, es
--     público, pero se carga igual fuera de las migraciones).
--
-- Un domingo o un feriado SUNAT no publica: vale el último publicado, y eso
-- lo resuelve quien lee (`cambio_sunat_del_dia`), no quien escribe.

create table if not exists public.tipos_cambio_sunat (
  fecha   date primary key,
  compra  numeric(8,3),
  venta   numeric(8,3) not null check (venta between 2 and 8),
  origen  text not null default 'emision',
  creado_en timestamptz not null default now()
);

comment on table public.tipos_cambio_sunat is
  'El tipo de cambio venta que publica SUNAT, uno por día (149). Lo usa el Excel para el contador.';

alter table public.tipos_cambio_sunat enable row level security;
drop policy if exists lectura_autenticados on public.tipos_cambio_sunat;
create policy lectura_autenticados on public.tipos_cambio_sunat for select to authenticated
  using ((select public.mi_rol()) is not null);
revoke all on public.tipos_cambio_sunat from anon;
revoke insert, update, delete on public.tipos_cambio_sunat from authenticated;

-- El del día, o el último publicado antes (domingos y feriados).
create or replace function public.cambio_sunat_del_dia(p_fecha date)
returns numeric
language sql stable security invoker
set search_path = public
as $$
  select venta from tipos_cambio_sunat
   where fecha <= p_fecha and fecha >= p_fecha - 7
   order by fecha desc limit 1
$$;

-- emitir_comprobante guarda el cambio que le llega, si ese día no estaba.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.emitir_comprobante(jsonb)'::regprocedure), E'\r\n', E'\n');
  v_viejo text := $a$  -- 148: un cambio de SUNAT que no lo es se rechaza, no se guarda.$a$;
begin
  if position(v_viejo in v_def) = 0 then
    raise exception '149: no encontré el bloque de la 148 en emitir_comprobante';
  end if;
  v_def := replace(v_def, v_viejo, $a$  -- 149: el cambio del día queda guardado para todo lo demás (compras).
  if v_moneda = 'USD' and (p_datos ->> 'tipo_cambio_sunat')::numeric between 2 and 8 then
    insert into tipos_cambio_sunat (fecha, venta)
    values (coalesce(nullif(p_datos ->> 'fecha_emision','')::date, current_date),
            round((p_datos ->> 'tipo_cambio_sunat')::numeric, 3))
    on conflict (fecha) do nothing;
  end if;
$a$ || v_viejo);
  execute v_def;
end $$;

-- Centinela: el domingo toma el del sábado, y una semana sin dato da null.
do $$
begin
  begin
    insert into tipos_cambio_sunat (fecha, venta, origen) values ('1990-01-06', 3.5, 'centinela');
    if public.cambio_sunat_del_dia('1990-01-07') is distinct from 3.5 then
      raise exception '149: el domingo no tomó el cambio del sábado';
    end if;
    if public.cambio_sunat_del_dia('1990-01-20') is not null then
      raise exception '149: tomó un cambio de hace dos semanas';
    end if;
    begin
      insert into tipos_cambio_sunat (fecha, venta) values ('1990-01-08', 344);
      raise exception '149: se guardó un cambio de 344';
    exception when check_violation then null;
    end;
    raise exception '__149_DESHACER__';
  exception when others then
    if sqlerrm <> '__149_DESHACER__' then raise; end if;
  end;
  raise notice '149: tipos de cambio de SUNAT por día.';
end $$;
