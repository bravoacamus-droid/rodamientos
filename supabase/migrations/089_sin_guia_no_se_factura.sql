-- ###########################################################################
-- Sin guía no se factura
-- ###########################################################################
--
-- Luis, 17/09: *«no debería emitir la factura si no tengo la guía hecha, ¿no?
-- Aparte, te acuerdas que la guía va sujeta a la cotización — si no, no deja
-- facturar»*.
--
-- Es el orden que fijó Willy y está en la primera página del proyecto: la guía
-- va ANTES que la factura, porque los productos técnicos se revisan y con la
-- guía sellada por el almacén del cliente es con lo que se puede facturar sin
-- arriesgar una anulación. Facturar antes de despachar es poner por escrito —y
-- con un correlativo fiscal gastado— que salió algo que todavía está aquí.
--
-- Hasta hoy era una costumbre, no una regla: ni la pantalla ni la Server
-- Action lo pedían. Y el 17/09 se descubrió que **ninguna factura del sistema
-- tenía guía**, porque `guia_id` existía desde la 002 y nadie la mandaba.
--
-- ---------------------------------------------------------------------------
-- Por qué aquí además de en la pantalla
-- ---------------------------------------------------------------------------
-- Porque `emitir_comprobante` es `security definer` y se llega a ella por
-- PostgREST con cualquier sesión válida. La pantalla y la Server Action ya lo
-- comprueban; esto es lo que no se puede saltar sin pasar por la aplicación.
--
-- ---------------------------------------------------------------------------
-- Lo que esta migración NO hace
-- ---------------------------------------------------------------------------
-- No vincula las guías: eso sigue en `vincular_guias_comprobante` (084), que
-- corre justo después. Aquí solo se EXIGE que vengan declaradas en `p_datos`,
-- que es lo que cierra el agujero. Mover el vínculo dentro de esta función
-- sería lo ideal —una sola transacción— pero obliga a reescribir la función
-- fiscal entera, y eso se hace aparte y con la factura de prueba delante.
--
-- Las notas de crédito NO pasan por aquí (`emitir_nota`), y bien: una nota no
-- ampara ningún traslado.
-- ###########################################################################

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

  if position('sin una guia de remision' in v_def) > 0 then
    raise notice 'emitir_comprobante ya exige guía; no se toca nada.';
  else
    /*
      El guardia va PEGADO al control de rol, o sea lo primero.

      La propia 004 lo dice en su comentario: «validar a media función deja un
      correlativo quemado o stock movido». Un rechazo tardío aquí costaría un
      número de factura que ya no se puede reutilizar.
    */
    if position($ancla$if jsonb_array_length(v_items) = 0 then$ancla$ in v_def) = 0 then
      raise exception 'emitir_comprobante no tiene el ancla esperada; revisa la función a mano';
    end if;

    v_def := replace(
      v_def,
      $sql$  if jsonb_array_length(v_items) = 0 then$sql$,
      $sql$  -- La guía va antes que la factura (Willy). Se exige DECLARADA aquí:
  -- el vínculo lo escribe `vincular_guias_comprobante` justo después (084).
  if coalesce(jsonb_array_length(p_datos -> 'guias'), 0) = 0 then
    raise exception 'No se puede facturar sin una guia de remision: la mercaderia sale primero'
      using errcode = 'check_violation';
  end if;

  if jsonb_array_length(v_items) = 0 then$sql$
    );

    execute v_def;
  end if;
end $$;

-- ###########################################################################
-- Centinela
-- ###########################################################################
-- EJECUTA la función, no lee su fuente. La lección de la 082: un centinela que
-- mira el texto que la propia migración acaba de escribir siempre pasa.
do $$
declare
  v_def   text;
  v_falla boolean := false;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_comprobante';

  if position('sin una guia de remision' in v_def) = 0 then
    raise exception 'El guardia no quedó dentro de emitir_comprobante';
  end if;

  -- Sin `guias` en el payload tiene que reventar, y reventar por ESTO y no
  -- por cualquier otra cosa. Se llama con un payload mínimo: si el guardia
  -- está donde debe, no llega ni a mirar el resto.
  begin
    perform public.emitir_comprobante('{"tipo":"factura"}'::jsonb);
    v_falla := true;
  exception
    when others then
      if position('sin una guia de remision' in sqlerrm) = 0
         and position('no puede emitir' in sqlerrm) = 0 then
        raise exception 'Falló por otra cosa antes de mirar la guía: %', sqlerrm;
      end if;
  end;

  if v_falla then
    raise exception 'emitir_comprobante aceptó un comprobante SIN guía';
  end if;
end $$;

comment on function public.emitir_comprobante(jsonb) is
  'Emisión completa en un round-trip: correlativo, cabecera, ítems, cuotas, SPOT y (opcional) descarga de stock. Los totales se calculan en el servidor. Desde la 089 exige que el payload declare al menos una guía: la guía va antes que la factura (decisión de Willy).';
