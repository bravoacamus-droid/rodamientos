-- ###########################################################################
-- 106 · BLOQUEO DE EDICIÓN: un producto o una cotización, una persona a la vez
-- ###########################################################################
--
-- Willy, reunión del 06/10 (4:27): *«mientras yo cargo un grupo de
-- productos, ¿otra persona puede ir cargando otro grupo?»*. Y, al explicarle
-- que si dos editan el mismo «se van a cruzar los datos»: *«para productos
-- también […] todo lo que está a rellenar debe ser así, para que no se
-- crucen los datos»*.
--
-- Hoy, si dos abren el mismo producto, gana el ÚLTIMO que guarda y el primero
-- pierde sus cambios sin enterarse. Con la cotización es peor: al guardar se
-- borran y se reinsertan las líneas (069), así que se pierde la cotización
-- entera del otro.
--
-- Cómo funciona:
--   · Abrir para editar TOMA el bloqueo (`tomar_bloqueo`). Si lo tiene otro y
--     está vivo, no lo toma: devuelve quién lo tiene y desde cuándo.
--   · Mientras la pantalla está abierta, late cada 30 s. Si deja de latir
--     —se cerró la pestaña, se cortó la luz— el bloqueo CADUCA a los 2
--     minutos y otro puede entrar. Sin caducidad, una pestaña olvidada
--     bloquearía el producto para siempre.
--   · Al salir se suelta (`soltar_bloqueo`).
--   · Gerencia puede quitarlo (`p_forzar`): alguien que dejó la pantalla
--     abierta y se fue a almorzar no puede dejar a los demás esperando.
--   · Al GUARDAR, la Server Action pregunta `bloqueo_ajeno`: si lo tiene otro
--     vivo, no guarda. Es la puerta de verdad; la pantalla es el aviso.
--
-- No hay trigger sobre `productos` ni `cotizaciones`: esas tablas las tocan
-- también la base y sus triggers (stock, precio promedio, estados), y un
-- trigger que exigiera bloqueo los rompería.
--
-- La tabla no tiene políticas: solo se toca por estas funciones, que son
-- SECURITY DEFINER y usan `auth.uid()`. Nadie puede tomar un bloqueo a nombre
-- de otro ni borrar el de otro sin ser gerencia.
-- ###########################################################################

create table if not exists public.bloqueos_edicion (
  entidad      text        not null check (entidad in ('producto', 'cotizacion')),
  registro_id  uuid        not null,
  usuario_id   uuid        not null references public.perfiles(id) on delete cascade,
  tomado_en    timestamptz not null default now(),
  latido_en    timestamptz not null default now(),
  primary key (entidad, registro_id)
);

comment on table public.bloqueos_edicion is
  'Quién está editando qué (106). Caduca a los 2 minutos sin latido. Solo se toca por tomar_bloqueo / soltar_bloqueo.';

alter table public.bloqueos_edicion enable row level security;
revoke all on public.bloqueos_edicion from anon, authenticated;


-- Cuánto aguanta un bloqueo sin latir. La pantalla late cada 30 s: cuatro
-- latidos perdidos seguidos es que esa pantalla ya no está.
create or replace function public.bloqueo_caducidad()
returns interval
language sql
immutable
as $$ select interval '2 minutes' $$;


