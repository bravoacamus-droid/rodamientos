-- 179 · Las series por defecto siguen al ambiente de SUNAT
--
-- El problema. Moisés, 02/11: *«¿se puede hacer dinámico? Si mi ambiente está
-- en beta, que se pongan por defecto los correlativos de beta, y si está en
-- producción, que se cambie a los correlativos que estamos haciendo»*. Hasta
-- hoy eran dos pasos que había que acordarse de dar a la vez: cambiar el
-- ambiente y cambiar, uno por uno, el «por defecto» de factura, notas y guía.
-- Olvidar el segundo en producción lo paraba la 093 (no emite con una de
-- pruebas); olvidarlo al volver a beta era peor: las pruebas se comían
-- números del talonario real (F002-580…), que es justo lo que SUNAT pregunta.
--
-- Ahora el ambiente arrastra las series, en la base y no en la pantalla, para
-- que valga se cambie desde donde se cambie:
--   · beta       → la de pruebas activa de cada documento (F001, FC01, FD01, T001)
--   · producción → la real activa que más lleva emitido (F002, FC02, FD02, T002)
-- Solo los documentos de SUNAT de factura (las notas «a boleta» y las boletas
-- no se tocan: Willy no emite boletas). Cotización y orden de compra no van a
-- SUNAT y no cambian. Si un tipo no tiene la serie que tocaría, se queda como
-- estaba.

create or replace function public.series_segun_ambiente()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ambiente text := (select ambiente from config_sunat where id = 1);
  v_tipo     tipo_documento;
  v_id       uuid;
begin
  foreach v_tipo in array array['factura', 'nota_credito', 'nota_debito', 'guia_remision']::tipo_documento[] loop
    select s.id into v_id
      from series_documento s
     where s.tipo = v_tipo
       and s.activo
       and not (s.tipo in ('nota_credito', 'nota_debito') and s.serie like 'B%')
       and s.es_prueba = (v_ambiente = 'beta')
     order by s.correlativo_actual desc, s.serie desc
     limit 1;

    if v_id is not null then
      -- Una predeterminada por tipo (`ux_series_predeterminada`): primero se
      -- baja la que había.
      update series_documento set predeterminada = false
       where tipo = v_tipo and predeterminada and id <> v_id;
      update series_documento set predeterminada = true where id = v_id and not predeterminada;
    end if;
  end loop;
end
$$;

comment on function public.series_segun_ambiente() is
  'Pone por defecto las series de pruebas en beta y las reales en producción (179). La llama el disparador de config_sunat.';

create or replace function public.tg_series_segun_ambiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ambiente is distinct from old.ambiente then
    perform public.series_segun_ambiente();
  end if;
  return new;
end
$$;

drop trigger if exists tg_config_sunat_series on public.config_sunat;
create trigger tg_config_sunat_series
  after update of ambiente on public.config_sunat
  for each row execute function public.tg_series_segun_ambiente();

-- Centinela: se EJECUTA en los dos sentidos y se deshace. Con F001 y F002
-- activas, beta deja F001 por defecto y producción deja F002.
do $$
declare v_beta text; v_prod text; v_original text;
begin
  begin
    v_original := (select ambiente from config_sunat where id = 1);
    update series_documento set activo = true where tipo = 'factura' and serie in ('F001', 'F002');
    update config_sunat set ambiente = 'produccion' where id = 1;
    update config_sunat set ambiente = 'beta' where id = 1;
    select serie into v_beta from series_documento where tipo = 'factura' and predeterminada;
    update config_sunat set ambiente = 'produccion' where id = 1;
    select serie into v_prod from series_documento where tipo = 'factura' and predeterminada;
    raise exception '__179__%|%', v_beta, v_prod;
  exception when others then
    if sqlerrm not like '__179__%' then raise; end if;
    if replace(sqlerrm, '__179__', '') <> 'F001|F002' then
      raise exception '179: beta|producción dejó % y se esperaba F001|F002', replace(sqlerrm, '__179__', '');
    end if;
  end;
end $$;
