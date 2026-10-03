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
 * Activar/desactivar (`setState`): en `SState` conviven 'ACTIVO' y
 * 'Activo' con casings distintos según quién los sembró, así que
 * "inactiva" se define SOLO por el código 'INACTIVO' (el mismo que usan
 * los catálogos genéricos, usuarios e impacto social) y cualquier otro
 * estado cuenta como activa -- ver `INACTIVE_STATE_CODE`.
 */
/** Único código de `SState` que marca una plantilla como desactivada. */
const INACTIVE_STATE_CODE = 'INACTIVO';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findByOperationProduct(ideOperationProduct: string) {
    const rows = await this.prisma.sOperationProductTemplate.findMany({
      where: { IdeOperationProduct: ideOperationProduct },
      include: {
        SPersonRol: { select: { DesPersonRol: true } },
        SState: { select: { CodState: true } },
      },
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
      isActive: row.SState?.CodState !== INACTIVE_STATE_CODE,
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

  /** Activa/desactiva una plantilla. `active=false` usa el código
   *  'INACTIVO'; `active=true` vuelve a 'Activo' (el mismo que asigna
   *  `create`, garantizado a existir). */
  async setState(ideOperationProductTemplate: string, active: boolean, actor: string) {
    const existing = await this.prisma.sOperationProductTemplate.findUnique({
      where: { IdeOperationProductTemplate: ideOperationProductTemplate },
    });
    if (!existing) {
      throw new NotFoundException(`No existe la plantilla "${ideOperationProductTemplate}"`);
    }
    const ideState = await this.stateMachine.getStateByCode(active ? 'Activo' : INACTIVE_STATE_CODE);
    await this.prisma.sOperationProductTemplate.update({
      where: { IdeOperationProductTemplate: ideOperationProductTemplate },
      data: { IdeState: ideState, UsrModification: actor, TstModification: new Date() },
    });
    return { ideOperationProductTemplate, isActive: active };
  }

  /** Resuelve la plantilla a usar para generar un documento (ver
   *  GenerationService): la primera ACTIVA que matchee producto+
   *  operación+tipo+rol, por `NumOrder` (las desactivadas con
   *  'INACTIVO' se saltean). */
  async resolveForGeneration(
    ideOperationProduct: string | string[],
    codTemplateType: string,
    idePersonRol: string,
  ) {
    const template = await this.prisma.sOperationProductTemplate.findFirst({
      where: {
        IdeOperationProduct: Array.isArray(ideOperationProduct) ? { in: ideOperationProduct } : ideOperationProduct,
        CodTemplateType: codTemplateType,
        IdePersonRol: idePersonRol,
        SState: { CodState: { not: INACTIVE_STATE_CODE } },
      },
      orderBy: { NumOrder: 'asc' },
    });
    if (!template || !template.TemplateFile) {
      throw new ConflictException(
        `No hay una plantilla configurada de tipo "${codTemplateType}" para ese producto/operación/rol (o están todas desactivadas)`,
      );
    }
    return template;
  }
}
