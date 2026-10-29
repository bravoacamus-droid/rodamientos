-- 173 · El enlace público vuelve a llevar el membrete y las cuentas
--
-- El problema. La 137 (15/10) cerró a `anon` todas las tablas y funciones y
-- le dejó solo `cotizacion_por_token`. Era lo correcto, pero `/ver/<token>`
-- leía la cabecera con `emisorParaImprimir()` y las cuentas con
-- `cuentasParaCobrar()`, que van directo a `empresa` y `cuentas_bancarias`.
-- Desde ese día el cliente abría el enlace y veía la cotización SIN logo, sin
-- razón social, con «RUC» sin número, sin cuentas para pagar, y la cabecera
-- «Cotización de para …». Nadie lo vio porque quien prueba el enlace tiene
-- la sesión abierta. Lo encontró el revisor de vistas previas el 29/10.
--
-- La salida es la misma que la del documento (072): una función
-- `security definer` que devuelve SOLO lo que va impreso, y solo a quien trae
-- un token que lleva a una cotización viva. Sin token válido devuelve null,
-- igual que `cotizacion_por_token`: no dice si la empresa existe.
--
-- OJO: reaplicar la 137 vuelve a quitarle a `anon` esta función (revoca
-- todo). Si se reaplica, reaplicar esta después.

create or replace function public.membrete_por_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'razon_social', e.razon_social,
           'nombre_comercial', e.nombre_comercial,
           'ruc', e.ruc,
           'direccion', e.direccion,
           'telefono', e.telefono,
           'email', coalesce(e.email_ventas, e.email),
           'web', e.web,
           'logo_url', e.logo_url,
           'cuentas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'banco', c.banco, 'moneda', c.moneda,
                      'numero', c.numero, 'cci', c.cci) order by c.orden)
               from (select * from cuentas_bancarias where activo order by orden limit 10) c
           ), '[]'::jsonb))
    from empresa e
   where e.id = 1
     and p_token ~ '^[0-9a-fA-F]{32}$'
     and exists (select 1 from cotizaciones q
                  where q.token_publico = p_token and q.estado <> 'anulada');
$$;

revoke all on function public.membrete_por_token(text) from public;
grant execute on function public.membrete_por_token(text) to anon, authenticated;

-- Centinela: como `anon`, con un token vivo sale la razón social y con uno
-- inventado sale null; y `anon` sigue sin poder leer las tablas.
do $$
declare
  v_token text := (select token_publico from cotizaciones
                    where token_publico is not null and estado <> 'anulada' limit 1);
  v jsonb;
begin
  if has_table_privilege('anon', 'public.empresa', 'select')
     or has_table_privilege('anon', 'public.cuentas_bancarias', 'select') then
    raise exception '173: anon lee las tablas directamente';
  end if;
  if not has_function_privilege('anon', 'public.membrete_por_token(text)', 'execute') then
    raise exception '173: anon no puede llamar a membrete_por_token';
  end if;
  begin
    set local role anon;
    if public.membrete_por_token(repeat('0', 32)) is not null then
      raise exception '173: un token inventado devolvió el membrete';
    end if;
    if v_token is not null then
      v := public.membrete_por_token(v_token);
      if coalesce(v ->> 'ruc', '') = '' then
        raise exception '173: con un token vivo no salió el RUC';
      end if;
    else
      raise notice '173: no hay ninguna cotización con enlace; caso positivo sin probar';
    end if;
    raise exception '__173_DESHACER__';
  exception when others then
    if sqlerrm <> '__173_DESHACER__' then raise; end if;
  end;
end $$;
