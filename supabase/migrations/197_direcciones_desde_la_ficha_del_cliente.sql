-- ###########################################################################
-- 197 · LAS DIRECCIONES DE ENTREGA SE ADMINISTRAN TAMBIÉN DESDE EL CLIENTE
-- ###########################################################################
--
-- Moisés, 06/11: *«esas direcciones que se puedan guardar en cada cliente, en
-- su ficha… si yo entro voy a poder ver sus direcciones, editarlas,
-- eliminarlas, hacer el CRUD por ahí también»*.
--
-- La 195 dejaba escribir solo a quien hace guías. La ficha del cliente la usa
-- quien edita clientes, así que también puede él. Ver ya podía (195).
-- ###########################################################################

drop policy if exists cd_insert on public.cliente_direcciones;
create policy cd_insert on public.cliente_direcciones
  for insert with check (
    (select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar'))
    or (select public.puede('clientes', 'editar')));

drop policy if exists cd_update on public.cliente_direcciones;
create policy cd_update on public.cliente_direcciones
  for update using (
    (select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar'))
    or (select public.puede('clientes', 'editar')))
  with check (
    (select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar'))
    or (select public.puede('clientes', 'editar')));

drop policy if exists cd_delete on public.cliente_direcciones;
create policy cd_delete on public.cliente_direcciones
  for delete using (
    (select public.puede('guias', 'crear')) or (select public.puede('guias', 'editar'))
    or (select public.puede('clientes', 'editar')));
