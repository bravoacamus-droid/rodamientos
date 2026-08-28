-- ###########################################################################
-- 031 · EL GUARDIÁN DE CUOTA NO COMPILABA AL EJECUTARSE
-- ###########################################################################
--
-- `consultas_reservar_cuota` reventaba en CADA llamada con:
--
--   42702: column reference "periodo" is ambiguous
--
-- Y con ella se caía la consulta de RUC y DNI entera: el alta de cliente y la
-- de proveedor respondían «No se pudo consultar el documento» pasara lo que
-- pasara, porque la reserva de cuota va ANTES de salir a la red.
--
-- ---------------------------------------------------------------------------
-- Por qué nadie lo vio hasta hoy
-- ---------------------------------------------------------------------------
-- Dos capas lo tapaban, y las dos por buenos motivos:
--
--   1. Sin `DECOLECTA_TOKEN` el paquete NI SIQUIERA LLEGA a pedir cuota:
--      degrada a «escribe los datos a mano» antes de tocar la base. En
--      desarrollo no había token, así que la función no se llamaba nunca.
--   2. `plpgsql` no valida el cuerpo al crearlo. La ambigüedad se resuelve en
--      tiempo de EJECUCIÓN, así que la migración 003 se aplicó sin una queja y
--      la función existió rota desde el primer día.
--
-- O sea que el fallo apareció justo al configurar el token —lo primero que se
-- hizo con él fue destapar esto—, y habría aparecido igual en producción el
-- día de la entrega si no se prueba antes.
--
-- ---------------------------------------------------------------------------
-- Qué estaba mal, exactamente
-- ---------------------------------------------------------------------------
-- La función es `returns table (concedido, periodo, plan, consumidas, limite)`,
-- y en plpgsql **los nombres de un RETURNS TABLE son variables de salida**.
-- `consultas_cuota` tiene columnas que se llaman igual: `periodo`, `plan`,
-- `consumidas`, `limite`. Así que cada `where periodo = p_periodo` tenía dos
-- candidatos —la variable y la columna— y Postgres se negaba a elegir.
--
-- No es que faltara una comilla: la función NUNCA funcionó.
--
-- El arreglo es poner alias a la tabla y calificar cada columna.
--
-- Con una excepción que no se puede calificar y que costó un intento fallido:
-- el destino de un `ON CONFLICT (periodo)` es una inferencia de índice, y ahí
-- Postgres solo acepta el nombre pelado de la columna —no admite alias— así
-- que seguía siendo ambiguo. Se nombra el CONSTRAINT en su lugar:
-- `on conflict on constraint consultas_cuota_pkey`. Con eso no queda ningún
-- identificador que resolver, y de paso dice qué unicidad se está usando, que
-- es la clave primaria de la tabla.
--
-- La firma NO cambia: `packages/consultas/src/cuota.ts` lee esos cinco nombres.

set search_path = public, extensions;

create or replace function consultas_reservar_cuota(
  p_periodo       text,
  p_plan          text,
  p_limite        integer,
  p_prioridad     text,
  p_reserva_pct   numeric,
  p_inicio_ciclo  timestamptz,
  p_fin_ciclo     timestamptz
) returns table (
  concedido   boolean,
  periodo     text,
  plan        text,
  consumidas  integer,
  limite      integer
) language plpgsql as $$
declare
  v_consumidas       integer;
  v_agotado          boolean;
  v_umbral_previo    integer;
  v_umbral_nuevo     integer;
  v_pct              numeric;
  v_reserva_desde    numeric;
begin
  -- La lista de columnas de un INSERT no es una expresión: ahí no hay
  -- ambigüedad. El destino del ON CONFLICT sí la tenía, y NO se puede
  -- calificar con alias —es una inferencia de índice, admite solo el nombre
  -- pelado—, así que se nombra el constraint. Es la clave primaria.
  insert into consultas_cuota (periodo, plan, limite, consumidas, inicio_ciclo, fin_ciclo)
  values (p_periodo, p_plan, p_limite, 0, p_inicio_ciclo, p_fin_ciclo)
  on conflict on constraint consultas_cuota_pkey
  do update set plan = excluded.plan, limite = excluded.limite;

  -- Bloquea la fila: ninguna otra transacción concurrente puede leerla para
  -- actualizarla hasta que esta termine.
  select c.consumidas, c.agotado_forzado, c.ultimo_umbral_notificado
    into v_consumidas, v_agotado, v_umbral_previo
    from consultas_cuota c
   where c.periodo = p_periodo
   for update;

  v_reserva_desde := 100 - p_reserva_pct;
  v_pct := (v_consumidas::numeric / greatest(p_limite, 1)) * 100;

  -- 100% o agotado por 429: nadie pasa.
  if v_agotado or v_consumidas >= p_limite then
    return query select false, p_periodo, p_plan, v_consumidas, p_limite;
    return;
  end if;

  -- Modo reserva: solo 'critical' pasa.
  if v_pct >= v_reserva_desde and p_prioridad <> 'critical' then
    return query select false, p_periodo, p_plan, v_consumidas, p_limite;
    return;
  end if;

  -- A la izquierda de un SET va siempre una columna, nunca una variable; a la
  -- derecha sí hacía falta calificar, y en el RETURNING también.
  update consultas_cuota c
     set consumidas = c.consumidas + 1,
         actualizado = now()
   where c.periodo = p_periodo
  returning c.consumidas into v_consumidas;

  -- Actualiza el último umbral cruzado (para que la app notifique una sola
  -- vez por umbral por ciclo, sección 4.3 de la especificación).
  v_pct := (v_consumidas::numeric / greatest(p_limite, 1)) * 100;
  v_umbral_nuevo := v_umbral_previo;
  if v_pct >= 100 then v_umbral_nuevo := 100;
  elsif v_pct >= 95 then v_umbral_nuevo := greatest(v_umbral_previo, 95);
  elsif v_pct >= 90 then v_umbral_nuevo := greatest(v_umbral_previo, 90);
  elsif v_pct >= 75 then v_umbral_nuevo := greatest(v_umbral_previo, 75);
  elsif v_pct >= 50 then v_umbral_nuevo := greatest(v_umbral_previo, 50);
  end if;

  if v_umbral_nuevo <> v_umbral_previo then
    update consultas_cuota c
       set ultimo_umbral_notificado = v_umbral_nuevo
     where c.periodo = p_periodo;
  end if;

  return query select true, p_periodo, p_plan, v_consumidas, p_limite;
