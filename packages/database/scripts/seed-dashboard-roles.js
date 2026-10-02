#!/usr/bin/env node
/**
 * Siembra dos roles nuevos en `TRol` -- `SALES` (Comercial) y `PORTFOLIO`
 * (Cartera) -- pedidos explícitamente por el usuario (2026-10-02) para
 * poder filtrar el dashboard de inicio por área: hasta este script solo
 * existían `ADMIN` (`seed-admin-user.js`) y los tres de Siniestros
 * (`CLAIMS_ADJUSTER`/`CLAIMS_MANAGER`/`CLAIMS_DIRECTOR`,
 * `seed-claims-approval-workflow.js`) -- ningún rol propio para
 * comercial/cartera. Mismo patrón exacto que ese script (`findOrCreateByCode`
 * sobre `TRol`, códigos en inglés), pero sin máquina de estados nueva --
 * estos roles no son una ENTIDAD con ciclo de vida propio, solo un valor
 * más de `TRol` para asignarle a un usuario desde la pantalla de Usuarios.
 *
 * Después de correr este script, el usuario asigna `SALES`/`PORTFOLIO` a
 * los usuarios que correspondan desde la pantalla de Usuarios del
 * backoffice (`CodRol`, un único rol por usuario, igual que hoy) --
 * ningún usuario existente cambia de rol solo.
 *
 * Idempotente: correr de nuevo no duplica nada (`findUnique` por
 * `CodRol` antes de crear).
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.resolve(__dirname, '../../../services/iam-service/.env'));

const SYSTEM = 'seed-script';

// CodRol -> DesRol (roles nuevos para el dashboard de inicio, 2026-10-02).
const DASHBOARD_ROLES = [
  { codRol: 'SALES', desRol: 'Comercial' },
  { codRol: 'PORTFOLIO', desRol: 'Cartera' },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('No se encontró DATABASE_URL (ver services/iam-service/.env).');
  }
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const audit = { UsrCreation: SYSTEM, TstCreation: now, UsrModification: SYSTEM, TstModification: now };

    const activeState = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
    if (!activeState) {
      throw new Error('No existe SState con CodState="ACTIVO". Correr primero seed-contract-testing-fixtures.js.');
    }
    const ideActivo = activeState.IdeState;

    async function findOrCreateByCode(model, codeField, code, extraData, label) {
      const existing = await prisma[model].findUnique({ where: { [codeField]: code } });
      if (existing) {
        console.log(`= ${label} ya existía (${code})`);
        return existing;
      }
      const created = await prisma[model].create({ data: { [codeField]: code, ...extraData, ...audit } });
      console.log(`+ ${label} creado (${code})`);
      return created;
    }

    for (const { codRol, desRol } of DASHBOARD_ROLES) {
      await findOrCreateByCode('tRol', 'CodRol', codRol, { DesRol: desRol, IdeState: ideActivo }, 'TRol');
    }

    console.log('\nSeed de roles del dashboard (SALES/PORTFOLIO) completo.');
    console.log('Asigná estos roles a los usuarios que correspondan desde la pantalla de Usuarios.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
