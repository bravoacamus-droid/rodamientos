-- ###########################################################################
-- 127 · EL ESTADO ANTE SUNAT SOLO LO ESCRIBE EL SERVIDOR
-- ###########################################################################
--
-- Auditoría del 15/10, al cablear el envío de guías. La política genérica de
-- escritura (006) deja a cualquier rol con permiso sobre `guias_remision`
-- hacer un PATCH por PostgREST con `estado_sunat = 'aceptado'`: la guía
-- desaparece de /sunat, «Enviar a SUNAT» dice «ya fue aceptada», y la
-- mercadería sale sin GRE. O cambiar `sunat_ticket` por el de otra guía, y
-- la consulta le pondría la respuesta ajena.
--
-- En `comprobantes` la 079 dejó estas columnas abiertas a propósito, porque
-- `enviar.ts` las escribía con la sesión. Ya no: desde la pantalla SUNAT
-- todas las escrituras de estado van con la clave de servicio. Así que se
-- cierran las dos tablas con la misma regla de la 079:
-- `escribe_una_funcion()` (una función security definer o service_role).
--
-- Solo se mira si CAMBIAN: actualizar otra columna de la fila (editar un
-- borrador de guía, 115) sigue pasando.
-- ###########################################################################

set local search_path = public, extensions;

create or replace function public.tg_estado_sunat_solo_servidor()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if public.escribe_una_funcion() then
    return new;
  end if;
  if new.estado_sunat is distinct from old.estado_sunat
     or new.sunat_ticket is distinct from old.sunat_ticket
     or new.sunat_codigo_respuesta is distinct from old.sunat_codigo_respuesta
     or new.sunat_mensaje is distinct from old.sunat_mensaje
     or new.sunat_enviado_en is distinct from old.sunat_enviado_en
     or new.sunat_hash_cdr is distinct from old.sunat_hash_cdr then
    raise exception 'El estado ante SUNAT solo lo cambia el envío, no una edición directa'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists tg_guia_estado_sunat on public.guias_remision;
create trigger tg_guia_estado_sunat
  before update on public.guias_remision
  for each row execute function public.tg_estado_sunat_solo_servidor();

drop trigger if exists tg_comprobante_estado_sunat on public.comprobantes;
create trigger tg_comprobante_estado_sunat
  before update on public.comprobantes
  for each row execute function public.tg_estado_sunat_solo_servidor();

-- ------------------------------------------------------------------ Centinela
-- Se EJECUTA: como una sesión de usuario, cambiar el estado de una guía
-- tiene que fallar, y cambiar otra columna tiene que pasar.
do $$
declare
  v_guia uuid;
  v_ok boolean := false;
begin
  select id into v_guia from guias_remision limit 1;
  if v_guia is null then
    raise notice '127: no hay guías para el centinela; no se ejecuta.';
    return;
  end if;
  begin
    -- Una sesión de gerencia: con RLS, sin usuario la fila ni se ve.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select id from perfiles where rol = 'gerencia' and activo limit 1),
                        'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      update guias_remision set estado_sunat = 'aceptado' where id = v_guia;
      if not found then
        raise exception '127: la sesión de gerencia no ve la guía; el centinela no prueba nada';
      end if;
    exception when insufficient_privilege then
      v_ok := true;
    end;
    -- Otra columna sí pasa (editar un borrador, 115).
    update guias_remision set observaciones = observaciones where id = v_guia;
    reset role;
    if not v_ok then
      raise exception '127: una sesión pudo marcar la guía como aceptada';
    end if;
    raise exception '__127_DESHACER__';
  exception when others then
    reset role;
    if sqlerrm <> '__127_DESHACER__' then raise; end if;
  end;
  raise notice '127: el estado ante SUNAT de guías y comprobantes solo lo escribe el servidor.';
end $$;
