-- ###########################################################################
-- 045 · LO QUE YA ESTÁ PEDIDO Y TODAVÍA NO HA LLEGADO
-- ###########################################################################
--
-- La segunda mitad de la bandeja «Por comprar».
--
-- La 041 dejó `v_comprometido`: qué le prometió Willy a cada cliente y cuánto
-- de eso no está en almacén. Con eso solo ya se puede pintar una pantalla,
-- pero da un consejo peligroso, porque no mira las compras en curso:
--
--     comprometido 20 · stock 0  →  «compra 20»
--
-- aunque ayer se hubieran pedido esas 20 al proveedor y estuvieran en camino.
-- Una bandeja que dice dos veces lo mismo se compra dos veces, y en esto
-- comprar de más cuesta dinero inmovilizado en un almacén que ya está lleno.
--
-- Esta vista responde a la otra mitad de la pregunta: **de este producto, ¿qué
-- hay ya pedido que no ha llegado?**
--
-- ---------------------------------------------------------------------------
-- Por qué no vale `pendiente_de_recibir` (044)
-- ---------------------------------------------------------------------------
-- Aquella responde *por compra*: «de la CMP-26-00014, ¿qué falta?». Sirve para
-- el botón «Recibir», que siempre parte de una compra concreta.
--
-- La bandeja pregunta al revés: parte del PRODUCTO y necesita sumar lo que
-- está pedido en todas las compras abiertas a la vez. Son la misma tabla leída
-- por lados opuestos, y ninguna de las dos se puede escribir en términos de la
-- otra sin quedar peor que las dos por separado.
-- ###########################################################################

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Lo pedido a proveedores, por producto
-- ---------------------------------------------------------------------------
create or replace view v_pedido_pendiente
with (security_invoker = true) as
select
  ci.producto_id,
  sum(ci.cantidad - ci.cantidad_recibida)  as pendiente,
  count(distinct c.id)                     as compras,
  -- La fecha en la que se espera lo PRIMERO que llega. La bandeja la enseña
  -- para que quien mira pueda decidir si aguanta o si vuelve a pedir: no es lo
  -- mismo «llega mañana» que «llega en tres semanas» cuando el cliente ya
  -- confirmó.
  min(c.fecha_estimada)                    as proxima_llegada,
  min(c.numero)                            as primera_compra
from compra_items ci
join compras c on c.id = ci.compra_id
-- 'recibida' y 'anulada' quedan fuera: en la primera ya llegó todo y en la
-- segunda nunca va a llegar nada. Dejar una anulada dentro sería peor que no
-- tener la vista, porque restaría de lo que hay que comprar algo que no viene.
where c.estado in ('registrada', 'recibida_parcial')
  and ci.cantidad_recibida < ci.cantidad
group by ci.producto_id;

comment on view v_pedido_pendiente is
  'Por producto, cuánto hay pedido a proveedores que todavía no ha llegado, en cuántas compras y para cuándo se espera lo primero. Con v_comprometido forma la bandeja «Por comprar»: uno dice lo que hace falta, el otro lo que ya viene en camino.';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_quien uuid;
  v_prov  uuid;
  v_prod  uuid;
  v_r     jsonb;
  v_id    uuid;
  v_n     numeric;
begin
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  select p.id into v_prod  from productos p limit 1;
  if v_quien is null or v_prod is null then
    raise notice 'Sin perfil de gerencia o sin productos: no se puede probar. Se omite.';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  insert into proveedores (codigo, razon_social, tipo_documento, numero_documento)
  values ('ZZTESTPROV045', 'ZZTEST PROVEEDOR 045', 'RUC', '20100070970')
  on conflict do nothing;
  select id into v_prov from proveedores where codigo = 'ZZTESTPROV045';

  -- Dos compras del mismo producto: la vista tiene que SUMARLAS. Es el caso
  -- que justifica que exista, y el que `pendiente_de_recibir` no puede ver.
  v_r := public.crear_compra(jsonb_build_object(
    'proveedor_id', v_prov, 'fecha_estimada', (current_date + 20),
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'cantidad', 7, 'costo_unitario', 4))));
  v_id := (v_r ->> 'id')::uuid;

  v_r := public.crear_compra(jsonb_build_object(
    'proveedor_id', v_prov, 'fecha_estimada', (current_date + 5),
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'cantidad', 3, 'costo_unitario', 4))));

  select pendiente into v_n from v_pedido_pendiente where producto_id = v_prod;
  if v_n is distinct from 10 then
    raise exception 'La vista no suma las compras abiertas: dio % y esperaba 10', v_n;
  end if;

  -- Y la fecha que sale es la de lo PRIMERO que llega, no la de la primera
  -- compra que se registró.
  if (select proxima_llegada from v_pedido_pendiente where producto_id = v_prod)
     is distinct from (current_date + 5) then
    raise exception 'proxima_llegada no es la más cercana';
  end if;

  -- Anular una compra tiene que quitarla de la cuenta en el acto: si no, la
  -- bandeja seguiría restando mercadería que ya nadie va a traer.
  update compras set estado = 'anulada' where id = v_id;
  select pendiente into v_n from v_pedido_pendiente where producto_id = v_prod;
  if v_n is distinct from 3 then
    raise exception 'Una compra anulada sigue contando como pedida: quedó en %', v_n;
  end if;

  delete from compras where proveedor_id = v_prov;
  delete from proveedores where id = v_prov;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'v_pedido_pendiente suma lo que viene en camino y olvida lo anulado.';
end $$;
