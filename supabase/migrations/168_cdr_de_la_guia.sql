-- ###########################################################################
-- 168 · LA CONSTANCIA (CDR) DE LA GUÍA, GUARDADA
-- ###########################################################################
--
-- El problema (auditoría SUNAT del 28/10, M4). Cuando SUNAT contesta el
-- ticket de una guía, devuelve el CDR: la constancia firmada de que la
-- recibió. Es la prueba de que la guía existe para SUNAT, y lo que se
-- enseña si paran el camión y alguien lo discute. El ERP lo leía, sacaba el
-- código y el mensaje, y lo tiraba: `guias_remision` no tenía dónde
-- guardarlo. La factura sí lo guarda, en `comprobantes.sunat_respuesta`.
--
-- La solución: la misma columna, con el mismo formato (el `ResultadoCdr`
-- entero, con `cdrXml` dentro), para que una ficha sepa leer las dos.
--
-- Sin datos que mover: ninguna guía ha ido aún a SUNAT (en beta no se
-- mandan, 126).
-- ###########################################################################

alter table guias_remision
  add column if not exists sunat_respuesta jsonb;

comment on column guias_remision.sunat_respuesta is
  'Lo que contestó SUNAT a la guía (ResultadoCdr: aceptado, codigo, descripcion, observaciones y cdrXml, la constancia firmada). Mismo formato que comprobantes.sunat_respuesta (168).';

-- Y como el resto de columnas de SUNAT (127), la constancia solo la escribe
-- el servidor: una sesión de usuario con un PATCH podría si no colgarle a
-- una guía o a una factura un CDR que SUNAT nunca dio. La función es la
-- misma para las dos tablas, y `comprobantes.sunat_respuesta` tampoco
-- estaba en la lista. Se parchea sobre la versión viva, con ancla, para no
-- pisar lo que otra migración le haya añadido.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.tg_estado_sunat_solo_servidor()'::regprocedure), E'\r\n', E'\n');
  v_ancla text := 'or new.sunat_hash_cdr is distinct from old.sunat_hash_cdr';
begin
  if position('new.sunat_respuesta is distinct from old.sunat_respuesta' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception '168: no encuentro el ancla «%» en tg_estado_sunat_solo_servidor()', v_ancla;
  end if;
  v_def := replace(v_def, v_ancla,
    v_ancla || E'\n     or new.sunat_respuesta is distinct from old.sunat_respuesta');
  execute v_def;
end $$;

-- Centinela: la columna existe, es jsonb, y la puede escribir quien escribe
-- la respuesta (la Server Action, con service_role); se prueba escribiendo
-- de verdad en una guía y deshaciendo. Y una sesión de usuario NO puede
-- tocar la constancia de un comprobante.
do $$
declare
  v_id uuid;
  v_bloqueado boolean := false;
begin
  if position('new.sunat_respuesta is distinct from old.sunat_respuesta'
              in pg_get_functiondef('public.tg_estado_sunat_solo_servidor()'::regprocedure)) = 0 then
    raise exception '168: tg_estado_sunat_solo_servidor() no protege sunat_respuesta';
  end if;

  select id into v_id from comprobantes where sunat_respuesta is not null limit 1;
  if v_id is not null then
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (select id from perfiles where rol = 'gerencia' and activo limit 1),
                          'role', 'authenticated')::text, true);
      set local role authenticated;
      begin
        update comprobantes set sunat_respuesta = sunat_respuesta || '{"falso": true}'::jsonb where id = v_id;
        if not found then
          raise exception '168: la sesión de gerencia no ve el comprobante; el centinela no prueba nada';
        end if;
      exception when insufficient_privilege then
        if sqlerrm like 'El estado ante SUNAT%' then v_bloqueado := true; else raise; end if;
      end;
      reset role;
      if not v_bloqueado then
        raise exception '168: una sesión de usuario pudo cambiar la constancia de SUNAT de un comprobante';
      end if;
      raise exception '__168_DESHACER__';
    exception when others then
      reset role;
      if sqlerrm <> '__168_DESHACER__' then raise; end if;
    end;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'guias_remision'
       and column_name = 'sunat_respuesta' and data_type = 'jsonb'
  ) then
    raise exception '168: falta guias_remision.sunat_respuesta (jsonb)';
  end if;

  select id into v_id from guias_remision limit 1;
  if v_id is not null then
    begin
      update guias_remision
         set sunat_respuesta = jsonb_build_object('aceptado', true, 'codigo', '0', 'cdrXml', '<ApplicationResponse/>')
       where id = v_id;
      if (select sunat_respuesta->>'cdrXml' from guias_remision where id = v_id) <> '<ApplicationResponse/>' then
        raise exception '168: la constancia no se guardó';
      end if;
      raise exception '__168_DESHACER__';
    exception when others then
      if sqlerrm <> '__168_DESHACER__' then raise; end if;
    end;
  end if;

  raise notice '168: guias_remision.sunat_respuesta lista para la constancia de SUNAT.';
end $$;
