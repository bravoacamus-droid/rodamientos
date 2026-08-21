-- ============================================================================
-- ERP RODATECH · Cargos adicionales de la cotización y opciones del documento
-- ============================================================================

-- ---------------------------------------------------------------- Cabecera
alter table cotizaciones
  add column if not exists cargos_total   numeric(14,2) not null default 0,
  add column if not exists mostrar_igv    boolean       not null default true,
  add column if not exists mostrar_margen boolean       not null default false,
  add column if not exists editada_en     timestamptz,
  add column if not exists editada_por    uuid references profiles(id) on delete set null;

comment on column cotizaciones.cargos_total is
  'Suma de los cargos adicionales (flete, embalaje, seguro) que se cobran al cliente.';
comment on column cotizaciones.mostrar_igv is
  'Si es falso, el PDF muestra un total único sin desglosar el IGV.';
comment on column cotizaciones.mostrar_margen is
  'Si es verdadero, el PDF incluye costo y margen. Genera una copia de uso interno.';

-- ------------------------------------------------------- Cargos adicionales
create table if not exists cotizacion_cargos (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  orden         smallint not null default 1,
  concepto      text not null,
  detalle       text,
  monto         numeric(14,2) not null default 0,   -- lo que se cobra al cliente
  costo         numeric(14,2) not null default 0,   -- lo que le cuesta a la empresa
  creado_en     timestamptz not null default now()
);
create index if not exists idx_cotiz_cargos on cotizacion_cargos(cotizacion_id);

comment on table cotizacion_cargos is
  'Conceptos ajenos a la mercadería: flete, embalaje, seguro, instalación. '
  'El monto se cobra al cliente y el costo alimenta el cálculo del margen.';

alter table cotizacion_cargos enable row level security;

drop policy if exists "lectura_autenticados" on cotizacion_cargos;
create policy "lectura_autenticados" on cotizacion_cargos
  for select to authenticated using (true);

drop policy if exists "escritura_rol" on cotizacion_cargos;
create policy "escritura_rol" on cotizacion_cargos
  for all to authenticated
  using (public.tiene_rol('admin','gerencia','ventas'))
  with check (public.tiene_rol('admin','gerencia','ventas'));

grant select, insert, update, delete on cotizacion_cargos to authenticated;

-- ------------------------------------------- Recalcular totales con cargos
create or replace function public.recalcular_cotizacion(p_cotizacion uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_items   numeric(14,2);
  v_costo_i numeric(14,2);
  v_cargos  numeric(14,2);
  v_costo_c numeric(14,2);
  v_base    numeric(14,2);
  v_costo   numeric(14,2);
begin
  select coalesce(sum(subtotal), 0), coalesce(sum(costo_unitario * cantidad), 0)
    into v_items, v_costo_i
    from cotizacion_items where cotizacion_id = p_cotizacion;

  select coalesce(sum(monto), 0), coalesce(sum(costo), 0)
    into v_cargos, v_costo_c
    from cotizacion_cargos where cotizacion_id = p_cotizacion;

  v_base  := v_items + v_cargos;
  v_costo := v_costo_i + v_costo_c;

  update cotizaciones
     set subtotal     = v_items,
         cargos_total = v_cargos,
         igv          = round(v_base * 0.18, 2),
         total        = round(v_base * 1.18, 2),
         costo_total  = v_costo,
         margen_pct   = case when v_base > 0
                             then round(((v_base - v_costo) / v_base) * 100, 2)
                             else 0 end,
         actualizado_en = now()
   where id = p_cotizacion;
end $$;

grant execute on function public.recalcular_cotizacion(uuid) to authenticated;

-- --------------------------- Alertas: enlazar al documento, no al listado
create or replace function public.alertas_enlaces_documento()
returns void
language sql security definer set search_path = public
as $$
  update alertas
     set accion_url = '/facturacion/' || entidad_id
   where entidad_tipo = 'comprobante' and entidad_id is not null;
$$;

select public.alertas_enlaces_documento();
