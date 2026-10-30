#!/usr/bin/env node
/**
 * Deja en MAYUSCULAS (y sin espacios en los extremos) el numero de documento de las personas ya existentes
 * (TPerson.NumIdentification), p. ej. 06809020r -> 06809020R. El codigo nuevo ya guarda los documentos asi y
 * busca sin distinguir mayusculas; este script pone al dia los datos antiguos.
 *
 * Si dos personas del MISMO tipo de documento solo se diferencian por mayusculas/espacios (serian la misma
 * persona duplicada) NO se tocan: se listan para que se unifiquen a mano, porque la clave unica
 * (tipo + numero) impediria el cambio.
 *
 * Idempotente. Uso (desde la raiz del repo / carpeta deploy en la VPS):
 *   bash scripts/db-run.sh normalize-person-documents.js
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

  const conflicts = await client.query(
    `SELECT "IdeIdentificationType", upper(btrim("NumIdentification")) AS doc,
            count(*)::int AS n, array_agg("IdePerson"::text || ' = ' || "NumIdentification") AS personas
       FROM ars_platform."TPerson"
      WHERE "NumIdentification" IS NOT NULL
      GROUP BY 1, 2 HAVING count(*) > 1`,
  );
  if (conflicts.rowCount > 0) {
    console.log('ATENCION: documentos duplicados que solo difieren en mayusculas/espacios (no se tocan):');
    for (const row of conflicts.rows) console.log(`  ${row.doc}: ${row.personas.join(' | ')}`);
  }

  const updated = await client.query(
    `UPDATE ars_platform."TPerson" p
        SET "NumIdentification" = upper(btrim(p."NumIdentification"))
      WHERE p."NumIdentification" IS NOT NULL
        AND p."NumIdentification" <> upper(btrim(p."NumIdentification"))
        AND NOT EXISTS (
          SELECT 1 FROM ars_platform."TPerson" o
           WHERE o."IdePerson" <> p."IdePerson"
             AND o."IdeIdentificationType" IS NOT DISTINCT FROM p."IdeIdentificationType"
             AND upper(btrim(o."NumIdentification")) = upper(btrim(p."NumIdentification")))
      RETURNING p."IdePerson"`,
  );
  console.log(`OK. Documentos puestos en mayusculas: ${updated.rowCount}.`);
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
