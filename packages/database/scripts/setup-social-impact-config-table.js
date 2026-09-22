#!/usr/bin/env node
/**
 * Crea (si no existe) la tabla `SSocialImpactConfig`, nueva por completo
 * -- no hay nada legado que preservar acá (confirmado: ninguna de las
 * 130 tablas introspectadas originalmente tiene rastro de "impacto
 * social"/SIP/CFP/SP). Es la configuración de qué productos participan
 * del cálculo de Impacto Social (Fase 3, ver docs/02-roadmap.md).
 *
 * Decisión explícita del usuario (2026-09-22): por ahora el cálculo real
 * (SIP/CFP/SP y el ajuste de prima) queda EN PROCESO dentro de
 * `packages/shared-common` (mismo patrón que el motor de reglas),
 * leyendo esta tabla directamente vía Prisma -- NO una llamada HTTP real
 * a `social-impact-service`. Reemplazar esto por una llamada real entre
 * servicios queda documentado como pendiente explícito en el roadmap.
 *
 * Diseño (mismo criterio que el resto de las tablas de configuración sin
 * `Cod`/`Des` propio, ver `SPlanProductRisk`): una fila por producto
 * (`IdeProduct` único), `ConfigJSON` para los parámetros del cálculo
 * (hoy solo `{ pctPrimaAdjustment: number }`, un placeholder simple
 * hasta que se definan las fórmulas reales de SIP/CFP/SP), e `IdeState`
 * (Activo/Inactivo) siguiendo la misma convención de máquina de estados
 * que ya usa el resto del sistema (`StateMachineService.getStateByCode`,
 * sin necesidad de registrar esta tabla como entidad nueva -- ver
 * `PlanProductRisksService` para el mismo patrón).
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-social-impact-config-table.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  }
  return match[1].trim();
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."SSocialImpactConfig" (
      "IdeSocialImpactConfig" uuid NOT NULL DEFAULT gen_random_uuid(),
      "IdeProduct" uuid NOT NULL,
      "ConfigJSON" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "IdeState" uuid NOT NULL,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_SSocialImpactConfig" PRIMARY KEY ("IdeSocialImpactConfig"),
      CONSTRAINT "UK_SSocialImpactConfig_01" UNIQUE ("IdeProduct"),
      CONSTRAINT "FK_SSocialImpactConfig_SProduct" FOREIGN KEY ("IdeProduct")
        REFERENCES ars_platform."SProduct" ("IdeProduct"),
      CONSTRAINT "FK_SSocialImpactConfig_SState" FOREIGN KEY ("IdeState")
        REFERENCES ars_platform."SState" ("IdeState")
    )
  `);

  const check = await client.query(`SELECT count(*)::int AS count FROM ars_platform."SSocialImpactConfig"`);
  console.log('OK. Tabla ars_platform."SSocialImpactConfig" lista.');
  console.log(`Filas actuales: ${check.rows[0].count}`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
