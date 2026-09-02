-- ###########################################################################
-- 047 · UNA COTIZACIÓN SE PUEDE FACTURAR POR PARTES
-- ###########################################################################
--
-- Encontrado el 02/09 al construir la bandeja «Por comprar» (§I). Son DOS
-- fallos, y el primero es peor que el que fui a buscar.
--
-- ---------------------------------------------------------------------------
-- 1 · La factura cobraba lo COTIZADO, no lo confirmado
-- ---------------------------------------------------------------------------
-- Desde la 041 el cliente puede confirmar parte: «de las 6 me quedo con 4».
-- Eso se guarda en `cotizacion_items.cantidad_aprobada` y la bandeja de
-- compras ya lo respeta.
--
-- La emisión no. Facturaba `cantidad` —lo que se cotizó— así que al cliente
-- que confirmó 4 se le emitía un comprobante por 6, se le descargaban 6 del
-- almacén y se le cobraban 6. Con el número de una serie fiscal encima.
--
-- ---------------------------------------------------------------------------
-- 2 · Y la cotización se cerraba entera
-- ---------------------------------------------------------------------------
-- `emitir_comprobante` ponía la cotización en `atendida` en cuanto se le
-- emitía cualquier comprobante, sin mirar cuánto se había entregado. Como
-- `v_comprometido` solo mira las `aprobada`, **lo no entregado desaparecía**:
-- de la bandeja «Por comprar», de lo que hay que reponer y de cualquier sitio
-- donde se pudiera ver que a ese cliente todavía se le debe algo.
--
-- Facturar 4 de 6 borraba las 2 que quedaban. En silencio.
--
-- ---------------------------------------------------------------------------
-- Cómo se arregla
-- ---------------------------------------------------------------------------
-- Una columna que cuenta lo ya facturado por línea, y el cierre de la
-- cotización pasa a ser una consecuencia —«no queda nada pendiente»— en vez de
-- un efecto secundario de emitir.
--
-- Hoy no hay ninguna cotización viva en la base, así que esto no arregla datos
-- pasados: los evita. Pero tenía que entrar ANTES de que Willy facture de
-- verdad, porque después habría facturas emitidas de más que ya no se pueden
-- deshacer sin una nota de crédito.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Lo ya facturado de cada línea
-- ---------------------------------------------------------------------------
alter table cotizacion_items
  add column if not exists cantidad_atendida numeric(14,2) not null default 0;

comment on column cotizacion_items.cantidad_atendida is
  'Cuánto de esta línea se ha facturado ya. Permite facturar una cotización en varias veces sin perder de vista lo que falta.';

