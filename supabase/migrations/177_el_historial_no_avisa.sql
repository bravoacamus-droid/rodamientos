-- 177 · El historial de SIMPLE no dispara «Guía sin facturar»
--
-- El problema. El 02/11 se cargaron las 575 guías T002 de SIMPLE como
-- historial (Willy: «para que cuando le pregunten si la guía tal ya se hizo
-- tenga el historial y no vaya a SIMPLE»). 563 quedaron enlazadas a su factura
-- por la columna «Guía Remisión» de las ventas; **47 no tienen factura vigente**
-- —anuladas, o facturadas con otra guía en la misma factura— y
-- `generar_alertas` (161), que corre cada hora desde las 7:05 y avisa al
-- celular, las habría perseguido como «Guía sin facturar», severidad alta,
-- por guías de 2024.
--
-- La regla: la alerta es para las guías que salieron DESDE EL ERP. Las del
-- historial entraron sin autor (`creado_por` null); las del ERP lo llevan
-- siempre (la emisión lo pone).
--
-- La función tiene 28 000 caracteres y solo cambia una condición, así que en
-- vez de copiarla entera se toma la versión viva, se cambia ESE renglón
-- —comprobando que aparece una sola vez— y se vuelve a crear.

do $$
declare
  v_def   text := pg_get_functiondef('public.generar_alertas'::regproc);
  v_ancla text := $a$and g.motivo_codigo in ('01', '14')$a$;
  v_veces int;
begin
  if position('g.creado_por is not null' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '177: la condición de «Guía sin facturar» aparece % veces, se esperaba 1', v_veces;
  end if;
  execute replace(v_def, v_ancla,
    v_ancla || E'\n       -- 177: solo las guías del ERP; el historial de SIMPLE entró sin autor.\n       and g.creado_por is not null');
end $$;

-- Centinela: se EJECUTA y ninguna guía del historial queda como «sin facturar».
-- Lo que escribe se deshace.
do $$
declare v_n int;
begin
  begin
    perform public.generar_alertas();
    select count(*) into v_n
      from alertas a join guias_remision g on g.id = a.entidad_id
     where a.tipo = 'guia_sin_facturar' and g.creado_por is null and not a.archivada;
    raise exception '__177__%', v_n;
  exception when others then
    if sqlerrm not like '__177__%' then raise; end if;
    if replace(sqlerrm, '__177__', '')::int > 0 then
      raise exception '177: % guías del historial siguen avisando', replace(sqlerrm, '__177__', '');
    end if;
  end;
end $$;
