# Copia de seguridad · cómo se hace y cómo se vuelve atrás

El proyecto Supabase está en **plan free, sin copias automáticas** (comprobado el
31/08). Lo único que hay es `pnpm db:respaldar`. Reescrito el 23/10: la versión
anterior copiaba 45 tablas de 72, sin archivos.

## Qué copia

Escribe en `documentosrodamiento/respaldos/AAAA-MM-DD-HHMM/` (hora de Lima,
fuera de git):

| Fichero | Qué es |
|---|---|
| `<tabla>.json` | Todas las tablas de `public`, leídas de la base. Cada una se **cuenta** en la base y se compara con lo copiado: si no cuadra, la copia falla |
| `orden.json` | El orden de restauración, calculado de las claves foráneas |
| `_cuentas.json` | Las cuentas de acceso (`auth.users`) **sin contraseñas** |
| `_archivos/<bucket>/…` | Los archivos de Storage: papeles de proveedor, vouchers, constancias de retención |
| `_esquema.sql` | La foto del esquema VIVO: funciones, vistas, disparadores, políticas. No es para ejecutar, es para comparar con las migraciones |
| `manifiesto.json` | Recuentos por tabla, archivos y errores |

No copia `config_sunat_secretos` (la clave del certificado: se vuelve a subir
el certificado) ni `intentos_login`.

Al terminar, apunta una fila en `respaldos` (147). **Datos de la empresa**
la enseña a gerencia y admin, y se pone en ámbar si la última copia buena tiene
más de 7 días o si la última que se intentó falló.

La del 23/10: 71 tablas, 28 467 filas, 1 archivo, 17 MB, 2 minutos.

## Programarla (Windows, en el equipo de Luis)

Una vez al día a la 1 de la tarde. Desde una consola de Windows:

```
schtasks /create /tn "Rodatech - copia de seguridad" /sc daily /st 13:00 ^
  /tr "cmd /c cd /d E:\rodamientos && node scripts\respaldar.mjs >> documentosrodamiento\respaldos\registro.log 2>&1"
```

Si el equipo está apagado a esa hora, no se hace, y al octavo día la pantalla lo
dice. Cada copia ocupa ~17 MB: conviene borrar a mano las de más de tres meses
y guardar una por mes.

**Lo que falta de verdad** sigue siendo lo mismo que el 31/08: el plan Pro de
Supabase (~25 USD/mes) trae copias diarias propias y PITR. Esto es un parche
que convierte «se perdió todo» en «se perdió lo de hoy».

## Cómo se restaura

> ⚠️ **Nunca se ha restaurado una copia de verdad.** Lo de abajo es el
> procedimiento razonado, no uno probado. La primera vez, hacerlo en un
> proyecto Supabase NUEVO y vacío, nunca encima del del cliente.

1. **Proyecto nuevo** en Supabase. Apuntar `.env.local` a él (URL, llaves,
   `SUPABASE_PROJECT_REF`).
2. **El esquema**: aplicar las migraciones `001` → la última, una a una, con
   `node scripts/aplicar-migraciones.mjs NNN.sql`. Comparar después las
   funciones con `_esquema.sql` de la copia: si alguna difiere, manda la de la
   copia (es lo que de verdad corría).
3. **Las cuentas**: crear cada fila de `_cuentas.json` con la API de admin de
   Auth **con el mismo `id`** (`perfiles.id` es ese id), su `email` y su
   `app_metadata`. Contraseña nueva para cada uno.
4. **Los datos**, tabla por tabla en el orden de `orden.json`, con los
   disparadores apagados para que no repitan movimientos de kardex ni
   bitácora:
   ```sql
   set session_replication_role = replica;
   insert into public.<tabla> select * from json_populate_recordset(null::public.<tabla>, '<contenido del json>');
   set session_replication_role = origin;
   ```
   Las tablas con `generated always as identity` (p. ej. `respaldos`,
   `actividad`) necesitan `overriding system value`. Después, poner cada
   secuencia en su máximo: `select setval(pg_get_serial_sequence(...), max(id))`.
5. **Los archivos**: subir `_archivos/<bucket>/<ruta>` a cada bucket con la
   misma ruta (las tablas `*_adjuntos` guardan esa ruta).
6. **Comprobar**: contar cada tabla y compararla con `manifiesto.json`.
7. Subir otra vez el certificado digital en **SUNAT y numeración**.
