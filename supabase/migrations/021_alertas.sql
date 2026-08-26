-- ###########################################################################
-- 021 · ALERTAS: enlaces que no existían, y una puerta para refrescar
-- ###########################################################################
--
-- Dos cosas, las dos descubiertas al cablear la pantalla de alertas.
--
-- 1 · `generar_alertas()` guardaba en `accion_url` tres rutas que la aplicación
--     NO tiene. La alerta es el gesto de «entérate y ve a arreglarlo»: si el
--     enlace lleva a un 404, la alerta miente. Eran:
--
--       /inventario/productos/{id}  →  no existe; el producto está en /productos/{id}
--       /inventario/ajustes         →  no existe; es /inventario/ajuste, en singular
--       /cobranzas/{id}             →  no existe; cobranzas es una sola pantalla,
--                                      y el documento se abre en /facturacion/{id}
--
--     O sea que de los siete tipos que se generan, TRES llevaban a ninguna
--     parte. Nadie lo notó porque nadie había abierto todavía la bandeja.
--
-- 2 · `generar_alertas()` está cerrada a `authenticated` desde la 012 y tiene
--     que seguir estándolo: es trabajo programado, no algo que dispare una
--     pantalla. Pero mientras no haya un cron configurado, una bandeja que
--     nadie puede rellenar es una pantalla vacía para siempre. Se añade
--     `refrescar_alertas()`: valida rol —como exige el centinela de la 013— y
--     por dentro llama a la de siempre.
--
-- El texto y la lógica de las alertas no cambian: solo las rutas.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La generación, con los enlaces corregidos
-- ---------------------------------------------------------------------------
create or replace function public.generar_alertas()
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_nuevas int := 0; v_n int;
begin
  -- Quiebre y stock bajo -----------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select case when coalesce(s.cantidad,0) <= 0 then 'quiebre_stock' else 'stock_bajo' end,
         case when coalesce(s.cantidad,0) <= 0 then 'critica'::severidad_alerta else 'alta'::severidad_alerta end,
         case when coalesce(s.cantidad,0) <= 0 then 'Quiebre de stock' else 'Stock bajo el mínimo' end,
         p.codigo || ' · ' || p.descripcion || ' — saldo ' || coalesce(s.cantidad,0) ||
           ' (mínimo ' || p.stock_minimo || ')',
         'producto', p.id, p.codigo, coalesce(s.cantidad,0),
         '/productos/' || p.id,
         'stock:' || p.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from productos p
  left join stock s on s.producto_id = p.id
  where not p.archivado
    and p.stock_minimo > 0
    and coalesce(s.cantidad, 0) <= p.stock_minimo
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Sobrestock / capital inmovilizado (25:21) ---------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'sobrestock', 'media',
         'Sobrestock · capital inmovilizado',
         p.codigo || ' · ' || p.descripcion || ' — ' || s.cantidad || ' unidades (máximo ' || p.stock_maximo ||
           '), valorizado USD ' || round(s.valorizado, 2),
         'producto', p.id, p.codigo, round(s.valorizado, 2),
         '/productos/' || p.id,
         'sobrestock:' || p.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from productos p
  join stock s on s.producto_id = p.id
  where not p.archivado and p.stock_maximo > 0 and s.cantidad > p.stock_maximo
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Saldo negativo: siempre es un error de operación que hay que cuadrar.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'stock_negativo', 'critica', 'Saldo negativo en almacén',
         p.codigo || ' · saldo ' || s.cantidad || '. Requiere cuadre de gerencia.',
         'producto', p.id, p.codigo, s.cantidad, '/inventario/ajuste',
         'negativo:' || p.id::text || ':' || to_char(current_date, 'YYYY-MM-DD')
  from stock s join productos p on p.id = s.producto_id
  where s.cantidad < 0
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Cartera vencida y por vencer ----------------------------------------------
  -- El enlace va a la FICHA del comprobante, no a /cobranzas: cobranzas es una
  -- sola pantalla con toda la cartera, y llegar ahí desde una alerta obliga a
  -- volver a buscar el documento del que hablaba la alerta.
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select case when c.fecha_vencimiento < current_date then 'credito_vencido' else 'credito_por_vencer' end,
         case when c.fecha_vencimiento < current_date - 30 then 'critica'::severidad_alerta
              when c.fecha_vencimiento < current_date then 'alta'::severidad_alerta
              else 'media'::severidad_alerta end,
         case when c.fecha_vencimiento < current_date then 'Factura vencida' else 'Factura por vencer' end,
         c.numero || ' · ' || cl.razon_social || ' — saldo USD ' || c.saldo ||
           ' vence ' || to_char(c.fecha_vencimiento, 'DD/MM/YYYY'),
         'comprobante', c.id, c.numero, c.saldo, '/facturacion/' || c.id,
         'cartera:' || c.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from comprobantes c join clientes cl on cl.id = c.cliente_id
  where c.estado in ('emitido','parcial','vencido')
    and c.saldo > 0
    and c.fecha_vencimiento is not null
    and c.fecha_vencimiento <= current_date + 7
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Línea de crédito excedida --------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'linea_credito', 'alta', 'Línea de crédito excedida',
         cl.razon_social || ' — expuesto USD ' || round(x.saldo, 2) ||
           ' sobre una línea de USD ' || cl.linea_credito,
         'cliente', cl.id, cl.razon_social, round(x.saldo, 2), '/clientes/' || cl.id,
         'linea:' || cl.id::text || ':' || to_char(current_date, 'IYYY-IW')
  from clientes cl
  join lateral (
    select coalesce(sum(c.saldo), 0) as saldo
    from comprobantes c
    where c.cliente_id = cl.id and c.estado in ('emitido','parcial','vencido')
  ) x on true
  where cl.linea_credito > 0 and x.saldo > cl.linea_credito
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Cotizaciones por vencer -----------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'cotizacion_por_vencer', 'baja', 'Cotización por vencer',
         q.numero || ' · ' || cl.razon_social || ' — vence ' || to_char(q.fecha_vencimiento, 'DD/MM/YYYY'),
         'cotizacion', q.id, q.numero, q.total, '/cotizaciones/' || q.id,
         'cotiz:' || q.id::text
  from cotizaciones q join clientes cl on cl.id = q.cliente_id
  where q.estado in ('enviada','aprobada')
    and q.fecha_vencimiento between current_date and current_date + 3
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  -- Rechazos de SUNAT -----------------------------------------------------------
  insert into alertas (tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id, entidad_nombre, valor, accion_url, huella)
  select 'sunat_rechazo', 'critica', 'Comprobante rechazado por SUNAT',
         c.numero || ' — ' || coalesce(c.sunat_codigo_respuesta, '') || ' ' || coalesce(c.sunat_mensaje, ''),
         'comprobante', c.id, c.numero, c.total, '/facturacion/' || c.id,
         'sunat:' || c.id::text || ':' || coalesce(c.sunat_codigo_respuesta, 'x')
  from comprobantes c
  where c.estado_sunat in ('rechazado','observado')
  on conflict do nothing;
  get diagnostics v_n = row_count; v_nuevas := v_nuevas + v_n;

  return jsonb_build_object('nuevas', v_nuevas, 'generado_en', now());
