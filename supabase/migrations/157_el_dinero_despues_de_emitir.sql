-- ###########################################################################
-- 157 · EL DINERO DESPUÉS DE EMITIR (27/10)
-- ###########################################################################
--
-- La auditoría del 27/10 recorrió por la base, dentro de transacciones
-- deshechas, lo que pasa DESPUÉS de emitir: la nota de crédito, la anulación,
-- la recepción y el kardex. Seis cosas salieron mal, y todas eran de la
-- variante cara de CLAUDE.md §2: escritas, conectadas y sin ejecutar, porque
-- probarlas gasta un correlativo fiscal o mueve stock.
--
-- 1 · **La nota de crédito no bajaba lo que se debe.** `recalcular_comprobante`
--     sumaba solo los cobros. Una factura de 53,23 con un cobro de 10 y una
--     nota de 11,80 seguía debiendo 43,23, y `registrar_pagos` dejaba cobrar
--     esos 43,23. El aviso de deuda al cotizar, la cartera, el estado de
--     cuenta y las alertas de crédito vencido leían ese saldo inflado.
--     `nota.ts` ya decía «una nota de crédito cambia lo que se debe»: estaba
--     la intención y faltaba el cable. El único rodeo era apuntar a mano un
--     «cobro» con el medio `nota_credito`, sin enlace a ninguna nota y sin
--     tope: se podía cobrar con una nota que no existía.
--     Arreglo: lo pagado es `least(total, cobros + notas de crédito vigentes)`.
--     Un disparador lo recalcula al emitir y al anular la nota, y la nota
--     misma nace saldada: no es deuda de nadie. El medio `nota_credito` ya no
--     se acepta como cobro.
--     Ojo con el histórico: las 482 facturas de F002 que entraron del Excel
--     como pagadas NO tienen cobros apuntados. Recalcularlas desde cero las
--     volvería a poner en deuda. Si lo pagado de la factura no se explica con
--     los cobros y las notas que hay en el sistema, el disparador no la toca.
--
-- 2 · **Se facturaba lo confirmado, no lo despachado.** Con una guía de 1 de
--     3 se facturaban las 3, y la segunda guía —la que llevaba las otras 2—
--     se quedaba «sin facturar» para siempre. Y se le declaraba a SUNAT
--     mercadería que no había salido, que es justo lo que la regla de la 089
--     («la guía antes que la factura») quería evitar.
--     Arreglo: `emitir_comprobante` rechaza la factura o boleta de una
--     cotización en la que un producto supera lo que llevan las guías
--     declaradas. Los kits cuentan como `despacho_por_item`: en kits.
--
-- 3 · **Anular una factura dejaba la cotización «atendida».** La guía quedaba
--     libre, pero lo facturado seguía descontado en `cantidad_atendida`, y
--     «Facturar» ya no ofrecía ninguna línea. El caso típico —una factura con
--     el RUC mal que se anula para emitirla bien— no tenía salida sin SQL.
--     Arreglo: `anular_comprobante` devuelve lo que la factura descontó (la
--     inversa de `registrar_atencion_de_cotizacion`, de la última línea a la
--     primera) y la cotización vuelve a «aprobada». El pedido no guarda
--     estado propio —se lee de sus comprobantes—, así que no hay nada más
--     que recalcular.
--
-- 4 · **El costo promedio se duplicaba al recibir con el stock en negativo.**
--     En −5 (valorizado 0), entraban 10 a $ 2 y quedaba stock 5 valorizado
--     en $ 20: promedio $ 4. El stock negativo es deliberado (002) y hoy casi
--     todo sale por guía antes de recibirse, así que cada recepción lo
--     inflaba. Arreglo: si el saldo previo es cero o negativo, lo que queda
--     va al costo de la entrada.
--
-- 5 · **Se podía recibir contra una orden anulada**, y meter en una recepción
--     de una orden un producto que la orden no tenía (entraba al stock y la
--     orden no se enteraba). Arreglo: las dos cosas se rechazan.
--
-- 6 · **Los pedidos se saltaban números.** `crear_pedido` usaba una secuencia,
--     que no vuelve atrás: cada aprobación fallida o de prueba quemaba un
--     PED. La secuencia va por 34 y el último pedido es PED-26-00014. Ahora
--     el número sale del último que existe, bajo un candado de transacción,
--     así que lo deshecho no deja hueco.
--
-- 7 · **Reaplicada el 27/10 por la tarde**, tras la verificación. El tope del
--     punto 2 tenía tres huecos:
--     a) Solo miraba los productos de la cotización: una llamada directa a la
--        RPC facturaba 50 de un producto que no salió en ninguna guía, y una
--        factura sin cotización no se comprobaba. Ahora cuenta todo, y una
--        línea sin producto se rechaza (no salió en ninguna guía).
--     b) Una factura que cobraba menos de lo que llevaba su guía dejaba ese
--        resto sin cobrar para siempre: la guía queda facturada y no se puede
--        volver a declarar, y el tope impedía cobrarlo con la guía siguiente.
--        Ahora lo que salió en las guías ya facturadas de la cotización y no
--        se cobró sigue disponible. La pantalla, además, ya no deja facturar
--        menos de lo que lleva la guía (`cuadreConGuias`).
--     c) Con el saldo que sigue negativo tras una entrada (−15 y +10), el
--        promedio quedaba en 0 en el stock y el kardex.
--     Cada parche mira antes si ya está puesto, y el del tope sustituye su
--     primera versión, así que esta migración se puede aplicar otra vez
--     entera.

