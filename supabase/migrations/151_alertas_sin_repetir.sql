-- ###########################################################################
-- 151 · UNA ALERTA POR COSA, Y SE VA CUANDO DEJA DE SER VERDAD (23/10)
-- ###########################################################################
--
-- El consultor del 23/10 le puso un 5 a las alertas: 126 sin leer. Y no eran
-- 126 cosas. La huella de cada alerta lleva la ventana de tiempo —la semana
-- en cartera y stock, el DÍA en saldo negativo— para que se vuelva a avisar
-- de lo que sigue pendiente; pero la de la semana anterior no se iba nunca.
-- Una factura vencida desde septiembre tenía tres alertas, una por semana, y
-- 18 «saldo negativo» eran el mismo puñado de productos día tras día.
--
-- Y lo que ya se arregló tampoco se iba: una factura cobrada seguía en la
-- bandeja como «vencida» hasta que alguien la archivara a mano.
--
-- `generar_alertas` termina ahora limpiando, en este orden:
--
--   1 · Archiva la alerta cuya causa ya no existe: la factura se cobró o se
--       anuló, la cotización dejó de estar pendiente o ya venció, el saldo
--       negativo se cuadró, el stock volvió por encima del mínimo.
--   2 · De lo que sigue vivo, deja UNA por cosa —la más reciente, que trae el
--       saldo de hoy— y archiva las anteriores.
--
-- Archivar no borra: la alerta sigue en la base y en «Archivadas».

do $$
declare
  v_def text := replace(pg_get_functiondef('public.generar_alertas()'::regprocedure), E'\r\n', E'\n');
  v_viejo text := $a$  return jsonb_build_object('nuevas', v_nuevas, 'generado_en', now());$a$;
begin
  if position(v_viejo in v_def) = 0 then
    raise exception '151: no encontré el final de generar_alertas';
  end if;
  v_def := replace(v_def, v_viejo, $a$  -- 151 · 1: lo que dejó de ser verdad se archiva solo.
  update alertas a set archivada = true
   where not a.archivada and a.tipo in ('credito_vencido', 'credito_por_vencer')
     and not exists (select 1 from comprobantes c
                      where c.id = a.entidad_id and c.estado in ('emitido','parcial','vencido') and c.saldo > 0);
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'cotizacion_por_vencer'
     and not exists (select 1 from cotizaciones q
                      where q.id = a.entidad_id and q.estado in ('enviada','aprobada')
                        and q.fecha_vencimiento >= current_date);
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'stock_negativo'
     and not exists (select 1 from stock s where s.producto_id = a.entidad_id and s.cantidad < 0);
  update alertas a set archivada = true
   where not a.archivada and a.tipo in ('quiebre_stock', 'stock_bajo')
     and not exists (select 1 from productos p left join stock s on s.producto_id = p.id
                      where p.id = a.entidad_id and not p.archivado and p.stock_minimo > 0
                        and coalesce(s.cantidad, 0) <= p.stock_minimo);

  -- 151 · 2: de lo vivo, una por cosa: la más reciente.
  update alertas a set archivada = true
   where not a.archivada and a.entidad_id is not null
     and exists (select 1 from alertas b
                  where not b.archivada and b.entidad_id = a.entidad_id
                    and split_part(b.huella, ':', 1) = split_part(a.huella, ':', 1)
                    and (b.generada_en, b.id) > (a.generada_en, a.id));

$a$ || v_viejo);
  execute v_def;
end $$;

-- Centinela: EJECUTA la generación y lo deshace.
do $$
declare v_n int;
begin
  begin
    perform public.generar_alertas();

    select count(*) into v_n from (
      select entidad_id, split_part(huella, ':', 1)
        from alertas where not archivada and entidad_id is not null
       group by 1, 2 having count(*) > 1) x;
    if v_n > 0 then raise exception '151: quedan % cosas con más de una alerta viva', v_n; end if;

    select count(*) into v_n from alertas a
     where not a.archivada and a.tipo in ('credito_vencido', 'credito_por_vencer')
       and not exists (select 1 from comprobantes c where c.id = a.entidad_id and c.saldo > 0
                         and c.estado in ('emitido','parcial','vencido'));
    if v_n > 0 then raise exception '151: quedan % alertas de facturas ya cobradas', v_n; end if;

    raise exception '__151_DESHACER__';
  exception when others then
    if sqlerrm <> '__151_DESHACER__' then raise; end if;
  end;
  raise notice '151: alertas sin repetir.';
end $$;
