-- ###########################################################################
-- Una factura puede amparar VARIAS guías de remisión
-- ###########################################################################
--
-- Willy, 16/09 (48:10): *«a veces hay que atender, hacer una factura de dos
-- guías: seis o dos guías y tienen una sola factura, entonces hay que
-- digitarla; no puede estar dos guías asociadas, ¿cómo saldría?»*.
--
-- Es el caso normal de esta casa: el pedido sale en dos despachos —lo que hay
-- en almacén y lo que llegó después de la compra— y se factura una vez. El
-- flujo lo permite desde siempre (la guía va ANTES que la factura, y se puede
-- facturar por partes desde la 047); lo que no había era dónde anotarlo.
--
-- ---------------------------------------------------------------------------
-- Y de paso, una que no se había visto: NINGUNA factura tenía guía
-- ---------------------------------------------------------------------------
-- `comprobantes.guia_id` existe desde la 002, `emitir_comprobante` la inserta
-- desde la 004 leyendo `p_datos ->> 'guia_id'`, y el documento la imprime con
-- su rótulo «Guía de remisión»… pero **la Server Action nunca la mandaba**.
-- Así que la columna llevaba tres semanas en null en todas, y el rótulo no
-- salía nunca. Otra pieza con la puerta sin abrir.
--
-- ---------------------------------------------------------------------------
-- Por qué una tabla y no un array
-- ---------------------------------------------------------------------------
-- Porque hay una regla que depende de esto y que se comprueba consultando:
-- `anular_guia` se niega a anular una guía que ya esté facturada (004:1136,
-- `where c.guia_id = p_id`). Con un array de uuid esa comprobación pasa a ser
-- un `= any(...)` sobre una columna sin índice; con una tabla es una clave
-- ajena y un índice, y la protección sigue siendo barata.
--
-- `guia_id` se CONSERVA con la primera. No es redundancia por pereza: es lo
-- que mantiene viva esa protección y el rótulo del documento sin tocar
-- `emitir_comprobante`, que es una función de doscientas líneas que emite
-- comprobantes y no se toca por gusto.
-- ###########################################################################

create table if not exists comprobante_guias (
  comprobante_id uuid not null references comprobantes(id) on delete cascade,
  guia_id        uuid not null references guias_remision(id) on delete restrict,
  -- El orden en que se imprimen. Se respeta el que eligió quien facturó.
  orden          smallint not null default 1,
  primary key (comprobante_id, guia_id)
);

comment on table comprobante_guias is
  'Las guías de remisión que ampara un comprobante. Una factura puede amparar varias (Willy, 16/09): el pedido sale en dos despachos y se factura una vez. comprobantes.guia_id conserva la PRIMERA, que es lo que mantiene la protección de anular_guia y el rótulo del documento.';

create index if not exists ix_comp_guias_guia on comprobante_guias (guia_id);

alter table comprobante_guias enable row level security;

drop policy if exists "lectura_autenticados" on public.comprobante_guias;
create policy "lectura_autenticados" on public.comprobante_guias
  for select to authenticated
  using ((select public.mi_rol()) is not null);

-- Escribe quien puede escribir comprobantes: vincular una guía a una factura
-- es parte de emitirla, no una operación de almacén.
drop policy if exists "escritura_insert" on public.comprobante_guias;
create policy "escritura_insert" on public.comprobante_guias
  for insert to authenticated
  with check ((select public.puede_escribir('comprobantes')));

drop policy if exists "escritura_delete" on public.comprobante_guias;
create policy "escritura_delete" on public.comprobante_guias
  for delete to authenticated
  using ((select public.puede_escribir('comprobantes')));

-- Sin UPDATE a propósito: una vinculación no se corrige, se quita y se pone.

