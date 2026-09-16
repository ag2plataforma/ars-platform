#!/usr/bin/env node
/**
 * Crea (o rota la contraseña de) un usuario administrador de arranque.
 *
 * El esquema `ars_platform` migrado solo trae catálogos/referencia
 * (SState, etc.), no usuarios de aplicación — sin esto no hay forma de
 * hacer el primer POST /auth/login contra iam-service.
 *
 * Uso:
 *   node packages/database/scripts/seed-admin-user.js [codUser] [password]
 *
 * Por defecto: codUser="admin", password aleatoria generada e impresa
 * por consola (para no dejar una contraseña fija predecible en el repo).
 * Se puede correr varias veces: si el usuario ya existe, solo se le
 * agrega una fila nueva en TUserCredential con la password indicada
 * (el login siempre usa la credencial más reciente).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// El DATABASE_URL vive en el .env de iam-service (no hay uno propio en
// packages/database) — mismo patrón que db/run-migration.js.
loadEnvFile(path.resolve(__dirname, '../../../services/iam-service/.env'));

async function main() {
  const codUser = process.argv[2] || 'admin';
  const password = process.argv[3] || crypto.randomBytes(9).toString('base64url');

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'No se encontró DATABASE_URL. Verifica services/iam-service/.env (debe apuntar a ?schema=ars_platform).',
    );
  }

  const prisma = new PrismaClient();
  try {
    const activeState = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
    if (!activeState) {
      throw new Error(
        'No existe SState con CodState="ACTIVO" en ars_platform. Revisa el catálogo de estados antes de seedear.',
      );
    }

    const now = new Date();
    const system = 'seed-script';

    let rol = await prisma.tRol.findUnique({ where: { CodRol: 'ADMIN' } });
    if (!rol) {
      rol = await prisma.tRol.create({
        data: {
          CodRol: 'ADMIN',
          DesRol: 'Administrador',
          IdeState: activeState.IdeState,
          UsrCreation: system,
          TstCreation: now,
          UsrModification: system,
          TstModification: now,
        },
      });
      console.log(`Rol creado: ADMIN (${rol.IdeRol})`);
    }

    let user = await prisma.tUser.findUnique({ where: { CodUser: codUser } });
    if (!user) {
      user = await prisma.tUser.create({
        data: {
          CodUser: codUser,
          UserName: codUser,
          IdeRol: rol.IdeRol,
          IdeState: activeState.IdeState,
          UserData: { lang: 'es' },
          UsrCreation: system,
          TstCreation: now,
          UsrModification: system,
          TstModification: now,
        },
      });
      console.log(`Usuario creado: ${codUser} (${user.IdeUser})`);
    } else {
      console.log(`Usuario ya existía: ${codUser} (${user.IdeUser}) — se le asigna una contraseña nueva.`);
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.tUserCredential.create({
      data: {
        IdeUser: user.IdeUser,
        Credential: hashed,
        IdeState: activeState.IdeState,
        UsrCreation: system,
        TstCreation: now,
        UsrModification: system,
        TstModification: now,
      },
    });

    console.log('\nListo. Credenciales para probar POST /auth/login:');
    console.log(`  userName: ${codUser}`);
    console.log(`  password: ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
