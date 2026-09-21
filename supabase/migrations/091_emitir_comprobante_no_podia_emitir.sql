-- ###########################################################################
-- 091 · `emitir_comprobante` NO PODÍA EMITIR
-- ###########################################################################
--
-- Al probar la emisión el 21/09 —la primera vez que alguien la ejecuta desde
-- que se tocó— Postgres contestó:
--
--   column "estado" is of type estado_comprobante but expression is of type
--   boolean
--
-- Es un `insert` descuadrado, y lo descuadró la **071**.
--
-- ---------------------------------------------------------------------------
-- Qué hizo mal la 071
-- ---------------------------------------------------------------------------
-- Añadió `mostrar_cuenta` parcheando la definición viva de la función, con
-- dos `replace`: uno en la lista de COLUMNAS y otro en la de VALORES.
--
-- En las columnas lo puso AL FINAL, detrás de `estado_sunat`:
--
--   ..., vendedor_id, observaciones, estado, estado_sunat, mostrar_cuenta
--
-- Pero en los valores lo puso detrás de `observaciones`, que NO es el último:
-- después van los dos estados, que la función pone a mano.
--
--   ..., nullif(p_datos ->> 'observaciones',''),
--        coalesce((p_datos ->> 'mostrar_cuenta')::boolean, true),   ← aquí
--        'emitido', 'pendiente'
--
-- Con eso `estado` recibe el booleano, `estado_sunat` recibe `'emitido'` y
-- `mostrar_cuenta` recibe `'pendiente'`. La función dejó de poder insertar
-- nada: no es que emitiera mal, es que no emitía.
--
-- ---------------------------------------------------------------------------
-- Por qué nadie lo vio en seis días
-- ---------------------------------------------------------------------------
-- Porque **emitir gasta un correlativo fiscal de verdad**, así que nadie lo
-- ejecutaba: quedó apuntado en CLAUDE.md como «escrito pero sin probar en
-- pantalla» y ahí se quedó. La última factura del sistema es del 04/09,
-- anterior a la 071.
--
-- Y porque el centinela de la 071 miraba el TEXTO: contaba que
-- `mostrar_cuenta` apareciera dos veces en la definición. Aparecía — una vez
-- en las columnas y otra en los valores, que es exactamente lo que pasaba.
-- Nunca comprobó que las dos estuvieran en la misma posición.
--
-- Es la tercera vez este mes que un centinela de texto deja pasar una función
-- rota: la 031 (`periodo` ambiguo), la 082 (`buscar_productos` sin reemplazar)
-- y esta. **Lo único que demuestra que una función sirve es llamarla**, y por
-- eso el centinela de abajo emite una factura de verdad.
-- ###########################################################################

do $$
declare
  v_def   text;
  v_viejo text;
  v_ancla constant text := $v$'emitido', 'pendiente'$v$;
  -- El comentario viaja con su valor: dejarlo donde estaba lo pondría a
  -- explicar `estado`, que no es lo que explica.
  v_bloque text :=
$v$    -- Ausente = true. Las cuentas salen desde la 029; quitarlas por omisión
    -- cambiaría en silencio lo que imprime una pantalla que no mande el
    -- campo. Esto añade poder decir «esta no», no un comportamiento nuevo.
    coalesce((p_datos ->> 'mostrar_cuenta')::boolean, true)$v$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_comprobante';

  if v_def is null then
    raise exception 'No existe emitir_comprobante: aplica antes 004_funciones.sql';
  end if;

  -- Los .sql del repo están en CRLF, así que la definición guardada trae los
  -- retornos de carro dentro. Se quitan antes de buscar nada: si no, el ancla
  -- no casa y parece que la función es otra.
  v_def    := replace(v_def, chr(13), '');
  v_bloque := replace(v_bloque, chr(13), '');   -- por si este .sql se guarda en CRLF

  if position(v_ancla || ',' in v_def) > 0 then
    -- El valor ya está detrás de los estados: esto ya se arregló.
    raise notice '091: emitir_comprobante ya tenía el valor en su sitio.';

  elsif position($v$'mostrar_cuenta'$v$ in v_def) = 0 then
    -- No lleva el parche de la 071. Nada que mover.
    raise notice '091: emitir_comprobante no tiene mostrar_cuenta; no se toca.';

  else
    v_viejo := v_bloque || ',' || chr(10) || '    ' || v_ancla;

    if position(v_viejo in v_def) = 0 then
      -- Está descuadrada, pero no como esperábamos. Antes que adivinar, se
      -- para y se enseña el trozo: un `replace` a ciegas sobre la función que
      -- factura es peor que no aplicar la migración.
      raise exception
        '091: el descuadre no es el esperado. Mira este trozo a mano: %',
        substring(v_def from greatest(position(v_ancla in v_def) - 400, 1) for 460);
    end if;

    /*
      El bloque se muda al final, que es donde está su columna.

      Se mueve el VALOR y no la columna a propósito: la lista de columnas es
      la que coincide con la tabla y con todo lo que ya lee `mostrar_cuenta`.
      Mover la columna sería arreglar el síntoma por el lado caro.
    */
    v_def := replace(v_def, v_viejo, v_ancla || ',' || chr(10) || v_bloque);

    execute v_def;
  end if;
