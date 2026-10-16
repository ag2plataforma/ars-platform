#!/usr/bin/env node
/**
 * Prepara la BD para los riesgos de tipo persona (ver docs/02-roadmap.md):
 *
 *  - SRisk."IndPersonRisk" boolean default false: marca los riesgos que SON
 *    una persona (ej. "Viaje", "Persona"). Al contratar, la app pide los datos
 *    minimos de cada asegurado y crea/busca la persona. (SRiskType NO se usa:
 *    indica si el riesgo es principal u opcional.)
 *  - SRiskProduct."ObjInsuredPersonFields" json: configuracion, por riesgo de
 *    cada producto, de los datos de persona a pedir del asegurado
 *    ({ campo: "NONE" | "OPTIONAL" | "REQUIRED" }). Null = minimo por defecto
 *    (nombre, primer apellido, documento, nacimiento).
 *  - TPerson."DesEmail": se QUITA la restriccion UNIQUE (UK_TPerson_02) para
 *    permitir que varias personas compartan correo (menores con el correo de
 *    un padre). La identidad de la persona pasa a ser el documento
 *    (UK_TPerson_01: tipo + numero, que se mantiene). Se crea un indice normal.
 *  - Marca como persona los riesgos cuyo codigo/descripcion sea
 *    "PERSONA"/"PERSON" (si existen); el resto se marca desde Catalogos > Riesgos.
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
    `ALTER TABLE ars_platform."SRisk" ADD COLUMN IF NOT EXISTS "IndPersonRisk" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE ars_platform."SRiskProduct" ADD COLUMN IF NOT EXISTS "ObjInsuredPersonFields" json`,
    `ALTER TABLE ars_platform."TPerson" DROP CONSTRAINT IF EXISTS "UK_TPerson_02"`,
    `DROP INDEX IF EXISTS ars_platform."UK_TPerson_02"`,
    `CREATE INDEX IF NOT EXISTS "IX_TPerson_DesEmail" ON ars_platform."TPerson" ("DesEmail")`,
  ];
  for (const sql of statements) await client.query(sql);

  // Una version anterior de este script creo la marca en SRiskType (error de diseno: ese catalogo
  // indica principal/opcional). Si existe, se traspasa lo marcado a los SRisk que usan esos tipos
  // (via SRiskProduct) y se elimina la columna.
  const legacy = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'ars_platform' AND table_name = 'SRiskType' AND column_name = 'IndPersonRisk'`,
  );
  if (legacy.rowCount > 0) {
    const moved = await client.query(
      `UPDATE ars_platform."SRisk" r SET "IndPersonRisk" = true
        WHERE EXISTS (
          SELECT 1 FROM ars_platform."SRiskProduct" rp
            JOIN ars_platform."SRiskType" rt ON rt."IdeRiskType" = rp."IdeRiskType"
           WHERE rp."IdeRisk" = r."IdeRisk" AND rt."IndPersonRisk" = true)
        RETURNING r."CodRisk"`,
    );
    console.log('Marca traspasada de SRiskType a SRisk:', JSON.stringify(moved.rows.map((r) => r.CodRisk)));
    await client.query(`ALTER TABLE ars_platform."SRiskType" DROP COLUMN "IndPersonRisk"`);
  }

  const marked = await client.query(
    `UPDATE ars_platform."SRisk" SET "IndPersonRisk" = true
      WHERE upper("CodRisk") IN ('PERSONA','PERSON') OR upper("DesRisk") IN ('PERSONA','PERSON')
      RETURNING "CodRisk", "DesRisk"`,
  );
  // Version anterior: la configuracion se guardaba en SProduct (a nivel de producto). Si existe, se copia a
  // los riesgos de producto marcados como persona que aun no tengan configuracion y se elimina la columna.
  const legacyProduct = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'ars_platform' AND table_name = 'SProduct' AND column_name = 'ObjInsuredPersonFields'`,
  );
  if (legacyProduct.rowCount > 0) {
    const copied = await client.query(
      `UPDATE ars_platform."SRiskProduct" rp SET "ObjInsuredPersonFields" = p."ObjInsuredPersonFields"
         FROM ars_platform."SProduct" p, ars_platform."SRisk" r
        WHERE p."IdeProduct" = rp."IdeProduct" AND r."IdeRisk" = rp."IdeRisk" AND r."IndPersonRisk" = true
          AND rp."ObjInsuredPersonFields" IS NULL AND p."ObjInsuredPersonFields" IS NOT NULL
        RETURNING rp."CodRiskProduct"`,
    );
    console.log('Configuracion de persona traspasada de SProduct a SRiskProduct:', JSON.stringify(copied.rows.map((r) => r.CodRiskProduct)));
    await client.query(`ALTER TABLE ars_platform."SProduct" DROP COLUMN "ObjInsuredPersonFields"`);
  }

  const all = await client.query(
    `SELECT "CodRisk", "DesRisk", "IndPersonRisk" FROM ars_platform."SRisk" ORDER BY 1`,
  );
  console.log('OK. Columnas listas; correo de TPerson ya no es unico.');
  console.log('Marcados como persona ahora:', JSON.stringify(marked.rows));
  console.log('Riesgos:', JSON.stringify(all.rows));
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
