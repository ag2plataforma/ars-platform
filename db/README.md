# db/ — migraciones manuales (Fase 1)

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

## Por qué un script y no una herramienta de migraciones "de verdad"

Por ahora (Fase 1) el objetivo es solo levantar el esquema una vez a partir del DDL existente. Cuando empecemos a evolucionar el modelo de datos de verdad (Fase 2 en adelante), pasamos a Prisma Migrate, que sí lleva control de versiones de esquema — no tiene sentido montar esa maquinaria todavía para una carga inicial de una sola vez.
