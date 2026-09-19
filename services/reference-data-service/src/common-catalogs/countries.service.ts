import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SCountry } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

const INCLUDE = { SState: true, SLanguage: true } as const;

@Injectable()
export class CountriesService {
  private readonly crud: CatalogCrudService<SCountry>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SCountry>(
      this.prisma.sCountry,
      'CodCountry',
      'DesCountry',
      'IdeCountry',
      'país',
      INCLUDE,
    );
  }

  findAll(): Promise<SCountry[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SCountry> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateCountryDto, actor: string): Promise<SCountry> {
    const ideLanguage = await this.resolveLanguage(dto.codLanguage);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codCountry,
      dto.desCountry,
      { CodDDI: dto.codDDI, IdeLanguage: ideLanguage },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateCountryDto, actor: string): Promise<SCountry> {
    const extra: Record<string, unknown> = {};
    if (dto.codDDI !== undefined) extra.CodDDI = dto.codDDI;
    if (dto.codLanguage !== undefined) {
      extra.IdeLanguage = await this.resolveLanguage(dto.codLanguage);
    }
    return this.crud.update(id, dto.desCountry, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SCountry> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveLanguage(codLanguage: string): Promise<string> {
    const language = await this.prisma.sLanguage.findFirst({ where: { CodLanguage: codLanguage } });
    if (!language) {
      throw new NotFoundException(`No existe idioma con código "${codLanguage}"`);
    }
    return language.IdeLanguage;
  }
}
