-- ###########################################################################
-- 198 · LA GUÍA EN BORRADOR SE VUELVE A PODER EDITAR
-- ###########################################################################
--
-- El problema. Moisés, 06/11, editando la T002-00000581 (TECNOFIL): al
-- «Guardar cambios» salía *«El estado, el número y el cliente de una guía los
-- ponen sus funciones»* — *«pero solo andamos cambiando la dirección»*.
--
-- Era cierto: no hacía falta cambiar nada. `tg_guia_solo_borrador` (137)
-- comparaba `new.numero` con `old.numero`, y `numero` es una columna
-- GENERADA (serie || '-' || correlativo). En un disparador BEFORE, Postgres
-- todavía no la ha calculado: `new.numero` llega vacío, siempre «distinto»
-- del viejo. Así que TODA edición directa de un borrador —la de la pantalla
-- «Editar guía»— se rechazaba, cambiara lo que cambiara. Comprobado: un
-- `update … set direccion_llegada = direccion_llegada` como usuario caía igual.
--
-- La solución: no comparar `numero`. Lo que lo forma —`serie` y
-- `correlativo`— ya se compara, así que el número sigue sin poder tocarse.
-- Lo demás, idéntico a la 137. Las cotizaciones y los comprobantes también
-- generan su número, pero sus disparadores no lo comparan (revisado).
-- ###########################################################################

create or replace function public.tg_guia_solo_borrador()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $function$
begin
  if public.escribe_una_funcion() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Las guías se generan desde su pantalla.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.estado = 'borrador' then return old; end if;
    raise exception 'Una guía emitida no se borra: se anula.' using errcode = '42501';
  end if;
  if old.estado <> 'borrador' then
    raise exception 'La guía % ya está emitida: si algo está mal, hay que anularla.', old.numero
      using errcode = '42501';
  end if;
  -- Sin `numero`: es generado y en un BEFORE llega vacío (198). Lo protegen
  -- `serie` y `correlativo`, que son de lo que está hecho.
  if new.estado is distinct from old.estado
     or new.serie is distinct from old.serie
     or new.correlativo is distinct from old.correlativo
     or new.cliente_id is distinct from old.cliente_id
     or new.cotizacion_id is distinct from old.cotizacion_id
     or new.pedido_id is distinct from old.pedido_id then
    raise exception 'El estado, el número y el cliente de una guía los ponen sus funciones.'
      using errcode = '42501';
  end if;
  return new;
end $function$;

-- Centinela: se EJECUTA como un usuario de verdad (rol `authenticated`, con
-- la sesión de gerencia) sobre un borrador que exista. Cambiar la dirección
-- tiene que pasar; cambiar el correlativo, no. Todo se deshace.
do $$
declare
  v_ger uuid := (select id from perfiles where rol = 'gerencia' and activo limit 1);
  v_guia uuid := (select id from guias_remision where estado = 'borrador' limit 1);
  v_msg text;
begin
  if v_ger is null or v_guia is null then
    raise notice '198: no hay un borrador con que probar; el centinela no se ejecuta.';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ger, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    update guias_remision set direccion_llegada = direccion_llegada || ' ' where id = v_guia;

    begin
      update guias_remision set correlativo = correlativo + 100000 where id = v_guia;
      raise exception '198: dejó cambiar el correlativo de un borrador';
    exception when insufficient_privilege then
      v_msg := sqlerrm;
    end;
    if v_msg not like '%los ponen sus funciones%' then
      raise exception '198: al cambiar el correlativo dijo «%»', v_msg;
    end if;

    raise exception '__198_DESHACER__';
  exception when others then
    if sqlerrm <> '__198_DESHACER__' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  raise notice '198: el borrador se edita y su número sigue protegido; deshecho limpio.';
end $$;
