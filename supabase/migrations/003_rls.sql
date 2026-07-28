-- ============================================================================
-- ERP RODATECH · Row Level Security
-- Modelo: todo usuario autenticado LEE; la ESCRITURA se limita por rol.
-- ============================================================================

create or replace function public.tiene_rol(variadic p_roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select rol::text = any(p_roles) from profiles where id = auth.uid() and activo), false)
$$;

do $$
declare t text;
  tablas text[] := array[
    'empresa','series_documento','profiles','marcas','categorias','almacenes','productos',
    'producto_equivalencias','clientes','proveedores','stock','movimientos_inventario',
    'cotizaciones','cotizacion_items','pedidos','pedido_items','comprobantes','comprobante_items',
    'pagos','gestiones_cobranza','ordenes_compra','oc_items','importaciones','recepciones',
    'recepcion_items','alertas','actividad'];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura_autenticados" on public.%I', t);
    execute format(
      'create policy "lectura_autenticados" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Escritura por rol -----------------------------------------------------------
do $$
declare
  cfg record;
  reglas jsonb := '{
    "empresa":                ["admin","gerencia"],
    "series_documento":       ["admin","gerencia"],
    "marcas":                 ["admin","gerencia","compras"],
    "categorias":             ["admin","gerencia","compras"],
    "almacenes":              ["admin","gerencia","almacen"],
    "productos":              ["admin","gerencia","compras","almacen"],
    "producto_equivalencias": ["admin","gerencia","compras","ventas"],
    "clientes":               ["admin","gerencia","ventas","cobranzas"],
    "proveedores":            ["admin","gerencia","compras"],
    "stock":                  ["admin","gerencia","almacen"],
    "movimientos_inventario": ["admin","gerencia","almacen","compras","ventas"],
    "cotizaciones":           ["admin","gerencia","ventas"],
    "cotizacion_items":       ["admin","gerencia","ventas"],
    "pedidos":                ["admin","gerencia","ventas","almacen"],
    "pedido_items":           ["admin","gerencia","ventas","almacen"],
    "comprobantes":           ["admin","gerencia","ventas"],
    "comprobante_items":      ["admin","gerencia","ventas"],
    "pagos":                  ["admin","gerencia","cobranzas"],
    "gestiones_cobranza":     ["admin","gerencia","cobranzas","ventas"],
    "ordenes_compra":         ["admin","gerencia","compras"],
    "oc_items":               ["admin","gerencia","compras"],
    "importaciones":          ["admin","gerencia","compras"],
    "recepciones":            ["admin","gerencia","compras","almacen"],
    "recepcion_items":        ["admin","gerencia","compras","almacen"],
    "alertas":                ["admin","gerencia","ventas","almacen","compras","cobranzas"],
    "actividad":              ["admin","gerencia","ventas","almacen","compras","cobranzas"]
  }'::jsonb;
  tabla text;
  roles text;
begin
  for tabla in select jsonb_object_keys(reglas) loop
    select string_agg(quote_literal(value), ',') into roles
      from jsonb_array_elements_text(reglas -> tabla) as value;

    execute format('drop policy if exists "escritura_rol" on public.%I', tabla);
    execute format(
      'create policy "escritura_rol" on public.%I for all to authenticated
         using (public.tiene_rol(%s)) with check (public.tiene_rol(%s))',
      tabla, roles, roles);
  end loop;
end $$;

-- Perfiles: cada usuario puede actualizar su propia ficha; admin gestiona todas
drop policy if exists "perfil_propio" on public.profiles;
create policy "perfil_propio" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.tiene_rol('admin'))
  with check (id = auth.uid() or public.tiene_rol('admin'));

drop policy if exists "perfil_admin_insert" on public.profiles;
create policy "perfil_admin_insert" on public.profiles
  for insert to authenticated with check (public.tiene_rol('admin'));

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
