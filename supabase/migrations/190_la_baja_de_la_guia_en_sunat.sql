-- ###########################################################################
-- 190 · LA BAJA DE UNA GUÍA ANULADA, EN SUNAT
-- ###########################################################################
--
-- Willy, reunión del 04/11 (53:10–54:10), sobre su sistema anterior: al
-- anular una guía *«me salía un mensaje automático que decía: se anula la
-- guía número tal en el sistema, pero para anular toda la guía
-- definitivamente tiene que darle de baja en SUNAT»*; él le pasaba un
-- pantallazo a su contador, que la daba de baja, y le confirmaba. Luis,
-- 04/11: *«que cuando anule la guía se anule del sistema y le diga que
-- también tiene que eliminarlo de SUNAT, algo más bonito y armado»*.
--
-- Para la guía electrónica no hay baja por servicio, como la hay para las
-- facturas (125): se hace a mano en SUNAT Operaciones en Línea. Hasta hoy:
--
--   · `anular_guia` dejaba la aceptada en `baja_solicitada`… y ahí acababa.
--     Nada la sacaba de ese estado, así que no había forma de saber cuáles
--     ya se dieron de baja y cuáles no.
--   · La `observado` (aceptada con observaciones, igual de viva en SUNAT) se
--     quedaba como estaba, sin aviso de baja.
--
-- Ahora:
--
--   · `anular_guia` pasa a `baja_solicitada` también la observada.
--   · `marcar_baja_guia_sunat(id, nota)` la cierra: `baja_aceptada`, quién y
--     cuándo, y una nota opcional («la dio de baja el contador»). Es lo que
--     pulsa Willy cuando ya está hecho en SUNAT.
--   · Las que faltan se cuentan en la pantalla: «baja_solicitada» en una
--     guía anulada = falta darla de baja.
-- ###########################################################################

alter table guias_remision
  add column if not exists baja_sunat_en timestamptz,
  add column if not exists baja_sunat_por uuid,
  add column if not exists baja_sunat_nota text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_baja_sunat_por_fkey') then
    alter table guias_remision
      add constraint guias_remision_baja_sunat_por_fkey
      foreign key (baja_sunat_por) references perfiles(id);
  end if;
end $$;

comment on column guias_remision.baja_sunat_en is
  'Cuándo se marcó como dada de baja en SUNAT Operaciones en Línea (190). A mano: para la GRE no hay baja por servicio.';

-- ------------------------------------------------------------ anular_guia
-- La misma de la 146, con la observada también a `baja_solicitada`.
create or replace function public.anular_guia(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  -- Control de rol. Va lo PRIMERO: es `security definer` y se salta RLS.
  if not public.puede('guias','eliminar') then
    raise exception 'Tu rol no puede anular una guía'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_motivo,''))) < 5 then
    raise exception 'La anulación requiere un motivo' using errcode = 'check_violation';
  end if;
  if exists (select 1 from comprobantes c where c.guia_id = p_id and c.estado <> 'anulado') then
    raise exception 'No se puede anular: la guía está referenciada por un comprobante vigente'
      using errcode = 'foreign_key_violation';
  end if;

  -- Devolver al almacén lo que la guía sacó.
  perform public.registrar_movimientos(
    (select jsonb_agg(jsonb_build_object(
              'producto_id', m.producto_id, 'tipo', 'ingreso', 'cantidad', m.cantidad,
              'costo_unitario', m.costo_unitario,
              'referencia_tipo', 'guia', 'referencia_id', p_id,
              'motivo', 'Reposición por anulación de guía') order by m.producto_id)
     from movimientos_inventario m
     where m.referencia_tipo = 'guia' and m.referencia_id = p_id and m.tipo = 'salida'))
  where exists (select 1 from movimientos_inventario m
                where m.referencia_tipo = 'guia' and m.referencia_id = p_id and m.tipo = 'salida');

  update guias_remision
     set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(),
         motivo_anulacion = p_motivo,
         -- Viva en SUNAT (aceptada, con o sin observaciones): falta la baja.
         estado_sunat = case when estado_sunat in ('aceptado', 'observado')
                             then 'baja_solicitada'::estado_sunat else estado_sunat end
   where id = p_id and estado <> 'anulada';

  if not found then
    raise exception 'Guía % no existe o ya está anulada', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'estado', 'anulada');
end $function$;

-- ------------------------------------------------- marcar_baja_guia_sunat
create or replace function public.marcar_baja_guia_sunat(p_id uuid, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_numero text;
begin
  -- El mismo permiso que anularla: es el segundo paso de lo mismo.
  if not public.puede('guias','eliminar') then
    raise exception 'Tu rol no puede dar de baja una guía'
      using errcode = 'insufficient_privilege';
  end if;

  update guias_remision
     set estado_sunat = 'baja_aceptada',
         baja_sunat_en = now(),
         baja_sunat_por = auth.uid(),
         baja_sunat_nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_id and estado = 'anulada' and estado_sunat = 'baja_solicitada'
   returning numero into v_numero;

  if v_numero is null then
    raise exception 'Esta guía no está esperando la baja en SUNAT (tiene que estar anulada y aceptada por SUNAT)'
      using errcode = 'check_violation';
  end if;
  return jsonb_build_object('id', p_id, 'numero', v_numero);
end $function$;

revoke all on function public.marcar_baja_guia_sunat(uuid, text) from public, anon;
grant execute on function public.marcar_baja_guia_sunat(uuid, text) to authenticated;

-- --------------------------------------------------------------- centinela
-- EJECUTA las dos con una guía de verdad, como gerencia, y deshace al salir:
-- anular devuelve stock, así que no puede quedarse.
do $$
declare
  v_guia uuid;
  v_gerente uuid;
  v_estado text;
begin
  select id into v_guia from guias_remision
   where estado = 'emitida' and estado_sunat = 'aceptado'
     and not exists (select 1 from comprobantes c where c.guia_id = guias_remision.id and c.estado <> 'anulado')
   order by creado_en desc limit 1;
  select id into v_gerente from perfiles where rol = 'gerencia' and activo order by creado_en limit 1;
  if v_guia is null or v_gerente is null then
    raise notice '190: no hay guía aceptada libre o gerente para probar; se aplica sin ejecutar.';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);

    -- Antes de anular no se puede marcar.
    begin
      perform public.marcar_baja_guia_sunat(v_guia, null);
      raise exception '190: marcó la baja de una guía que no está anulada';
    exception when check_violation then null;
    end;

    perform public.anular_guia(v_guia, 'Prueba del centinela 190');
    select estado_sunat::text into v_estado from guias_remision where id = v_guia;
    if v_estado <> 'baja_solicitada' then
      raise exception '190: al anular quedó en % y no en baja_solicitada', v_estado;
    end if;

    perform public.marcar_baja_guia_sunat(v_guia, '  la dio de baja el contador ');
    if not exists (select 1 from guias_remision
                    where id = v_guia and estado_sunat = 'baja_aceptada'
                      and baja_sunat_por = v_gerente and baja_sunat_en is not null
                      and baja_sunat_nota = 'la dio de baja el contador') then
      raise exception '190: la baja no quedó registrada';
    end if;

    -- Dos veces no.
    begin
      perform public.marcar_baja_guia_sunat(v_guia, null);
      raise exception '190: marcó la baja dos veces';
    exception when check_violation then null;
    end;

    raise exception '__190_DESHACER__';
  exception when others then
    if sqlerrm <> '__190_DESHACER__' then raise; end if;
  end;
  raise notice '190: anular y marcar la baja, probados y deshechos.';
end $$;
