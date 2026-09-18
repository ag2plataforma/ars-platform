import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TBroker } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateBrokerDto } from './dto/create-broker.dto';
import { UpdateBrokerDto } from './dto/update-broker.dto';

const INCLUDE = { SBrokerType: true } as const;

/**
 * `TBroker` -- confirmado contra el código real (`full_dump.txt`, todas
 * las copias del esquema): NO tiene función PL/pgSQL propia de
 * escritura, solo aparece leído vía `FGetIdeDesc('TBroker', ...)` dentro
 * de consultas de solo lectura (`GETJSONBY`). Es CRUD directo de la
 * capa LoopBack original, igual que `TPerson`/`TQuote`. `Cod`/`Des`
 * únicos + `IdeState`, así que reutiliza `CatalogCrudService`.
 *
 * `SBrokerType` (`codBrokerType`) y `TPerson` (`idePerson`) se
 * resuelven acá mismo (sin llamada HTTP entre servicios, mismo criterio
 * que `TQuotePerson`/`SPersonRol` en `underwriting-service`) -- ninguno
 * de los dos tiene CRUD propio todavía: `SBrokerType` se asume ya
 * sembrado (como `SDistributionChannel`/`SProcess`, catálogos que
 * tampoco tienen CRUD todavía), y `TPerson` ya lo gestiona
 * `PersonsModule` de este mismo servicio.
 */
@Injectable()
export class BrokersService {
  private readonly crud: CatalogCrudService<TBroker>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<TBroker>(
      prisma.tBroker,
      'CodBroker',
      'DesBroker',
      'IdeBroker',
      'broker',
      INCLUDE,
    );
  }

  findAll(): Promise<TBroker[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<TBroker> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateBrokerDto, actor: string): Promise<TBroker> {
    const ideBrokerType = await this.resolveBrokerType(dto.codBrokerType);
    await this.resolvePerson(dto.idePerson);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codBroker,
      dto.desBroker,
      { IdeBrokerType: ideBrokerType, IdePerson: dto.idePerson },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateBrokerDto, actor: string): Promise<TBroker> {
    const extra: Record<string, unknown> = {};
    if (dto.codBrokerType !== undefined) {
      extra.IdeBrokerType = await this.resolveBrokerType(dto.codBrokerType);
    }
    if (dto.idePerson !== undefined) {
      await this.resolvePerson(dto.idePerson);
      extra.IdePerson = dto.idePerson;
    }
    return this.crud.update(id, dto.desBroker, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<TBroker> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveBrokerType(codBrokerType: string): Promise<string> {
    const brokerType = await this.prisma.sBrokerType.findFirst({ where: { CodBrokerType: codBrokerType } });
    if (!brokerType) {
      throw new NotFoundException(`No existe tipo de broker con código "${codBrokerType}"`);
    }
    return brokerType.IdeBrokerType;
  }

  private async resolvePerson(idePerson: string): Promise<void> {
    const person = await this.prisma.tPerson.findUnique({ where: { IdePerson: idePerson } });
    if (!person) {
      throw new NotFoundException(`No existe persona con id "${idePerson}"`);
    }
  }
}
