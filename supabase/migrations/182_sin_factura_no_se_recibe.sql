-- ###########################################################################
-- 182 · SIN LA FACTURA DEL PROVEEDOR NO SE RECIBE LA MERCADERÍA
-- ###########################################################################
--
-- El problema. Moisés, 02/11, con Willy en vivo: *«las órdenes de compra es
-- para un análisis interno de las compras, lo que se gastó, a quién, todo…
-- recibir la mercadería, tener esa trazabilidad… puede registrar la orden de
-- compra sin tener el PDF de la factura, pero antes de recepcionar tiene que
-- subir las facturas que le envió el proveedor, para que lo tenga o le pida
-- antes de recepcionar»*.
--
-- Hasta hoy se podía recibir una compra sin ningún papel del proveedor, y la
-- factura se quedaba para «luego», que es nunca. El momento de pedirla es
-- cuando la mercadería llega: después ya no hay con qué presionar.
--
-- La regla: una recepción de una compra exige que esa compra tenga subida
-- su FACTURA (`compra_adjuntos.tipo = 'factura'`, PDF o foto). Registrar la
-- compra sin el PDF sigue permitido.
--
-- Va en un disparador y no dentro de `recepcionar_mercaderia`: así vale para
-- cualquier camino que inserte una recepción, hoy o mañana. Las recepciones
-- sueltas (sin compra) no cambian. Al aplicarla, las únicas compras sin
-- recibir eran las tres de hoy (OC02-00002..4), y ninguna tenía la factura:
-- no hay histórico que se rompa.
-- ###########################################################################

create or replace function public.recepcion_exige_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text;
begin
  if new.compra_id is null then
    return new;
  end if;
  if not exists (select 1 from compra_adjuntos a where a.compra_id = new.compra_id and a.tipo = 'factura') then
    select numero into v_numero from compras where id = new.compra_id;
    raise exception 'Antes de recibir la mercadería de %, sube la factura del proveedor (PDF o foto) en la ficha de la compra.',
      coalesce(v_numero, 'esta compra')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

comment on function public.recepcion_exige_factura() is
  'Una recepción de una compra exige la factura del proveedor subida (182).';

drop trigger if exists tg_recepcion_exige_factura on public.recepciones;
create trigger tg_recepcion_exige_factura
  before insert on public.recepciones
  for each row execute function public.recepcion_exige_factura();

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA: una compra sin factura no se deja recibir; con la factura
-- subida, sí. Todo se deshace.
do $$
declare
  v_prov uuid := (select id from proveedores limit 1);
  v_c uuid; v_msg text;
begin
  if v_prov is null then
    raise notice '182: no hay proveedores; el centinela no se ejecuta.';
    return;
  end if;
  begin
    insert into compras (numero, proveedor_id, tipo, fecha, subtotal, igv, total, estado, moneda)
    values ('ZZ182-1', v_prov, 'local', current_date, 0, 0, 0, 'registrada', 'USD') returning id into v_c;

    begin
      insert into recepciones (numero, compra_id) values ('ZZ182-R1', v_c);
      raise exception '182: dejó recibir sin la factura';
    exception when check_violation then
      v_msg := sqlerrm;
    end;
    if v_msg not like '%sube la factura del proveedor%' then
      raise exception '182: sin factura dijo «%» y no lo esperado', v_msg;
    end if;

    insert into compra_adjuntos (compra_id, tipo, ruta, nombre, tamano_bytes, mime)
    values (v_c, 'factura', 'compras/zz182/factura.pdf', 'factura.pdf', 1, 'application/pdf');
    insert into recepciones (numero, compra_id) values ('ZZ182-R2', v_c);

    raise exception '__182_DESHACER__';
  exception when others then
    if sqlerrm <> '__182_DESHACER__' then raise; end if;
  end;
  raise notice '182: sin factura no se recibe, con factura sí; deshecho limpio.';
end $$;