create or replace function public.tomar_bloqueo(
  p_entidad  text,
  p_registro uuid,
  p_forzar   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo      uuid := auth.uid();
  v_actual  public.bloqueos_edicion;
  v_nombre  text;
begin
  if v_yo is null or public.mi_rol() is null then
    raise exception 'Hay que iniciar sesión.' using errcode = '42501';
  end if;
  if p_entidad not in ('producto', 'cotizacion') then
    raise exception 'Entidad no válida: %', p_entidad using errcode = '22023';
  end if;
  if p_forzar and public.mi_rol() <> 'gerencia' then
    raise exception 'Solo Gerencia puede quitar el bloqueo de otra persona.' using errcode = '42501';
  end if;

  -- `for update`: dos que entran a la vez no pueden tomarlo los dos.
  select * into v_actual
    from public.bloqueos_edicion
   where entidad = p_entidad and registro_id = p_registro
   for update;

  if found
     and v_actual.usuario_id <> v_yo
     and v_actual.latido_en > now() - public.bloqueo_caducidad()
     and not p_forzar then
    select nombre into v_nombre from public.perfiles where id = v_actual.usuario_id;
    return jsonb_build_object(
      'ok', false,
      'usuario', coalesce(v_nombre, 'otra persona'),
      'desde', v_actual.tomado_en,
      'latido', v_actual.latido_en
    );
  end if;

  insert into public.bloqueos_edicion (entidad, registro_id, usuario_id)
  values (p_entidad, p_registro, v_yo)
  on conflict (entidad, registro_id) do update
     set usuario_id = v_yo,
         -- Si ya era mío, conservo desde cuándo lo tengo: un latido no es
         -- volver a empezar.
         tomado_en  = case when bloqueos_edicion.usuario_id = v_yo
                           then bloqueos_edicion.tomado_en else now() end,
         latido_en  = now();

  return jsonb_build_object('ok', true);
end $$;

comment on function public.tomar_bloqueo(text, uuid, boolean) is
  'Toma (o renueva) el bloqueo de edición. Devuelve {ok:false, usuario, desde} si lo tiene otro vivo (106).';


create or replace function public.soltar_bloqueo(p_entidad text, p_registro uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.bloqueos_edicion
   where entidad = p_entidad
     and registro_id = p_registro
     and usuario_id = auth.uid();
$$;


-- La puerta de las Server Actions: null si se puede guardar, o el nombre de
-- quien lo tiene. Sin bloqueo (caducado o nunca tomado) se puede guardar: el
-- bloqueo avisa de un conflicto, no es un permiso.
create or replace function public.bloqueo_ajeno(p_entidad text, p_registro uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.nombre, 'otra persona')
    from public.bloqueos_edicion b
    left join public.perfiles p on p.id = b.usuario_id
   where b.entidad = p_entidad
     and b.registro_id = p_registro
     and b.usuario_id <> auth.uid()
     and b.latido_en > now() - public.bloqueo_caducidad();
$$;

revoke all on function public.tomar_bloqueo(text, uuid, boolean) from public, anon;
revoke all on function public.soltar_bloqueo(text, uuid) from public, anon;
revoke all on function public.bloqueo_ajeno(text, uuid) from public, anon;
grant execute on function public.tomar_bloqueo(text, uuid, boolean) to authenticated;
grant execute on function public.soltar_bloqueo(text, uuid) to authenticated;
grant execute on function public.bloqueo_ajeno(text, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Centinela: se EJECUTA con dos usuarios de verdad, haciéndose pasar por cada
-- uno con `request.jwt.claims`, y se deshace todo al final.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid;
  b uuid;
  r jsonb;
  reg uuid := gen_random_uuid();
begin
  select id into a from public.perfiles where activo and rol = 'gerencia' order by id limit 1;
  select id into b from public.perfiles where activo and id <> a order by id limit 1;
  if a is null or b is null then
    raise notice '106: no hay dos usuarios activos para probar; se aplica sin centinela.';
    return;
  end if;

  begin
    -- A toma el bloqueo.
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    r := public.tomar_bloqueo('producto', reg);
    if not (r->>'ok')::boolean then raise exception '106: A no pudo tomar un bloqueo libre'; end if;

    -- B no puede, y sabe quién lo tiene.
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    r := public.tomar_bloqueo('producto', reg);
    if (r->>'ok')::boolean then raise exception '106: B tomó un bloqueo que tenía A'; end if;
    if public.bloqueo_ajeno('producto', reg) is null then
      raise exception '106: bloqueo_ajeno no ve el bloqueo de A';
    end if;

    -- Caducado, B sí puede.
    update public.bloqueos_edicion set latido_en = now() - interval '3 minutes'
     where entidad = 'producto' and registro_id = reg;
    r := public.tomar_bloqueo('producto', reg);
    if not (r->>'ok')::boolean then raise exception '106: B no pudo tomar un bloqueo caducado'; end if;

    -- A (gerencia) puede forzarlo; y soltar solo suelta el propio.
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    r := public.tomar_bloqueo('producto', reg, true);
    if not (r->>'ok')::boolean then raise exception '106: gerencia no pudo forzar'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    perform public.soltar_bloqueo('producto', reg);
    if not exists (select 1 from public.bloqueos_edicion where registro_id = reg) then
      raise exception '106: B soltó el bloqueo de A';
    end if;

    raise exception '__106_DESHACER__';
  exception when others then
    if sqlerrm <> '__106_DESHACER__' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice '106: bloqueo de edición probado con dos usuarios (tomar, rechazar, caducar, forzar, soltar).';
end $$;
