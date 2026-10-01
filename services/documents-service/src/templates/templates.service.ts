import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateTemplateDto, ReplaceTemplateFileDto } from './dto/create-template.dto';

/**
 * CRUD de `SOperationProductTemplate` -- tabla legada (ya existía en el
 * schema, nunca tuvo pantalla propia en v1) que relaciona una plantilla
 * .docx con producto+operación (`IdeOperationProduct`), rol de persona
 * destinataria y tipo de documento. `TemplateFile` (bytea, columna nueva
 * -- ver setup-document-templates-columns.js) guarda el archivo en sí;
 * `TemplateContent` (ya existía, requerido) se reusa para el nombre de
 * archivo original, solo a fin de mostrarlo en la pantalla.
 *
 * Deliberadamente SIN activar/desactivar en esta primera versión: no hay
 * ningún uso previo de esta tabla en el código (es la primera pantalla
 * que la toca) para confirmar con qué código de `SState` se seedeó acá
 * "Inactivo" -- otras partes del proyecto usan casings distintos para
 * sus propios estados ('Activo' en underwriting-service, 'ACTIVO' en los
 * catálogos genéricos de product-rating-service), así que adivinar uno
 * podría tirar un `NotFoundException` recién al probar en pantalla. Para
 * reemplazar una plantilla por ahora: `replaceFile` (sin pasar por
 * `IdeState`). Activar/desactivar queda para cuando se confirme el
 * código real.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findByOperationProduct(ideOperationProduct: string) {
    const rows = await this.prisma.sOperationProductTemplate.findMany({
      where: { IdeOperationProduct: ideOperationProduct },
      include: { SPersonRol: { select: { DesPersonRol: true } } },
      orderBy: { NumOrder: 'asc' },
    });
    return rows.map((row) => ({
      ideOperationProductTemplate: row.IdeOperationProductTemplate,
      codTemplateType: row.CodTemplateType,
      desFileName: row.TemplateContent,
      idePersonRol: row.IdePersonRol,
      desPersonRol: row.SPersonRol.DesPersonRol,
      numOrder: row.NumOrder,
      hasFile: row.TemplateFile !== null,
    }));
  }

  async create(dto: CreateTemplateDto, actor: string) {
    const ideActivo = await this.stateMachine.getStateByCode('Activo');
    const now = new Date();
    const created = await this.prisma.sOperationProductTemplate.create({
      data: {
        IdeOperationProduct: dto.ideOperationProduct,
        CodTemplateType: dto.codTemplateType,
        TemplateContent: dto.fileName,
        TemplateFile: Buffer.from(dto.fileBase64, 'base64'),
        IdePersonRol: dto.idePersonRol,
        NumOrder: dto.numOrder,
        IdeState: ideActivo,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });
    return { ideOperationProductTemplate: created.IdeOperationProductTemplate };
  }

  async replaceFile(ideOperationProductTemplate: string, dto: ReplaceTemplateFileDto, actor: string) {
    const existing = await this.prisma.sOperationProductTemplate.findUnique({
      where: { IdeOperationProductTemplate: ideOperationProductTemplate },
    });
    if (!existing) {
      throw new NotFoundException(`No existe la plantilla "${ideOperationProductTemplate}"`);
    }
    await this.prisma.sOperationProductTemplate.update({
      where: { IdeOperationProductTemplate: ideOperationProductTemplate },
      data: {
        TemplateContent: dto.fileName,
        TemplateFile: Buffer.from(dto.fileBase64, 'base64'),
        NumOrder: dto.numOrder ?? existing.NumOrder,
        UsrModification: actor,
        TstModification: new Date(),
      },
    });
    return { ideOperationProductTemplate };
  }

  /** Resuelve la plantilla a usar para generar un documento (ver
   *  GenerationService): la primera que matchee producto+operación+
   *  tipo+rol, por `NumOrder` -- sin filtrar por `IdeState` todavía
   *  (ver doc-comment de la clase: no hay activar/desactivar en esta
   *  primera versión, toda plantilla creada queda utilizable). */
  async resolveForGeneration(ideOperationProduct: string, codTemplateType: string, idePersonRol: string) {
    const template = await this.prisma.sOperationProductTemplate.findFirst({
      where: { IdeOperationProduct: ideOperationProduct, CodTemplateType: codTemplateType, IdePersonRol: idePersonRol },
      orderBy: { NumOrder: 'asc' },
    });
    if (!template || !template.TemplateFile) {
      throw new ConflictException(
        `No hay una plantilla configurada de tipo "${codTemplateType}" para ese producto/operación/rol`,
      );
    }
    return template;
  }
}
