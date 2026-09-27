#!/usr/bin/env node
/**
 * Siembra los roles y la máquina de estados REAL (no un placeholder de
 * prueba, a diferencia de `seed-contract-testing-fixtures.js`) para
 * Fase 4 (Siniestros), Etapa 2 -- flujo de aprobación -- 2026-09-24.
 *
 * Qué siembra:
 *
 *  1. Tres roles nuevos en `TRol` (hoy solo existe "ADMIN", ver
 *     `seed-admin-user.js`): `CLAIMS_ADJUSTER` (ajustador, nivel 1),
 *     `CLAIMS_MANAGER` (jefe de siniestros, nivel 2), `CLAIMS_DIRECTOR`
 *     (gerencia, nivel 3) -- acordados con el usuario, códigos en inglés
 *     igual que "ADMIN".
 *
 *  2. Estados nuevos (`SState`) y la máquina de estados de:
 *     - `TClaimFile` (la "carpeta" de siniestro, objeto principal que ve
 *       el usuario en pantalla): Declarado -> En revisión de requisitos
 *       -> En evaluación -> Aprobado/Rechazado -> Pagado -> Cerrado
 *       (+ Reabierto). ESTA ENTIDAD SALIÓ de `NO_TRANSITION_ENTITIES` en
 *       `seed-contract-testing-fixtures.js` -- este script limpia el
 *       marcador de estado inicial obsoleto que apuntaba a
 *       `SEED_BORRADOR` (mismo criterio de `markInitial`, copiado de
 *       ese script) y lo reemplaza por "Declarado".
 *     - `TApproval` (cabecera de una aprobación -- agrupa el pago de
 *       varias coberturas): Pendiente -> Cerrada. Se cierra cuando
 *       TODAS sus `TApprovalDetail` llegan a un estado final
 *       (Aprobado o Rechazado) -- lo decide `ApprovalService`, no esta
 *       máquina.
 *     - `TApprovalDetail` (decisión POR COBERTURA -- el usuario pidió
 *       evaluar el escalamiento por cobertura individual, no por el
 *       total de la carpeta): Pendiente nivel 1 -> Pendiente nivel 2 ->
 *       Pendiente nivel 3 -> Aprobado/Rechazado. Qué nivel hace falta
 *       para una fila concreta lo decide `SClaimApprovalThreshold`
 *       (catálogo aparte, ver `migrate-claims-etapa2-schema.js`) contra
 *       el `ApprovedAmount` de esa cobertura -- esta máquina solo valida
 *       que la transición sea legal, no decide el nivel requerido.
 *
 *  Deliberadamente NO se les da máquina propia (se quedan "sin
 *  transición", ver `seed-contract-testing-fixtures.js`):
 *  `TClaim`/`TClaimRisk`/`TCoverageProvision`/`TClaimRequirement`
 *  (ya así desde Etapa 1) y `TGuaranteeProvision`/`TClaimPayment`
 *  (nacen directamente "Activo", agregadas a `CATALOG_ACTIVE_ENTITIES`).
 *
 * Requiere haber corrido antes `migrate-claims-etapa2-schema.js` (crea
 * las tablas `SClaimApprovalThreshold`/`TClaimPayment` que este script
 * NO toca -- los umbrales se configuran por pantalla, no se siembran
 * acá) y tener ya corrido `seed-contract-testing-fixtures.js` al menos
 * una vez (de ahí sale el `SState` "ACTIVO"/"SEED_BORRADOR" que este
 * script reutiliza).
 *
 * Idempotente (mismo patrón findOrCreateByCode/findOrCreateStateRule
 * que seed-contract-testing-fixtures.js). Se puede correr varias veces
 * sin efecto.
 *
 * Uso (desde la raíz del repo):
 *   node packages/database/scripts/seed-claims-approval-workflow.js
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

// CodRol -> DesRol (roles nuevos de Siniestros, Etapa 2).
const CLAIMS_ROLES = [
  { codRol: 'CLAIMS_ADJUSTER', desRol: 'Ajustador de siniestros' },
  { codRol: 'CLAIMS_MANAGER', desRol: 'Jefe de siniestros' },
  { codRol: 'CLAIMS_DIRECTOR', desRol: 'Gerencia de siniestros' },
];

// CodState -> DesState (estados nuevos, sin prefijo "[SEED]" porque son
// la máquina REAL, no un fixture de prueba -- mismo criterio que
// "Aceptado"/"Contratado" en seed-contract-testing-fixtures.js).
const CLAIM_FILE_STATES = {
  DECLARADO: 'Declarado',
  EN_REVISION_REQUISITOS: 'En revisión de requisitos',
  EN_EVALUACION: 'En evaluación',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  PAGADO: 'Pagado',
  CERRADO: 'Cerrado',
  REABIERTO: 'Reabierto',
};

const APPROVAL_STATES = {
  PENDIENTE: 'Pendiente',
  CERRADA: 'Cerrada',
};

const APPROVAL_DETAIL_STATES = {
  PENDIENTE_NIVEL_1: 'Pendiente nivel 1 (ajustador)',
  PENDIENTE_NIVEL_2: 'Pendiente nivel 2 (jefe de siniestros)',
  PENDIENTE_NIVEL_3: 'Pendiente nivel 3 (gerencia)',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

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
      throw new Error(
        'No existe SState con CodState="ACTIVO". Correr primero seed-contract-testing-fixtures.js.',
      );
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

    // --- 1. Roles ---
    const roles = {};
    for (const { codRol, desRol } of CLAIMS_ROLES) {
      roles[codRol] = await findOrCreateByCode('tRol', 'CodRol', codRol, { DesRol: desRol, IdeState: ideActivo }, 'TRol');
    }

    // --- 2. Estados ---
    const claimFileStateIds = {};
    for (const [code, des] of Object.entries(CLAIM_FILE_STATES)) {
      const row = await findOrCreateByCode('sState', 'CodState', code, { DesState: des }, 'SState (TClaimFile)');
      claimFileStateIds[code] = row.IdeState;
    }
    const approvalStateIds = {};
    for (const [code, des] of Object.entries(APPROVAL_STATES)) {
      const row = await findOrCreateByCode('sState', 'CodState', code, { DesState: des }, 'SState (TApproval)');
      approvalStateIds[code] = row.IdeState;
    }
    const approvalDetailStateIds = {};
    for (const [code, des] of Object.entries(APPROVAL_DETAIL_STATES)) {
      const row = await findOrCreateByCode('sState', 'CodState', code, { DesState: des }, 'SState (TApprovalDetail)');
      approvalDetailStateIds[code] = row.IdeState;
    }

    // --- 3. Máquina de estados: SEntity + SStateRule ---
    async function findOrCreateEntity(codEntity) {
      return findOrCreateByCode('sEntity', 'CodEntity', codEntity, { DesEntity: codEntity, IdeState: ideActivo }, 'SEntity');
    }

    async function findOrCreateStateRule(codEntity, ideStateFrom, ideStateTo, desOperativeCode, indInitialState) {
      const entity = await findOrCreateEntity(codEntity);
      const existing = await prisma.sStateRule.findFirst({
        where: { IdeEntity: entity.IdeEntity, IdeStateFrom: ideStateFrom, IdeStateTo: ideStateTo, DesOperativeCode: desOperativeCode },
      });
      if (existing) {
        console.log(`= SStateRule ya existía (${codEntity}, op=${desOperativeCode})`);
        return existing;
      }
      const created = await prisma.sStateRule.create({
        data: {
          IdeEntity: entity.IdeEntity,
          IdeStateFrom: ideStateFrom,
          IdeStateTo: ideStateTo,
          IndInitialState: indInitialState,
          DesOperativeCode: desOperativeCode,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log(`+ SStateRule creada (${codEntity}, op=${desOperativeCode}, inicial=${indInitialState})`);
      return created;
    }

    // Igual que en seed-contract-testing-fixtures.js: si la entidad ya
    // tenía un marcador de estado inicial apuntando a OTRO estado (caso
    // real: TClaimFile venía de "sin transición" -> SEED_BORRADOR), se
    // elimina antes de crear el nuevo, para no dejar dos filas
    // IndInitialState=true (getInitialState no determinaría cuál usar).
    async function markInitial(codEntity, ideStateInitial) {
      const entity = await findOrCreateEntity(codEntity);
      const stale = await prisma.sStateRule.findMany({
        where: { IdeEntity: entity.IdeEntity, IndInitialState: true, NOT: { IdeStateFrom: ideStateInitial } },
      });
      for (const row of stale) {
        await prisma.sStateRule.delete({ where: { IdeStateRule: row.IdeStateRule } });
        console.log(`- SStateRule inicial obsoleta eliminada (${codEntity}, apuntaba a otro estado)`);
      }
      return findOrCreateStateRule(codEntity, ideStateInitial, ideStateInitial, null, true);
    }

    // --- TClaimFile ---
    const cf = claimFileStateIds;
    await markInitial('TClaimFile', cf.DECLARADO);
    await findOrCreateStateRule('TClaimFile', cf.DECLARADO, cf.EN_REVISION_REQUISITOS, 'ENVIAR_A_REVISION', false);
    await findOrCreateStateRule('TClaimFile', cf.EN_REVISION_REQUISITOS, cf.EN_EVALUACION, 'ENVIAR_A_EVALUACION', false);
    await findOrCreateStateRule('TClaimFile', cf.REABIERTO, cf.EN_EVALUACION, 'ENVIAR_A_EVALUACION', false);
    await findOrCreateStateRule('TClaimFile', cf.EN_EVALUACION, cf.APROBADO, 'APROBAR', false);
    await findOrCreateStateRule('TClaimFile', cf.EN_EVALUACION, cf.RECHAZADO, 'RECHAZAR', false);
    await findOrCreateStateRule('TClaimFile', cf.APROBADO, cf.PAGADO, 'PAGAR', false);
    await findOrCreateStateRule('TClaimFile', cf.PAGADO, cf.CERRADO, 'CERRAR', false);
    await findOrCreateStateRule('TClaimFile', cf.RECHAZADO, cf.CERRADO, 'CERRAR', false);
    await findOrCreateStateRule('TClaimFile', cf.CERRADO, cf.REABIERTO, 'REABRIR', false);

    // --- TApproval (cabecera) ---
    const ap = approvalStateIds;
    await markInitial('TApproval', ap.PENDIENTE);
    await findOrCreateStateRule('TApproval', ap.PENDIENTE, ap.CERRADA, 'CERRAR', false);

    // --- TApprovalDetail (decisión por cobertura) ---
    const ad = approvalDetailStateIds;
    await markInitial('TApprovalDetail', ad.PENDIENTE_NIVEL_1);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_1, ad.PENDIENTE_NIVEL_2, 'ESCALAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_2, ad.PENDIENTE_NIVEL_3, 'ESCALAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_1, ad.APROBADO, 'APROBAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_2, ad.APROBADO, 'APROBAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_3, ad.APROBADO, 'APROBAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_1, ad.RECHAZADO, 'RECHAZAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_2, ad.RECHAZADO, 'RECHAZAR', false);
    await findOrCreateStateRule('TApprovalDetail', ad.PENDIENTE_NIVEL_3, ad.RECHAZADO, 'RECHAZAR', false);

    console.log('\nSeed de Etapa 2 (Siniestros) -- roles + máquina de estados -- completo.');
    console.log(`Roles: ${Object.keys(roles).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
