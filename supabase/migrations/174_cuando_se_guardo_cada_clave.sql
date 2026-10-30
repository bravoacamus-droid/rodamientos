-- 174 · Cuándo se guardó cada clave de SUNAT
--
-- El problema. Las claves no vuelven nunca a la pantalla —el campo sale vacío
-- y «en blanco = no cambiar»—, que es lo correcto. Pero entonces no hay forma
-- de saber si una clave quedó guardada. Luis, 30/10, después de pelearse un
-- día con la clave SOL: «no se sabe si está guardado o no correctamente».
-- `config_sunat_secretos.actualizado_en` es una sola fecha para las tres, y
-- esa tabla la lee solo el servidor.
--
-- Una fecha por clave, en la tabla visible (no dice nada de la clave, solo
-- cuándo se escribió). La escribe `guardarConfigSunat` al guardar cada una.
-- Las ya guardadas quedan en null: no se sabe cuál se guardó cuándo, y la
-- pantalla dice «Guardada» sin fecha antes que inventarla.

alter table public.config_sunat
  add column if not exists clave_sol_guardada_en timestamptz,
  add column if not exists certificado_clave_guardada_en timestamptz,
  add column if not exists gre_secreto_guardado_en timestamptz;

comment on column public.config_sunat.clave_sol_guardada_en is
  'Cuándo se guardó la clave SOL (174). Solo la fecha: la clave vive cifrada en config_sunat_secretos.';
comment on column public.config_sunat.certificado_clave_guardada_en is
  'Cuándo se guardó la clave del certificado (174).';
comment on column public.config_sunat.gre_secreto_guardado_en is
  'Cuándo se guardó el client_secret de guías (174).';

-- Centinela: las tres columnas existen y se pueden escribir. Deshace.
do $$
begin
  begin
    update public.config_sunat
       set clave_sol_guardada_en = now(),
           certificado_clave_guardada_en = now(),
           gre_secreto_guardado_en = now()
     where id = 1;
    raise exception '__174_DESHACER__';
  exception when others then
    if sqlerrm <> '__174_DESHACER__' then raise; end if;
  end;
end $$;