-- ###########################################################################
-- Vincular, con las comprobaciones donde no se pueden saltar
-- ###########################################################################
--
-- Va en una RPC propia y no dentro de `emitir_comprobante` por una razón de
-- riesgo: aquella emite el comprobante, gasta el correlativo, mueve stock y
-- arma el cronograma de cuotas. Meterle mano para esto sería arriesgar la
-- emisión entera por un dato que es una referencia.
--
-- Se llama justo después de emitir, en la misma Server Action. Si fallara, lo
-- que queda es una factura emitida sin sus guías anotadas —que se arregla
-- volviendo a vincular—, no una emisión a medias.
create or replace function public.vincular_guias_comprobante(
  p_comprobante uuid,
  p_guias       uuid[]
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_cliente uuid;
  v_estado  text;
  v_g       uuid;
  v_i       smallint := 0;
begin
  if (select public.mi_rol()) is null then
    raise exception 'Hay que iniciar sesión.' using errcode = 'insufficient_privilege';
  end if;
  if not (select public.puede_escribir('comprobantes')) then
    raise exception 'Tu rol no puede tocar comprobantes.' using errcode = 'insufficient_privilege';
  end if;

  select cliente_id, estado into v_cliente, v_estado
  from comprobantes where id = p_comprobante;

  if v_cliente is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_estado = 'anulado' then
    raise exception 'El comprobante está anulado: no se le vinculan guías.';
  end if;

  delete from comprobante_guias where comprobante_id = p_comprobante;

  foreach v_g in array coalesce(p_guias, array[]::uuid[]) loop
    /*
      La guía tiene que ser del MISMO cliente.

      Sin esto, una factura de un cliente podría amparar la guía de otro —y
      eso ante SUNAT es un documento que dice que la mercadería viajó a un
      sitio al que no fue—. Se comprueba aquí y no en la pantalla porque la
      pantalla no es el único camino: toda RPC es un endpoint público.
    */
    if not exists (
      select 1 from guias_remision g
      where g.id = v_g and g.cliente_id = v_cliente and g.estado <> 'anulada'
    ) then
      raise exception
        'Esa guía no existe, está anulada o es de otro cliente.'
        using errcode = 'check_violation';
    end if;

    v_i := v_i + 1;
    insert into comprobante_guias (comprobante_id, guia_id, orden)
    values (p_comprobante, v_g, v_i);
  end loop;

  -- La PRIMERA se copia a `comprobantes.guia_id`: es lo que mantiene la
  -- protección de `anular_guia` y el rótulo del documento.
  update comprobantes
     set guia_id = (
       select cg.guia_id from comprobante_guias cg
       where cg.comprobante_id = p_comprobante
       order by cg.orden limit 1
     )
   where id = p_comprobante;
end $$;

grant execute on function public.vincular_guias_comprobante(uuid, uuid[]) to authenticated;

-- ###########################################################################
-- La protección de «no anules una guía facturada», al día
-- ###########################################################################
--
-- Esta es la parte que se rompe en silencio si se olvida. `anular_guia` (004)
-- impide anular una guía ya facturada mirando **`comprobantes.guia_id`**.
-- Desde ahora la segunda, la tercera y las siguientes guías de una factura NO
-- están en esa columna: esa comprobación las dejaría anular, y quedaría una
-- factura amparando una guía anulada.
--
-- Se arregla con un TRIGGER y no redefiniendo `anular_guia`, por dos motivos:
--
--   1 · Aquella son doscientas líneas que anulan, reponen stock y registran
--       actividad. Copiarla entera aquí para cambiar un `if` es crear una
--       segunda versión que mañana se separa de la primera.
--   2 · El trigger protege por CUALQUIER camino, no solo por esa RPC. Es el
--       mismo criterio de `proteger_comprobante_emitido` (006): las reglas
--       que no se pueden saltar viven en la tabla.
create or replace function public.guia_esta_facturada(p_guia uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from comprobantes c
    where c.guia_id = p_guia and c.estado <> 'anulado'
  ) or exists (
    select 1
    from comprobante_guias cg
    join comprobantes c on c.id = cg.comprobante_id
    where cg.guia_id = p_guia and c.estado <> 'anulado'
  );
$$;

grant execute on function public.guia_esta_facturada(uuid) to authenticated;

comment on function public.guia_esta_facturada is
  'Si una guía está amparada por algún comprobante vivo, por la columna guia_id o por comprobante_guias. Sin esto, la segunda guía de una factura se podría anular y quedaría una factura amparando una guía anulada.';

create or replace function public.proteger_guia_facturada()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.estado = 'anulada' and old.estado <> 'anulada'
     and public.guia_esta_facturada(old.id) then
    raise exception
      'No se puede anular %: está amparada por una factura vigente. Anula primero la factura o emite una nota de crédito.',
      old.numero
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

drop trigger if exists tg_proteger_guia_facturada on public.guias_remision;
create trigger tg_proteger_guia_facturada
  before update on public.guias_remision
  for each row
  execute function public.proteger_guia_facturada();

-- ###########################################################################
-- Centinela
-- ###########################################################################
do $$
declare
  v_guia uuid;
begin
  -- Que la tabla y las funciones respondan.
  perform 1 from comprobante_guias limit 1;
  perform public.guia_esta_facturada(gen_random_uuid());

  -- Y que `guia_esta_facturada` diga la verdad sobre lo que YA hay: toda guía
  -- que hoy esté en comprobantes.guia_id tiene que salir como facturada.
  select c.guia_id into v_guia
  from comprobantes c
  where c.guia_id is not null and c.estado <> 'anulado'
  limit 1;

  if v_guia is not null and not public.guia_esta_facturada(v_guia) then
    raise exception
      'guia_esta_facturada no reconoce una guía que ya está en comprobantes.guia_id';
  end if;
end $$;
