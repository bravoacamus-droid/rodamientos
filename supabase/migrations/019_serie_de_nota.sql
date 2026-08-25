-- ###########################################################################
-- 019 · La serie de una nota tiene que casar con el documento que corrige
-- ###########################################################################
--
-- SUNAT exige que la serie de una nota empiece por la misma letra que el
-- comprobante al que afecta: una nota sobre FACTURA va en serie F, sobre
-- BOLETA en serie B. Cruzarlas es un rechazo — y el correlativo se gasta
-- igual, porque se consume al emitir, no al aceptar.
--
-- Hasta ahora la base NO lo comprobaba. `comp_serie_formato` solo mira que la
-- serie sea `^[BF][A-Z0-9]{3}$`, así que `BC01` sobre una factura entraba sin
-- una queja. Se vio probando: la emisión salió adelante y devolvió
-- `BC01-00000001` apuntando a `F001-00000001`.
--
-- La regla vivía únicamente en `dominio/nota.ts`, en el navegador. Eso vale
-- para la pantalla y no vale para nada más: cualquiera con sesión puede llamar
-- a `emitir_comprobante` por PostgREST, que es exactamente el agujero que se
-- cerró en la 012 para otras funciones.
--
-- No se puede hacer con un CHECK: la condición mira OTRA fila —el comprobante
-- referenciado— y un CHECK solo ve la suya. Por eso va como trigger.
--
-- Idempotente.

set search_path = public, extensions;

create or replace function public.validar_serie_de_nota()
returns trigger
language plpgsql
as $$
declare
  v_tipo_ref   tipo_documento;
  v_num_ref    text;
  v_inicial    char(1);
  v_esperada   char(1);
begin
  -- Solo aplica a notas. Una factura o una boleta no corrigen nada.
  if new.tipo not in ('nota_credito', 'nota_debito') then
    return new;
  end if;

  select tipo, numero into v_tipo_ref, v_num_ref
    from comprobantes where id = new.referencia_id;

  -- Sin referencia no hay nada que comparar; de eso ya se encarga
  -- `comp_nota_referencia`, que exige que toda nota apunte a un documento.
  if v_tipo_ref is null then
    return new;
  end if;

  v_inicial  := left(new.serie, 1);
  v_esperada := case when v_tipo_ref = 'boleta' then 'B' else 'F' end;

  if v_inicial <> v_esperada then
    raise exception
      'La serie % no corresponde: % es una % y su nota tiene que ir en una serie que empiece por %',
      new.serie, v_num_ref, v_tipo_ref, v_esperada
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.validar_serie_de_nota() is
  'Impide emitir una nota en una serie cruzada (BC01 sobre factura, FC01 sobre boleta). SUNAT lo rechaza y el correlativo se gasta igual.';

drop trigger if exists trg_serie_de_nota on public.comprobantes;
create trigger trg_serie_de_nota
  before insert or update of serie, referencia_id on public.comprobantes
  for each row execute function public.validar_serie_de_nota();


-- ---------------------------------------------------------------------------
-- Centinela
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.comprobantes'::regclass
       and tgname = 'trg_serie_de_nota'
       and not tgisinternal
  ) then
    raise exception 'El trigger trg_serie_de_nota no quedó instalado';
  end if;
end $$;
