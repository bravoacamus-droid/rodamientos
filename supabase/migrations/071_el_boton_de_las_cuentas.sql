-- ###########################################################################
-- 071 · EL INTERRUPTOR DE LAS CUENTAS, QUE WILLY PIDIÓ Y NADIE PODÍA PULSAR
-- ###########################################################################
--
-- Willy, 07/09 (13:21):
--
--   *«Al momento de elaborar la factura tiene un botón que se puede activar o
--   no, según tú desees, para que figure en la factura los números de
--   cuenta.»* — *«A veces ocupa mucho espacio, a veces no es necesario.»*
--
-- La columna se creó en la 029. El documento la lee y la imprime desde
-- entonces. Lo que nunca existió es **el botón**: `emitir_comprobante` no la
-- mira, así que toda factura nace con el `default true` del esquema y las
-- cuentas salen siempre, quiera o no quiera.
--
-- Es el mismo patrón que ya se documentó seis veces el 07/09: la pieza está,
-- el camino no. Y aquí es más claro de lo normal, porque la frase de Willy
-- está copiada literalmente en el comentario de la 029 y en el del componente
-- que lo imprime — se documentó la intención y no se conectó el cable.
--
-- ---------------------------------------------------------------------------
-- Por qué se parchea la definición viva y no se reescribe la función
-- ---------------------------------------------------------------------------
-- `emitir_comprobante` son casi doscientas líneas en la 004: correlativos,
-- detracción, retención, cuotas, stock. Copiarlas aquí para tocar una columna
-- crearía dos versiones de la misma función que se separan a la primera
-- corrección que solo se haga en una.
--
-- Se lee la definición vigente, se le añade la columna donde va y se vuelve a
-- ejecutar. Es el patrón de la 018 y de la 063, y es reentrante: si la columna
-- ya está, no se toca nada.
--
-- Ausente sigue siendo `true`. Y no es pereza: las cuentas salen desde la 029
-- y quitarlas por defecto cambiaría en silencio todas las facturas que se
-- emitan desde una pantalla que aún no mande el campo. Lo que se añade es
-- poder decir «esta no», no un comportamiento nuevo por omisión.
-- ###########################################################################

set local search_path = public, extensions;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_comprobante';

  if v_def is null then
    raise exception 'No existe emitir_comprobante: aplica antes 004_funciones.sql';
  end if;

  if position('mostrar_cuenta' in v_def) > 0 then
    raise notice 'emitir_comprobante ya guarda mostrar_cuenta; no se toca nada.';
  else
    -- La lista de columnas del insert. `estado, estado_sunat` son las dos
    -- últimas y cierran el paréntesis: es un ancla estable.
    v_def := replace(
      v_def,
      'vendedor_id, observaciones, estado, estado_sunat',
      'vendedor_id, observaciones, estado, estado_sunat, mostrar_cuenta'
    );

    -- Y el valor. Va detrás de `observaciones`, que es el último `p_datos`
    -- del values antes de los dos estados, que la función pone a mano.
    v_def := replace(
      v_def,
      $sql$nullif(p_datos ->> 'observaciones',''),$sql$,
      $sql$nullif(p_datos ->> 'observaciones',''),
    -- Ausente = true. Las cuentas salen desde la 029; quitarlas por omisión
    -- cambiaría en silencio lo que imprime una pantalla que no mande el
    -- campo. Esto añade poder decir «esta no», no un comportamiento nuevo.
    coalesce((p_datos ->> 'mostrar_cuenta')::boolean, true),$sql$
    );

    execute v_def;
  end if;
end $$;

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- Que el cable quedó conectado. Sin esto, la columna volvería a quedarse en su
-- default y el interruptor de la pantalla no haría nada — que es exactamente
-- la situación que esta migración viene a arreglar, y que duró desde la 029
-- sin que nada fallara.
do $$
declare
  v_def text;
  v_n   int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_comprobante';

  if position('mostrar_cuenta' in v_def) = 0 then
    raise exception 'emitir_comprobante no guarda mostrar_cuenta: el botón de Willy no haría nada';
  end if;

  -- Una vez, no dos: si el `replace` hubiera pegado la columna en un sitio
  -- inesperado, el insert tendría columnas descuadradas.
  select count(*) into v_n
    from regexp_matches(v_def, 'mostrar_cuenta', 'g');
  if v_n <> 2 then
    raise exception 'mostrar_cuenta aparece % veces en emitir_comprobante; se esperaban 2 (columna y valor)', v_n;
  end if;
end $$;

comment on column comprobantes.mostrar_cuenta is
  'Si el documento impreso lleva al pie las cuentas para pagar. Willy 07/09 13:21: «un botón que se puede activar o no, según tú desees… a veces ocupa mucho espacio». Creada en la 029; `emitir_comprobante` no la leía hasta la 071, así que hasta entonces salían siempre.';
