-- ###########################################################################
-- 156 · AVISO DE QUE EL CERTIFICADO DIGITAL VA A CADUCAR (23/10)
-- ###########################################################################
--
-- El consultor del 23/10 (n.º 8): el certificado digital dura uno o dos años,
-- y el día que caduca SUNAT rechaza TODO lo que se firme con él. La fecha ya
-- se guardaba al subirlo (`config_sunat.certificado_caduca_en`, 017) y se
-- enseñaba en la pantalla de SUNAT —donde nadie entra si todo funciona—.
-- Nadie avisaba.
--
-- `generar_alertas` avisa desde 30 días antes: alta hasta la última semana,
-- crítica la última semana y después de caducar. Una alerta por certificado
-- (la huella lleva la fecha de caducidad): al subir el nuevo, la vieja deja de
-- ser verdad y la 151 la archiva sola.

alter table public.alertas drop constraint if exists alerta_tipo_ok;
alter table public.alertas add constraint alerta_tipo_ok check (tipo = any (array[
  'quiebre_stock', 'stock_bajo', 'sobrestock', 'stock_negativo', 'credito_por_vencer',
  'credito_vencido', 'linea_credito', 'cotizacion_por_vencer', 'sunat_rechazo',
  'sin_rotacion', 'margen_bajo', 'sunat_atascado', 'certificado_por_vencer']));

do $$
declare
  v_def text := replace(pg_get_functiondef('public.generar_alertas()'::regprocedure), E'\r\n', E'\n');
  v_viejo text := $a$  -- 151 · 1: lo que dejó de ser verdad se archiva solo.$a$;
begin
  if position(v_viejo in v_def) = 0 then raise exception '156: no encontré el bloque de la 151'; end if;
  v_def := replace(v_def, v_viejo, $a$  -- 156: el certificado digital, desde 30 días antes de caducar.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'certificado_por_vencer',
         case when cs.certificado_caduca_en <= current_date + 7 then 'critica'::severidad_alerta
              else 'alta'::severidad_alerta end,
         case when cs.certificado_caduca_en < current_date then 'El certificado digital caducó'
              else 'El certificado digital va a caducar' end,
         'Caduca el ' || to_char(cs.certificado_caduca_en, 'DD/MM/YYYY') ||
           '. Sin certificado vigente SUNAT rechaza todas las facturas: hay que renovarlo y subir el nuevo.',
         null, null, coalesce(cs.certificado_nombre, 'Certificado digital'),
         (cs.certificado_caduca_en - current_date), '/configuracion/sunat',
         'certificado:' || to_char(cs.certificado_caduca_en, 'YYYY-MM-DD')
    from config_sunat cs
   where cs.certificado_caduca_en is not null
     and cs.certificado_caduca_en <= current_date + 30
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- 156: al subir otro certificado, el aviso del anterior sobra.
  update alertas a set archivada = true
   where not a.archivada and a.tipo = 'certificado_por_vencer'
     and not exists (select 1 from config_sunat cs
                      where cs.certificado_caduca_en <= current_date + 30
                        and a.huella = 'certificado:' || to_char(cs.certificado_caduca_en, 'YYYY-MM-DD'));

$a$ || v_viejo);
  execute v_def;
end $$;

-- Centinela: un certificado que caduca en 5 días avisa en crítico, y al
-- cambiarlo por uno de dentro de un año el aviso se archiva.
do $$
declare v_id int := (select id from config_sunat limit 1); v_n int;
begin
  if v_id is null then raise notice '156: no hay config_sunat; se salta.'; return; end if;
  begin
    update config_sunat set certificado_caduca_en = current_date + 5 where id = v_id;
    perform public.generar_alertas();
    select count(*) into v_n from alertas where tipo = 'certificado_por_vencer' and not archivada and severidad = 'critica';
    if v_n <> 1 then raise exception '156: el certificado por caducar dio % alertas críticas', v_n; end if;

    update config_sunat set certificado_caduca_en = current_date + 365 where id = v_id;
    perform public.generar_alertas();
    select count(*) into v_n from alertas where tipo = 'certificado_por_vencer' and not archivada;
    if v_n <> 0 then raise exception '156: el aviso del certificado viejo no se archivó'; end if;

    raise exception '__156_DESHACER__';
  exception when others then
    if sqlerrm <> '__156_DESHACER__' then raise; end if;
  end;
  raise notice '156: aviso del certificado digital.';
end $$;
