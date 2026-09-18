import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, STranslator } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';
import { ListTranslationsDto } from './dto/list-translations.dto';

const INCLUDE = { SLanguage: true, SState: true } as const;

/**
 * `STranslator` -- una traducción puntual (`DesTranslation`/`Short`/
 * `Large`) de un `STextContent` a un idioma. Único real por
 * (`IdeTextContent`, `IdeLanguage`) -- `UK_STranslator_01` -- se
 * chequea antes de insertar para dar un error claro en vez de dejar
 * que reviente la constraint de Postgres.
 */
@Injectable()
export class TranslationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findAll(query: ListTranslationsDto): Promise<STranslator[]> {
    const where: Prisma.STranslatorWhereInput = {};
    if (query.ideTextContent) where.IdeTextContent = query.ideTextContent;
    if (query.codLanguage) where.SLanguage = { CodLanguage: query.codLanguage };
    return this.prisma.sTranslator.findMany({ where, include: INCLUDE, orderBy: { TstCreation: 'asc' } });
  }

  async findOne(id: string): Promise<STranslator> {
    const row = await this.prisma.sTranslator.findUnique({ where: { IdeTranslator: id }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException(`No existe traducción con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateTranslationDto, actor: string): Promise<STranslator> {
    const textContent = await this.prisma.sTextContent.findUnique({ where: { IdeTextContent: dto.ideTextContent } });
    if (!textContent) {
      throw new NotFoundException(`No existe grupo de traducción con id "${dto.ideTextContent}"`);
    }
    const language = await this.prisma.sLanguage.findFirst({ where: { CodLanguage: dto.codLanguage } });
    if (!language) {
      throw new NotFoundException(`No existe idioma con código "${dto.codLanguage}"`);
    }
    const existing = await this.prisma.sTranslator.findFirst({
      where: { IdeTextContent: dto.ideTextContent, IdeLanguage: language.IdeLanguage },
    });
    if (existing) {
      throw new ConflictException('Ya existe una traducción para ese grupo de texto en ese idioma');
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sTranslator.create({
      data: {
        IdeTextContent: dto.ideTextContent,
        IdeLanguage: language.IdeLanguage,
        DesTranslation: dto.desTranslation,
        DesTranslationShort: dto.desTranslationShort,
        DesTranslationLarge: dto.desTranslationLarge,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTranslationDto, actor: string): Promise<STranslator> {
    await this.findOne(id);
    const data: Prisma.STranslatorUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.desTranslation !== undefined) data.DesTranslation = dto.desTranslation;
    if (dto.desTranslationShort !== undefined) data.DesTranslationShort = dto.desTranslationShort;
    if (dto.desTranslationLarge !== undefined) data.DesTranslationLarge = dto.desTranslationLarge;
    return this.prisma.sTranslator.update({ where: { IdeTranslator: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<STranslator> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sTranslator.update({
      where: { IdeTranslator: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }
}
