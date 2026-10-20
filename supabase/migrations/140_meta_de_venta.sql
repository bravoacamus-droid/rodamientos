-- ###########################################################################
-- 140 · LA META DE VENTA DEL MES
-- ###########################################################################
--
-- Luis, 20/10, en Informes: *«cada mes tengo un volumen de venta… cuál es el
-- tope, cuánto debería vender, como si fuera mi límite»*, y enseguida:
-- *«¿sería dable que en datos maestros de la empresa ponga ese número tope…
-- la meta del mes, y la meta que tengo que llegar a vender por día?»*.
--
-- Una columna, en dólares y sin IGV —como todo lo que suman los informes—.
-- Vacía significa «sin meta puesta»: entonces «¿Cómo voy?» usa el promedio de
-- los meses elegidos. Solo por mes: por día no hace falta (Luis, 20/10: «ya
-- por día no necesita, sino por mes nomás»).
--
-- El VALOR no va aquí: lo escribe Willy desde Configuración → Datos de la
-- empresa (CLAUDE.md §3: los datos del cliente no van en migraciones).
-- ###########################################################################

alter table empresa
  add column if not exists meta_venta_mensual numeric(14, 2)
    check (meta_venta_mensual is null or meta_venta_mensual > 0);

comment on column empresa.meta_venta_mensual is
  'Meta de venta del mes, USD sin IGV (140). Null: Informes usa el promedio.';

do $$
begin
  -- El centinela la ESCRIBE y la lee, y deshace al salir por excepción.
  begin
    update empresa set meta_venta_mensual = 12345.67 where id = 1;
    if (select meta_venta_mensual from empresa where id = 1) <> 12345.67 then
      raise exception '140: la meta no se guardó';
    end if;
    begin
      update empresa set meta_venta_mensual = -1 where id = 1;
      raise exception '140: aceptó una meta negativa';
    exception when check_violation then null;
    end;
    raise exception '__140_DESHACER__';
  exception when others then
    if sqlerrm <> '__140_DESHACER__' then raise; end if;
  end;
  raise notice '140: meta_venta_mensual lista.';
end $$;
