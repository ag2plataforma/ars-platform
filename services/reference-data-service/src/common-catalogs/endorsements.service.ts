import { Injectable } from '@nestjs/common';
import { PrismaService, SEndorsement } from '@ars-platform/database';
import { StateMachineService, CatalogCrudService } from '@ars-platform/shared-common';
import { CreateEndorsementDto } from './dto/create-endorsement.dto';
import { UpdateEndorsementDto } from './dto/update-endorsement.dto';

/**
 * Catálogo común simple (`Cod`/`Des`/`IdeState` + auditoría, sin FK
 * propia), mismo patrón que `PaymentTypesService`. Agregado 2026-09-28
 * (backlog priorizado, ítem 1: "Gestión de movimientos y suplementos del
 * contrato", Etapa 1 -- cierre de Anulación). `SEndorsement` ("tipo de
 * endoso", ej. Anulación/Cambio de datos/Aumento de suma asegurada) ya
 * existía en el esquema y `ContractsService.cancel()` ya lo consume vía
 * `SProductEndorsement.IdeEndorsement`, pero no tenía ningún CRUD/pantalla
 * -- solo una fila de prueba sembrada por script (`SEED_ENDORSEMENT`,
 * ver `packages/database/scripts/seed-cancelcontract-fixtures.js`).
 */
const INCLUDE = { SState: true } as const;

@Injectable()
export class EndorsementsService {
  private readonly crud: CatalogCrudService<SEndorsement>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SEndorsement>(
      prisma.sEndorsement,
      'CodEndorsement',
      'DesEndorsement',
      'IdeEndorsement',
      'tipo de endoso',
      INCLUDE,
    );
  }

  findAll(): Promise<SEndorsement[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SEndorsement> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateEndorsementDto, actor: string): Promise<SEndorsement> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codEndorsement, dto.desEndorsement, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateEndorsementDto, actor: string): Promise<SEndorsement> {
    return this.crud.update(id, dto.desEndorsement, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SEndorsement> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