end $$;

comment on function public.generar_alertas() is
  'Idempotente por `huella`. Deja las alertas con notificado_en NULL para que un worker las EMPUJE (WhatsApp/email): Willy no quiere entrar a buscarlas (25:21). Las rutas de `accion_url` tienen que existir en apps/web/src/app/(erp) — lo vigila alertas/dominio/enlaces.test.ts.';

-- La 012 la cerró a `authenticated` y así se queda. `create or replace` no
-- toca los permisos, pero se repite el revoke para que quien lea esta
-- migración no tenga que ir a buscar la otra para saberlo.
revoke execute on function public.generar_alertas() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. La puerta legítima: refrescar la bandeja desde la pantalla
-- ---------------------------------------------------------------------------
--
-- Por qué la abre cualquiera que pueda escribir en `alertas` —o sea, todos los
-- roles— y no solo gerencia: generar alertas solo INSERTA alertas, es
-- idempotente por `huella` y no toca ningún dato de negocio. Restringirlo a
-- gerencia dejaría al de almacén mirando un tablero viejo sin poder hacer nada,
-- que es exactamente la queja de la que salió este módulo (25:21).
--
-- Lo que sí es caro es el barrido: recorre catálogo, cartera y cotizaciones.
-- Cuando haya un cron cada hora, este botón pasa a ser el «no me fío, mira
-- otra vez» y no el mecanismo principal.
create or replace function public.refrescar_alertas()
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.puede_escribir('alertas') then
    raise exception 'Tu rol no puede refrescar las alertas.'
      using errcode = 'insufficient_privilege';
  end if;

  return public.generar_alertas();
end $$;

comment on function public.refrescar_alertas() is
  'Envoltura con control de rol de generar_alertas(), que sigue cerrada a authenticated. Es el botón «actualizar» de la bandeja mientras no haya cron.';

revoke execute on function public.refrescar_alertas() from public, anon;
grant execute on function public.refrescar_alertas() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Los centinelas de la 012 y la 013 ya pasaron cuando esta migración se
-- aplica, así que no verían nada de lo que hay aquí. Se repiten sobre lo
-- nuevo: la envoltura tiene que validar rol, y la función de dentro tiene que
-- seguir cerrada.
do $$
begin
  if has_function_privilege('authenticated', 'public.generar_alertas()', 'EXECUTE') then
    raise exception 'generar_alertas() volvió a quedar abierta a authenticated';
  end if;

  if pg_get_functiondef('public.refrescar_alertas()'::regprocedure)
     !~* '(puede_escribir|tiene_rol|es_gerencia)' then
    raise exception 'refrescar_alertas() escribe y la puede llamar cualquiera, pero no valida rol';
  end if;

  raise notice 'Alertas: enlaces corregidos y la puerta de refresco valida rol.';
end $$;
