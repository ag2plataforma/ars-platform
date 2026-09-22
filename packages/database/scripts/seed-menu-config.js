#!/usr/bin/env node
/**
 * Seedea la configuración MÍNIMA de menú (`SetupModule`) para que el
 * sidebar dinámico del backoffice (`GET /reference-data/site-map-menu`,
 * equivalente a `FGetSiteMap`) muestre las pantallas reales que ya
 * existen hoy en `apps/backoffice/src/app/app.routes.ts`, en vez de
 * "todavía no hay más secciones configuradas".
 *
 * Decisión explícita del usuario (ver docs/02-roadmap.md): en vez de
 * dejar 4 links fijos hardcodeados en `sidebar.component.html` +
 * secciones dinámicas aparte, se migra el sidebar completo a dinámico
 * -- este script es lo que deja la base de datos con esas pantallas ya
 * cargadas, así el sidebar no queda vacío apenas se saca el hardcodeo.
 *
 * Crea o actualiza (upsert real por código único -- idempotente, se
 * puede correr varias veces sin duplicar NI quedarse con datos viejos
 * si `SITE_MAP_ITEMS` cambia; antes solo creaba si faltaba, sin tocar
 * un ítem ya existente):
 *   - SApplication  "BACKOFFICE"       -- la app nueva del backoffice
 *   - SApplicationRole "ADMIN"         -- mismo CodRol que ya usa el
 *     usuario admin real de iam-service (`db:seed-admin-user`, `TRol`);
 *     `SiteMapMenuService.getMenu(role)` filtra `SApplicationRole` por
 *     el `CodRol` del JWT, así que tienen que coincidir literalmente
 *     para que el usuario admin vea algo.
 *   - SSiteMap, en árbol (soporta hasta 3 niveles, ver
 *     `site-map-menu.service.ts`): 6 ítems raíz (Inicio, Cotización,
 *     Catálogos, Ubicaciones, Configuración de menú, Configuración de
 *     productos) -- el último es un ítem PADRE sin `path` propio (nunca
 *     navega, el sidebar lo muestra como desplegable porque tiene
 *     hijos) con 3 hijos: Catálogos de producto, Productos y Tablas de
 *     tarifa.
 *     Decisión explícita del usuario: antes "Productos"/"Tarifas" eran
 *     ítems raíz separados y sus catálogos vivían mezclados con los 9
 *     comunes en "Catálogos" -- se agrupó todo bajo un padre para
 *     ordenar el menú (ver `docs/02-roadmap.md`).
 *   - SSiteMapRole: concede acceso de "ADMIN" a CADA ítem del árbol --
 *     el acceso NO se hereda del padre a los hijos (confirmado contra
 *     `SiteMapMenuService.buildLevel`, filtra `SSiteMapRole` en cada
 *     nivel), así que el padre también necesita su propia concesión.
 *
 * Uso: node packages/database/scripts/seed-menu-config.js
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Mismo DATABASE_URL que usan iam-service/reference-data-service.
loadEnvFile(path.resolve(__dirname, '../../../services/iam-service/.env'));

const SYSTEM = 'seed-script';

/** Calcado de `apps/backoffice/src/app/app.routes.ts` +
 * `sidebar.component.html` (links hoy fijos, que este seed reemplaza).
 * `children` opcional arma un ítem padre -- ver `upsertItem` más abajo. */
const SITE_MAP_ITEMS = [
  { cod: 'DASHBOARD', des: 'Inicio', order: 1, path: '/dashboard', icon: 'pi-home' },
  { cod: 'COTIZACION', des: 'Cotización', order: 2, path: '/cotizacion', icon: 'pi-calculator' },
  { cod: 'CATALOGOS', des: 'Catálogos', order: 3, path: '/catalogos', icon: 'pi-book' },
  { cod: 'UBICACIONES', des: 'Ubicaciones', order: 4, path: '/ubicaciones', icon: 'pi-map-marker' },
  {
    cod: 'CONFIGURACION_MENU',
    des: 'Configuración de menú',
    order: 5,
    path: '/configuracion-menu',
    icon: 'pi-sitemap',
  },
  {
    cod: 'CONFIG_PRODUCTOS',
    des: 'Configuración de productos',
    order: 6,
    path: null,
    icon: 'pi-box',
    children: [
      {
        cod: 'CATALOGOS_PRODUCTO',
        des: 'Catálogos de producto',
        order: 1,
        path: '/configuracion-productos/catalogos',
        icon: 'pi-tags',
      },
      {
        cod: 'PRODUCTOS',
        des: 'Productos',
        order: 2,
        path: '/configuracion-productos/productos',
        icon: 'pi-sitemap',
      },
      {
        cod: 'TARIFAS',
        des: 'Tablas de tarifa',
        order: 3,
        path: '/configuracion-productos/tarifas',
        icon: 'pi-percentage',
      },
    ],
  },
];

