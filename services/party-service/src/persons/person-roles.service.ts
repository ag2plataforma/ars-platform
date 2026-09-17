import { Injectable } from '@nestjs/common';
import { PrismaService, SPersonRol } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreatePersonRoleDto } from './dto/create-person-role.dto';
import { UpdatePersonRoleDto } from './dto/update-person-role.dto';

/**
 * `SPersonRol` -- catálogo de roles de persona, confirmado contra datos
 * reales (`packages/database/scripts/investigate-party-service.js`):
 * TOMADOR, TITULAR, BENEFICIARIO, ASEGURADO (4 filas en producción, sin
 * seed/constante en el repo antes de esta investigación). Consumido por
 * `TQuotePerson`/`TContractPerson`/`TContractFilePerson`/`TFileRiskPerson`
 * (join de persona+cotización/contrato+rol) -- esa asociación es del
 * ítem siguiente del roadmap (resumen/aceptación de cotización en
 * underwriting-service), no de este.
 */
@Injectable()
export class PersonRolesService {
  private readonly crud: CatalogCrudService<SPersonRol>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SPersonRol>(
      this.prisma.sPersonRol,
      'CodPersonRol',
      'DesPersonRol',
      'IdePersonRol',
      'rol de persona',
    );
  }

  findAll(): Promise<SPersonRol[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SPersonRol> {
    return this.crud.findOne(id);
  }

  async create(dto: CreatePersonRoleDto, actor: string): Promise<SPersonRol> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codPersonRol,
      dto.desPersonRol,
      { IdeTextContent: dto.ideTextContent },
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdatePersonRoleDto, actor: string): Promise<SPersonRol> {
    const extra: Record<string, unknown> = {};
    if (dto.ideTextContent !== undefined) extra.IdeTextContent = dto.ideTextContent;
    return this.crud.update(id, dto.desPersonRol, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SPersonRol> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
