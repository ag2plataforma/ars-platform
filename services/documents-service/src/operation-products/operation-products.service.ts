import { Injectable } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';

/**
 * Catálogo de solo lectura de `SOperationProduct` (producto + operación
 * configurada, ej. "Alta de póliza" / CONTGENE para el producto X) --
 * son filas que ya existen, seedeadas por scripts de configuración
 * (ver packages/database/scripts/setup-renewal-operation-catalog.js para
 * un ejemplo), no hay CRUD propio para crearlas todavía. Esta pantalla
 * de plantillas solo necesita LISTARLAS para que el operador elija a
 * cuál de las operaciones ya configuradas de un producto le quiere
 * asociar una plantilla -- no inventa filas nuevas.
 */
@Injectable()
export class OperationProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(ideProduct: string) {
    const rows = await this.prisma.sOperationProduct.findMany({
      where: { IdeProduct: ideProduct },
      include: { SOperation: { select: { CodOperation: true, DesOperation: true } } },
      orderBy: { Order: 'asc' },
    });
    return rows.map((row) => ({
      ideOperationProduct: row.IdeOperationProduct,
      codOperation: row.SOperation.CodOperation,
      desOperation: row.SOperation.DesOperation,
    }));
  }
}
