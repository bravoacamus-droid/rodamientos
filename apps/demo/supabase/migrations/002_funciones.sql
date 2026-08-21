-- ============================================================================
-- ERP RODATECH · Funciones, triggers y vistas
-- ============================================================================

-- ---------------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------------
create or replace function public.mi_rol()
returns rol_usuario
language sql stable security definer set search_path = public
as $$ select rol from profiles where id = auth.uid() $$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select rol in ('admin','gerencia') from profiles where id = auth.uid()), false) $$;

-- Perfil automático al crear usuario en auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'rol')::rol_usuario, 'ventas')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Número correlativo genérico
create or replace function public.siguiente_numero(p_prefijo text, p_tabla text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_max integer;
  v_anio text := to_char(current_date, 'YY');
  v_sql  text;
begin
  v_sql := format(
    'select coalesce(max(nullif(regexp_replace(numero, ''^%s-%s-'', ''''), '''')::integer), 0) from %I where numero like ''%s-%s-%%''',
    p_prefijo, v_anio, p_tabla, p_prefijo, v_anio);
  execute v_sql into v_max;
  return p_prefijo || '-' || v_anio || '-' || lpad((v_max + 1)::text, 5, '0');
end $$;

-- Siguiente correlativo de comprobante (reserva atómica)
create or replace function public.siguiente_correlativo(p_tipo tipo_comprobante, p_serie text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_next integer;
begin
  update series_documento
     set correlativo = correlativo + 1
   where tipo = p_tipo and serie = p_serie and activo
  returning correlativo into v_next;
  if v_next is null then
    raise exception 'Serie % no configurada para el tipo %', p_serie, p_tipo;
  end if;
  return v_next;
end $$;

-- ---------------------------------------------------------------------------
-- KARDEX · registrar movimiento con costo promedio ponderado
-- ---------------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_producto     uuid,
  p_almacen      uuid,
  p_tipo         tipo_movimiento,
  p_cantidad     numeric,
  p_costo        numeric default null,
  p_ref_tipo     text    default null,
  p_ref_id       uuid    default null,
  p_ref_numero   text    default null,
  p_motivo       text    default null,
  p_usuario      uuid    default null,
  p_fecha        timestamptz default now(),
  p_documento    text    default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_signo         int;
  v_prev_cant     numeric(14,2) := 0;
  v_prev_val      numeric(16,4) := 0;
  v_costo_prom    numeric(14,4) := 0;
  v_costo_mov     numeric(14,4);
  v_new_cant      numeric(14,2);
  v_new_val       numeric(16,4);
  v_id            uuid;
begin
  v_signo := case
    when p_tipo in ('ingreso','ajuste_positivo','transferencia_entrada','regularizacion') then 1
    else -1 end;

  select saldo_cantidad, saldo_valorizado
    into v_prev_cant, v_prev_val
    from movimientos_inventario
   where producto_id = p_producto and almacen_id = p_almacen
   order by fecha desc, creado_en desc
   limit 1;

  v_prev_cant := coalesce(v_prev_cant, 0);
  v_prev_val  := coalesce(v_prev_val, 0);
  v_costo_prom := case when v_prev_cant > 0 then v_prev_val / v_prev_cant
                       else coalesce((select costo_promedio from productos where id = p_producto), 0) end;

  if v_signo = 1 then
    v_costo_mov := coalesce(p_costo, v_costo_prom);
    v_new_cant  := v_prev_cant + p_cantidad;
    v_new_val   := v_prev_val + (p_cantidad * v_costo_mov);
  else
    v_costo_mov := coalesce(p_costo, v_costo_prom);
    v_new_cant  := v_prev_cant - p_cantidad;
    v_new_val   := v_prev_val - (p_cantidad * v_costo_mov);
  end if;

  if v_new_cant > 0 then
    v_costo_prom := v_new_val / v_new_cant;
  end if;

  insert into movimientos_inventario (
    fecha, producto_id, almacen_id, tipo, cantidad, costo_unitario,
    saldo_cantidad, saldo_valorizado, costo_promedio,
    referencia_tipo, referencia_id, referencia_numero, documento, motivo, usuario_id
  ) values (
    p_fecha, p_producto, p_almacen, p_tipo, p_cantidad, v_costo_mov,
    v_new_cant, v_new_val, v_costo_prom,
    p_ref_tipo, p_ref_id, p_ref_numero, p_documento, p_motivo, p_usuario
  ) returning id into v_id;

  insert into stock (producto_id, almacen_id, cantidad, actualizado_en)
  values (p_producto, p_almacen, v_new_cant, p_fecha)
  on conflict (producto_id, almacen_id)
  do update set cantidad = excluded.cantidad, actualizado_en = excluded.actualizado_en;

  update productos
     set costo_promedio = case when v_new_cant > 0 then v_costo_prom else costo_promedio end,
         ultimo_costo   = case when v_signo = 1 then v_costo_mov else ultimo_costo end,
         actualizado_en = now()
   where id = p_producto;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- COBRANZAS · recalcular saldo del comprobante al registrar/eliminar pagos
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_comprobante()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := coalesce(new.comprobante_id, old.comprobante_id);
  v_pagado numeric(14,2);
  v_total  numeric(14,2);
  v_venc   date;
begin
  select coalesce(sum(monto),0) into v_pagado from pagos where comprobante_id = v_id;
  select total, fecha_vencimiento into v_total, v_venc from comprobantes where id = v_id;

  update comprobantes
     set pagado = v_pagado,
         saldo  = greatest(v_total - v_pagado, 0),
         estado = (case
           when estado = 'anulado' then 'anulado'
           when v_pagado >= v_total - 0.01 then 'pagado'
           when v_pagado > 0 and v_venc < current_date then 'vencido'
           when v_pagado > 0 then 'parcial'
           when v_venc < current_date then 'vencido'
           else 'emitido' end)::estado_comprobante
   where id = v_id;
  return null;
end $$;

drop trigger if exists trg_pagos_recalcular on pagos;
create trigger trg_pagos_recalcular
  after insert or update or delete on pagos
  for each row execute function public.recalcular_comprobante();

-- ---------------------------------------------------------------------------
-- LANDED COST · prorrateo de gastos de importación
-- ---------------------------------------------------------------------------
create or replace function public.calcular_landed_cost(p_importacion uuid)
returns table (
  producto_id uuid,
  codigo text,
  descripcion text,
  cantidad numeric,
  costo_fob_unit numeric,
  costo_fob_total numeric,
  base_prorrateo numeric,
  participacion numeric,
  gastos_asignados numeric,
  costo_landed_unit numeric,
  costo_landed_total numeric,
  incremento_pct numeric
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_oc uuid;
  v_metodo text;
  v_tc numeric;
  v_gastos numeric;
  v_base_total numeric;
begin
  select i.orden_compra_id, i.metodo_prorrateo, i.tipo_cambio,
         (i.flete + i.seguro + i.ad_valorem + i.ipm + i.agente_aduana +
          i.almacen_portuario + i.transporte_interno + i.otros_gastos)
    into v_oc, v_metodo, v_tc, v_gastos
    from importaciones i where i.id = p_importacion;

  if v_oc is null then return; end if;

  select sum(case v_metodo
               when 'peso'     then oi.peso_kg * oi.cantidad
               when 'cantidad' then oi.cantidad
               else oi.subtotal end)
    into v_base_total
    from oc_items oi where oi.orden_compra_id = v_oc;

  if coalesce(v_base_total,0) = 0 then v_base_total := 1; end if;

  return query
  select
    oi.producto_id,
    oi.codigo,
    oi.descripcion,
    oi.cantidad,
    round(oi.costo_unitario * v_tc, 4)                                        as costo_fob_unit,
    round(oi.subtotal * v_tc, 2)                                              as costo_fob_total,
    round(case v_metodo when 'peso' then oi.peso_kg * oi.cantidad
                        when 'cantidad' then oi.cantidad
                        else oi.subtotal end, 4)                              as base_prorrateo,
    round(case v_metodo when 'peso' then oi.peso_kg * oi.cantidad
                        when 'cantidad' then oi.cantidad
                        else oi.subtotal end / v_base_total * 100, 4)         as participacion,
    round(case v_metodo when 'peso' then oi.peso_kg * oi.cantidad
                        when 'cantidad' then oi.cantidad
                        else oi.subtotal end / v_base_total * v_gastos, 2)    as gastos_asignados,
    round((oi.subtotal * v_tc + (case v_metodo when 'peso' then oi.peso_kg * oi.cantidad
                                               when 'cantidad' then oi.cantidad
                                               else oi.subtotal end / v_base_total * v_gastos))
          / nullif(oi.cantidad,0), 4)                                         as costo_landed_unit,
    round(oi.subtotal * v_tc + (case v_metodo when 'peso' then oi.peso_kg * oi.cantidad
                                              when 'cantidad' then oi.cantidad
                                              else oi.subtotal end / v_base_total * v_gastos), 2) as costo_landed_total,
    round(((oi.subtotal * v_tc + (case v_metodo when 'peso' then oi.peso_kg * oi.cantidad
                                                when 'cantidad' then oi.cantidad
                                                else oi.subtotal end / v_base_total * v_gastos))
          / nullif(oi.subtotal * v_tc, 0) - 1) * 100, 2)                      as incremento_pct
  from oc_items oi
  where oi.orden_compra_id = v_oc
  order by oi.orden;
end $$;

-- ---------------------------------------------------------------------------
-- MOTOR DE ALERTAS (Nivel 1 · reglas + histórico)
-- ---------------------------------------------------------------------------
create or replace function public.generar_alertas()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer := 0;
begin
  delete from alertas where archivada = false;

  -- Stock por agotarse
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'stock_bajo',
         (case when coalesce(s.total,0) <= 0 then 'critica'
              when coalesce(s.total,0) <= p.stock_minimo * 0.5 then 'alta'
              else 'media' end)::severidad_alerta,
         'Stock por agotarse: ' || p.sku,
         p.descripcion || ' · Stock ' || coalesce(s.total,0)::text || ' ' || p.unidad ||
         ' (mínimo ' || p.stock_minimo::text || ')',
         'producto', p.id, p.sku, coalesce(s.total,0),
         '/productos/' || p.id
  from productos p
  left join (select producto_id, sum(cantidad) total from stock group by producto_id) s on s.producto_id = p.id
  where p.activo and p.stock_minimo > 0 and coalesce(s.total,0) <= p.stock_minimo;
  get diagnostics v_count = row_count;

  -- Créditos vencidos
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'credito_vencido', 'critica'::severidad_alerta,
         'Documento vencido: ' || c.numero,
         cl.razon_social || ' · S/ ' || to_char(c.saldo,'FM999,999,990.00') ||
         ' vencido hace ' || (current_date - c.fecha_vencimiento)::text || ' días',
         'comprobante', c.id, c.numero, c.saldo,
         '/cobranzas'
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.saldo > 0.01 and c.estado <> 'anulado' and c.fecha_vencimiento < current_date;

  -- Créditos por vencer (7 días)
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'credito_vence', 'media'::severidad_alerta,
         'Por vencer: ' || c.numero,
         cl.razon_social || ' · S/ ' || to_char(c.saldo,'FM999,999,990.00') ||
         ' vence en ' || (c.fecha_vencimiento - current_date)::text || ' días',
         'comprobante', c.id, c.numero, c.saldo,
         '/cobranzas'
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.saldo > 0.01 and c.estado <> 'anulado'
    and c.fecha_vencimiento between current_date and current_date + 7;

  -- Línea de crédito excedida
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'linea_credito', 'alta'::severidad_alerta,
         'Línea de crédito excedida',
         cl.razon_social || ' · deuda S/ ' || to_char(d.deuda,'FM999,999,990.00') ||
         ' sobre línea de S/ ' || to_char(cl.linea_credito,'FM999,999,990.00'),
         'cliente', cl.id, cl.razon_social, d.deuda,
         '/clientes/' || cl.id
  from clientes cl
  join (select cliente_id, sum(saldo) deuda from comprobantes
        where saldo > 0 and estado <> 'anulado' group by cliente_id) d on d.cliente_id = cl.id
  where cl.linea_credito > 0 and d.deuda > cl.linea_credito;

  -- Productos sin rotación (90 días con stock)
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'sin_rotacion', 'baja'::severidad_alerta,
         'Sin rotación: ' || p.sku,
         p.descripcion || ' · ' || coalesce(s.total,0)::text || ' und inmovilizadas · valorizado S/ ' ||
         to_char(coalesce(s.total,0) * p.costo_promedio, 'FM999,999,990.00'),
         'producto', p.id, p.sku, coalesce(s.total,0) * p.costo_promedio,
         '/productos/' || p.id
  from productos p
  join (select producto_id, sum(cantidad) total from stock group by producto_id) s on s.producto_id = p.id
  where p.activo and s.total > 0
    and not exists (
      select 1 from movimientos_inventario m
      where m.producto_id = p.id and m.tipo = 'salida'
        and m.fecha > now() - interval '90 days');

  -- Reposición sugerida por rotación
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'reposicion', 'media'::severidad_alerta,
         'Reposición sugerida: ' || p.sku,
         'Rotación de ' || round(r.salidas,0)::text || ' und en 90 días · stock actual ' ||
         coalesce(s.total,0)::text || ' · cobertura ' ||
         round(coalesce(s.total,0) / nullif(r.salidas/90.0, 0), 0)::text || ' días',
         'producto', p.id, p.sku, ceil(r.salidas / 90.0 * 45),
         '/productos/' || p.id
  from productos p
  join (select producto_id, sum(cantidad) salidas from movimientos_inventario
        where tipo = 'salida' and fecha > now() - interval '90 days'
        group by producto_id having sum(cantidad) > 0) r on r.producto_id = p.id
  left join (select producto_id, sum(cantidad) total from stock group by producto_id) s on s.producto_id = p.id
  where p.activo
    and coalesce(s.total,0) / nullif(r.salidas/90.0, 0) < 30;

  -- Pedidos de emergencia pendientes de aprobación
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'emergencia', 'alta'::severidad_alerta,
         'Pedido de emergencia pendiente: ' || pe.numero,
         cl.razon_social || ' · S/ ' || to_char(pe.total,'FM999,999,990.00') || ' requiere aprobación administrativa',
         'pedido', pe.id, pe.numero, pe.total,
         '/pedidos/' || pe.id
  from pedidos pe join clientes cl on cl.id = pe.cliente_id
  where pe.es_emergencia and pe.requiere_aprobacion and pe.aprobado_en is null and pe.estado <> 'anulado';

  -- Margen bajo en cotizaciones vigentes
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url)
  select 'margen_bajo', 'alta'::severidad_alerta,
         'Margen bajo en ' || c.numero,
         cl.razon_social || ' · margen ' || round(c.margen_pct,1)::text || '% por debajo del mínimo (15%)',
         'cotizacion', c.id, c.numero, c.margen_pct,
         '/cotizaciones/' || c.id
  from cotizaciones c join clientes cl on cl.id = c.cliente_id
  where c.estado in ('borrador','enviada') and c.margen_pct < 15 and c.total > 0;

  select count(*) into v_count from alertas where archivada = false;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- VISTAS ANALÍTICAS
-- ---------------------------------------------------------------------------
create or replace view v_stock_productos as
select
  p.id,
  p.sku,
  p.codigo_fabricante,
  p.descripcion,
  p.unidad,
  p.stock_minimo,
  p.costo_promedio,
  p.precio_mayorista,
  p.precio_fabrica,
  p.precio_importacion,
  p.activo,
  p.atributos,
  p.imagen_url,
  p.ubicacion,
  m.nombre as marca,
  m.id     as marca_id,
  m.segmento as marca_segmento,
  cat.nombre as categoria,
  cat.id   as categoria_id,
  cat.slug as categoria_slug,
  coalesce(s.total, 0) as stock_total,
  coalesce(s.total, 0) * p.costo_promedio as valorizado,
  case when coalesce(s.total,0) <= 0 then 'agotado'
       when p.stock_minimo > 0 and coalesce(s.total,0) <= p.stock_minimo then 'critico'
       when p.stock_minimo > 0 and coalesce(s.total,0) <= p.stock_minimo * 1.5 then 'bajo'
       else 'normal' end as estado_stock
from productos p
left join marcas m on m.id = p.marca_id
left join categorias cat on cat.id = p.categoria_id
left join (select producto_id, sum(cantidad) total from stock group by producto_id) s on s.producto_id = p.id;

create or replace view v_ventas_mensuales as
select
  date_trunc('month', c.fecha_emision)::date as mes,
  to_char(date_trunc('month', c.fecha_emision)::date, 'TMMon YY') as etiqueta,
  count(*) as documentos,
  sum(c.op_gravada) as venta_neta,
  sum(c.total) as venta_total,
  sum(c.costo_total) as costo,
  sum(c.op_gravada - c.costo_total) as margen,
  case when sum(c.op_gravada) > 0
       then round((sum(c.op_gravada - c.costo_total) / sum(c.op_gravada)) * 100, 2)
       else 0 end as margen_pct
from comprobantes c
where c.estado <> 'anulado' and c.tipo <> 'nota_credito'
group by 1, 2
order by 1;

create or replace view v_top_productos as
select
  p.id, p.sku, p.descripcion, m.nombre as marca, cat.nombre as categoria,
  sum(ci.cantidad) as unidades,
  sum(ci.subtotal) as venta,
  sum(ci.subtotal - ci.costo_unitario * ci.cantidad) as margen,
  count(distinct c.cliente_id) as clientes
from comprobante_items ci
join comprobantes c on c.id = ci.comprobante_id and c.estado <> 'anulado' and c.tipo <> 'nota_credito'
join productos p on p.id = ci.producto_id
left join marcas m on m.id = p.marca_id
left join categorias cat on cat.id = p.categoria_id
group by p.id, p.sku, p.descripcion, m.nombre, cat.nombre;

create or replace view v_cartera as
select
  c.id, c.numero, c.tipo, c.fecha_emision, c.fecha_vencimiento, c.total, c.pagado, c.saldo, c.estado,
  c.moneda,
  cl.id as cliente_id, cl.razon_social as cliente, cl.ruc, cl.telefono, cl.whatsapp, cl.email,
  cl.linea_credito, cl.dias_credito,
  (current_date - c.fecha_vencimiento) as dias_vencido,
  case
    when c.fecha_vencimiento >= current_date then 'vigente'
    when current_date - c.fecha_vencimiento <= 15 then '1-15'
    when current_date - c.fecha_vencimiento <= 30 then '16-30'
    when current_date - c.fecha_vencimiento <= 60 then '31-60'
    else '60+' end as tramo,
  pr.nombre as vendedor
from comprobantes c
join clientes cl on cl.id = c.cliente_id
left join profiles pr on pr.id = c.vendedor_id
where c.saldo > 0.01 and c.estado <> 'anulado';

create or replace view v_resumen_clientes as
select
  cl.id, cl.codigo, cl.ruc, cl.razon_social, cl.nombre_comercial, cl.sector, cl.distrito,
  cl.linea_credito, cl.dias_credito, cl.lista_precio, cl.activo, cl.email, cl.telefono, cl.whatsapp,
  cl.contacto, cl.direccion,
  coalesce(v.total_vendido, 0) as total_vendido,
  coalesce(v.documentos, 0)    as documentos,
  coalesce(v.margen, 0)        as margen,
  coalesce(d.deuda, 0)         as deuda,
  coalesce(d.vencido, 0)       as vencido,
  greatest(cl.linea_credito - coalesce(d.deuda,0), 0) as credito_disponible,
  v.ultima_compra,
  coalesce(q.cotizaciones, 0)  as cotizaciones
from clientes cl
left join (
  select cliente_id, sum(total) total_vendido, count(*) documentos,
         sum(op_gravada - costo_total) margen, max(fecha_emision) ultima_compra
  from comprobantes where estado <> 'anulado' and tipo <> 'nota_credito' group by cliente_id
) v on v.cliente_id = cl.id
left join (
  select cliente_id, sum(saldo) deuda,
         sum(case when fecha_vencimiento < current_date then saldo else 0 end) vencido
  from comprobantes where saldo > 0 and estado <> 'anulado' group by cliente_id
) d on d.cliente_id = cl.id
left join (
  select cliente_id, count(*) cotizaciones from cotizaciones group by cliente_id
) q on q.cliente_id = cl.id;

-- KPIs del dashboard
create or replace function public.kpis_dashboard(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_desde date := coalesce(p_desde, date_trunc('month', current_date)::date);
  v_hasta date := coalesce(p_hasta, current_date);
  v_dias  int  := greatest((v_hasta - v_desde) + 1, 1);
  v_prev_desde date := v_desde - v_dias;
  v_prev_hasta date := v_desde - 1;
  r jsonb;
begin
  select jsonb_build_object(
    'ventas',            coalesce((select sum(total) from comprobantes where estado<>'anulado' and tipo<>'nota_credito' and fecha_emision between v_desde and v_hasta),0),
    'ventas_prev',       coalesce((select sum(total) from comprobantes where estado<>'anulado' and tipo<>'nota_credito' and fecha_emision between v_prev_desde and v_prev_hasta),0),
    'venta_neta',        coalesce((select sum(op_gravada) from comprobantes where estado<>'anulado' and tipo<>'nota_credito' and fecha_emision between v_desde and v_hasta),0),
    'margen',            coalesce((select sum(op_gravada - costo_total) from comprobantes where estado<>'anulado' and tipo<>'nota_credito' and fecha_emision between v_desde and v_hasta),0),
    'margen_prev',       coalesce((select sum(op_gravada - costo_total) from comprobantes where estado<>'anulado' and tipo<>'nota_credito' and fecha_emision between v_prev_desde and v_prev_hasta),0),
    'documentos',        coalesce((select count(*) from comprobantes where estado<>'anulado' and fecha_emision between v_desde and v_hasta),0),
    'cotizaciones',      coalesce((select count(*) from cotizaciones where fecha between v_desde and v_hasta),0),
    'cotizaciones_monto',coalesce((select sum(total) from cotizaciones where fecha between v_desde and v_hasta),0),
    'convertidas',       coalesce((select count(*) from cotizaciones where fecha between v_desde and v_hasta and estado in ('aceptada','convertida')),0),
    'pedidos_pendientes',coalesce((select count(*) from pedidos where estado in ('pendiente','aprobado','preparacion')),0),
    'emergencias',       coalesce((select count(*) from pedidos where es_emergencia and requiere_aprobacion and aprobado_en is null and estado <> 'anulado'),0),
    'cartera',           coalesce((select sum(saldo) from comprobantes where saldo>0 and estado<>'anulado'),0),
    'cartera_vencida',   coalesce((select sum(saldo) from comprobantes where saldo>0 and estado<>'anulado' and fecha_vencimiento < current_date),0),
    'cobrado',           coalesce((select sum(monto) from pagos where fecha between v_desde and v_hasta),0),
    'compras',           coalesce((select sum(total) from ordenes_compra where estado not in ('borrador','anulada') and fecha between v_desde and v_hasta),0),
    'valorizado',        coalesce((select sum(s.cantidad * p.costo_promedio) from stock s join productos p on p.id=s.producto_id),0),
    'skus',              coalesce((select count(*) from productos where activo),0),
    'skus_criticos',     coalesce((select count(*) from v_stock_productos where estado_stock in ('critico','agotado') and activo),0),
    'clientes_activos',  coalesce((select count(distinct cliente_id) from comprobantes where fecha_emision between v_desde and v_hasta),0),
    'alertas',           coalesce((select count(*) from alertas where not archivada),0),
    'alertas_criticas',  coalesce((select count(*) from alertas where not archivada and severidad in ('alta','critica')),0),
    'desde',             v_desde,
    'hasta',             v_hasta
  ) into r;
  return r;
end $$;

-- Proyección de ventas (regresión lineal simple sobre los últimos 12 meses)
create or replace function public.proyeccion_ventas(p_meses int default 3)
returns table (mes date, etiqueta text, valor_real numeric, proyectado numeric)
language sql stable security definer set search_path = public
as $$
  with hist as (
    select row_number() over (order by v.mes) as x, v.mes, v.venta_total as y
    from v_ventas_mensuales v
    where v.mes >= (date_trunc('month', current_date) - interval '12 months')::date
  ),
  reg as (
    select count(*)::numeric n, coalesce(sum(x),0)::numeric sx, coalesce(sum(y),0) sy,
           coalesce(sum(x*y),0) sxy, coalesce(sum(x*x),0)::numeric sxx, max(mes) ultimo
    from hist
  ),
  coef as (
    select n, ultimo,
      case when n > 1 and (n*sxx - sx*sx) <> 0 then (n*sxy - sx*sy)/(n*sxx - sx*sx) else 0 end as b,
      sy, sx
    from reg
  ),
  ab as (select n, ultimo, b, (sy - b*sx)/nullif(n,0) as a from coef)
  select h.mes, to_char(h.mes,'TMMon YY')::text, h.y,
         round((select a from ab) + (select b from ab) * h.x, 2)
  from hist h
  union all
  select ((select ultimo from ab) + (g.i || ' month')::interval)::date,
         to_char((select ultimo from ab) + (g.i || ' month')::interval, 'TMMon YY')::text,
         null::numeric,
         greatest(round((select a from ab) + (select b from ab) * ((select n from ab) + g.i), 2), 0)
  from generate_series(1, p_meses) g(i)
  where (select n from ab) > 1
  order by 1;
$$;

-- Búsqueda inteligente de productos con equivalencias
create or replace function public.buscar_productos(p_q text, p_limit int default 30)
returns table (
  id uuid, sku text, codigo_fabricante text, descripcion text, marca text,
  categoria text, stock numeric, precio_mayorista numeric, costo_promedio numeric,
  estado_stock text, relevancia real
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.sku, v.codigo_fabricante, v.descripcion, v.marca, v.categoria,
         v.stock_total, v.precio_mayorista, v.costo_promedio, v.estado_stock,
         greatest(
           similarity(lower(v.sku), lower(p_q)),
           similarity(lower(v.codigo_fabricante), lower(p_q)),
           similarity(lower(v.descripcion), lower(p_q))
         )::real as relevancia
  from v_stock_productos v
  where v.activo
    and (lower(v.sku) like '%' || lower(p_q) || '%'
      or lower(v.codigo_fabricante) like '%' || lower(p_q) || '%'
      or lower(v.descripcion) like '%' || lower(p_q) || '%')
  order by relevancia desc, v.stock_total desc
  limit p_limit;
$$;

-- Equivalencias de un producto (bidireccional) con stock
create or replace function public.equivalencias_de(p_producto uuid)
returns table (
  id uuid, sku text, codigo_fabricante text, descripcion text, marca text,
  marca_segmento text, tipo tipo_equivalencia, nota text,
  stock numeric, precio_mayorista numeric, estado_stock text
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.sku, v.codigo_fabricante, v.descripcion, v.marca, v.marca_segmento,
         e.tipo, e.nota, v.stock_total, v.precio_mayorista, v.estado_stock
  from producto_equivalencias e
  join v_stock_productos v on v.id = e.equivalente_id
  where e.producto_id = p_producto
  union
  select v.id, v.sku, v.codigo_fabricante, v.descripcion, v.marca, v.marca_segmento,
         e.tipo, e.nota, v.stock_total, v.precio_mayorista, v.estado_stock
  from producto_equivalencias e
  join v_stock_productos v on v.id = e.producto_id
  where e.equivalente_id = p_producto;
$$;

-- Historial de precios de un producto (últimas operaciones)
create or replace function public.historial_producto(p_producto uuid, p_limit int default 20)
returns table (
  fecha date, documento text, origen text, cliente text,
  cantidad numeric, precio_unitario numeric, estado text
)
language sql stable security definer set search_path = public
as $$
  select h.fecha, h.documento, h.origen, h.cliente, h.cantidad, h.precio_unitario, h.estado
  from v_historial_precios h
  where h.producto_id = p_producto
  order by h.fecha desc
  limit p_limit;
$$;

-- Número a letras (para comprobantes)
create or replace function public._tres_letras(n int)
returns text
language plpgsql immutable
as $$
declare
  unidades text[] := array['UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ',
    'ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE',
    'VEINTIUNO','VEINTIDOS','VEINTITRES','VEINTICUATRO','VEINTICINCO','VEINTISEIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
  decenas  text[] := array['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  centenas text[] := array['CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  t text := '';
begin
  if n is null or n = 0 then return ''; end if;
  if n = 100 then return 'CIEN'; end if;
  if n >= 100 then t := centenas[(n/100)] || ' '; n := n % 100; end if;
  if n = 0 then return trim(t); end if;
  if n <= 29 then return trim(t || unidades[n]); end if;
  t := t || decenas[(n/10)+1];
  if n % 10 <> 0 then t := t || ' Y ' || unidades[n % 10]; end if;
  return trim(t);
end $$;

create or replace function public.numero_a_letras(p_monto numeric, p_moneda text default 'PEN')
returns text
language plpgsql immutable
as $$
declare
  v_ent bigint; v_dec int; v_txt text := ''; v_mill bigint; v_miles int; v_resto int;
  v_sufijo text;
begin
  v_ent := floor(abs(p_monto))::bigint;
  v_dec := round((abs(p_monto) - v_ent) * 100)::int;
  if v_dec = 100 then v_ent := v_ent + 1; v_dec := 0; end if;

  v_sufijo := case when upper(p_moneda) = 'USD' then 'DÓLARES AMERICANOS' else 'SOLES' end;

  if v_ent = 0 then
    v_txt := 'CERO';
  else
    v_mill  := v_ent / 1000000;
    v_miles := ((v_ent % 1000000) / 1000)::int;
    v_resto := (v_ent % 1000)::int;
    if v_mill > 0 then
      v_txt := case when v_mill = 1 then 'UN MILLON' else public._tres_letras(v_mill::int) || ' MILLONES' end || ' ';
    end if;
    if v_miles > 0 then
      v_txt := v_txt || case when v_miles = 1 then 'MIL' else public._tres_letras(v_miles) || ' MIL' end || ' ';
    end if;
    if v_resto > 0 then v_txt := v_txt || public._tres_letras(v_resto); end if;
  end if;

  return trim(regexp_replace(v_txt, '\s+', ' ', 'g')) || ' CON ' || lpad(v_dec::text,2,'0') || '/100 ' || v_sufijo;
end $$;
