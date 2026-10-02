#!/usr/bin/env node
/**
 * Crea (si no existen) `SAdjustment` y `TQuoteAdjustment` -- catálogo
 * genérico de recargos/descuentos (docs/02-roadmap.md, Fase 2 backlog
 * ítem 7). El motor de reglas ya resuelve `adjustment('COD')` de forma
 * genérica (`AdjustmentValueResolver`, Fase 3) pero hasta ahora el único
 * caso real (`SOCIAL_IMPACT`) tenía su propia tabla de configuración
 * dedicada (`SSocialImpactConfig`) -- esta migración agrega una tabla
 * REUTILIZABLE para cualquier recargo/descuento nuevo (fidelidad,
 * multi-póliza, siniestralidad, etc.) sin escribir ninguna tabla
 * dedicada por caso.
 *
 * Decisiones explícitas del usuario (2026-10-02, tres rondas de
 * `AskUserQuestion`):
 *  - Catálogo con un modo por ajuste (`IndAutomatic`): manual (el
 *    operador lo elige al cotizar) o automático. Por ahora SOLO se
 *    construye el flag y el modo manual -- ningún ajuste automático se
 *    aplica solo todavía (mismo criterio que Requisitos Etapa 1 con
 *    OCR: la columna/flag queda reservada para cuando haya un caso
 *    concreto que programar, ver `PrismaAdjustmentValueResolver`).
 *  - Porcentaje FIJO por ajuste (`PctAdjustment`), definido en el
 *    catálogo -- el operador no lo edita al aplicarlo, solo elige
 *    aplicarlo o no.
 *  - Se puede aplicar más de un ajuste genérico a la vez en la misma
 *    cotización (`TQuoteAdjustment` no tiene restricción de unicidad
 *    por `IdeQuote` sola, solo por el par `IdeQuote`+`IdeAdjustment`).
 *
 * `SAdjustment`: catálogo "Cod/Des simple" (mismo molde que
 * `SRiskLevel`/`SCalculationRule`, ver `CatalogCrudService` en
 * `packages/shared-common`) -- `CodAdjustment` único, `DesAdjustment`,
 * `PctAdjustment` (negativo = descuento, positivo = recargo, mismo
 * signo que `AppliedAdjustment.pctPrimaAdjustment`), `IndAutomatic` y
 * `IdeState` (Activo/Inactivo).
 *
 * `TQuoteAdjustment`: qué ajustes del catálogo están aplicados a una
 * cotización puntual -- tabla de unión simple, sin `Cod`/`Des` propio
 * (mismo criterio que `TQuoteSocialImpactAnswer`), única por
 * (`IdeQuote`,`IdeAdjustment`) para no duplicar la aplicación del mismo
 * ajuste dos veces.
 *
 * Idempotente (`CREATE TABLE IF NOT EXISTS`). Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-generic-adjustments-tables.js
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
    CREATE TABLE IF NOT EXISTS ars_platform."SAdjustment" (
      "IdeAdjustment" uuid NOT NULL DEFAULT gen_random_uuid(),
      "CodAdjustment" varchar(60) NOT NULL,
      "DesAdjustment" varchar(255) NOT NULL,
      "PctAdjustment" numeric(9,4) NOT NULL,
      "IndAutomatic" boolean NOT NULL DEFAULT false,
      "IdeState" uuid NOT NULL,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_SAdjustment" PRIMARY KEY ("IdeAdjustment"),
      CONSTRAINT "UK_SAdjustment_01" UNIQUE ("CodAdjustment"),
      CONSTRAINT "FK_SAdjustment_SState" FOREIGN KEY ("IdeState")
        REFERENCES ars_platform."SState" ("IdeState")
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."TQuoteAdjustment" (
      "IdeQuoteAdjustment" uuid NOT NULL DEFAULT gen_random_uuid(),
      "IdeQuote" uuid NOT NULL,
      "IdeAdjustment" uuid NOT NULL,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_TQuoteAdjustment" PRIMARY KEY ("IdeQuoteAdjustment"),
      CONSTRAINT "UK_TQuoteAdjustment_01" UNIQUE ("IdeQuote", "IdeAdjustment"),
      CONSTRAINT "FK_TQuoteAdjustment_TQuote" FOREIGN KEY ("IdeQuote")
        REFERENCES ars_platform."TQuote" ("IdeQuote"),
      CONSTRAINT "FK_TQuoteAdjustment_SAdjustment" FOREIGN KEY ("IdeAdjustment")
        REFERENCES ars_platform."SAdjustment" ("IdeAdjustment")
    )
  `);

  const adjustmentCount = await client.query(`SELECT count(*)::int AS count FROM ars_platform."SAdjustment"`);
  const quoteAdjustmentCount = await client.query(`SELECT count(*)::int AS count FROM ars_platform."TQuoteAdjustment"`);
  console.log('OK. Tablas ars_platform."SAdjustment" y "TQuoteAdjustment" listas.');
  console.log(`Filas actuales -- SAdjustment: ${adjustmentCount.rows[0].count}, TQuoteAdjustment: ${quoteAdjustmentCount.rows[0].count}`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
