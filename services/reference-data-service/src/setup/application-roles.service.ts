import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SApplicationRole } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { CatalogCrudService } from '@ars-platform/shared-common';
import { CreateApplicationRoleDto } from './dto/create-application-role.dto';
import { UpdateApplicationRoleDto } from './dto/update-application-role.dto';

const INCLUDE = { SApplication: true, SState: true } as const;

@Injectable()
export class ApplicationRolesService {
  private readonly crud: CatalogCrudService<SApplicationRole>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SApplicationRole>(
      this.prisma.sApplicationRole,
      'CodApplicationRole',
      'DesApplicationRole',
      'IdeApplicationRole',
      'rol de aplicación',
      INCLUDE,
    );
  }

  findAll(): Promise<SApplicationRole[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SApplicationRole> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateApplicationRoleDto, actor: string): Promise<SApplicationRole> {
    const ideApplication = await this.resolveApplication(dto.codApplication);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codApplicationRole,
      dto.desApplicationRole,
      { IdeApplication: ideApplication },
      activeStateId,
      actor,
    );
  }

  update(id: string, dto: UpdateApplicationRoleDto, actor: string): Promise<SApplicationRole> {
    return this.crud.update(id, dto.desApplicationRole, {}, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SApplicationRole> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async resolveApplication(codApplication: string): Promise<string> {
    const application = await this.prisma.sApplication.findFirst({ where: { CodApplication: codApplication } });
    if (!application) {
      throw new NotFoundException(`No existe aplicación con código "${codApplication}"`);
    }
    return application.IdeApplication;
  }
}