do $$ begin
  alter table cotizacion_items add constraint cotiz_item_atendida_ok check (
    cantidad_atendida >= 0
    -- El techo es lo que el cliente CONFIRMÓ, no lo que se cotizó. Es la
    -- invariante que impide volver a emitir de más aunque alguien llame al RPC
    -- por su cuenta: no se le puede facturar a nadie más de lo que pidió.
    and cantidad_atendida <= coalesce(cantidad_aprobada, cantidad)
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Apuntar lo entregado y cerrar solo si no queda nada
-- ---------------------------------------------------------------------------
-- Vive en su propia función y no dentro de `emitir_comprobante` por dos
-- motivos: se puede probar sola, y deja que el parche sobre esa función —que
-- tiene 195 líneas— sea de una sola línea.
create or replace function public.registrar_atencion_de_cotizacion(
  p_cotizacion  uuid,
  p_comprobante uuid
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_prod  record;
  v_linea record;
  v_resto numeric;
  v_cabe  numeric;
begin
  if p_cotizacion is null or p_comprobante is null then return; end if;

  -- Por producto, porque un comprobante puede traer el mismo en dos líneas.
  for v_prod in
    select producto_id, sum(cantidad) as cantidad
      from comprobante_items
     where comprobante_id = p_comprobante and producto_id is not null
     group by producto_id
  loop
    v_resto := v_prod.cantidad;

    -- Y se reparte entre las líneas de la cotización que llevan ese producto,
    -- EN ORDEN y sin pasar de lo confirmado en cada una. Con una línea por
    -- producto —lo normal— es una resta; con dos, la primera se sirve entera
    -- antes que la segunda, igual que se sirve al cliente.
    for v_linea in
      select id, cantidad_atendida, coalesce(cantidad_aprobada, cantidad) as tope
        from cotizacion_items
       where cotizacion_id = p_cotizacion and producto_id = v_prod.producto_id
       order by orden
    loop
      exit when v_resto <= 0;
      v_cabe := least(v_resto, v_linea.tope - v_linea.cantidad_atendida);
      if v_cabe > 0 then
        update cotizacion_items
           set cantidad_atendida = cantidad_atendida + v_cabe
         where id = v_linea.id;
        v_resto := v_resto - v_cabe;
      end if;
    end loop;

    -- Si sobra, NO se revienta la emisión. Facturar algo que no estaba en la
    -- cotización —o más de lo confirmado, porque el cliente cambió de idea en
    -- el mostrador— es una venta legítima; simplemente no cuelga de esta
    -- cotización, que es lo que esta tabla dice.
  end loop;

  -- El cierre pasa a ser una consecuencia, no un efecto secundario de emitir.
  update cotizaciones q
     set estado = 'atendida'
   where q.id = p_cotizacion
     and q.estado = 'aprobada'
     and not exists (
       select 1 from cotizacion_items ci
        where ci.cotizacion_id = q.id
          and ci.cantidad_atendida < coalesce(ci.cantidad_aprobada, ci.cantidad));
end $$;

comment on function public.registrar_atencion_de_cotizacion(uuid, uuid) is
  'Descuenta de la cotización lo que acaba de facturarse, línea a línea, y la cierra solo cuando no queda nada pendiente.';

revoke execute on function public.registrar_atencion_de_cotizacion(uuid, uuid) from public, anon;
grant execute on function public.registrar_atencion_de_cotizacion(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- El parche sobre `emitir_comprobante`
-- ---------------------------------------------------------------------------
-- Se reescribe SOLO el bloque del cierre, sobre la definición que haya en la
-- base. Es la misma técnica de la 018 y por el mismo motivo: copiar aquí las
-- 195 líneas de la función la duplicaría, y a la siguiente vez que alguien
-- tocara la 004 las dos versiones se separarían sin que nadie lo notara.
do $bloque$
declare
  v_def text;
  -- Se busca con expresión regular y no con texto literal: el cuerpo guardado
  -- en la base lleva los saltos de línea con los que se aplicó la 004 —CRLF,
  -- porque el fichero venía así— y un `position()` con saltos simples no
  -- encuentra nada. El `\s+` deja el parche indiferente a eso.
  v_patron text := 'update cotizaciones set estado = ''atendida''\s+'
                || 'where id = \(p_datos ->> ''cotizacion_id''\)::uuid and estado = ''aprobada'';';
  v_nuevo text := 'perform public.registrar_atencion_de_cotizacion((p_datos ->> ''cotizacion_id'')::uuid, v_id);';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_comprobante';

  if v_def is null then
    raise exception 'No existe emitir_comprobante: aplica antes 004_funciones.sql';
  end if;

  if v_def !~ v_patron then
    if position('registrar_atencion_de_cotizacion' in v_def) > 0 then
      raise notice 'emitir_comprobante ya estaba parcheada; no se toca nada.';
    else
      raise exception 'No encuentro el bloque de cierre en emitir_comprobante: alguien lo cambió y este parche ya no vale';
    end if;
  else
    execute regexp_replace(v_def, v_patron, v_nuevo);
  end if;

  -- Y se comprueba que de verdad quedó dentro. Un `execute` que no falla
  -- no demuestra que la sustitución ocurriera.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_comprobante';
  if position('registrar_atencion_de_cotizacion' in v_def) = 0 then
    raise exception 'El parche no llegó a aplicarse sobre emitir_comprobante';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------------
-- Y la bandeja deja de pedir lo que ya se entregó
-- ---------------------------------------------------------------------------
create or replace view v_comprometido
with (security_invoker = true) as
select
  ci.producto_id,
  ci.cotizacion_id,
  ci.id                      as item_id,
  q.numero                   as cotizacion,
  q.fecha,
  q.cliente_id,
  cl.razon_social            as cliente,
  ci.codigo,
  ci.descripcion,
  ci.marca,
  ci.disponibilidad,
  coalesce(ci.dias_entrega, public.dias_por_defecto(ci.disponibilidad)) as dias_entrega,
  ci.cantidad                as cotizado,
  -- Lo confirmado MENOS lo ya facturado (047). Antes era solo lo confirmado, y
  -- con una factura parcial la bandeja mandaba a comprar de nuevo algo que ya
  -- se había entregado.
  --
  -- El `::numeric(14,2)` no es cosmético: `create or replace view` se niega a
  -- cambiarle el tipo a una columna que ya existía, y la resta de dos
  -- `numeric(14,2)` da un `numeric` a secas.
  (ci.cantidad_aprobada - ci.cantidad_atendida)::numeric(14,2) as comprometido,
  ci.costo_unitario          as costo_referencia,
  coalesce(s.cantidad, 0)    as stock,
  greatest(ci.cantidad_aprobada - ci.cantidad_atendida - coalesce(s.cantidad, 0), 0) as falta,
  -- Al final, y no al lado de `comprometido`, por lo mismo: `create or replace`
  -- tampoco deja reordenar columnas, solo añadir detrás.
  ci.cantidad_atendida       as atendido
from cotizacion_items ci
join cotizaciones q on q.id = ci.cotizacion_id
join clientes cl    on cl.id = q.cliente_id
left join stock s   on s.producto_id = ci.producto_id
where q.estado = 'aprobada'
  and ci.producto_id is not null
  and coalesce(ci.cantidad_aprobada, 0) - ci.cantidad_atendida > 0;

comment on view v_comprometido is
  'Líneas confirmadas por el cliente que siguen pendientes de entregar —descontando lo ya facturado— con lo que falta contra el stock. Es de donde sale la bandeja «Por comprar».';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Se factura una cotización EN DOS VECES contra la base real y se comprueba
-- que en medio no desaparece nada. Leer la función no demuestra eso.
do $$
declare
  v_quien   uuid;
  v_cliente uuid;
  v_prod    uuid;
  v_cot     uuid;
  v_item    uuid;
  v_r       jsonb;
  v_n       numeric;
  v_estado  estado_cotizacion;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select p.id into v_prod  from productos p where p.precio_minimo = 0 limit 1;
  if v_quien is null or v_prod is null then
    raise notice 'Sin perfil de gerencia o sin productos: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  insert into clientes (codigo, razon_social, tipo_documento, numero_documento)
  values ('ZZTEST047', 'ZZTEST FACTURA PARCIAL', 'RUC', '20100070970')
  on conflict do nothing;
  select id into v_cliente from clientes where codigo = 'ZZTEST047';

  -- Se cotizan 6 y el cliente confirma 6.
  v_r := public.crear_cotizacion(jsonb_build_object(
    'cliente_id', v_cliente,
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'codigo', 'ZZ', 'descripcion', 'ZZTEST',
      'cantidad', 6, 'valor_unitario', 50, 'costo_unitario', 40))));
  v_cot := (v_r ->> 'id')::uuid;
  perform public.aprobar_cotizacion(v_cot);

  select id into v_item from cotizacion_items where cotizacion_id = v_cot;

  -- Primera factura: 4 de las 6.
  v_r := public.emitir_comprobante(jsonb_build_object(
    'tipo', 'factura', 'serie', 'F001', 'cliente_id', v_cliente,
    'cotizacion_id', v_cot, 'condicion_pago', 'contado',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'codigo', 'ZZ', 'descripcion', 'ZZTEST',
      'cantidad', 4, 'valor_unitario', 50))));

  select cantidad_atendida into v_n from cotizacion_items where id = v_item;
  if v_n is distinct from 4 then
    raise exception 'No se apuntó lo facturado: cantidad_atendida quedó en %', v_n;
  end if;

  -- LO IMPORTANTE: la cotización sigue viva y la bandeja sigue viendo las 2.
  select estado into v_estado from cotizaciones where id = v_cot;
  if v_estado <> 'aprobada' then
    raise exception 'La cotización se cerró con una factura parcial: quedó en %', v_estado;
  end if;

  select comprometido into v_n from v_comprometido where item_id = v_item;
  if v_n is distinct from 2 then
    raise exception 'La bandeja perdió lo pendiente: dice % y esperaba 2', v_n;
  end if;

  -- Segunda factura: las 2 que faltaban.
  v_r := public.emitir_comprobante(jsonb_build_object(
    'tipo', 'factura', 'serie', 'F001', 'cliente_id', v_cliente,
    'cotizacion_id', v_cot, 'condicion_pago', 'contado',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'codigo', 'ZZ', 'descripcion', 'ZZTEST',
      'cantidad', 2, 'valor_unitario', 50))));

  select estado into v_estado from cotizaciones where id = v_cot;
  if v_estado <> 'atendida' then
    raise exception 'La cotización no se cerró al entregarlo todo: quedó en %', v_estado;
  end if;
  if exists (select 1 from v_comprometido where item_id = v_item) then
    raise exception 'La bandeja sigue pidiendo algo que ya se entregó entero';
  end if;

  -- Y no se puede facturar de más: el techo es lo que el cliente confirmó.
  begin
    update cotizacion_items set cantidad_atendida = 7 where id = v_item;
    raise exception 'Dejó apuntar más entregado de lo que el cliente confirmó';
  exception when check_violation then null;
  end;

  -- Limpieza.
  --
  -- Incluye DEVOLVER los dos correlativos de F001 que esta prueba ha gastado.
  -- F001 es una serie FISCAL: un salto ahí no es un número feo, es un hueco en
  -- la numeración que SUNAT pregunta. Y esta migración se puede reaplicar.
  update series_documento
     set correlativo_actual = greatest(correlativo_actual - 2, 0)
   where serie = 'F001' and tipo = 'factura';

  -- Y el de la cotización de prueba, por lo mismo: la numeración de las
  -- cotizaciones la ve el cliente en el papel.
  update series_documento
     set correlativo_actual = greatest(correlativo_actual - 1, 0)
   where tipo = 'cotizacion' and predeterminada;

  delete from comprobante_cuotas where comprobante_id in
    (select id from comprobantes where cliente_id = v_cliente);
  delete from comprobante_items where comprobante_id in
    (select id from comprobantes where cliente_id = v_cliente);
  delete from comprobantes where cliente_id = v_cliente;
  delete from cotizaciones where id = v_cot;
  delete from clientes where id = v_cliente;
  perform set_config('request.jwt.claims', '', true);


  -- Y se borra el rastro que esta prueba dejó en la bitácora (051). Estas
  -- migraciones se reaplican, y una bitácora que acumula documentos de
  -- prueba deja de servir para lo que se hizo.
  delete from actividad
   where entidad in ('comprobantes', 'cotizaciones', 'clientes')
     and creado_en > now() - interval '2 minutes';

  raise notice 'Una cotización se puede facturar en dos veces sin perder lo que falta.';
end $$;