async function main() {
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
    const auditFields = { UsrCreation: SYSTEM, TstCreation: now, UsrModification: SYSTEM, TstModification: now };

    // 1) SApplication
    let application = await prisma.sApplication.findUnique({ where: { CodApplication: 'BACKOFFICE' } });
    if (!application) {
      application = await prisma.sApplication.create({
        data: {
          CodApplication: 'BACKOFFICE',
          DesApplication: 'Backoffice',
          IdeState: activeState.IdeState,
          ...auditFields,
        },
      });
      console.log(`SApplication creada: BACKOFFICE (${application.IdeApplication})`);
    } else {
      console.log(`SApplication ya existía: BACKOFFICE (${application.IdeApplication})`);
    }

    // 2) SApplicationRole -- mismo código que el CodRol real "ADMIN" (ver seed-admin-user.js).
    let applicationRole = await prisma.sApplicationRole.findUnique({
      where: { CodApplicationRole: 'ADMIN' },
    });
    if (!applicationRole) {
      applicationRole = await prisma.sApplicationRole.create({
        data: {
          CodApplicationRole: 'ADMIN',
          DesApplicationRole: 'Administrador',
          IdeApplication: application.IdeApplication,
          IdeState: activeState.IdeState,
          ...auditFields,
        },
      });
      console.log(`SApplicationRole creado: ADMIN (${applicationRole.IdeApplicationRole})`);
    } else {
      console.log(`SApplicationRole ya existía: ADMIN (${applicationRole.IdeApplicationRole})`);
    }

    // 3) SSiteMap (upsert real, en árbol) + 4) SSiteMapRole (concesión a
    // ADMIN, por cada ítem -- no se hereda del padre a los hijos).
    async function upsertItem(item, parentId, depth = 0) {
      const indent = '  '.repeat(depth + 1);
      const data = {
        DesSiteMap: item.des,
        NumOrder: item.order,
        DesPathOption: item.path,
        Image: item.icon,
        IdeSiteMapParent: parentId,
        IdeState: activeState.IdeState,
      };

      let siteMap = await prisma.sSiteMap.findUnique({ where: { CodSiteMap: item.cod } });
      if (!siteMap) {
        siteMap = await prisma.sSiteMap.create({
          data: { CodSiteMap: item.cod, ...data, ...auditFields },
        });
        console.log(`${indent}SSiteMap creado: ${item.cod} (${siteMap.IdeSiteMap})`);
      } else {
        siteMap = await prisma.sSiteMap.update({
          where: { IdeSiteMap: siteMap.IdeSiteMap },
          data: { ...data, UsrModification: SYSTEM, TstModification: new Date() },
        });
        console.log(`${indent}SSiteMap actualizado: ${item.cod} (${siteMap.IdeSiteMap})`);
      }

      const existingGrant = await prisma.sSiteMapRole.findFirst({
        where: { IdeSiteMap: siteMap.IdeSiteMap, IdeApplicationRole: applicationRole.IdeApplicationRole },
      });
      if (!existingGrant) {
        await prisma.sSiteMapRole.create({
          data: {
            IdeSiteMap: siteMap.IdeSiteMap,
            IdeApplicationRole: applicationRole.IdeApplicationRole,
            IdeState: activeState.IdeState,
            ...auditFields,
          },
        });
        console.log(`${indent}  -> concedido a ADMIN`);
      } else {
        console.log(`${indent}  -> ya estaba concedido a ADMIN`);
      }

      for (const child of item.children ?? []) {
        await upsertItem(child, siteMap.IdeSiteMap, depth + 1);
      }
    }

    for (const item of SITE_MAP_ITEMS) {
      await upsertItem(item, null);
    }

    console.log('\nListo. GET /reference-data/site-map-menu?codApplicationRole=ADMIN debería devolver el menú completo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
