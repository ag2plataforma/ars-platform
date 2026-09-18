import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, STextContent } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateTextContentDto } from './dto/create-text-content.dto';

const INCLUDE = {
  SLanguage: true,
  STranslator: { include: { SLanguage: true, SState: true }, orderBy: { TstCreation: 'asc' as const } },
} as const;

/**
 * `STextContent` -- sin `Cod`/`Des` propio (no es un catálogo con nombre,
 * es un grupo de traducción anónimo), así que se escribe a mano. No hay
 * ninguna función PL/pgSQL real que resolver acá (se confirmó que
 * `FGetSiteMap`, el único candidato investigado, no usa `STextContent`
 * para nada -- ver `docs/02-roadmap.md`): es CRUD puro.
 */
@Injectable()
export class TextContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  findAll(): Promise<STextContent[]> {
    return this.prisma.sTextContent.findMany({ include: INCLUDE, orderBy: { TstCreation: 'desc' } });
  }

  async findOne(id: string): Promise<STextContent> {
    const row = await this.prisma.sTextContent.findUnique({ where: { IdeTextContent: id }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException(`No existe grupo de traducción con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateTextContentDto, actor: string): Promise<STextContent> {
    let ideLanguage: string | undefined;
    if (dto.codLanguage) {
      const language = await this.prisma.sLanguage.findFirst({ where: { CodLanguage: dto.codLanguage } });
      if (!language) {
        throw new NotFoundException(`No existe idioma con código "${dto.codLanguage}"`);
      }
      ideLanguage = language.IdeLanguage;
    }
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sTextContent.create({
      data: {
        IdeLanguage: ideLanguage,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async setState(id: string, codState: string, actor: string): Promise<STextContent> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sTextContent.update({
      where: { IdeTextContent: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }
}
