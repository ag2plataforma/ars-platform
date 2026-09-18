import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, SLocation } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ListLocationsDto } from './dto/list-locations.dto';

const INCLUDE = { SCountry: true } as const;

/**
 * `SLocation` (divisiones geográficas -- región/estado/ciudad, jerárquica
 * vía `IdeLocationParent`, opcionalmente ligada a un país) NO usa
 * `CatalogCrudService`: a diferencia de los catálogos "simples", su
 * unicidad real es compuesta (`CodLocation` + `IdeCountry`, confirmado
 * por `UK_SLocation_01` en el esquema) -- el mismo código puede repetirse
 * en países distintos, así que `CatalogCrudService.create` (que solo
 * sabe chequear un único código global) rechazaría códigos válidos por
 * error. Se escribe a mano, mismo criterio que `SRiskLevel` para la
 * jerarquía (`codLocationParent` -- '' desasocia, un código real
 * resuelve, no enviado deja el campo intacto).
 */
@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async findAll(query: ListLocationsDto): Promise<SLocation[]> {
    const where: Prisma.SLocationWhereInput = {};
    if (query.codCountry) {
      where.SCountry = { CodCountry: query.codCountry };
    }
    if (query.codLocationParent !== undefined) {
      where.IdeLocationParent = query.codLocationParent === '' ? null : await this.resolveParent(query.codLocationParent);
    }
    return this.prisma.sLocation.findMany({
      where,
      include: INCLUDE,
      orderBy: { DesLocation: 'asc' },
    });
  }

  async findOne(id: string): Promise<SLocation> {
    const row = await this.prisma.sLocation.findUnique({ where: { IdeLocation: id }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException(`No existe ubicación con id "${id}"`);
    }
    return row;
  }

  async create(dto: CreateLocationDto, actor: string): Promise<SLocation> {
    const ideCountry = dto.codCountry ? await this.resolveCountry(dto.codCountry) : null;
    const ideLocationParent = dto.codLocationParent ? await this.resolveParent(dto.codLocationParent) : null;

    const existing = await this.prisma.sLocation.findFirst({
      where: { CodLocation: dto.codLocation, IdeCountry: ideCountry },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una ubicación con código "${dto.codLocation}" para ese país`,
      );
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();
    return this.prisma.sLocation.create({
      data: {
        CodLocation: dto.codLocation,
        DesLocation: dto.desLocation,
        IdeCountry: ideCountry,
        IdeLocationParent: ideLocationParent,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateLocationDto, actor: string): Promise<SLocation> {
    await this.findOne(id);
    const data: Prisma.SLocationUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.desLocation !== undefined) data.DesLocation = dto.desLocation;
    if (dto.codLocationParent !== undefined) {
      data.IdeLocationParent = dto.codLocationParent === '' ? null : await this.resolveParent(dto.codLocationParent);
    }
    return this.prisma.sLocation.update({ where: { IdeLocation: id }, data, include: INCLUDE });
  }

  async setState(id: string, codState: string, actor: string): Promise<SLocation> {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.sLocation.update({
      where: { IdeLocation: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: INCLUDE,
    });
  }

  private async resolveCountry(codCountry: string): Promise<string> {
    const country = await this.prisma.sCountry.findFirst({ where: { CodCountry: codCountry } });
    if (!country) {
      throw new NotFoundException(`No existe país con código "${codCountry}"`);
    }
    return country.IdeCountry;
  }

  private async resolveParent(codLocationParent: string): Promise<string> {
    const parent = await this.prisma.sLocation.findFirst({ where: { CodLocation: codLocationParent } });
    if (!parent) {
      throw new NotFoundException(`No existe ubicación padre con código "${codLocationParent}"`);
    }
    return parent.IdeLocation;
  }
}
