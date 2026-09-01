-- ###########################################################################
-- 039 · CREAR MARCAS DESDE LA PANTALLA, Y EL CATÁLOGO 03 DE SUNAT ENTERO
-- ###########################################################################
--
-- Willy, 01/09 (17:47): *«tengo que tener la opción de crear familias,
-- subfamilias, descripciones, marcas también, porque no estoy considerando
-- todas las marcas»*.
--
-- La 028 dejó crear familia, sub-familia y descripción. Faltaban las dos que
-- pidió ahora, y son casos MUY distintos aunque en la pantalla se vean igual.
--
-- ---------------------------------------------------------------------------
-- 1 · La marca sí se inventa
-- ---------------------------------------------------------------------------
-- `marcas` es nuestra: nombre libre, único por `normalizar_codigo(nombre)`.
-- Hoy hay 24 y el maestro que mandó trae 6 (SKF, FAG, NTN, NSK, INA, TIMKEN),
-- pero él mismo dice que aparecerán otras. Mismo patrón que la 028: crear algo
-- que ya existe NO es un error, se devuelve lo que hay con `creada: false`.
--
-- ---------------------------------------------------------------------------
-- 2 · La unidad de medida NO se inventa
-- ---------------------------------------------------------------------------
-- Y aquí hay que ser claro, porque él lo pidió como si fueran lo mismo.
--
-- `unidades_medida` es el **catálogo 03 de SUNAT**. Su clave primaria es el
-- código que viaja dentro del XML de la factura:
--
--     <cbc:InvoicedQuantity unitCode="NIU">2</cbc:InvoicedQuantity>
--
-- SUNAT valida ese código contra su propia tabla. Un código inventado —«UND»,
-- «PZA», «ROD»— **no se rechaza en nuestra pantalla: se rechaza en SUNAT**,
-- cuando la factura ya está emitida, con el cliente esperando. Y la fila
-- quedaría en la base referenciada por productos que ya no se pueden facturar.
--
-- Así que no se abre un «crear unidad». Lo que se hace es cargar el catálogo
-- de verdad, para que la unidad que falte **ya esté ahí y solo haya que
-- buscarla**. Había 6 de las ~40 que un distribuidor industrial puede llegar a
-- necesitar; con el buscador del desplegable, tener 40 no estorba.
--
-- Los códigos son los de la Recomendación 20 de UN/CEFACT, que es de donde
-- SUNAT toma el catálogo 03.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1 · crear_marca
-- ---------------------------------------------------------------------------
create or replace function public.crear_marca(p_nombre text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id     uuid;
begin
  -- Quien mantiene el maestro de productos mantiene sus marcas: no tiene
  -- sentido dejar dar de alta un rodamiento y no el fabricante que lo hace.
  if not public.puede_escribir('productos') then
    raise exception 'Tu rol no puede crear marcas'
      using errcode = 'insufficient_privilege';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'El nombre de la marca es demasiado corto'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id into v_id from marcas m
   where m.nombre_norm = public.normalizar_codigo(v_nombre);

  if v_id is not null then
    -- Ya existía. Se dice, no se disimula: quien teclea «SKF» cuando SKF ya
    -- está no acaba de crear nada, y su producto va donde esperaba igual.
    --
    -- Se reactiva si estaba dada de baja: es lo que quiere quien la escribe.
    update marcas set activo = true where id = v_id and not activo;
    return (select jsonb_build_object(
              'id', m.id, 'nombre', m.nombre,
              -- `marcas` no tiene columna `codigo` —a diferencia de familias,
              -- sub-familias y tipos—. Se devuelve la forma canónica del
              -- nombre, que es lo que de verdad la identifica y lo que lleva
              -- el índice único.
              'codigo', m.nombre_norm, 'creada', false)
            from marcas m where m.id = v_id);
  end if;

  insert into marcas (nombre, orden)
  values (upper(v_nombre),
          -- Al final: las 24 que vinieron del catálogo del cliente tienen su
          -- orden pensado y una nueva no debería colarse en medio.
          (select coalesce(max(orden), 100) + 10 from marcas))
  returning id into v_id;

  return (select jsonb_build_object(
            'id', m.id, 'nombre', m.nombre, 'codigo', m.nombre_norm, 'creada', true)
          from marcas m where m.id = v_id);
end $$;

comment on function public.crear_marca(text) is
  'Da de alta una marca desde el alta de producto. Devuelve la que ya hubiera con creada:false en vez de fallar: quien está creando un producto no quiere una lección sobre duplicados.';

revoke execute on function public.crear_marca(text) from public, anon;
grant execute on function public.crear_marca(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 · El catálogo 03, para poder elegir en vez de inventar
-- ---------------------------------------------------------------------------
-- `on conflict do nothing`: las 6 que ya estaban conservan su etiqueta y su
-- orden, que se eligieron a mano y están bien.
--
-- El `orden` agrupa por para qué sirven: primero lo que se factura de verdad
-- aquí (unidades y empaques), después longitud, peso, volumen y tiempo. Con el
-- buscador del desplegable el orden importa menos, pero quien abre la lista
-- sin escribir nada debería ver «Unidad» arriba, no «Año».
insert into unidades_medida (codigo, etiqueta, abreviatura, orden) values
  -- Lo que de verdad se vende en un almacén de rodamientos
  ('NIU', 'Unidad',              'und',   10),
  ('ZZ',  'Servicio',            'serv',  20),
  ('SET', 'Juego / Set',         'jgo',   30),
  ('KT',  'Kit',                 'kit',   35),
  ('PR',  'Par',                 'par',   40),
  ('DZN', 'Docena',              'dzn',   50),
  ('GRO', 'Gruesa (12 docenas)', 'gr',    55),
  ('CEN', 'Ciento',              'cto',   60),
  ('MIL', 'Millar',              'mll',   65),
  -- Empaques
  ('BX',  'Caja',                'caja',  100),
  ('CT',  'Cartón',              'ctn',   105),
  ('PK',  'Paquete',             'paq',   110),
  ('BG',  'Bolsa',               'bls',   115),
  ('BJ',  'Balde',               'bld',   120),
  ('DR',  'Cilindro / Tambor',   'cil',   125),
  ('CA',  'Lata',                'lata',  130),
  ('BO',  'Botella',             'bot',   135),
  ('RO',  'Rollo',               'rll',   140),
  ('BE',  'Fardo',               'frd',   145),
  ('TU',  'Tubo',                'tbo',   150),
  ('ST',  'Lámina / Plancha',    'lam',   155),
  ('BLL', 'Barril',              'bar',   160),
  -- Longitud
  ('MTR', 'Metro',               'm',     200),
  ('CMT', 'Centímetro',          'cm',    205),
  ('MMT', 'Milímetro',           'mm',    210),
  ('INH', 'Pulgada',             'pulg',  215),
  ('FOT', 'Pie',                 'pie',   220),
  ('YRD', 'Yarda',               'yd',    225),
  -- Superficie y volumen
  ('MTK', 'Metro cuadrado',      'm2',    300),
  ('MTQ', 'Metro cúbico',        'm3',    305),
  ('LTR', 'Litro',               'L',     310),
  ('MLT', 'Mililitro',           'mL',    315),
  ('GLL', 'Galón',               'gal',   320),
  -- Peso
  ('KGM', 'Kilogramo',           'kg',    400),
  ('GRM', 'Gramo',               'g',     405),
  ('TNE', 'Tonelada',            't',     410),
  ('LBR', 'Libra',               'lb',    415),
  ('ONZ', 'Onza',                'oz',    420),
  -- Tiempo, para los servicios
  ('HUR', 'Hora',                'h',     500),
  ('DAY', 'Día',                 'día',   505),
  ('MON', 'Mes',                 'mes',   510),
  ('ANN', 'Año',                 'año',   515)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
do $$
declare
  v_n     int;
  v_marca jsonb;
  v_id    uuid;
  v_quien uuid;
begin
  -- El catálogo entró y las 6 originales siguen como estaban.
  select count(*) into v_n from unidades_medida;
  if v_n < 40 then
    raise exception 'El catálogo 03 no se cargó entero: solo % unidades', v_n;
  end if;

  if (select etiqueta from unidades_medida where codigo = 'NIU') is distinct from 'Unidad' then
    raise exception 'La unidad NIU perdió su etiqueta original';
  end if;
  if (select etiqueta from unidades_medida where codigo = 'SET') is distinct from 'Kit / Set' then
    raise exception 'La unidad SET perdió su etiqueta original: el insert pisó lo que ya estaba';
  end if;

  -- Todos los códigos pasan el check de SUNAT. Si alguno no lo pasara el
  -- insert ya habría fallado, pero esto lo deja dicho.
  select count(*) into v_n from unidades_medida where codigo !~ '^[A-Z0-9]{2,3}$';
  if v_n > 0 then
    raise exception '% unidad(es) con un código que SUNAT no aceptaría', v_n;
  end if;

  -- crear_marca, haciéndose pasar por gerencia: `puede_escribir` mira
  -- `auth.uid()`, y en una migración no hay sesión.
  select p.id into v_quien from perfiles p where p.activo and p.rol = 'gerencia' limit 1;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  delete from marcas where nombre_norm = public.normalizar_codigo('ZZTESTMARCA');

  v_marca := public.crear_marca('zztestmarca');
  if not (v_marca->>'creada')::boolean then
    raise exception 'crear_marca dice que no la creó, y no existía';
  end if;
  if v_marca->>'nombre' is distinct from 'ZZTESTMARCA' then
    raise exception 'crear_marca no normaliza el nombre a mayúsculas: %', v_marca->>'nombre';
  end if;
  v_id := (v_marca->>'id')::uuid;

  -- La segunda vez devuelve la misma, sin fallar y sin duplicar. Es el caso
  -- que de verdad importa: alguien teclea «SKF» con SKF ya en la lista.
  v_marca := public.crear_marca('  ZzTestMarca  ');
  if (v_marca->>'creada')::boolean then
    raise exception 'crear_marca duplicó una marca que ya existía';
  end if;
  if (v_marca->>'id')::uuid is distinct from v_id then
    raise exception 'crear_marca devolvió otra marca al repetir el nombre';
  end if;

  select count(*) into v_n from marcas
   where nombre_norm = public.normalizar_codigo('ZZTESTMARCA');
  if v_n <> 1 then
    raise exception 'Quedaron % filas para la misma marca', v_n;
  end if;

  delete from marcas where id = v_id;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'Marcas: se crean desde la pantalla. Unidades: % del catálogo 03, para elegir y no inventar.',
    (select count(*) from unidades_medida);
end $$;
