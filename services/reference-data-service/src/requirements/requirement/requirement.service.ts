import { Injectable } from '@nestjs/common';
import { PrismaService, SRequirement } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';

const INCLUDE = { SState: true } as const;

/**
 * `SRequirement` -- catálogo simple (Cod/Des) de tipos de documento
 * exigibles ("Cédula", "Comprobante de domicilio", "Formulario de
 * declaración de salud", ...), sin FK propia. Es el "qué documento es"
 * -- la CONFIGURACIÓN de qué producto/proceso lo exige vive en
 * `SProductRequirement` (`ProductRequirementService`, mismo módulo).
 *
 * Ver el doc-comment de `ProductRequirementService` para el análisis
 * completo de la feature "Requisitos" y el alcance acordado con el
 * usuario (2026-09-24): Etapa 1 = checklist sin archivo real (sin
 * upload ni OCR -- no existe mecanismo de subida de archivos en todo el
 * monorepo, confirmado por búsqueda), scope de Cotización + Contratación
 * (Siniestros queda afuera hasta que arranque la Fase 4).
 */
@Injectable()
export class RequirementService {
  private readonly crud: CatalogCrudService<SRequirement>;

  constructor(
    prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SRequirement>(
      prisma.sRequirement,
      'CodRequirement',
      'DesRequirement',
      'IdeRequirement',
      'requisito',
      INCLUDE,
    );
  }

  findAll(): Promise<SRequirement[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SRequirement> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateRequirementDto, actor: string): Promise<SRequirement> {
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(dto.codRequirement, dto.desRequirement, {}, activeStateId, actor);
  }

  update(id: string, dto: UpdateRequirementDto, actor: string): Promise<SRequirement> {
    return this.crud.update(id, dto.desRequirement, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SRequirement> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }
}
