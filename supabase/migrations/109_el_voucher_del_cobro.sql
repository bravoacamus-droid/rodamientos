-- ###########################################################################
-- 109 · EL VOUCHER DEL COBRO
-- ###########################################################################
--
-- Luis, 07/10, mirando cobranzas:
--
--   *«en cobranzas en cobrar falta botón de subir foto o pdf del voucher del
--   pago»*.
--
-- El lado del proveedor lo tiene desde la 076 (el papel `pago` de la
-- recepción). El del cliente no tenía dónde: el pago guardaba el número de
-- operación en `referencia` y nada más, así que el día que el cliente dice
-- «yo ya te pagué esa», la prueba está en el WhatsApp de alguien.
--
-- ---------------------------------------------------------------------------
-- Columnas en `pagos` y no una tabla aparte
-- ---------------------------------------------------------------------------
-- Un cobro se registra de uno en uno desde la pantalla (un comprobante, un
-- importe) y lleva, como mucho, un voucher. Una tabla de adjuntos con su FK
-- serían dos escrituras y un huérfano posible por cada cobro; tres columnas
-- son una sola fila que se crea o no se crea.
--
-- Se guarda la RUTA dentro del bucket, nunca la URL: las firmadas caducan a
-- los diez minutos (068).
--
-- ---------------------------------------------------------------------------
-- Bucket propio, privado
-- ---------------------------------------------------------------------------
-- `documentos-proveedor` escribe con el permiso de `recepcion_adjuntos`, que
-- es de compras y almacén; el voucher lo sube cobranzas. Mezclarlos obligaría
-- a dar a cobranzas permiso sobre los papeles del proveedor. Un bucket por
-- dueño y cada uno con la puerta de su tabla.
-- ###########################################################################

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · El almacén
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vouchers-cobro',
  'vouchers-cobro',
  false,
  10485760, -- 10 MB, el mismo tope que los papeles del proveedor (068)
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "voucher_lectura" on storage.objects;
create policy "voucher_lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'vouchers-cobro' and (select public.mi_rol()) is not null);

drop policy if exists "voucher_subida" on storage.objects;
create policy "voucher_subida" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vouchers-cobro' and (select public.puede_escribir('pagos')));

drop policy if exists "voucher_borrado" on storage.objects;
create policy "voucher_borrado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vouchers-cobro' and (select public.puede_escribir('pagos')));

-- ---------------------------------------------------------------------------
-- 2 · El voucher en el pago
-- ---------------------------------------------------------------------------
alter table pagos add column if not exists voucher_ruta   text;
alter table pagos add column if not exists voucher_nombre text;
alter table pagos add column if not exists voucher_mime   text;

-- La ruta la pone el servidor y siempre empieza por `cobros/`. Sin esto, quien
-- llame a la RPC a mano podría apuntar el pago a cualquier objeto del bucket.
alter table pagos drop constraint if exists pago_voucher_ruta_ok;
alter table pagos add constraint pago_voucher_ruta_ok
  check (voucher_ruta is null or voucher_ruta like 'cobros/%');

comment on column pagos.voucher_ruta is
  'Ruta del voucher (foto o PDF) dentro del bucket privado `vouchers-cobro` (109). La ruta y no la URL: las firmadas caducan.';

-- ---------------------------------------------------------------------------
-- 3 · `registrar_pagos` acepta el voucher
-- ---------------------------------------------------------------------------
-- Igual que la de la 004, con las tres columnas nuevas al final del insert.
create or replace function public.registrar_pagos(p_pagos jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_n int;
begin
  -- Va lo PRIMERO (004): es `security definer` y se salta la RLS.
  if not public.puede_escribir('pagos') then
    raise exception 'Tu rol no puede registrar pagos'
      using errcode = 'insufficient_privilege';
  end if;

  insert into pagos (comprobante_id, cuota_id, fecha, monto, medio, referencia, observaciones,
                     registrado_por, voucher_ruta, voucher_nombre, voucher_mime)
  select (i ->> 'comprobante_id')::uuid,
         nullif(i ->> 'cuota_id','')::uuid,
         coalesce(nullif(i ->> 'fecha','')::date, current_date),
         (i ->> 'monto')::numeric,
         coalesce(nullif(i ->> 'medio',''), 'transferencia'),
         nullif(i ->> 'referencia',''),
         nullif(i ->> 'observaciones',''),
         auth.uid(),
         nullif(i ->> 'voucher_ruta',''),
         nullif(i ->> 'voucher_nombre',''),
         nullif(i ->> 'voucher_mime','')
  from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) i;
  get diagnostics v_n = row_count;
  return jsonb_build_object('pagos', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- Centinela: la EJECUTA (CLAUDE.md §2) y lo deshace
-- ---------------------------------------------------------------------------
-- Registra un pago de 0.01 con voucher, como gerencia, sobre un comprobante
-- con saldo; comprueba que el voucher quedó en la fila, y sale por excepción,
-- que borra el pago y devuelve el saldo.
do $$
declare
  v_usuario uuid;
  v_comp    uuid;
  v_ruta    text;
begin
  select id into v_usuario from perfiles where rol = 'gerencia' and activo limit 1;
  select id into v_comp from comprobantes where saldo > 1 and estado <> 'anulado' limit 1;
  if v_usuario is null or v_comp is null then
    raise notice '109: sin gerente o sin comprobante con saldo; el centinela no se ejecuta.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

    perform public.registrar_pagos(jsonb_build_array(jsonb_build_object(
      'comprobante_id', v_comp, 'monto', 0.01, 'medio', 'transferencia',
      'voucher_ruta', 'cobros/centinela.pdf', 'voucher_nombre', 'centinela.pdf',
      'voucher_mime', 'application/pdf')));

    select voucher_ruta into v_ruta from pagos
     where comprobante_id = v_comp and monto = 0.01
     order by creado_en desc limit 1;
    if v_ruta is distinct from 'cobros/centinela.pdf' then
      raise exception '109: registrar_pagos no guardó el voucher (quedó %)', coalesce(v_ruta, 'null');
    end if;

    raise exception '__109_DESHACER__';
  exception when others then
    if sqlerrm <> '__109_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '109: el pago guarda su voucher; bucket vouchers-cobro listo.';
end $$;
