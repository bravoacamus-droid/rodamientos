-- ###########################################################################
-- 009 · CORRECCIONES SOBRE MIGRACIONES YA APLICADAS
-- ###########################################################################
--
-- 002 ya corrió contra el proyecto, y `create table if not exists` no vuelve a
-- tocar una tabla que existe. Así que los arreglos posteriores al esquema base
-- viven aquí, escritos para dar el mismo resultado en las dos situaciones:
--
--   * base nueva  -> 002 ya trae la forma correcta y esto no encuentra nada
--                    que cambiar;
--   * base ya creada -> esto la lleva a la forma correcta.
--
-- Todo con guardas, para que se pueda re-aplicar cuantas veces haga falta.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Los códigos de producto SÍ pueden llevar espacios adentro
-- ---------------------------------------------------------------------------
-- La reunión decía "el código es único y sin espacios" (10:44) y de ahí salió
-- `productos_codigo_sin_espacios`. Pero el archivo que el propio cliente mandó
-- el 21/08/2026 trae '7210 BEP' y '7308 BEP': lo que quería decir es que el
-- código no se DUPLICA por un espacio, no que el espacio esté prohibido.
--
-- Con la restricción vieja, su propio maestro no se podía importar, y la
-- alternativa —reescribirle el código a '7210BEP'— cambiaba lo que el cliente
-- final lee en la cotización.
--
-- La unicidad no depende de esta columna sino de `codigo_norm`, que colapsa
-- espacios y separadores. Aquí solo se exige que no haya espacios al principio
-- ni al final, que es error de tipeo puro.
alter table productos drop constraint if exists productos_codigo_sin_espacios;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.productos'::regclass
       and conname  = 'productos_codigo_sin_bordes'
  ) then
    alter table productos
      add constraint productos_codigo_sin_bordes check (codigo = btrim(codigo));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare v_viejo int; v_nuevo int; v_prueba text;
begin
  select count(*) into v_viejo from pg_constraint
   where conrelid = 'public.productos'::regclass and conname = 'productos_codigo_sin_espacios';
  select count(*) into v_nuevo from pg_constraint
   where conrelid = 'public.productos'::regclass and conname = 'productos_codigo_sin_bordes';

  if v_viejo > 0 then raise exception 'La restricción vieja sigue puesta'; end if;
  if v_nuevo = 0 then raise exception 'Falta la restricción nueva'; end if;

  -- Los dos códigos reales que el archivo del cliente trae con espacio.
  foreach v_prueba in array array['7210 BEP', '7308 BEP'] loop
    if v_prueba <> btrim(v_prueba) then
      raise exception 'El código de prueba % no pasaría', v_prueba;
    end if;
  end loop;

  raise notice 'Correcciones aplicadas: los códigos con espacio interno ya entran.';
end $$;