end $$;

-- ###########################################################################
-- Centinela · EMITE UNA FACTURA DE VERDAD, Y LA DESHACE
-- ###########################################################################
-- El runner mete cada migración en su propia transacción. Un bloque anidado
-- de PL/pgSQL es un savepoint, así que aquí dentro se puede emitir en serio
-- —correlativo incluido— y devolverlo todo al terminar: se sale por una
-- excepción, y eso deshace la factura, sus ítems y el correlativo gastado.
-- Lo único que sobrevive son las variables, que no son transaccionales, y es
-- justo lo que hay que mirar.
--
-- Sin esto la migración no prueba nada: la 071 también «se aplicó bien».
do $$
declare
  v_perfil  uuid;
  v_cliente uuid;
  v_prod    uuid;
  v_estado  text;
  v_cuenta  boolean;
  v_numero  text;
  v_id      uuid;
  v_fallo   text;
begin
  -- Un empleado activo que pueda escribir comprobantes: `emitir_comprobante`
  -- es `security definer` pero comprueba el rol, y en una migración no hay
  -- sesión, así que `auth.uid()` sería null y la llamada moriría en la puerta.
  select p.id into v_perfil
    from perfiles p
    join permisos_rol pr on pr.rol = p.rol and pr.tabla = 'comprobantes' and pr.escribir
   where p.activo
   limit 1;

  select id into v_cliente from clientes limit 1;
  select id into v_prod from productos limit 1;

  if v_perfil is null or v_cliente is null or v_prod is null then
    raise notice '091: base sin perfiles, clientes o productos; el centinela no corre.';
    return;
  end if;

  begin
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', v_perfil, 'role', 'authenticated')::text);

    -- La llamada va en su propia sentencia, y la lectura en otra: dentro de
    -- un mismo `select`, la fila que inserta la función no entra todavía en
    -- el snapshot de esa sentencia y se lee un null que parece un fallo.
    v_id := (public.emitir_comprobante(jsonb_build_object(
       'tipo', 'factura',
       -- F001 es la serie de prueba. Da igual: esto se deshace entero, y el
       -- correlativo vuelve solo al hacerlo.
       'serie', 'F001',
       'cliente_id', v_cliente,
       'vendedor_id', v_perfil,
       'condicion_pago', 'contado',
       -- Se manda false a propósito: con el descuadre de la 071 este valor
       -- acababa en `estado`, así que comprobar que llega a SU columna es
       -- comprobar que el insert quedó cuadrado.
       'mostrar_cuenta', false,
       -- La 089 exige guía declarada. Aquí solo se mira que la lista no venga
       -- vacía; el vínculo de verdad lo hace `vincular_guias_comprobante`,
       -- que no se llama desde aquí.
       'guias', jsonb_build_array(gen_random_uuid()),
       'items', jsonb_build_array(jsonb_build_object(
         'producto_id', v_prod,
         'cantidad', 1,
         'valor_unitario', 10
       ))
     )) ->> 'id')::uuid;

    select c.estado::text, c.mostrar_cuenta, c.numero
      into v_estado, v_cuenta, v_numero
      from comprobantes c
     where c.id = v_id;

    -- Salir por excepción es lo que deshace todo lo de arriba.
    raise exception using message = '__091_DESHACER__';

  exception when others then
    if sqlerrm <> '__091_DESHACER__' then
      v_fallo := sqlerrm;
    end if;
  end;

  if v_fallo is not null then
    raise exception '091: emitir_comprobante sigue sin poder emitir: %', v_fallo;
  end if;

  if v_estado is distinct from 'emitido' then
    raise exception '091: el comprobante nació en estado %, y tenía que nacer emitido', v_estado;
  end if;

  if v_cuenta is distinct from false then
    raise exception '091: mostrar_cuenta no llegó a su columna; quedó en %', v_cuenta;
  end if;

  raise notice '091: emitida y deshecha % — el insert está cuadrado.', v_numero;
end $$;
