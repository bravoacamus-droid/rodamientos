-- ###########################################################################
-- 063 · LA GUÍA GUARDA QUE VA A PIE
-- ###########################################################################
--
-- La 062 añadió `a_pie` y `conductor_telefono` a `guias_remision`, pero la
-- guía no se inserta a mano: la crea `generar_guia_desde_cotizacion()`, que
-- lista sus columnas una a una. Sin tocarla, las dos nuevas se quedarían
-- siempre en su valor por defecto y la pantalla parecería funcionar mientras
-- el dato se pierde en el camino — que es el peor de los fallos, porque no
-- avisa.
--
-- Se parchea la definición VIVA por reemplazo de texto, igual que hizo la 018
-- con la comprobación de estado. Copiar aquí la función entera la duplicaría,
-- y a la siguiente vez que alguien tocara la 004 las dos versiones se
-- separarían sin que nadie lo notara.
-- ###########################################################################

set search_path = public, extensions;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generar_guia_desde_cotizacion';

  if v_def is null then
    raise exception 'No existe generar_guia_desde_cotizacion: aplica antes 004_funciones.sql';
  end if;

  if position('a_pie' in v_def) > 0 then
    raise notice 'La función ya guarda a_pie; no se toca nada.';
  else
    -- La lista de columnas del insert.
    v_def := replace(
      v_def,
      'conductor_documento, conductor_nombre, conductor_licencia,',
      'conductor_documento, conductor_nombre, conductor_licencia, conductor_telefono, a_pie,'
    );
    -- Y los valores, en el mismo orden.
    v_def := replace(
      v_def,
      $sql$nullif(p_datos ->> 'conductor_licencia',''),$sql$,
      $sql$nullif(p_datos ->> 'conductor_licencia',''),
    nullif(p_datos ->> 'conductor_telefono',''),
    -- Ausente es «no, va en vehículo»: lo excepcional es ir a pie, y un dato
    -- que no llegó no puede significar lo excepcional.
    coalesce((p_datos ->> 'a_pie')::boolean, false),$sql$
    );
    execute v_def;
  end if;
end $$;

-- Centinela: que la próxima vez que alguien reescriba la 004 sin acordarse de
-- esto, se entere aquí y no en una guía impresa sin el teléfono de quien la
-- lleva.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generar_guia_desde_cotizacion';

  if position('a_pie' in v_def) = 0 then
    raise exception 'generar_guia_desde_cotizacion no guarda a_pie: el traslado peatonal se perdería en silencio';
  end if;
  if position('conductor_telefono' in v_def) = 0 then
    raise exception 'generar_guia_desde_cotizacion no guarda conductor_telefono';
  end if;
end $$;

comment on function public.generar_guia_desde_cotizacion(jsonb) is
  'Crea la guía en borrador desde una cotización aprobada o ya facturada. `atendida` significa facturada, no entregada: lo entregado se cuenta en guia_items. Desde la 063 guarda también `a_pie` y `conductor_telefono`, para el traslado peatonal que pidió Willy el 07/09.';
