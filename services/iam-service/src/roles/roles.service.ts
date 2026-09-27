import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { PrismaService, TRol } from '@ars-platform/database';

/**
 * Listado de solo lectura de `TRol` -- agregado 2026-09-24 (Fase 4,
 * Etapa 2). Hasta ahora `TRol` se creaba solo por script de seed (ver
 * `seed-admin-user.js`/`seed-claims-approval-workflow.js`), sin ningún
 * endpoint que lo listara -- la pantalla nueva de "Umbrales de
 * aprobación" (reference-data-service) necesita poder elegir un rol
 * real. Deliberadamente SIN create/update/setState todavía -- gestionar
 * roles desde la pantalla no fue parte del alcance acordado, solo
 * poder LEERLOS para asignarlos en otro catálogo.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<TRol[]> {
    return this.prisma.tRol.findMany({ include: { SState: true }, orderBy: { DesRol: 'asc' } });
  }

  async findOne(id: string): Promise<TRol> {
    const row = await this.prisma.tRol.findUnique({ where: { IdeRol: id }, include: { SState: true } });
    if (!row) throw new NotFoundException(`No existe rol con id "${id}"`);
    return row;
  }
}
