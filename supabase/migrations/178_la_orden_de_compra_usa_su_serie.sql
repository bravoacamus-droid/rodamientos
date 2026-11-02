-- 178 · La orden de compra se numera con su serie (OC02, como en SIMPLE)
--
-- El problema. Moisés, 02/11, con la pantalla de series de SIMPLE delante:
-- las órdenes de compra son OC02, y en el ERP salían CMP-26-00018. Quiso
-- dejarlo «como está en SIMPLE», y la pantalla de series ya permite crear una
-- serie de orden de compra y ponerla «por defecto»… pero no habría cambiado
-- nada: `siguiente_numero_interno` llevaba el prefijo ESCRITO A MANO
-- ('compra' → 'CMP') y nunca miraba cuál es la predeterminada. La pieza estaba
-- y el cable no (CLAUDE.md §2).
--
-- Ahora, para la orden de compra: si hay una serie activa y predeterminada
-- que no es la CMP de siempre, el número sale de ella —`OC02-00001`, con sus
-- dígitos— por el mismo `siguiente_correlativo` que numera todo. Sin ella,
-- como hasta hoy. Recepciones y ajustes no cambian.

create or replace function public.siguiente_numero_interno(p_tipo tipo_documento)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prefijo text := case p_tipo
    when 'compra'            then 'CMP'
    when 'recepcion'         then 'REC'
    when 'ajuste_inventario' then 'AJU'
    else upper(left(p_tipo::text, 3)) end;
  v_serie       text;
  v_longitud    int;
  v_correlativo integer;
begin
  -- 178: la orden de compra, con su serie por defecto si se eligió una.
  if p_tipo = 'compra' then
    select s.serie, s.longitud into v_serie, v_longitud
      from series_documento s
     where s.tipo = 'compra' and s.activo and s.predeterminada and s.serie <> 'CMP'
     limit 1;
    if v_serie is not null then
      v_correlativo := public.siguiente_correlativo(p_tipo, v_serie);
      return v_serie || '-' || lpad(v_correlativo::text, coalesce(v_longitud, 5), '0');
    end if;
  end if;

  insert into series_documento (tipo, serie, correlativo_inicial, correlativo_actual, longitud, predeterminada, descripcion)
  values (p_tipo, v_prefijo, 1, 0, 5, true, 'Serie interna autogenerada')
  on conflict (tipo, serie) do nothing;

  v_correlativo := public.siguiente_correlativo(p_tipo, v_prefijo);
  return v_prefijo || '-' || to_char(current_date, 'YY') || '-' || lpad(v_correlativo::text, 5, '0');
end
$$;

-- Centinela: se EJECUTA. Con una serie de prueba por defecto sale de ella;
-- sin ella, la CMP de siempre. Todo se deshace.
do $$
declare v_con text; v_sin text;
begin
  begin
    update series_documento set predeterminada = false where tipo = 'compra';
    insert into series_documento (tipo, serie, correlativo_inicial, correlativo_actual, longitud, predeterminada, activo, descripcion)
    values ('compra', 'ZZ78', 1, 0, 5, true, true, 'centinela 178');
    v_con := public.siguiente_numero_interno('compra');
    update series_documento set predeterminada = false where serie = 'ZZ78';
    v_sin := public.siguiente_numero_interno('compra');
    raise exception '__178__%|%', v_con, v_sin;
  exception when others then
    if sqlerrm not like '__178__%' then raise; end if;
    v_con := split_part(replace(sqlerrm, '__178__', ''), '|', 1);
    v_sin := split_part(replace(sqlerrm, '__178__', ''), '|', 2);
    if v_con <> 'ZZ78-00001' then
      raise exception '178: con serie por defecto salió % y se esperaba ZZ78-00001', v_con;
    end if;
    if v_sin not like 'CMP-%' then
      raise exception '178: sin serie por defecto salió % y se esperaba CMP-…', v_sin;
    end if;
  end;
end $$;
