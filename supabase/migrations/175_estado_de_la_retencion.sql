-- 175 · El estado de la retención de cada factura, en un solo sitio
--
-- El problema. Willy, 31/10: *«debo saber qué comprobantes de retención se
-- han entregado y qué comprobantes de retención quedan pendientes para
-- buscarlo en sunat o de lo contrario pedir al cliente»*; y que a veces *«hacen
-- el pago pero el documento de la retención le pasan después de 3, 4 días»*.
--
-- Cada pantalla lo calculaba a su manera y decían cosas distintas:
--   · Facturación miraba solo `retencion_aplica`, así que las 515 facturas del
--     Excel —nacidas en false aunque el cliente retenga— no salían nunca en
--     «Falta el comprobante de retención», ni con la retención ya cobrada.
--   · Cobranzas lo calculaba en el navegador, y la factura cobrada se iba de
--     la cartera: el «cobrada, falta el CR», que es justo el caso de los 3-4
--     días, no se veía en ninguna lista.
--
-- Ahora una vista. Una factura LLEVA retención si nació con ella o si al
-- cobrarla se registró una (medio «Retención»): una factura emitida no se
-- modifica (`tg_comprobante_columnas_de_las_rpc`), y que se le cobrara una
-- retención es lo que dice que la tuvo.
--
--   estado_retencion
--     cr_recibido    — el CR está subido.
--     falta_cr       — la retención se cobró y el CR no ha llegado.
--     por_cobrar     — le toca retener y la factura aún se debe.
--     sin_retencion  — el cliente es agente pero esta factura no se retiene
--                      (no llega a S/ 700, o se cobró entera sin retener).
--     no_agente      — el cliente no es agente de retención.
--
-- `llega_umbral`: ¿pasa de S/ 700 al cambio del día de emisión? (la ley,
-- Willy 13/10). `null` si no hay cambio de ese día ni de antes.
--
-- `retencion_decidida`: si la retención se ELIGIÓ al facturar. Las facturas
-- emitidas desde el ERP salen de una cotización y pasan por el interruptor
-- «con / sin retención»; las del Excel no tienen cotización y no se sabe. Con
-- ella, Cobranzas avisa cuando el cobro contradice a la factura.
--
-- `security_invoker`: lee con los permisos de quien consulta, como las tablas.

drop view if exists public.v_retenciones;
create view public.v_retenciones
with (security_invoker = true) as
with cobrado as (
  select p.comprobante_id, sum(p.monto) as monto, max(p.fecha) as fecha
    from pagos p
   where p.medio = 'retencion'
   group by p.comprobante_id
),
base as (
  select c.id as comprobante_id,
         c.numero,
         c.cliente_id,
         cl.razon_social as cliente,
         cl.numero_documento as documento,
         coalesce(cl.agente_retencion, false) as cliente_agente,
         c.fecha_emision,
         c.total,
         c.saldo,
         c.estado,
         c.retencion_aplica,
         c.retencion_monto,
         (c.cotizacion_id is not null) as retencion_decidida,
         coalesce(k.monto, 0) as retencion_cobrada,
         k.fecha as retenida_el,
         cr.numero_cr,
         cr.nombre as cr_nombre,
         cr.subido_en as cr_subido_en,
         (select t.venta from tipos_cambio_sunat t
           where t.fecha <= c.fecha_emision
           order by t.fecha desc limit 1) as tipo_cambio_emision
    from comprobantes c
    join clientes cl on cl.id = c.cliente_id
    left join cobrado k on k.comprobante_id = c.id
    left join comprobante_retenciones cr on cr.comprobante_id = c.id
   where c.tipo = 'factura'
     and c.estado <> 'anulado'
)
select b.*,
       case when b.tipo_cambio_emision is null then null
            else round(b.total * b.tipo_cambio_emision, 2) >= 700 end as llega_umbral,
       case
         when b.cr_subido_en is not null then 'cr_recibido'
         when b.retencion_cobrada > 0 then 'falta_cr'
         when b.saldo > 0.01
              and (b.retencion_aplica
                   or (b.cliente_agente
                       and b.tipo_cambio_emision is not null
                       and round(b.total * b.tipo_cambio_emision, 2) >= 700))
           then 'por_cobrar'
         when b.cliente_agente or b.retencion_aplica then 'sin_retencion'
         else 'no_agente'
       end as estado_retencion
  from base b;

comment on view public.v_retenciones is
  'El estado de la retención de cada factura no anulada (175): cr_recibido, falta_cr, por_cobrar, sin_retencion, no_agente. Lleva retención si nació con ella o si se le cobró una.';

grant select on public.v_retenciones to authenticated;

-- Centinela: la vista se lee y cada fila tiene un estado de los cinco.
do $$
declare v_malas int;
begin
  select count(*) into v_malas
    from public.v_retenciones
   where estado_retencion not in ('cr_recibido', 'falta_cr', 'por_cobrar', 'sin_retencion', 'no_agente');
  if v_malas > 0 then
    raise exception '175: % facturas con un estado de retención desconocido', v_malas;
  end if;
end $$;
