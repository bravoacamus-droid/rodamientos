-- ###########################################################################
-- 124 · EL MOTIVO «BONIFICACIÓN» DE LA NOTA DE CRÉDITO
-- ###########################################################################
--
-- El catálogo 09 de SUNAT tiene el 08 «Bonificación», y la 007 lo dejó fuera:
-- iba del 07 al 09. Luis, 15/10, con la nota del sistema de Willy delante:
-- ahí sale en la lista, y aquí no se podía elegir.
--
-- Es un catálogo de SUNAT, no un dato del cliente: va en migración.
-- ###########################################################################

insert into motivos_nota (tipo, codigo, descripcion)
values ('nota_credito', '08', 'Bonificación')
on conflict (tipo, codigo) do update set descripcion = excluded.descripcion, activo = true;

do $$
begin
  if not exists (select 1 from motivos_nota where tipo = 'nota_credito' and codigo = '08' and activo) then
    raise exception '124: el motivo 08 no quedó activo';
  end if;
  raise notice '124: motivo 08 «Bonificación» disponible para notas de crédito.';
end $$;
