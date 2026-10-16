#!/usr/bin/env node
/**
 * Prepara la BD para los riesgos de tipo persona (ver docs/02-roadmap.md):
 *
 *  - SRiskType."IndPersonRisk" boolean default false: marca los tipos de
 *    riesgo cuyo riesgo ES una persona (ej. "Persona"). Al contratar, la app
 *    pide los datos minimos de cada asegurado y crea/busca la persona.
 *  - SProduct."ObjInsuredPersonFields" json: configuracion por producto de
 *    los datos de persona a pedir ({ campo: "OPTIONAL" | "REQUIRED" }).
 *    Null = minimo por defecto (nombre, primer apellido, documento, nacimiento).
 *  - TPerson."DesEmail": se QUITA la restriccion UNIQUE (UK_TPerson_02) para
 *    permitir que varias personas compartan correo (menores con el correo de
 *    un padre). La identidad de la persona pasa a ser el documento
 *    (UK_TPerson_01: tipo + numero, que se mantiene). Se crea un indice normal.
 *  - Marca como persona los tipos de riesgo cuyo codigo/descripcion sea
 *    "PERSONA"/"PERSON" (si existen); el resto se marca desde el catalogo.
 *
 * Idempotente. Uso (desde la raiz del repo):
 *   bash scripts/db-run.sh setup-person-risks.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const statements = [
    `ALTER TABLE ars_platform."SRiskType" ADD COLUMN IF NOT EXISTS "IndPersonRisk" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE ars_platform."SProduct" ADD COLUMN IF NOT EXISTS "ObjInsuredPersonFields" json`,
    `ALTER TABLE ars_platform."TPerson" DROP CONSTRAINT IF EXISTS "UK_TPerson_02"`,
    `DROP INDEX IF EXISTS ars_platform."UK_TPerson_02"`,
    `CREATE INDEX IF NOT EXISTS "IX_TPerson_DesEmail" ON ars_platform."TPerson" ("DesEmail")`,
  ];
  for (const sql of statements) await client.query(sql);

  const marked = await client.query(
    `UPDATE ars_platform."SRiskType" SET "IndPersonRisk" = true
      WHERE upper("CodRiskType") IN ('PERSONA','PERSON') OR upper("DesRiskType") IN ('PERSONA','PERSON')
      RETURNING "CodRiskType", "DesRiskType"`,
  );
  const all = await client.query(
    `SELECT "CodRiskType", "DesRiskType", "IndPersonRisk" FROM ars_platform."SRiskType" ORDER BY 1`,
  );
  console.log('OK. Columnas listas; correo de TPerson ya no es unico.');
  console.log('Marcados como persona ahora:', JSON.stringify(marked.rows));
  console.log('Tipos de riesgo:', JSON.stringify(all.rows));
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
