import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SEntity } from '@ars-platform/database';

/**
 * `SEntity` -- catálogo de tipos de objeto de negocio del propio código
 * (ej. "TQuoteRisk", "TClient" -- 113 filas reales confirmadas en la
 * investigación). De solo lectura por ahora: crear una fila nueva acá no
 * hace nada útil sin el soporte correspondiente en código, a diferencia
 * del resto de los catálogos de este módulo, que sí son configuración
 * pura. Ver docs/02-roadmap.md.
 */
@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<SEntity[]> {
    return this.prisma.sEntity.findMany({ orderBy: { DesEntity: 'asc' } });
  }

  async findOne(id: string): Promise<SEntity> {
    const row = await this.prisma.sEntity.findUnique({ where: { IdeEntity: id } });
    if (!row) {
      throw new NotFoundException(`No existe entidad con id "${id}"`);
    }
    return row;
  }
}
