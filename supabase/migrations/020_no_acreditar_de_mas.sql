-- ###########################################################################
-- 020 · No se puede acreditar más de lo facturado
-- ###########################################################################
--
-- Se vio probando, y de la peor forma: reejecutar una prueba emitió una
-- SEGUNDA nota de crédito por el total sobre la misma factura. La base la
-- aceptó sin una queja y el resultado fue **1.057,98 acreditados sobre una
-- factura de 528,99** — el doble de lo que se vendió.
--
-- Ante SUNAT eso es una declaración con crédito fiscal inventado. Y el error
-- no requiere mala fe: basta con dar dos veces al botón, o con que dos
-- personas anulen la misma factura sin saberlo.
--
-- La comprobación existía en `acciones/nota.ts`, que suma las notas previas
-- antes de emitir. Eso protege la pantalla y nada más: `emitir_comprobante` es
-- alcanzable por PostgREST para cualquiera con sesión, que es justo el agujero
-- que se cerró en la 012 para otras funciones.
--
-- No se puede hacer con un CHECK —la condición suma OTRAS filas— así que va
-- como trigger. Se admite un céntimo de holgura, la misma que usa
-- `comp_pagado_rango`, porque los redondeos de dos notas parciales pueden
-- sumar un céntimo por encima sin que nadie esté haciendo nada raro.
--
-- Solo mira las notas de CRÉDITO. Una nota de débito aumenta la deuda y no
-- tiene tope: unos intereses de mora pueden superar el importe original si el
-- cliente tarda lo suficiente.
--
-- Idempotente.

set search_path = public, extensions;

create or replace function public.validar_credito_acumulado()
returns trigger
language plpgsql
as $$
declare
  v_total_ref   numeric(14,2);
  v_num_ref     text;
  v_acreditado  numeric(14,2);
begin
  if new.tipo <> 'nota_credito' or new.referencia_id is null then
    return new;
  end if;

  -- Una nota anulada ya no pesa sobre el documento.
  if new.estado = 'anulado' then
    return new;
  end if;

  select total, numero into v_total_ref, v_num_ref
    from comprobantes where id = new.referencia_id;

  if v_total_ref is null then
    return new;
  end if;

  select coalesce(sum(n.total), 0) into v_acreditado
    from comprobantes n
   where n.referencia_id = new.referencia_id
     and n.tipo = 'nota_credito'
     and n.estado <> 'anulado'
     -- En un UPDATE, la propia fila no cuenta dos veces.
     and n.id <> new.id;

  if v_acreditado + new.total > v_total_ref + 0.01 then
    raise exception
      'No se puede acreditar % sobre %: ya hay % acreditados de un total de % (quedan %)',
      new.total, v_num_ref, v_acreditado, v_total_ref,
      round(v_total_ref - v_acreditado, 2)
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.validar_credito_acumulado() is
  'Impide que la suma de notas de crédito supere el total del comprobante. Solo crédito: una nota de débito no tiene tope.';

drop trigger if exists trg_credito_acumulado on public.comprobantes;
create trigger trg_credito_acumulado
  before insert or update of total, referencia_id, estado on public.comprobantes
  for each row execute function public.validar_credito_acumulado();


-- ---------------------------------------------------------------------------
-- Centinela
-- ---------------------------------------------------------------------------
do $$
declare v_malos int;
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.comprobantes'::regclass
       and tgname = 'trg_credito_acumulado'
       and not tgisinternal
  ) then
    raise exception 'El trigger trg_credito_acumulado no quedó instalado';
  end if;

  -- Y de paso se comprueba que no haya quedado ningún documento sobre-
  -- acreditado de antes. El trigger solo vigila lo nuevo; lo viejo hay que
  -- mirarlo una vez.
  select count(*) into v_malos
    from (
      select r.id, r.total, coalesce(sum(n.total), 0) as acreditado
        from comprobantes r
        left join comprobantes n
          on n.referencia_id = r.id
         and n.tipo = 'nota_credito'
         and n.estado <> 'anulado'
       where r.tipo in ('factura', 'boleta')
       group by r.id, r.total
    ) x
   where x.acreditado > x.total + 0.01;

  if v_malos > 0 then
    raise exception
      '% comprobante(s) ya tienen más notas de crédito que su total. Hay que corregirlos a mano antes de que esto vuelva a pasar.',
      v_malos;
  end if;
end $$;