-- ---------------------------------------------------------------------------
-- 1 · Lo pagado cuenta las notas de crédito
-- ---------------------------------------------------------------------------

-- El cuerpo de `recalcular_comprobante` (la versión viva) pasa a una función
-- que se puede llamar con un id, porque ahora la llaman dos disparadores: el
-- de los cobros y el de las notas.
create or replace function public.recalcular_saldo_comprobante(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pagado numeric(14,2);
  v_total  numeric(14,2);
  v_venc   date;
begin
  -- 157: lo cobrado más lo acreditado con notas vigentes.
  select coalesce((select sum(monto) from pagos where comprobante_id = p_id), 0)
       + coalesce((select sum(n.total) from comprobantes n
                    where n.referencia_id = p_id and n.tipo = 'nota_credito'
                      and n.estado <> 'anulado'), 0)
    into v_pagado;
  select total, fecha_vencimiento into v_total, v_venc from comprobantes where id = p_id;

  update comprobantes
     set pagado = least(v_pagado, v_total),
         estado = (case
           when estado = 'anulado' then 'anulado'
           when v_pagado >= v_total - 0.01 then 'pagado'
           when v_venc is not null and v_venc < current_date then 'vencido'
           when v_pagado > 0 then 'parcial'
           else 'emitido' end)::estado_comprobante
   where id = p_id;

  -- Reparto sobre las cuotas, de la más antigua a la más nueva.
  update comprobante_cuotas cu
     set pagado = 0
   where cu.comprobante_id = p_id;

  with orden as (
    select id, monto,
           sum(monto) over (order by numero rows between unbounded preceding and 1 preceding) as previo
    from comprobante_cuotas where comprobante_id = p_id
  )
  update comprobante_cuotas cu
     set pagado = least(cu.monto, greatest(v_pagado - coalesce(o.previo, 0), 0))
    from orden o
   where cu.id = o.id;
end $$;

revoke all on function public.recalcular_saldo_comprobante(uuid) from public, anon, authenticated;

create or replace function public.recalcular_comprobante()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.recalcular_saldo_comprobante(coalesce(new.comprobante_id, old.comprobante_id));
  return null;
end $$;

-- El disparador de la nota.
create or replace function public.tg_nota_credito_salda()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ref     uuid := new.referencia_id;
  v_ahora   numeric(14,2);
  v_antes   numeric(14,2);
  v_pagos   numeric(14,2);
  v_total   numeric(14,2);
  v_pagado  numeric(14,2);
begin
  -- La nota misma no se debe: nace saldada. Las cuatro FC02 del histórico
  -- ya estaban así; las nuevas nacían «emitido» y salían en «Por cobrar».
  if new.estado not in ('anulado', 'pagado') then
    update comprobantes set pagado = total, estado = 'pagado' where id = new.id;
  end if;

  if v_ref is null then return null; end if;
  -- Solo lo que cambia lo acreditado: nacer vigente o anularse.
  if tg_op = 'UPDATE' and (old.estado = 'anulado') = (new.estado = 'anulado') then
    return null;
  end if;

  select coalesce(sum(total), 0) into v_ahora
    from comprobantes
   where referencia_id = v_ref and tipo = 'nota_credito' and estado <> 'anulado';
  v_antes := v_ahora + case when new.estado = 'anulado' then new.total else -new.total end;

  select coalesce(sum(monto), 0) into v_pagos from pagos where comprobante_id = v_ref;
  select total, pagado into v_total, v_pagado from comprobantes where id = v_ref for update;

  -- Lo pagado que el sistema no explica es el histórico cargado del Excel
  -- (pagado = total sin un solo cobro apuntado). Recalcularlo lo devolvería
  -- a deuda: se deja como está.
  if v_pagado > least(v_total, v_pagos + v_antes) + 0.01 then
    return null;
  end if;

  perform public.recalcular_saldo_comprobante(v_ref);
  return null;
end $$;

revoke all on function public.tg_nota_credito_salda() from public, anon, authenticated;

drop trigger if exists trg_nota_credito_salda on public.comprobantes;
create trigger trg_nota_credito_salda
  after insert or update of estado on public.comprobantes
  for each row
  when (new.tipo = 'nota_credito')
  execute function public.tg_nota_credito_salda();

-- ---------------------------------------------------------------------------
-- 2 · Parches de funciones vivas (pg_get_functiondef + reemplazo con ancla)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_viejo text;
  v_nuevo text;
begin
  -- 2.1 · registrar_pagos: la nota de crédito ya no es un medio de cobro.
  v_def := replace(pg_get_functiondef('public.registrar_pagos(jsonb)'::regprocedure), E'\r\n', E'\n');
  v_viejo := $a$  -- 152: ni de antes de 2020 ni del futuro.$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el ancla en registrar_pagos'; end if;
  -- Esta migración se reaplica (ver «Reaplicarla»): cada parche mira antes si ya está.
  if position('157: la nota de crédito baja lo que se debe' in v_def) = 0 then
  v_def := replace(v_def, v_viejo, $a$  -- 157: la nota de crédito baja lo que se debe al emitirse. Apuntarla
  -- además como cobro la aplicaría dos veces, y sin enlace a ninguna nota se
  -- podía «cobrar con nota de crédito» sin que existiera.
  if exists (select 1 from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i
              where i ->> 'medio' = 'nota_credito') then
    raise exception 'Una nota de credito no se apunta como cobro: al emitirla ya baja lo que se debe'
      using errcode = 'check_violation';
  end if;

$a$ || v_viejo);
  execute v_def;
  end if;

  -- 2.2 · emitir_comprobante: no se factura más de lo que salió en la guía.
  -- Si ya está la primera versión de este bloque (la del 27/10 por la
  -- mañana), se sustituye entera: va del marcador hasta el ancla de la 153.
  v_def := replace(pg_get_functiondef('public.emitir_comprobante(jsonb)'::regprocedure), E'
', E'
');
  v_viejo := $a$  -- 153: una nota de crédito no acredita más unidades de un producto de las$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el ancla en emitir_comprobante'; end if;
  v_nuevo := $a$  -- 157: no se factura más de lo que salió en las guías. Por producto, y un
  -- kit en kits, igual que `despacho_por_item`.
  -- Cuenta TODO lo que se factura: un producto que no es de la cotización,
  -- una factura sin cotización y una línea sin producto, que no salió en
  -- ninguna guía. La primera versión miraba solo los productos de la
  -- cotización y dejaba facturar 50 de uno ajeno.
  -- Y lo que salió en una guía de la cotización que ya ampara otra factura,
  -- y esa factura no cobró, sigue disponible: una guía facturada no se puede
  -- volver a declarar, así que sin esto ese resto no se cobraba nunca.
  if v_tipo in ('factura','boleta') and exists (
       with declaradas as (
         select distinct g.id::uuid as id
           from jsonb_array_elements_text(p_datos -> 'guias') g(id)
       ), anteriores as (
         select gr.id from guias_remision gr
          where nullif(p_datos ->> 'cotizacion_id','') is not null
            and gr.cotizacion_id = (p_datos ->> 'cotizacion_id')::uuid
            and gr.estado = 'emitida'
            and gr.id not in (select id from declaradas)
            and public.guia_esta_facturada(gr.id)
       ), filas as (
         select gi.guia_id, gi.cotizacion_item_id,
                gi.guia_id in (select id from declaradas) as declarada,
                coalesce(ci.producto_id, gi.producto_id) as producto_id,
                case when coalesce(p.es_kit, false)
                     then gi.cantidad / nullif(kc.cantidad, 0)
                     else gi.cantidad end as unidades,
                coalesce(p.es_kit, false) as es_kit
           from guia_items gi
           left join cotizacion_items ci on ci.id = gi.cotizacion_item_id
           left join productos p on p.id = ci.producto_id
           left join kit_componentes kc on kc.kit_id = ci.producto_id and kc.producto_id = gi.producto_id
          where gi.guia_id in (select id from declaradas)
             or gi.guia_id in (select id from anteriores)
       ), por_guia as (
         select guia_id, bool_or(declarada) as declarada, producto_id,
                case when bool_or(es_kit) then max(unidades) else sum(unidades) end as unidades
           from filas
          group by guia_id, cotizacion_item_id, producto_id
       ), despachado as (
         select producto_id,
                coalesce(sum(unidades) filter (where declarada), 0) as ahora,
                coalesce(sum(unidades) filter (where not declarada), 0) as antes
           from por_guia group by producto_id
       ), cobrado_antes as (
         select ci.producto_id, sum(ci.cantidad) as cantidad
           from comprobante_items ci
          where ci.producto_id is not null
            and ci.comprobante_id in (
              select c.id from comprobantes c
               where c.id <> v_id and c.tipo in ('factura','boleta') and c.estado <> 'anulado'
                 and (c.guia_id in (select id from anteriores)
                      or exists (select 1 from comprobante_guias cg
                                  where cg.comprobante_id = c.id
                                    and cg.guia_id in (select id from anteriores))))
          group by ci.producto_id
       ), facturado as (
         select producto_id, sum(cantidad) as cantidad
           from comprobante_items
          where comprobante_id = v_id
          group by producto_id
       )
       select 1 from facturado f
         left join despachado d on d.producto_id = f.producto_id
         left join cobrado_antes a on a.producto_id = f.producto_id
        where f.producto_id is null
           or f.cantidad > coalesce(d.ahora, 0)
                         + greatest(coalesce(d.antes, 0) - coalesce(a.cantidad, 0), 0) + 0.005)
  then
    raise exception 'Se factura más de lo que salió en la guía'
      using errcode = 'check_violation';
  end if;

$a$;
  if position('  -- 157: no se factura más de lo que salió en las guía' in v_def) > 0 then
    v_def := left(v_def, position('  -- 157: no se factura más de lo que salió en las guía' in v_def) - 1)
             || v_nuevo || substr(v_def, position(v_viejo in v_def));
  else
    v_def := replace(v_def, v_viejo, v_nuevo || v_viejo);
  end if;
  execute v_def;

  -- 2.3 · anular_comprobante: lo facturado vuelve a estar pendiente.
  v_def := replace(pg_get_functiondef('public.anular_comprobante(uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('157: para devolver lo atendido' in v_def) = 0 then
  v_viejo := $a$declare v_movs jsonb;
begin$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré la cabecera de anular_comprobante'; end if;
  v_def := replace(v_def, v_viejo, $a$declare v_movs jsonb;
  -- 157: para devolver lo atendido.
  v_doc   record;
  v_prod  record;
  v_linea record;
  v_resto numeric;
  v_quita numeric;
begin$a$);
  v_viejo := $a$  return jsonb_build_object('id', p_id, 'estado', 'anulado');$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el final de anular_comprobante'; end if;
  v_def := replace(v_def, v_viejo, $a$  -- 157: lo que esta factura descontó de la cotización vuelve a estar
  -- pendiente. Es la inversa de `registrar_atencion_de_cotizacion`: por
  -- producto, y de la ÚLTIMA línea a la primera, porque aquella llena en orden.
  select tipo, cotizacion_id into v_doc from comprobantes where id = p_id;
  if v_doc.tipo in ('factura','boleta') and v_doc.cotizacion_id is not null then
    for v_prod in
      select producto_id, sum(cantidad) as cantidad
        from comprobante_items
       where comprobante_id = p_id and producto_id is not null
       group by producto_id
    loop
      v_resto := v_prod.cantidad;
      for v_linea in
        select id, cantidad_atendida
          from cotizacion_items
         where cotizacion_id = v_doc.cotizacion_id and producto_id = v_prod.producto_id
         order by orden desc
      loop
        exit when v_resto <= 0;
        v_quita := least(v_resto, coalesce(v_linea.cantidad_atendida, 0));
        if v_quita > 0 then
          update cotizacion_items
             set cantidad_atendida = cantidad_atendida - v_quita
           where id = v_linea.id;
          v_resto := v_resto - v_quita;
        end if;
      end loop;
    end loop;

    -- Si queda algo por facturar, la cotización vuelve a estar abierta. El
    -- pedido no guarda estado: se lee de sus comprobantes.
    update cotizaciones q
       set estado = 'aprobada'
     where q.id = v_doc.cotizacion_id
       and q.estado = 'atendida'
       and exists (
         select 1 from cotizacion_items ci
          where ci.cotizacion_id = q.id
            and ci.cantidad_atendida < coalesce(ci.cantidad_aprobada, ci.cantidad));
  end if;

$a$ || v_viejo);
  execute v_def;
  end if;

  -- 2.4 · registrar_movimientos: con el saldo en cero o negativo, lo que queda
  -- va al costo de la entrada.
  v_def := replace(pg_get_functiondef('public.registrar_movimientos(jsonb,uuid)'::regprocedure), E'\r\n', E'\n');
  if position('157: en −5' in v_def) = 0 then
  v_viejo := $a$    v_new_val  := v_prev_val  + (v_signo * v_cantidad * v_costo_mov);
$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el ancla en registrar_movimientos'; end if;
  v_def := replace(v_def, v_viejo, v_viejo || $a$
    -- 157: en −5 (valorizado 0) entran 10 a $ 2. Sumar la entrada al valorizado
    -- viejo y dividir por 5 daba $ 4. Las unidades que tapan el hueco ya
    -- salieron; las que quedan son de esta entrada y valen lo que costó.
    if v_signo = 1 and v_prev_cant <= 0 then
      v_new_val := greatest(v_new_cant, 0) * v_costo_mov;
    end if;
$a$);
  execute v_def;
  end if;

  -- 2.4b · registrar_movimientos: con el saldo que sigue en cero o negativo,
  -- el promedio no se queda en 0.
  v_def := replace(pg_get_functiondef('public.registrar_movimientos(jsonb,uuid)'::regprocedure), E'
', E'
');
  if position('157: si el saldo sigue en cero o negativo' in v_def) = 0 then
  v_viejo := $a$    if v_new_cant <= 0 then
      v_new_val := 0;
$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el saldo agotado en registrar_movimientos'; end if;
  v_def := replace(v_def, v_viejo, v_viejo || $a$      -- 157: si el saldo sigue en cero o negativo, el promedio conserva el
      -- último válido, como dice el comentario de arriba: el de antes o, si
      -- no lo había, el de este movimiento. En −15 entraban 10 a $ 2 y el
      -- stock y el kardex quedaban con promedio 0.
      v_costo_prom := coalesce(nullif(v_costo_prom, 0), v_costo_mov);
$a$);
  execute v_def;
  end if;

  -- 2.5 · recepcionar_mercaderia: ni contra una orden anulada, ni lo que la
  -- orden no tiene.
  v_def := replace(pg_get_functiondef('public.recepcionar_mercaderia(jsonb)'::regprocedure), E'\r\n', E'\n');
  if position('157: una orden anulada no recibe nada' in v_def) = 0 then
  v_viejo := $a$    perform 1 from compras where id = v_compra for update;
  end if;
$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el ancla en recepcionar_mercaderia'; end if;
  v_def := replace(v_def, v_viejo, v_viejo || $a$
  -- 157: una orden anulada no recibe nada, y lo que se recibe contra una
  -- orden tiene que estar en ella. Lo demás va en una recepción sin orden.
  if v_compra is not null then
    if exists (select 1 from compras where id = v_compra and estado = 'anulada') then
      raise exception 'La orden % está anulada: no se le puede recibir',
        (select numero from compras where id = v_compra) using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) i
       where not exists (select 1 from compra_items ci
                          where ci.compra_id = v_compra
                            and ci.producto_id = (i ->> 'producto_id')::uuid)) then
      raise exception 'El producto % no está en la orden %: recíbelo en una recepción sin orden',
        (select p.codigo from jsonb_array_elements(v_items) i
           join productos p on p.id = (i ->> 'producto_id')::uuid
          where not exists (select 1 from compra_items ci
                             where ci.compra_id = v_compra and ci.producto_id = p.id)
          limit 1),
        (select numero from compras where id = v_compra)
        using errcode = 'check_violation';
    end if;
  end if;
$a$);
  execute v_def;
  end if;

  -- 2.6 · crear_pedido: numeración que se deshace con la transacción.
  v_def := replace(pg_get_functiondef('public.crear_pedido(uuid,jsonb,date)'::regprocedure), E'\r\n', E'\n');
  if position('157: el siguiente al último que existe' in v_def) = 0 then
  v_viejo := $a$  v_id      uuid;
begin$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré la cabecera de crear_pedido'; end if;
  v_def := replace(v_def, v_viejo, $a$  v_id      uuid;
  v_num     int;
begin$a$);
  v_viejo := $a$  insert into pedidos (numero,$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el insert de crear_pedido'; end if;
  v_def := replace(v_def, v_viejo, $a$  -- 157: el siguiente al último que existe, con un candado que dura lo que
  -- la transacción. La secuencia de la 130 no volvía atrás: cada aprobación
  -- fallida quemaba un número. `pedidos_numero_seq` se queda, sin uso.
  perform pg_advisory_xact_lock(hashtext('pedidos.numero'));
  select coalesce(max(substring(numero from '(\d+)$')::int), 0) + 1 into v_num from pedidos;

$a$ || v_viejo);
  v_viejo := $a$lpad(nextval('pedidos_numero_seq')::text, 5, '0')$a$;
  if position(v_viejo in v_def) = 0 then raise exception '157: no encontré el nextval de crear_pedido'; end if;
  v_def := replace(v_def, v_viejo, $a$lpad(v_num::text, 5, '0')$a$);
  execute v_def;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Centinela: EJECUTA cada arreglo y lo deshace (CLAUDE.md §2)
-- ---------------------------------------------------------------------------
do $$
declare
  v_usr  uuid := (select id from perfiles where rol = 'gerencia' and activo order by creado_en limit 1);
  v_cli  uuid; v_prov uuid; p1 uuid; p2 uuid; p3 uuid;
  v_cot  uuid; i1 uuid; v_g uuid; v_fac uuid; v_nc uuid; v_comp uuid;
  v_cot2 uuid; i2 uuid; v_g2 uuid; v_fac2 uuid; v_g3 uuid; v_g4 uuid; p4 uuid;
  r      jsonb;
  v_ok   boolean;
  v_total numeric; v_saldo numeric;
  v_max  int; v_ped text;
begin
  begin
    -- 4 · Costo promedio con el stock en negativo (como dueño: es interna).
    select p.id into p3 from productos p left join stock s on s.producto_id = p.id
     where not p.archivado and not p.es_kit and coalesce(s.cantidad, 0) = 0
     order by p.codigo limit 1;
    perform public.registrar_movimientos(jsonb_build_array(
      jsonb_build_object('producto_id', p3, 'tipo', 'salida', 'cantidad', 5, 'motivo', 'Centinela 157')));
    perform public.registrar_movimientos(jsonb_build_array(
      jsonb_build_object('producto_id', p3, 'tipo', 'ingreso', 'cantidad', 10, 'costo_unitario', 2,
                         'motivo', 'Centinela 157')));
    if (select costo_promedio from stock where producto_id = p3) <> 2
       or (select valorizado from stock where producto_id = p3) <> 10
       or (select costo_promedio from productos where id = p3) <> 2 then
      raise exception '157: tras −5 y +10 a 2, el costo promedio quedó en %',
        (select costo_promedio from stock where producto_id = p3);
    end if;

    select max(substring(numero from '(\d+)$')::int) into v_max from pedidos;

    -- 7c · En −15 entran 10 a $ 2: el saldo sigue negativo y el promedio no
    -- se queda en 0.
    select p.id into p4 from productos p left join stock s on s.producto_id = p.id
     where not p.archivado and not p.es_kit and coalesce(s.cantidad, 0) = 0 and p.id <> p3
     order by p.codigo limit 1;
    perform public.registrar_movimientos(jsonb_build_array(
      jsonb_build_object('producto_id', p4, 'tipo', 'salida', 'cantidad', 15, 'motivo', 'Centinela 157')));
    perform public.registrar_movimientos(jsonb_build_array(
      jsonb_build_object('producto_id', p4, 'tipo', 'ingreso', 'cantidad', 10, 'costo_unitario', 2,
                         'motivo', 'Centinela 157')));
    if (select costo_promedio from stock where producto_id = p4) <> 2 then
      raise exception '157: tras −15 y +10 a 2, el costo promedio quedó en %',
        (select costo_promedio from stock where producto_id = p4);
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    select id into v_cli from clientes
     where tipo_documento = 'RUC' and not coalesce(agente_retencion, false)
     order by creado_en limit 1;
    select id into v_prov from proveedores order by creado_en limit 1;
    select p.id into p1 from productos p
     where not p.archivado and not p.es_kit and p.unidad_codigo = 'NIU'
     order by p.codigo limit 1;
    select p.id into p2 from productos p
     where not p.archivado and not p.es_kit and p.unidad_codigo = 'NIU' and p.id <> p1
     order by p.codigo limit 1;

    -- 6 · El pedido que nace al aprobar es el siguiente al último.
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'orden', 1,
             'codigo', 'C157', 'descripcion', 'Centinela 157', 'cantidad', 10,
             'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 2))));
    v_cot := (r ->> 'id')::uuid;
    select id into i1 from cotizacion_items where cotizacion_id = v_cot;
    perform public.aprobar_cotizacion(v_cot, null::jsonb);
    select numero into v_ped from pedidos where cotizacion_id = v_cot;
    if v_ped is distinct from 'PED-' || to_char(current_date, 'YY') || '-' || lpad((coalesce(v_max, 0) + 1)::text, 5, '0') then
      raise exception '157: el pedido nuevo es % y el último era el %', v_ped, v_max;
    end if;

    -- 2 · Guía de 4 de 10: facturar 10 se rechaza; 4, no.
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C157',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 4, 'unidad_codigo', 'NIU'))));
    v_g := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g);
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 10, 'valor_unitario', 10))));
    exception when check_violation then
      v_ok := sqlerrm like 'Se factura más de lo que salió en la guía%';
    end;
    if not v_ok then raise exception '157: se facturaron 10 con una guía de 4'; end if;

    -- 7a · Un producto que no está en la cotización ni salió en la guía.
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
        'items', jsonb_build_array(
          jsonb_build_object('producto_id', p1, 'cantidad', 4, 'valor_unitario', 10),
          jsonb_build_object('producto_id', p2, 'cantidad', 50, 'valor_unitario', 10))));
    exception when check_violation then
      v_ok := sqlerrm like 'Se factura más de lo que salió en la guía%';
    end;
    if not v_ok then raise exception '157: se facturaron 50 de un producto que no salió en la guía'; end if;

    -- Sin cotización también se mira.
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 5, 'valor_unitario', 10))));
    exception when check_violation then
      v_ok := sqlerrm like 'Se factura más de lo que salió en la guía%';
    end;
    if not v_ok then raise exception '157: una factura sin cotización facturó 5 con una guía de 4'; end if;

    -- Y una línea sin producto no salió en ninguna guía.
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g),
        'items', jsonb_build_array(
          jsonb_build_object('producto_id', p1, 'cantidad', 4, 'valor_unitario', 10),
          jsonb_build_object('codigo', 'X', 'descripcion', 'Centinela 157 sin producto',
                             'unidad_codigo', 'NIU', 'cantidad', 1, 'valor_unitario', 10))));
    exception when check_violation then
      v_ok := sqlerrm like 'Se factura más de lo que salió en la guía%';
    end;
    if not v_ok then raise exception '157: se facturó una línea sin producto'; end if;

    r := public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
           'cotizacion_id', v_cot, 'condicion_pago', 'credito', 'dias_credito', 30,
           'guias', jsonb_build_array(v_g),
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 4, 'valor_unitario', 10))));
    v_fac := (r ->> 'id')::uuid;
    select total into v_total from comprobantes where id = v_fac;

    -- 7b · Una factura corta no deja el resto sin cobrar: guía de 4 y factura
    -- de 2; con la guía siguiente, de 2, se facturan 4 (2 + el resto), y 5 no.
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C157',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 4, 'unidad_codigo', 'NIU'))));
    v_g3 := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g3);
    perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
      'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g3),
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 2, 'valor_unitario', 10))));
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C157',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i1,
             'producto_id', p1, 'cantidad', 2, 'unidad_codigo', 'NIU'))));
    v_g4 := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g4);
    v_ok := false;
    begin
      perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
        'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g4),
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 5, 'valor_unitario', 10))));
    exception when check_violation then
      v_ok := sqlerrm like 'Se factura más de lo que salió en la guía%';
    end;
    if not v_ok then raise exception '157: con 2 de resto y una guía de 2 se facturaron 5'; end if;
    perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
      'cotizacion_id', v_cot, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g4),
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 4, 'valor_unitario', 10))));
    if (select cantidad_atendida from cotizacion_items where id = i1) <> 10 then
      raise exception '157: tras facturar el resto, la línea quedó con % atendidas de 10',
        (select cantidad_atendida from cotizacion_items where id = i1);
    end if;

    -- 1 · Cobro de 10 y nota de crédito: el saldo baja por los dos.
    perform public.registrar_pagos(jsonb_build_array(jsonb_build_object(
      'comprobante_id', v_fac, 'monto', 10, 'medio', 'transferencia')));
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'nota_credito', 'serie', 'FC01',
           'cliente_id', v_cli, 'referencia_id', v_fac, 'motivo_nota_codigo', '07',
           'condicion_pago', 'contado',
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1, 'valor_unitario', 10))));
    v_nc := (r ->> 'id')::uuid;
    select saldo into v_saldo from comprobantes where id = v_fac;
    if v_saldo <> v_total - 10 - (select total from comprobantes where id = v_nc) then
      raise exception '157: factura de %, cobro de 10 y nota de %: el saldo quedó en %',
        v_total, (select total from comprobantes where id = v_nc), v_saldo;
    end if;
    if (select saldo from comprobantes where id = v_nc) <> 0
       or (select estado from comprobantes where id = v_nc) <> 'pagado' then
      raise exception '157: la nota de crédito misma quedó como deuda';
    end if;

    -- Cobrar «con nota de crédito» se rechaza.
    v_ok := false;
    begin
      perform public.registrar_pagos(jsonb_build_array(jsonb_build_object(
        'comprobante_id', v_fac, 'monto', 1, 'medio', 'nota_credito')));
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception '157: se aceptó un cobro con el medio nota_credito'; end if;

    -- Anular la nota devuelve el saldo.
    perform public.anular_comprobante(v_nc, 'Centinela 157');
    if (select saldo from comprobantes where id = v_fac) <> v_total - 10 then
      raise exception '157: anular la nota dejó el saldo en %', (select saldo from comprobantes where id = v_fac);
    end if;

    -- 3 · Factura completa, anular y volver a facturar con la misma guía.
    r := public.crear_cotizacion(jsonb_build_object('cliente_id', v_cli, 'validez_dias', 15,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p2, 'orden', 1,
             'codigo', 'C157B', 'descripcion', 'Centinela 157 B', 'cantidad', 3,
             'unidad_codigo', 'NIU', 'valor_unitario', 10, 'costo_unitario', 2))));
    v_cot2 := (r ->> 'id')::uuid;
    select id into i2 from cotizacion_items where cotizacion_id = v_cot2;
    perform public.aprobar_cotizacion(v_cot2, null::jsonb);
    r := public.generar_guia_desde_cotizacion(jsonb_build_object('cotizacion_id', v_cot2,
           'peso_bruto_kg', 1, 'modalidad_traslado', '02', 'a_pie', true,
           'conductor_documento', '12345678', 'ubigeo_llegada', '150101', 'direccion_llegada', 'C157',
           'items', jsonb_build_array(jsonb_build_object('cotizacion_item_id', i2,
             'producto_id', p2, 'cantidad', 3, 'unidad_codigo', 'NIU'))));
    v_g2 := (r ->> 'id')::uuid;
    perform public.emitir_guia(v_g2);
    r := public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
           'cotizacion_id', v_cot2, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g2),
           'items', jsonb_build_array(jsonb_build_object('producto_id', p2, 'cantidad', 3, 'valor_unitario', 10))));
    v_fac2 := (r ->> 'id')::uuid;
    if (select estado from cotizaciones where id = v_cot2) <> 'atendida' then
      raise exception '157: la cotización facturada entera no quedó atendida';
    end if;
    perform public.anular_comprobante(v_fac2, 'Centinela 157');
    if (select cantidad_atendida from cotizacion_items where id = i2) <> 0
       or (select estado from cotizaciones where id = v_cot2) <> 'aprobada' then
      raise exception '157: anular la factura dejó la cotización en % con % atendidas',
        (select estado from cotizaciones where id = v_cot2),
        (select cantidad_atendida from cotizacion_items where id = i2);
    end if;
    perform public.emitir_comprobante(jsonb_build_object('tipo', 'factura', 'cliente_id', v_cli,
      'cotizacion_id', v_cot2, 'condicion_pago', 'contado', 'guias', jsonb_build_array(v_g2),
      'items', jsonb_build_array(jsonb_build_object('producto_id', p2, 'cantidad', 3, 'valor_unitario', 10))));

    -- 5 · Recibir contra una orden anulada, y lo que la orden no tiene.
    select id into v_comp from compras where estado = 'anulada' order by numero limit 1;
    if v_comp is null then raise exception '157: no hay ninguna orden anulada para probar'; end if;
    v_ok := false;
    begin
      perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_comp,
        'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1, 'costo_unitario', 1))));
    exception when check_violation then v_ok := sqlerrm like '%está anulada%';
    end;
    if not v_ok then raise exception '157: se recibió contra una orden anulada'; end if;

    r := public.crear_compra(jsonb_build_object('proveedor_id', v_prov, 'tipo', 'local',
           'fecha', current_date,
           'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 5,
             'costo_unitario', 3, 'unidad_codigo', 'NIU'))));
    v_comp := (r ->> 'id')::uuid;
    v_ok := false;
    begin
      perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_comp,
        'proveedor_id', v_prov,
        'items', jsonb_build_array(jsonb_build_object('producto_id', p2, 'cantidad', 1, 'costo_unitario', 1))));
    exception when check_violation then v_ok := sqlerrm like '%no está en la orden%';
    end;
    if not v_ok then raise exception '157: se recibió un producto que la orden no tiene'; end if;
    -- Y lo que sí tiene, entra.
    perform public.recepcionar_mercaderia(jsonb_build_object('compra_id', v_comp,
      'proveedor_id', v_prov,
      'items', jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 5, 'costo_unitario', 3))));

    perform set_config('role', 'postgres', true);
    raise exception '__157_DESHACER__';
  exception when others then
    perform set_config('role', 'postgres', true);
    if sqlerrm <> '__157_DESHACER__' then raise; end if;
  end;
  raise notice '157: la nota baja el saldo, se factura lo despachado (y solo eso, sin perder el resto), anular reabre, el costo no se dobla ni se queda en 0, la orden anulada no recibe y el pedido no salta.';
end $$;
