import { Injectable } from '@nestjs/common';
import { PrismaService, SOperation } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';

/**
 * Catálogo común simple, mismo patrón que `PaymentTypesService`. Agregado
 * 2026-09-28 junto con `SEndorsement`/`SEndorsementReason` (backlog
 * priorizado, ítem 1, Etapa 1) -- `SOperation` (ej. "Generación de
 * contrato"/"Generación de recibos"/una futura "Anulación") ya se usaba
 * internamente en `underwriting-service` (`CONTGENE`/`RECEGENE`
 * hardcodeados) pero, como ya se había notado al construir "Requisitos"
 * (24/09/2026), no existía ningún endpoint que lo listara. Hace falta acá
 * para poder elegir la operación real al configurar un
 * `SProductEndorsement` (`product-rating-service`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class OperationsService {
  private readonly crud: CatalogCrudService<SOperation>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SOperation>(
      prisma.sOperation,
      'CodOperation',
      'DesOperation',
      'IdeOperation',
      'operación',
      INCLUDE,
    );
  }

  findAll(): Promise<SOperation[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SOperation> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateOperationDto, actor: string): Promise<SOperation> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codOperation, dto.desOperation, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateOperationDto, actor: string): Promise<SOperation> {
    return this.crud.update(id, dto.desOperation, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SOperation> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
