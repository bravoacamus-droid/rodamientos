-- ###########################################################################
-- 093 · UNA SERIE DE PRUEBA NO FACTURA DE VERDAD
-- ###########################################################################
--
-- Luis, 24/09, sobre las series: *«recuerda q son demos q tu mismo pusiste
-- todavía nada es real»*. Se comprobó contra la base antes de tocar nada, y
-- **no es así** — la mitad, al menos:
--
--   · `F002` tiene **515 facturas de verdad**, del 18/09/2024 al 26/08/2026,
--     37 clientes, S/ 251.811,70, todas con su detalle. Salieron de
--     `historial de ventas.xlsx` el 28/08 (docs/HISTORIAL-VENTAS.md).
--   · `FC02`, 3 notas de crédito reales.
--   · Lo que sí es de mentira son `F001` y `FC01`, y las demás que sembró la
--     **007** — cuyo propio comentario las llama «marcadores».
--
-- Y eso le da la vuelta a lo que se venía diciendo. Hasta hoy CLAUDE.md
-- pedía poner `F002` por defecto cuanto antes. **Es al revés**: con `F002`
-- por defecto, cada prueba se come un número del libro real de Willy —la 516,
-- la 517—, y un hueco en el correlativo es justo lo que SUNAT pregunta. Las
-- pruebas tienen que gastar números de mentira.
--
-- Lo que no puede pasar es lo contrario: llegar al día de facturar de verdad
-- y que salga una `F001` porque nadie se acordó de cambiarlo.
--
-- ---------------------------------------------------------------------------
-- Cómo se distingue «de verdad» sin preguntarle a nadie
-- ---------------------------------------------------------------------------
-- `config_sunat.ambiente` ya existe desde la 017 y ya significa exactamente
-- esto. Su propio comentario: *«beta = homologación, sin valor fiscal. Por
-- defecto beta: emitir de verdad tiene que ser una decisión explícita»*.
--
-- Así que la regla queda: **en `produccion` no se emite en una serie marcada
-- como de prueba.** No hay que acordarse de nada — el día que alguien ponga
-- el ambiente en producción, el sistema exige elegir la serie buena antes de
-- dejar emitir, y dice cuál es.
--
-- ---------------------------------------------------------------------------
-- Dónde va el candado
-- ---------------------------------------------------------------------------
-- En `siguiente_correlativo`, que es **el cuello de botella por el que pasan
-- las tres emisiones**: la cotización (004:838), la guía (004:996) y el
-- comprobante (004:1226). Una sola comprobación las cubre todas, y no hay
-- forma de emitir sin pasar por ahí — ni desde la aplicación, ni por
-- PostgREST, ni con un script.
--
-- Los documentos internos (compra, recepción, ajuste) no se tocan: no son
-- fiscales y su numeración no la declara nadie.
-- ###########################################################################

alter table public.series_documento
  add column if not exists es_prueba boolean not null default false;

comment on column public.series_documento.es_prueba is
  'Serie de ensayo: sirve para probar, pero en ambiente de producción el sistema se niega a emitir con ella (093).';

-- ---------------------------------------------------------------------------
-- Las que sembró la 007 son marcadores, y lo dice ella misma
-- ---------------------------------------------------------------------------
-- Se marcan POR NOMBRE y solo estas. No se deduce «la que no tiene historial
-- es de prueba»: `B001` no tiene ni una boleta y puede acabar siendo la buena
-- el día que Willy emita la primera.
--
-- `F002` y `FC02` NO se marcan, evidentemente: son las que llevan su
-- facturación. Y `COT1` tampoco, porque una cotización no se declara.
update public.series_documento
   set es_prueba = true
 where serie in ('F001', 'B001', 'FC01', 'BC01', 'FD01', 'BD01', 'T001')
   and tipo in ('factura', 'boleta', 'nota_credito', 'nota_debito', 'guia_remision');

-- ###########################################################################
-- El candado
-- ###########################################################################
create or replace function public.siguiente_correlativo(p_tipo tipo_documento, p_serie text default null)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_next    integer;
  v_prueba  boolean;
  v_serie   text;
  v_buena   text;
