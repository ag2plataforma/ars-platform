import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';

export interface MenuNode {
  Titulo: string;
  Referencia: string | null;
  Orden: number;
  Imagen: string | null;
  Nivel: number;
  Submenu?: MenuNode[];
}

/**
 * Equivalente a `FGetSiteMap('pCodApplicationRole', ...)`, confirmado
 * línea por línea contra el código fuente real (idéntico en `ag2ars`/
 * `entity`/`temporal` -- la copia de `ag2servicio` es un sistema legacy
 * completamente distinto, con sus propias tablas `ARS_APLICACION_MENU*`,
 * no relacionado).
 *
 * Algoritmo real confirmado: árbol de hasta 3 niveles de `SSiteMap`
 * (raíz = `IdeSiteMapParent IS NULL`), filtrado por `SSiteMapRole`/
 * `SApplicationRole` contra el/los código(s) de rol recibidos, ambos
 * `Activo`, ordenado por `NumOrder` ascendente en cada nivel. El título
 * sale literal de `SSiteMap.DesSiteMap` -- el original NO pasa por
 * `STextContent`/`STranslator` para nada (confirmado, ver `I18nModule`).
 * El original arma la consulta con SQL dinámico concatenando los
 * códigos de rol (riesgo de inyección ya señalado en la Fase 0) -- acá
 * se resuelve con Prisma parametrizado, mismo resultado.
 *
 * **Desviación deliberada del original** (decisión explícita del
 * usuario, ver `docs/02-roadmap.md`): si el usuario tiene varios roles
 * que comparten acceso al mismo ítem de menú, el original lo devuelve
 * DUPLICADO (sin `DISTINCT`); acá se deduplica, porque no es un cálculo
 * de negocio (como una prima) sino un menú de navegación, y consultar
 * `SSiteMap` directamente (en vez de aplanar manualmente el join) ya
 * produce cada ítem una sola vez de por sí.
 */
@Injectable()
export class SiteMapMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async getMenu(codApplicationRoleList: string): Promise<MenuNode[]> {
    const codes = codApplicationRoleList
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (codes.length === 0) {
      return [];
    }

    const roles = await this.prisma.sApplicationRole.findMany({ where: { CodApplicationRole: { in: codes } } });
    const foundCodes = new Set(roles.map((r) => r.CodApplicationRole));
    const missing = codes.filter((c) => !foundCodes.has(c));
    if (missing.length > 0) {
      throw new NotFoundException(`No existe(n) rol(es) de aplicación con código(s): ${missing.join(', ')}`);
    }
    const roleIds = roles.map((r) => r.IdeApplicationRole);

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.buildLevel(null, 1, roleIds, activeStateId);
  }

  private async buildLevel(
    parentId: string | null,
    level: number,
    roleIds: string[],
    activeStateId: string,
  ): Promise<MenuNode[]> {
    const items = await this.prisma.sSiteMap.findMany({
      where: {
        IdeSiteMapParent: parentId,
        IdeState: activeStateId,
        SSiteMapRole: { some: { IdeApplicationRole: { in: roleIds }, IdeState: activeStateId } },
      },
      orderBy: { NumOrder: 'asc' },
    });

    const nodes: MenuNode[] = [];
    for (const item of items) {
      const node: MenuNode = {
        Titulo: item.DesSiteMap,
        Referencia: item.DesPathOption ?? null,
        Orden: Number(item.NumOrder),
        Imagen: item.Image ?? null,
        Nivel: level,
      };
      // El original hardcodea exactamente 3 niveles -- no hay recursión
      // más allá de eso, replicado tal cual.
      if (level < 3) {
        node.Submenu = await this.buildLevel(item.IdeSiteMap, level + 1, roleIds, activeStateId);
      }
      nodes.push(node);
    }
    return nodes;
  }
}
