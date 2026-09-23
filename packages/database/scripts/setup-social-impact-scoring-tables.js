#!/usr/bin/env node
/**
 * Crea (si no existe) las dos tablas de la Etapa 2 de Impacto Social
 * (calculo real de SIP/CFP y el ajuste de prima resultante, ver
 * docs/02-roadmap.md). Nuevas por completo, sin equivalente legado.
 *
 * - `SSocialImpactScoring`: configuracion GLOBAL (una sola fila) de la
 *   formula real -- tramos de CFP (kg CO2 -> puntos), pesos de SIP
 *   (puntos por hora de voluntariado, bonus por causa recurrente/
 *   donaciones), el peso de cada componente en el score combinado, y la
 *   tabla de tramos score combinado -> % de descuento. Mismo patron que
 *   `SCalculationRule.FormulaJSON` (formula real guardada como JSON,
 *   evaluada en codigo, editable sin deploy). Se inserta una fila
 *   default (los tramos que aprobo el usuario, 2026-09-22) si la tabla
 *   queda vacia.
 * - `TQuoteSocialImpactAnswer`: las respuestas del formulario de
 *   Impacto Social para UNA cotizacion puntual, mas el resultado ya
 *   calculado (kg CO2, score CFP, score SIP, score combinado, %
 *   ajuste) -- evita repetir la llamada a la API externa (emissions.dev)
 *   cada vez que se recalcula el precio de la cotizacion.
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Despues hay que actualizar el cliente Prisma:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raiz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-social-impact-scoring-tables.js
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

// Tramos/pesos aprobados por el usuario (2026-09-22) como punto de
// partida -- ver docs/02-roadmap.md. Todo ajustable despues vía
// PATCH /social-impact-scoring, sin tocar este script de nuevo.
const DEFAULT_FORMULA = {
  cfpBands: [
    { maxKgCo2: 2000, points: 100 },
    { maxKgCo2: 4000, points: 70 },
    { maxKgCo2: 6000, points: 40 },
    { maxKgCo2: 10000, points: 15 },
    { maxKgCo2: null, points: 0 },
  ],
  cfpFactors: {
    // kg CO2 por km, factores publicos promedio por tipo de combustible
    // (a confirmar/ajustar si el negocio tiene factores propios).
    carKgPerKm: { gasolina: 0.192, diesel: 0.171, hibrido: 0.106, electrico: 0.053 },
    // kg CO2 promedio por vuelo ida-y-vuelta (estimacion generica).
    avgFlightKg: 250,
  },
  electricity: {
    // Pais por defecto para la intensidad de red electrica real
    // (emissions.dev /v1/electricity/calculate) cuando no se conoce el
    // pais del cliente.
    defaultCountry: 'ES',
  },
  sipWeights: {
    pointsPerVolunteerHour: 2,
    maxVolunteerHours: 100,
    recurringCauseBonus: 50,
    donationBonus: 30,
  },
  combinedWeights: { cfp: 0.5, sip: 0.5 },
  scoreTiers: [
    { minScore: 0, maxScore: 25, pctPrimaAdjustment: 0 },
    { minScore: 26, maxScore: 50, pctPrimaAdjustment: -2 },
    { minScore: 51, maxScore: 75, pctPrimaAdjustment: -5 },
    { minScore: 76, maxScore: 100, pctPrimaAdjustment: -8 },
  ],
};

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."SSocialImpactScoring" (
      "IdeSocialImpactScoring" uuid NOT NULL DEFAULT gen_random_uuid(),
      "FormulaJSON" jsonb NOT NULL,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_SSocialImpactScoring" PRIMARY KEY ("IdeSocialImpactScoring")
    )
  `);

  const countRow = await client.query(`SELECT count(*)::int AS count FROM ars_platform."SSocialImpactScoring"`);
  if (countRow.rows[0].count === 0) {
    await client.query(
      `INSERT INTO ars_platform."SSocialImpactScoring"
        ("FormulaJSON", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
       VALUES ($1::jsonb, 'setup-script', now(), 'setup-script', now())`,
      [JSON.stringify(DEFAULT_FORMULA)],
    );
    console.log('Fila default de SSocialImpactScoring insertada.');
  } else {
    console.log('SSocialImpactScoring ya tenia datos, no se tocó.');
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."TQuoteSocialImpactAnswer" (
      "IdeQuoteSocialImpactAnswer" uuid NOT NULL DEFAULT gen_random_uuid(),
      "IdeQuote" uuid NOT NULL,
      "AnswersJSON" jsonb NOT NULL,
      "KgCo2Year" numeric NOT NULL,
      "CfpScore" numeric NOT NULL,
      "SipScore" numeric NOT NULL,
      "CombinedScore" numeric NOT NULL,
      "PctPrimaAdjustment" numeric NOT NULL,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_TQuoteSocialImpactAnswer" PRIMARY KEY ("IdeQuoteSocialImpactAnswer"),
      CONSTRAINT "UK_TQuoteSocialImpactAnswer_01" UNIQUE ("IdeQuote"),
      CONSTRAINT "FK_TQuoteSocialImpactAnswer_TQuote" FOREIGN KEY ("IdeQuote")
        REFERENCES ars_platform."TQuote" ("IdeQuote")
    )
  `);

  console.log('OK. Tablas de Impacto Social (Etapa 2) listas.');
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
