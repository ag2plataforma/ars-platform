import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { SaveCollectiveTiersDto } from './dto/save-collective-tiers.dto';

export interface CollectiveTierRow {
  IdeProductCollectiveTier: string;
  NumFrom: number;
  NumTo: number | null;
  AmtPerInsured: number;
}

/**
 * Tramos de la prima ÚNICA de un producto colectivo (`SProductCollectiveTier`, ver
 * `setup-collective-tiers.js`): "desde N hasta M asegurados -> importe anual por asegurado".
 * `underwriting-service` los lee al cotizar/contratar/hacer suplementos/renovar. SQL crudo hasta
 * regenerar el cliente Prisma. Se guardan todos de una vez (reemplazo completo), validando que
 * sean contiguos desde 1 y que solo el último quede sin tope.
 */
@Injectable()
export class CollectiveTiersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(codProduct: string): Promise<CollectiveTierRow[]> {
    const product = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct }, select: { IdeProduct: true } });
    if (!product) throw new NotFoundException(`No existe producto con código "${codProduct}"`);
    return this.list(product.IdeProduct);
  }

  private async list(ideProduct: string): Promise<CollectiveTierRow[]> {
    const rows = await this.prisma.$queryRaw<Array<Omit<CollectiveTierRow, 'AmtPerInsured'> & { AmtPerInsured: string }>>`
      SELECT "IdeProductCollectiveTier", "NumFrom", "NumTo", "AmtPerInsured"::text AS "AmtPerInsured"
        FROM ars_platform."SProductCollectiveTier"
       WHERE "IdeProduct" = ${ideProduct}::uuid
       ORDER BY "NumFrom"`;
    return rows.map((r) => ({ ...r, AmtPerInsured: Number(r.AmtPerInsured) }));
  }

  async save(codProduct: string, dto: SaveCollectiveTiersDto, actor: string): Promise<CollectiveTierRow[]> {
    const product = await this.prisma.sProduct.findFirst({ where: { CodProduct: codProduct }, select: { IdeProduct: true } });
    if (!product) throw new NotFoundException(`No existe producto con código "${codProduct}"`);

    const tiers = [...dto.tiers]
      .map((t) => ({ numFrom: t.numFrom, numTo: t.numTo ?? null, amtPerInsured: t.amtPerInsured }))
      .sort((a, b) => a.numFrom - b.numFrom);
    tiers.forEach((t, i) => {
      const n = i + 1;
      if (i === 0 && t.numFrom !== 1) throw new BadRequestException('El primer tramo tiene que empezar en 1 asegurado');
      if (t.numTo !== null && t.numTo < t.numFrom) throw new BadRequestException(`Tramo ${n}: "hasta" no puede ser menor que "desde"`);
      if (i < tiers.length - 1) {
        if (t.numTo === null) throw new BadRequestException(`Tramo ${n}: solo el último tramo puede quedar sin tope`);
        if (tiers[i + 1].numFrom !== t.numTo + 1) {
          throw new BadRequestException(`Los tramos ${n} y ${n + 1} no son contiguos (el siguiente debe empezar en ${t.numTo + 1})`);
        }
      }
    });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM ars_platform."SProductCollectiveTier" WHERE "IdeProduct" = ${product.IdeProduct}::uuid`;
      for (const t of tiers) {
        await tx.$executeRaw`
          INSERT INTO ars_platform."SProductCollectiveTier"
            ("IdeProduct", "NumFrom", "NumTo", "AmtPerInsured", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
          VALUES (${product.IdeProduct}::uuid, ${t.numFrom}, ${t.numTo}, ${t.amtPerInsured}, ${actor}, ${now}, ${actor}, ${now})`;
      }
    });
    return this.list(product.IdeProduct);
  }
}
