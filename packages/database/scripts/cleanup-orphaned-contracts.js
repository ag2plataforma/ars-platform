#!/usr/bin/env node
/**
 * Limpieza puntual de contratos huérfanos dejados por
 * `ContractsService.create()` ANTES de que se corrigiera para correr
 * dentro de una transacción (`this.prisma.$transaction`, ver
 * docs/02-roadmap.md y el doc-comment de `create()` en
 * `services/underwriting-service/src/contracts/contracts.service.ts`).
 *
 * Síntoma real reportado por el usuario: al contratar, faltaba
 * `SStateRule.IndInitialState` para la entidad `TContractRequirement`,
 * lo que hacía fallar `copyRisksAndCoverages` -- en ESE punto exacto del
 * método (confirmado leyendo el código real), el `Promise.all` que
 * resuelve los 3 estados iniciales (`TFileRisk`/`TRiskCoverage`/
 * `TContractRequirement`) se ejecuta ANTES del loop que crea
 * `TFileRisk`/`TRiskCoverage`/`TContractRequirement` -- así que un
 * contrato huérfano de este bug específico NUNCA llegó a tener ningún
 * `TFileRisk`, aunque sí quedaron grabados (con el código viejo, sin
 * transacción): `TContract`, `TContractPerson`, `TContractDistributionChannel`,
 * `TContractBilling`, `TContractFile` y `TContractOperation` (CONTGENE).
 *
 * Este script identifica contratos con esa firma exacta (tiene
 * `TContractFile` pero NINGUNO de ellos tiene ningún `TFileRisk`) y,
 * opcionalmente, los borra en el orden correcto -- dejando la cotización
 * de origen libre para reintentar "Generar contrato" (que ahora sí corre
 * atómico).
 *
 * IMPORTANTE -- lo que este script NO toca (a propósito):
 *   - `TPerson.IndClient`/`TstRelationshipStart`: `setContractPersons` los
 *     marca al crear `TContractPerson`, pero son un flag a nivel de
 *     PERSONA (puede tener otros contratos reales, o directamente ser
 *     cierto que va a convertirse en cliente en el reintento) -- revertirlo
 *     automáticamente podría pisar un estado válido. Si querés revertirlo
 *     a mano para una persona puntual, hacelo por separado.
 *   - Cualquier contrato que SÍ tenga al menos un `TFileRisk`: no matchea
 *     el patrón de este bug puntual, así que se deja fuera del listado
 *     por seguridad (podría ser un contrato real, o haber fallado más
 *     adelante en la cascada por otro motivo).
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/cleanup-orphaned-contracts.js
 *     -> DRY RUN: solo lista los contratos huérfanos encontrados, no borra nada.
 *
 *   node packages/database/scripts/cleanup-orphaned-contracts.js --confirm
 *     -> borra TODOS los contratos listados en el dry run (uno por uno,
 *        cada uno en su propia transacción de Postgres).
 *
 *   node packages/database/scripts/cleanup-orphaned-contracts.js --contract <IdeContract> --confirm
 *     -> limpia un único contrato puntual por su IdeContract (más seguro
 *        si ya sabés cuál es).
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
    throw new Error(`No se encontró DATABASE_URL en ${envPath}`);
  }
  return match[1].trim();
}

async function findOrphanedContracts(client, ideContractFilter) {
  const res = await client.query(
    `SELECT c."IdeContract", c."NumContract", c."TstCreation", q."NumQuote", q."IdeQuote"
     FROM ars_platform."TContract" c
     JOIN ars_platform."TQuote" q ON q."IdeQuote" = c."IdeQuote"
     WHERE EXISTS (SELECT 1 FROM ars_platform."TContractFile" cf WHERE cf."IdeContract" = c."IdeContract")
       AND NOT EXISTS (
         SELECT 1
         FROM ars_platform."TContractFile" cf
         JOIN ars_platform."TFileRisk" fr ON fr."IdeContractFile" = cf."IdeContractFile"
         WHERE cf."IdeContract" = c."IdeContract"
       )
       AND ($1::uuid IS NULL OR c."IdeContract" = $1::uuid)
     ORDER BY c."TstCreation" DESC`,
    [ideContractFilter],
  );
  return res.rows;
}

async function cleanupContract(client, ideContract) {
  await client.query('BEGIN');
  try {
    const fileRes = await client.query(
      `SELECT "IdeContractFile" FROM ars_platform."TContractFile" WHERE "IdeContract" = $1`,
      [ideContract],
    );
    const fileIds = fileRes.rows.map((r) => r.IdeContractFile);

    // Guarda de seguridad extra dentro de la propia transacción: si por
    // cualquier motivo alguno de estos archivos SÍ tiene TFileRisk, aborta
    // sin borrar nada (no debería pasar dado el filtro de arriba, pero
    // evita un borrado accidental si la BD cambió entre el listado y el borrado).
    if (fileIds.length > 0) {
      const riskCheck = await client.query(
        `SELECT COUNT(*)::int AS n FROM ars_platform."TFileRisk" WHERE "IdeContractFile" = ANY($1::uuid[])`,
        [fileIds],
      );
      if (riskCheck.rows[0].n > 0) {
        throw new Error(`El contrato ${ideContract} SÍ tiene TFileRisk -- abortado por seguridad, no se borra.`);
      }
    }

    await client.query(`DELETE FROM ars_platform."TContractOperation" WHERE "IdeContract" = $1`, [ideContract]);
    if (fileIds.length > 0) {
      await client.query(`DELETE FROM ars_platform."TContractFile" WHERE "IdeContract" = $1`, [ideContract]);
    }
    await client.query(`DELETE FROM ars_platform."TContractBilling" WHERE "IdeContract" = $1`, [ideContract]);
    await client.query(`DELETE FROM ars_platform."TContractDistributionChannel" WHERE "IdeContract" = $1`, [
      ideContract,
    ]);
    await client.query(`DELETE FROM ars_platform."TContractPerson" WHERE "IdeContract" = $1`, [ideContract]);
    await client.query(`DELETE FROM ars_platform."TContract" WHERE "IdeContract" = $1`, [ideContract]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const contractIdx = args.indexOf('--contract');
  const ideContractFilter = contractIdx >= 0 ? args[contractIdx + 1] : null;

  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const orphans = await findOrphanedContracts(client, ideContractFilter);

  if (orphans.length === 0) {
    console.log('No se encontró ningún contrato huérfano con esta firma (TContractFile sin ningún TFileRisk).');
    await client.end();
    return;
  }

  console.log(`Encontrados ${orphans.length} contrato(s) huérfano(s):\n`);
  for (const row of orphans) {
    console.log(
      `  - NumContract=${row.NumContract}  IdeContract=${row.IdeContract}  ` +
        `NumQuote=${row.NumQuote}  IdeQuote=${row.IdeQuote}  TstCreation=${row.TstCreation.toISOString()}`,
    );
  }

  if (!confirm) {
    console.log(
      '\n(DRY RUN -- no se borró nada. Volvé a correr con --confirm para borrarlos, ' +
        'o con --contract <IdeContract> --confirm para borrar solo uno puntual.)',
    );
    await client.end();
    return;
  }

  console.log('\nBorrando...');
  for (const row of orphans) {
    await cleanupContract(client, row.IdeContract);
    console.log(`  OK: borrado NumContract=${row.NumContract} (IdeContract=${row.IdeContract})`);
  }
  console.log('\nListo -- las cotizaciones correspondientes ya pueden reintentar "Generar contrato".');

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