end;
$$;

comment on function consultas_reservar_cuota is
  'Reserva atómica de una unidad de cuota. Llamar DESPUÉS de comprobar la caché y ANTES de llamar a Decolecta. Las columnas van con alias: los nombres del RETURNS TABLE son variables de salida en plpgsql y chocan con las columnas de consultas_cuota, que se llaman igual.';

-- ---------------------------------------------------------------------------
-- Verificación · y esta vez LLAMANDO a la función
-- ---------------------------------------------------------------------------
-- Es la única comprobación que habría servido. Mirar que la función existe, o
-- que su definición contiene tal texto, no dice nada: la rota también existía
-- y también contenía el texto. En plpgsql, lo único que prueba que un cuerpo
-- es válido es ejecutarlo.
--
-- Se usa un periodo de mentira («0000-TEST») que se borra al final, para no
-- tocar el contador del mes en curso.
do $$
declare
  v_periodo constant text := '0000-TEST';
  r         record;
begin
  delete from consultas_cuota where periodo = v_periodo;

  -- 1 · Primera reserva sobre un periodo que no existía: se crea y concede.
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 10, 'normal', 5, now(), now() + interval '30 days');

  if not r.concedido then raise exception 'La primera reserva no se concedió'; end if;
  if r.consumidas <> 1 then raise exception 'La primera reserva dejó el contador en %', r.consumidas; end if;
  if r.periodo <> v_periodo then raise exception 'La reserva devolvió otro periodo: %', r.periodo; end if;
  if r.limite <> 10 then raise exception 'La reserva devolvió otro límite: %', r.limite; end if;

  -- 2 · La segunda suma. Es lo que hace que 100 consultas sean 100.
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 10, 'normal', 5, now(), now() + interval '30 days');
  if r.consumidas <> 2 then raise exception 'La segunda reserva no incrementó: %', r.consumidas; end if;

  -- 3 · Liberar devuelve la unidad que no llegó a salir a la red.
  perform consultas_liberar_cuota(v_periodo);
  if (select c.consumidas from consultas_cuota c where c.periodo = v_periodo) <> 1 then
    raise exception 'Liberar no devolvió la unidad';
  end if;

  -- 4 · Con el ciclo lleno no pasa nadie, ni siquiera pidiendo.
  update consultas_cuota c set consumidas = 10 where c.periodo = v_periodo;
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 10, 'normal', 5, now(), now() + interval '30 days');
  if r.concedido then raise exception 'Se concedió cuota con el ciclo agotado'; end if;

  -- 5 · Modo reserva: lo normal se rechaza y lo crítico pasa. Es lo que deja
  -- emitir una factura cuando ya no quedan consultas para dar de alta clientes.
  --
  -- Aquí el límite es 100 y no 10 a propósito: con `p_reserva_pct = 5` la
  -- banda reservada empieza en el 95 %, o sea en 9,5 de 10 — y 9,5 no existe,
  -- porque a 9 todavía no se entra y a 10 ya bloquea el tope. Con 10 la banda
  -- está VACÍA y la prueba no probaría nada. Con 100, el 95 es un caso real.
  update consultas_cuota c set consumidas = 95, limite = 100 where c.periodo = v_periodo;
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 100, 'normal', 5, now(), now() + interval '30 days');
  if r.concedido then raise exception 'El modo reserva dejó pasar una consulta normal'; end if;

  update consultas_cuota c set consumidas = 95 where c.periodo = v_periodo;
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 100, 'critical', 5, now(), now() + interval '30 days');
  if not r.concedido then raise exception 'El modo reserva bloqueó una consulta crítica'; end if;
  if r.consumidas <> 96 then raise exception 'La crítica no consumió su unidad: %', r.consumidas; end if;

  -- Y por debajo de la banda, lo normal sigue pasando: la reserva es el 5 %
  -- final, no un freno permanente.
  update consultas_cuota c set consumidas = 50 where c.periodo = v_periodo;
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 100, 'normal', 5, now(), now() + interval '30 days');
  if not r.concedido then raise exception 'Se bloqueó una consulta normal a mitad del ciclo'; end if;

  -- 6 · Y el 429 de Decolecta cierra el grifo aunque el contador no llegue: es
  -- la señal de que el contador local se desincronizó del real.
  update consultas_cuota c set consumidas = 0, limite = 10 where c.periodo = v_periodo;
  perform consultas_marcar_agotado(v_periodo);
  select * into r from consultas_reservar_cuota(
    v_periodo, 'test', 10, 'critical', 5, now(), now() + interval '30 days');
  if r.concedido then raise exception 'Se concedió cuota con el ciclo marcado como agotado'; end if;

  delete from consultas_cuota where periodo = v_periodo;

  raise notice 'Cuota: reservar, liberar, tope, modo reserva y agotado, ejecutados de verdad.';
end $$;
