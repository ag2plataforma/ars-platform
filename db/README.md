# db/ — migraciones manuales

Esta carpeta guarda el script de migración inicial que crea el esquema `ars_platform` en tu Postgres (el mismo servidor de Vercel, esquema aislado — `entity`, que usa la v1, no se toca).

## `migrations/001_init_ars_platform_schema.sql`

Generado a partir del DDL de las 130 tablas que compartiste, con el esquema renombrado de `entity` a `ars_platform`. Crea el esquema, las extensiones necesarias (`uuid-ossp`, `pgcrypto`), las 130 tablas con sus índices, y al final las ~400 foreign keys.

## Cómo ejecutarla

1. Asegúrate de que `services/iam-service/.env` tiene tu `DATABASE_URL` real (la copiaste de `.env.example`).
2. Instala la dependencia del runner (una sola vez, en la raíz del repo):
   ```bash
   npm install pg --save-dev
   ```
3. Ejecuta la migración:
   ```bash
   node db/run-migration.js db/migrations/001_init_ars_platform_schema.sql
   ```
4. Verifica en tu proveedor (o con cualquier cliente de Postgres) que el esquema `ars_platform` apareció con las 130 tablas.
5. **Solo después de verificar que funcionó**, actualiza `services/iam-service/.env`: si tu `DATABASE_URL` trae `?schema=entity` (o similar) al final, cámbialo a `?schema=ars_platform` — así Prisma (que conectamos en el siguiente paso) apunta al esquema nuevo por defecto, no al de producción.

## `migrations/002_two_factor_auth.sql`

Primera evolución real del esquema en Fase 2 (agrega `TUserTwoFactor`/`TUserBackupCode` para 2FA en `iam-service`, ver su README). Mismo procedimiento que la migración 001: correr con `db/run-migration.js` y después actualizar `packages/database/prisma/schema.prisma` a mano para que coincida (los nuevos modelos ya están agregados en el repo) y correr `npx prisma generate` (no necesita conexión a la BD, solo lee el schema).

```bash
node db/run-migration.js db/migrations/002_two_factor_auth.sql
npx prisma generate --schema packages/database/prisma/schema.prisma
```

## Por qué un script y no Prisma Migrate

El plan original (ver historial de este archivo) era pasar a Prisma Migrate en cuanto hiciera falta evolucionar el esquema de verdad -- este es ese momento. **Decisión explícita del usuario, revisada**: se sigue con el script SQL simple en vez de adoptar Prisma Migrate ahora. Motivo: la BD real es un Postgres remoto compartido (mismo servidor de Vercel que usa `entity`/v1), y `prisma migrate dev` necesita una shadow database para generar el diff -- permisos inciertos en ese servidor, y sumar esa pieza de tooling en medio de una feature chica (2FA) no vale el riesgo. Se revisita cuando haga falta una evolución de esquema más grande o compleja que un script secuencial ya no alcance a manejar con claridad.
