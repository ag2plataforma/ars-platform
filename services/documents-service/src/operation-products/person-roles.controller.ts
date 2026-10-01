import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';

/**
 * Catálogo de solo lectura de `SPersonRol` (Titular, Corredor, etc.) --
 * para que la pantalla de plantillas elija a qué rol va dirigido un
 * documento (ej. la póliza al Titular, una comisión de corretaje al
 * Corredor). No había ningún endpoint que lo expusiera todavía en
 * ningún servicio.
 */
@Controller('person-roles')
export class PersonRolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    const rows = await this.prisma.sPersonRol.findMany({ orderBy: { DesPersonRol: 'asc' } });
    return rows.map((row) => ({
      idePersonRol: row.IdePersonRol,
      codPersonRol: row.CodPersonRol,
      desPersonRol: row.DesPersonRol,
    }));
  }
}