begin
  /*
    El candado va ANTES del update, no después.

    Es la misma razón por la que el control de rol de `emitir_comprobante` va
    lo primero: validar a media función deja un correlativo quemado. Aquí sería
    peor todavía —el número que se quema es el de una serie fiscal— y encima el
    documento no llegaría a crearse, así que el hueco no lo explicaría nadie.
  */
  if p_tipo in ('factura','boleta','nota_credito','nota_debito','guia_remision')
     and (select ambiente from config_sunat where id = 1) = 'produccion' then

    select s.serie, s.es_prueba into v_serie, v_prueba
      from series_documento s
     where s.tipo = p_tipo
       and s.activo
       and (s.serie = p_serie or (p_serie is null and s.predeterminada))
     limit 1;

    if v_prueba then
      -- Se dice CUÁL usar, no solo que esta no vale. La que continúa la
      -- numeración es la que más correlativo lleva de su tipo; si no hay otra,
      -- el mensaje también lo dice, porque entonces el problema es que falta
      -- crearla (es el caso de la guía: `T002` no existe todavía).
      select s.serie into v_buena
        from series_documento s
       where s.tipo = p_tipo and s.activo and not s.es_prueba
       order by s.correlativo_actual desc
       limit 1;

      raise exception
        'La serie % es de pruebas y el sistema está en producción. %',
        v_serie,
        coalesce(
          'Cambia la serie por defecto a ' || v_buena || ' en Configuración → SUNAT y numeración.',
          'No hay ninguna serie real para este documento: hay que crearla antes de emitir.')
        using errcode = 'check_violation';
    end if;
  end if;

  update series_documento
     set correlativo_actual = greatest(correlativo_actual + 1, correlativo_inicial)
   where tipo = p_tipo
     and activo
     and (serie = p_serie or (p_serie is null and predeterminada))
  returning correlativo_actual into v_next;

  if v_next is null then
    raise exception 'No hay serie activa % para el documento %', coalesce(p_serie,'(predeterminada)'), p_tipo
      using errcode = 'no_data_found';
  end if;
  return v_next;
end $$;

-- ###########################################################################
-- Centinela · PONE EL AMBIENTE EN PRODUCCIÓN, INTENTA EMITIR, Y LO DESHACE
-- ###########################################################################
-- La regla de la 091: lo único que demuestra que una función sirve es
-- llamarla. Aquí además hay que comprobar las DOS caras —que en producción
-- rebota y que en beta no estorba—, porque un candado que no deja trabajar en
-- beta pararía el proyecto entero mañana.
do $$
declare
  v_beta_ok    boolean := false;
  v_prod_freno boolean := false;
  v_prod_deja  boolean := false;
  v_fallo      text;
begin
  begin
    -- 1 · En beta, la serie de prueba tiene que funcionar como siempre.
    update config_sunat set ambiente = 'beta' where id = 1;
    perform public.siguiente_correlativo('factura', 'F001');
    v_beta_ok := true;

    -- 2 · En producción, la de prueba tiene que rebotar.
    update config_sunat set ambiente = 'produccion' where id = 1;
    begin
      perform public.siguiente_correlativo('factura', 'F001');
    exception when check_violation then
      v_prod_freno := true;
    end;

    -- 3 · Y la real tiene que seguir pasando. Un candado que también frena la
    --     serie buena dejaría a Willy sin poder facturar el primer día.
    perform public.siguiente_correlativo('factura', 'F002');
    v_prod_deja := true;

    raise exception using message = '__093_DESHACER__';
  exception when others then
    if sqlerrm <> '__093_DESHACER__' then v_fallo := sqlerrm; end if;
  end;

  if v_fallo is not null then
    raise exception '093: el centinela se rompió: %', v_fallo;
  end if;
  if not v_beta_ok then
    raise exception '093: en beta ya no se puede emitir con F001. El candado estorba donde no debe.';
  end if;
  if not v_prod_freno then
    raise exception '093: en producción F001 pasó igual. El candado no sirve.';
  end if;
  if not v_prod_deja then
    raise exception '093: en producción F002 también rebotó. El candado frena la serie buena.';
  end if;

  raise notice '093: frena F001 en producción, deja pasar F002, y en beta no estorba.';
end $$;
