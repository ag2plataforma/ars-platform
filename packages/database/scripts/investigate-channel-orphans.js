#!/usr/bin/env node
/**
 * SOLO LECTURA. Diagnostico de los canales de distribucion "huerfanos" de SCommissionProduct (origen/destino que no
 * existen en SDistributionChannel) y de usuarios cuyo UserData apunta a un canal inexistente. Lista tambien los
 * canales existentes y los arboles de comision, para decidir si se crea el canal que falta, se remapea a uno
 * existente o se desactiva la fila.
 *
 * Uso: bash scripts/db-run.sh investigate-channel-orphans.js
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

  console.log('== Canales de distribucion existentes');
  const channels = await client.query(`
    SELECT d."IdeDistributionChannel" AS id, d."CodDistributionChannel" AS cod, d."DesDistributionChannel" AS des,
           p."CodDistributionChannel" AS padre, b."CodBroker" AS broker, s."CodState" AS estado,
           (SELECT count(*) FROM ars_platform."SCommissionTree" t WHERE t."IdeDistributionChannel" = d."IdeDistributionChannel") AS arboles
      FROM ars_platform."SDistributionChannel" d
      LEFT JOIN ars_platform."SDistributionChannel" p ON p."IdeDistributionChannel" = d."IdeDistributionChannelParent"
      LEFT JOIN ars_platform."TBroker" b ON b."IdeBroker" = d."IdeBroker"
      JOIN ars_platform."SState" s ON s."IdeState" = d."IdeState"
     ORDER BY d."CodDistributionChannel"`);
  console.table(channels.rows);

  console.log('== SCommissionProduct con origen o destino inexistente');
  const orphans = await client.query(`
    SELECT cp."IdeCommissionProduct" AS id, pr."CodProduct" AS producto,
           cp."IdeDistributionChannelOrigin"::text AS origen, (o."IdeDistributionChannel" IS NOT NULL) AS origen_existe,
           cp."IdeDistributionChannelDestiny"::text AS destino, (d."IdeDistributionChannel" IS NOT NULL) AS destino_existe,
           cp."Percentaje" AS pct, cp."IndMain" AS principal, cp."TstInitial"::text AS desde, cp."TstEnd"::text AS hasta, s."CodState" AS estado
      FROM ars_platform."SCommissionProduct" cp
      JOIN ars_platform."SProduct" pr ON pr."IdeProduct" = cp."IdeProduct"
      JOIN ars_platform."SState" s ON s."IdeState" = cp."IdeState"
      LEFT JOIN ars_platform."SDistributionChannel" o ON o."IdeDistributionChannel" = cp."IdeDistributionChannelOrigin"
      LEFT JOIN ars_platform."SDistributionChannel" d ON d."IdeDistributionChannel" = cp."IdeDistributionChannelDestiny"
     WHERE o."IdeDistributionChannel" IS NULL OR d."IdeDistributionChannel" IS NULL
     ORDER BY pr."CodProduct"`);
  console.table(orphans.rows);

  console.log('== Todas las filas de SCommissionProduct (para ver el reparto completo)');
  const all = await client.query(`
    SELECT pr."CodProduct" AS producto, o."CodDistributionChannel" AS origen, d."CodDistributionChannel" AS destino,
           cp."Percentaje" AS pct, cp."IndMain" AS principal, s."CodState" AS estado
      FROM ars_platform."SCommissionProduct" cp
      JOIN ars_platform."SProduct" pr ON pr."IdeProduct" = cp."IdeProduct"
      JOIN ars_platform."SState" s ON s."IdeState" = cp."IdeState"
      LEFT JOIN ars_platform."SDistributionChannel" o ON o."IdeDistributionChannel" = cp."IdeDistributionChannelOrigin"
      LEFT JOIN ars_platform."SDistributionChannel" d ON d."IdeDistributionChannel" = cp."IdeDistributionChannelDestiny"
     ORDER BY 1, 2, 3`);
  console.table(all.rows);

  console.log('== Usuarios cuyo UserData apunta a un canal inexistente');
  const users = await client.query(`
    SELECT u."CodUser" AS usuario, u."UserData"->>'ideDistributionChannel' AS canal
      FROM ars_platform."TUser" u
      LEFT JOIN ars_platform."SDistributionChannel" d ON d."IdeDistributionChannel"::text = u."UserData"->>'ideDistributionChannel'
     WHERE u."UserData"->>'ideDistributionChannel' IS NOT NULL AND d."IdeDistributionChannel" IS NULL`);
  console.table(users.rows);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
