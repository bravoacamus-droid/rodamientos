-- 176 · La factura en borrador
--
-- El problema. Willy, 31/10 (por Moisés): quiere dejar la factura en
-- borrador *«para que lo mire antes, no vaya a ser»*, como la guía: llenar
-- todo, ver la vista previa, guardar, y emitir después. Hoy «Emitir» gasta el
-- correlativo, la deja fija y la manda a Cobranzas de un solo golpe. Lo que
-- se guardaba al llenar era solo del navegador (el «seguir donde me quedé»):
-- nadie más lo veía, no salía en Facturación y no se podía abrir desde otro
-- equipo.
--
-- La solución NO toca `emitir_comprobante`, que es lo más delicado del
-- sistema (CLAUDE.md §2: tres fallos encadenados el 21/09). Un borrador es lo
-- que se llenó en la pantalla de emitir —la cotización, las guías, la forma
-- de pago, la retención, la O/C, las observaciones, las cantidades—, guardado
-- en esta tabla. Al emitirlo se manda por el MISMO camino de siempre
-- (`emitirComprobante` → `emitir_comprobante`), y se borra.
--
-- Mientras es borrador NO es un comprobante: sin número, sin SUNAT, sin
-- cobranza, sin reportes. Por eso es una tabla aparte y no un estado más de
-- `comprobantes`: un estado nuevo ahí lo tendrían que excluir a mano la
-- cartera, los reportes, el contador y cada vista que suma facturas.
--
-- `total` y `moneda` son solo para la lista: el importe del comprobante lo
-- calcula la base al emitir, desde la cotización, como siempre.

create table if not exists public.facturas_borrador (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id),
  total numeric(14, 2) not null default 0,
  moneda text not null default 'USD' check (moneda in ('USD', 'PEN')),
  datos jsonb not null,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.facturas_borrador is
  'Facturas en borrador (176): lo llenado en la pantalla de emitir, sin número ni SUNAT ni cobranza. Al emitir se borra.';

create index if not exists facturas_borrador_cotizacion on public.facturas_borrador (cotizacion_id);

alter table public.facturas_borrador enable row level security;

-- Las ve quien tiene sesión; las escribe quien puede facturar.
drop policy if exists fb_select on public.facturas_borrador;
create policy fb_select on public.facturas_borrador
  for select using ((select public.mi_rol()) is not null);

drop policy if exists fb_insert on public.facturas_borrador;
create policy fb_insert on public.facturas_borrador
  for insert with check ((select public.puede('facturacion', 'crear')));

drop policy if exists fb_update on public.facturas_borrador;
create policy fb_update on public.facturas_borrador
  for update using ((select public.puede('facturacion', 'crear')))
  with check ((select public.puede('facturacion', 'crear')));

drop policy if exists fb_delete on public.facturas_borrador;
create policy fb_delete on public.facturas_borrador
  for delete using ((select public.puede('facturacion', 'crear')));

grant select, insert, update, delete on public.facturas_borrador to authenticated;

-- Centinela: la tabla se escribe y se borra (como superusuario, sin RLS).
do $$
declare v_cot uuid; v_cli uuid; v_id uuid;
begin
  select c.id, c.cliente_id into v_cot, v_cli from public.cotizaciones c limit 1;
  if v_cot is null then return; end if;
  begin
    insert into public.facturas_borrador (cotizacion_id, cliente_id, total, datos)
    values (v_cot, v_cli, 1, '{"prueba": true}'::jsonb)
    returning id into v_id;
    if v_id is null then raise exception '176: no se creó el borrador'; end if;
    raise exception '__176_DESHACER__';
  exception when others then
    if sqlerrm <> '__176_DESHACER__' then raise; end if;
  end;
end $$;
