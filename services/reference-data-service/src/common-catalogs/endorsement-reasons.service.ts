import { Injectable } from '@nestjs/common';
import { PrismaService, SEndorsementReason } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreateEndorsementReasonDto } from './dto/create-endorsement-reason.dto';
import { UpdateEndorsementReasonDto } from './dto/update-endorsement-reason.dto';

/**
 * Catálogo común simple, mismo patrón que `EndorsementsService` (ver su
 * doc-comment). `SEndorsementReason` es el motivo puntual dentro de un
 * tipo de endoso (ej., para Anulación: "Solicitud del cliente"/"Falta de
 * pago"/"Error en la emisión").
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class EndorsementReasonsService {
  private readonly crud: CatalogCrudService<SEndorsementReason>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SEndorsementReason>(
      prisma.sEndorsementReason,
      'CodEndorsementReason',
      'DesEndorsementReason',
      'IdeEndorsementReason',
      'motivo de endoso',
      INCLUDE,
    );
  }

  findAll(): Promise<SEndorsementReason[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SEndorsementReason> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateEndorsementReasonDto, actor: string): Promise<SEndorsementReason> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codEndorsementReason, dto.desEndorsementReason, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateEndorsementReasonDto, actor: string): Promise<SEndorsementReason> {
    return this.crud.update(id, dto.desEndorsementReason, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SEndorsementReason> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
