-- =============================================================================
-- @rodatech/consultas — migración de base de datos
-- =============================================================================
--
-- INTEGRADO: este SQL vive también en supabase/migrations/003_consultas.sql.
-- Si se edita aquí, hay que regenerar esa migración desde este archivo.

-- Ver README.md.
--
-- Contenido:
--   1. consultas_cuota  — contador de cuota mensual, con reserva atómica.
--   2. consultas_log    — bitácora de observabilidad (sin datos personales).
--   3. consultas_cache  — caché de RUC/DNI/tipo de cambio con TTL.
--   4. Funciones RPC que usa src/cuota.ts: consultas_reservar_cuota,
--      consultas_liberar_cuota, consultas_marcar_agotado.
--
-- La atomicidad de la reserva vive en Postgres (SELECT ... FOR UPDATE dentro
-- de una función), no en la aplicación: el ERP corre en varias instancias
-- serverless a la vez y un contador en memoria de proceso se desincroniza casi
-- de inmediato.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contador de cuota mensual
-- -----------------------------------------------------------------------------
create table if not exists consultas_cuota (
  periodo                   text primary key,       -- 'YYYY-MM' del ciclo (no siempre el mes calendario)
  plan                      text not null,           -- free | pro | custom
  limite                    integer not null,        -- 100 en el plan gratuito
  consumidas                integer not null default 0,
  agotado_forzado           boolean not null default false, -- true si Decolecta respondió 429
  ultimo_umbral_notificado  integer not null default 0,      -- 0/50/75/90/95/100, para no repetir alertas
  inicio_ciclo              timestamptz not null,
  fin_ciclo                 timestamptz not null,
  actualizado               timestamptz not null default now()
);

comment on table consultas_cuota is
  'Contador atómico de peticiones a Decolecta por ciclo. Una fila por periodo.';

-- -----------------------------------------------------------------------------
-- 2. Bitácora de observabilidad
-- -----------------------------------------------------------------------------
create table if not exists consultas_log (
  id            bigserial primary key,
  periodo       text not null,
  endpoint      text not null,          -- 'sunat/ruc' | 'reniec/dni' | 'tipo-cambio/sunat'
  prioridad     text not null,          -- critical | normal | low
  param_hash    text,                   -- hash corto de la clave consultada; NUNCA el documento en claro
  status_code   integer,                -- null cuando fue un acierto de caché (no hubo petición HTTP)
  desde_cache   boolean not null default false,
  ms            integer,
  creado_en     timestamptz not null default now()
);

create index if not exists consultas_log_periodo_idx on consultas_log (periodo);
create index if not exists consultas_log_creado_en_idx on consultas_log (creado_en);

comment on table consultas_log is
  'Bitácora de cada consulta (API o caché). Sin datos personales: el documento se guarda como hash, nunca en claro.';

-- -----------------------------------------------------------------------------
-- 3. Caché con TTL
-- -----------------------------------------------------------------------------
create table if not exists consultas_cache (
  espacio     text not null,   -- 'ruc' | 'dni' | 'tipo_cambio'
  clave       text not null,   -- documento normalizado, o 'fecha:YYYY-MM-DD' / 'mes:YYYY-MM'
  ok          boolean not null,        -- false = caché negativa (documento inexistente, 400/404/422)
  payload     jsonb,
  creado_en   timestamptz not null default now(),
  expira_en   timestamptz,             -- null = permanente (dato histórico inmutable)
  primary key (espacio, clave)
);

create index if not exists consultas_cache_expira_idx on consultas_cache (expira_en);

comment on table consultas_cache is
  'Caché de resultados de Decolecta. Un acierto aquí NUNCA debe pasar por el guardián de cuota.';

-- -----------------------------------------------------------------------------
-- 4. Reserva atómica de cuota
-- -----------------------------------------------------------------------------
-- Incrementa `consumidas` SOLO si hay cupo para la prioridad dada. El
-- SELECT ... FOR UPDATE bloquea la fila del periodo mientras dura la
-- transacción de la función, así que dos llamadas concurrentes nunca se pasan
-- del límite (checklist de la especificación, sección 10).
--
-- El llamador (src/cuota.ts) calcula inicio/fin de ciclo en TypeScript y los
-- pasa como parámetros: la función solo usa esos valores al crear la fila la
-- primera vez del periodo, para no duplicar lógica de fechas en SQL.
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
  insert into consultas_cuota (periodo, plan, limite, consumidas, inicio_ciclo, fin_ciclo)
  values (p_periodo, p_plan, p_limite, 0, p_inicio_ciclo, p_fin_ciclo)
  on conflict (periodo) do update set plan = excluded.plan, limite = excluded.limite;

  -- Bloquea la fila: ninguna otra transacción concurrente puede leerla para
  -- actualizarla hasta que esta termine.
  select consumidas, agotado_forzado, ultimo_umbral_notificado
    into v_consumidas, v_agotado, v_umbral_previo
    from consultas_cuota
   where periodo = p_periodo
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

  update consultas_cuota
     set consumidas = consumidas + 1,
         actualizado = now()
   where periodo = p_periodo
  returning consumidas into v_consumidas;

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
    update consultas_cuota set ultimo_umbral_notificado = v_umbral_nuevo where periodo = p_periodo;
  end if;

  return query select true, p_periodo, p_plan, v_consumidas, p_limite;
end;
$$;

comment on function consultas_reservar_cuota is
  'Reserva atómica de una unidad de cuota. Llamar DESPUÉS de comprobar la caché y ANTES de llamar a Decolecta.';

-- Libera una unidad reservada que no llegó a salir (timeout/red antes de que
-- la petición llegara al proveedor).
create or replace function consultas_liberar_cuota(p_periodo text)
returns void language sql as $$
  update consultas_cuota
     set consumidas = greatest(consumidas - 1, 0),
         actualizado = now()
   where periodo = p_periodo;
$$;

comment on function consultas_liberar_cuota is
  'Devuelve una unidad de cuota reservada cuando la petición no llegó a salir a la red.';

-- Sincroniza el contador local a "agotado": Decolecta respondió 429. Es una
-- señal de bug (desincronización), no un caso normal.
create or replace function consultas_marcar_agotado(p_periodo text)
returns void language sql as $$
  update consultas_cuota
     set consumidas = limite,
         agotado_forzado = true,
         ultimo_umbral_notificado = 100,
         actualizado = now()
   where periodo = p_periodo;
$$;

comment on function consultas_marcar_agotado is
  'Sincroniza el contador local a agotado tras un 429 real del proveedor.';

-- -----------------------------------------------------------------------------
-- 5. (Opcional) Row Level Security
-- -----------------------------------------------------------------------------
-- Estas tablas solo debe tocarlas el backend del ERP (con la service role o un
-- rol de servidor), nunca el navegador directamente. Si el proyecto habilita
-- RLS por defecto en todas las tablas nuevas, añade aquí las políticas que
-- correspondan a tu convención (p.ej. "solo service_role"), replicando el
-- patrón que ya use el resto de tablas administrativas del ERP.
