import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { CreateProductConsentDto } from './dto/create-product-consent.dto';
import { ListProductConsentsDto } from './dto/list-product-consents.dto';

export interface ProductConsentRow {
  IdeProductConsent: string;
  IdeProduct: string;
  IdeConsent: string;
  CodAction: string;
  CodConsent: string;
  DesConsent: string;
  IndMandatory: boolean;
  NumOrder: number;
  TstInitial: Date;
  TstEnd: Date;
  CodState: string;
}

/**
 * `SProductConsent` -- qué consentimientos del catálogo (`SConsent`,
 * party-service) debe aceptar el tomador para una acción (hoy `PAGO`: la
 * landing de pago) de un producto. `underwriting-service` lee estas filas al
 * armar la landing y solo muestra las activas y vigentes. La tabla la crea
 * `packages/database/scripts/setup-payment-links.js` (SQL crudo hasta
 * regenerar el cliente Prisma).
 */
@Injectable()
export class ProductConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProductConsentsDto): Promise<ProductConsentRow[]> {
    const codProduct = query.codProduct ?? null;
    return this.prisma.$queryRaw<ProductConsentRow[]>`
      SELECT pc."IdeProductConsent", pc."IdeProduct", pc."IdeConsent", pc."CodAction",
             c."CodConsent", c."DesConsent", c."IndMandatory", c."NumOrder", c."TstInitial", c."TstEnd",
             s."CodState"
        FROM ars_platform."SProductConsent" pc
        JOIN ars_platform."SConsent" c ON c."IdeConsent" = pc."IdeConsent"
        JOIN ars_platform."SState" s ON s."IdeState" = c."IdeState"
        JOIN ars_platform."SProduct" p ON p."IdeProduct" = pc."IdeProduct"
       WHERE (${codProduct}::text IS NULL OR p."CodProduct" = ${codProduct})
       ORDER BY c."NumOrder", c."DesConsent"`;
  }

  async create(dto: CreateProductConsentDto, actor: string): Promise<ProductConsentRow> {
    const [product, consent] = await Promise.all([
      this.prisma.sProduct.findFirst({ where: { CodProduct: dto.codProduct }, select: { IdeProduct: true } }),
      this.prisma.sConsent.findUnique({ where: { CodConsent: dto.codConsent }, select: { IdeConsent: true } }),
    ]);
    if (!product) throw new NotFoundException(`No existe producto con código "${dto.codProduct}"`);
    if (!consent) throw new NotFoundException(`No existe consentimiento con código "${dto.codConsent}"`);

    const codAction = dto.codAction ?? 'PAGO';
    const now = new Date();
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO ars_platform."SProductConsent"
        ("IdeProduct", "IdeConsent", "CodAction", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
      VALUES (${product.IdeProduct}::uuid, ${consent.IdeConsent}::uuid, ${codAction}, ${actor}, ${now}, ${actor}, ${now})
      ON CONFLICT ("IdeProduct", "IdeConsent", "CodAction") DO NOTHING`;
    if (inserted === 0) throw new ConflictException('Ese consentimiento ya está asignado al producto para esa acción');

    const rows = await this.findAll({ codProduct: dto.codProduct });
    return rows.find((r) => r.IdeConsent === consent.IdeConsent && r.CodAction === codAction)!;
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM ars_platform."SProductConsent" WHERE "IdeProductConsent" = ${id}::uuid`;
    if (deleted === 0) throw new NotFoundException(`No existe la asignación de consentimiento "${id}"`);
    return { deleted: true };
  }
}
