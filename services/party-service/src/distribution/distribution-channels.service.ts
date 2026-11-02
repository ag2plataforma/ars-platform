import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, SDistributionChannel } from '@ars-platform/database';
import { CatalogCrudService, StateMachineService } from '@ars-platform/shared-common';
import { CreateDistributionChannelDto } from './dto/create-distribution-channel.dto';
import { UpdateDistributionChannelDto } from './dto/update-distribution-channel.dto';

const INCLUDE = {
  SChannelType: true,
  SDistributionChannel: true, // padre (self-relation)
  TBroker: true,
  TPerson: true,
  SState: true,
} as const;

/**
 * `SDistributionChannel` -- el otro prerequisito de `CreateQuoteDto`
 * (junto con `SDistributionWay`) que ningún servicio exponía por API
 * todavía (ver el comentario en `brokers.service.ts`, que ya lo daba
 * por "asumido sembrado", igual que `SBrokerType`).
 *
 * `SChannelType`, `TBroker` y `TPerson` se resuelven acá mismo (sin
 * llamada HTTP entre servicios, mismo criterio que `BrokersService`)
 * porque los tres son accesibles desde este mismo servicio.
 * `IdeDistributionChannelParent` arma una jerarquía opcional, igual
 * que `IdeRiskLevelParent`/`IdeInsuranceAreaParent` en
 * product-rating-service: `''` desasocia, un código real resuelve, y
 * `undefined` deja el campo intacto.
 */
@Injectable()
export class DistributionChannelsService {
  private readonly crud: CatalogCrudService<SDistributionChannel>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {
    this.crud = new CatalogCrudService<SDistributionChannel>(
      prisma.sDistributionChannel,
      'CodDistributionChannel',
      'DesDistributionChannel',
      'IdeDistributionChannel',
      'canal de distribución',
      INCLUDE,
    );
  }

  findAll(): Promise<SDistributionChannel[]> {
    return this.crud.findAll();
  }

  findOne(id: string): Promise<SDistributionChannel> {
    return this.crud.findOne(id);
  }

  async create(dto: CreateDistributionChannelDto, actor: string): Promise<SDistributionChannel> {
    const extra = await this.buildExtra(dto, null);
    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    return this.crud.create(
      dto.codDistributionChannel,
      dto.desDistributionChannel,
      extra,
      activeStateId,
      actor,
    );
  }

  async update(id: string, dto: UpdateDistributionChannelDto, actor: string): Promise<SDistributionChannel> {
    const extra = await this.buildExtra(dto, id);
    return this.crud.update(id, dto.desDistributionChannel, extra, actor);
  }

  async setState(id: string, codState: string, actor: string): Promise<SDistributionChannel> {
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.crud.setState(id, stateId, actor);
  }

  private async buildExtra(
    dto: CreateDistributionChannelDto | UpdateDistributionChannelDto,
    idSelf: string | null,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {};
    if (dto.image !== undefined) extra.Image = dto.image;

    if (dto.codChannelType !== undefined) {
      if (dto.codChannelType === '') {
        extra.IdeChannelType = null;
      } else {
        const channelType = await this.prisma.sChannelType.findFirst({
          where: { CodChannelType: dto.codChannelType },
        });
        if (!channelType) {
          throw new NotFoundException(`No existe tipo de canal con código "${dto.codChannelType}"`);
        }
        extra.IdeChannelType = channelType.IdeChannelType;
      }
    }

    if (dto.codDistributionChannelParent !== undefined) {
      if (dto.codDistributionChannelParent === '') {
        extra.IdeDistributionChannelParent = null;
      } else {
        const parent = await this.prisma.sDistributionChannel.findFirst({
          where: { CodDistributionChannel: dto.codDistributionChannelParent },
        });
        if (!parent) {
          throw new NotFoundException(
            `No existe canal de distribución padre con código "${dto.codDistributionChannelParent}"`,
          );
        }
        if (idSelf) await this.assertNoCycle(idSelf, parent.IdeDistributionChannel);
        extra.IdeDistributionChannelParent = parent.IdeDistributionChannel;
      }
    }

    if (dto.codBroker !== undefined) {
      if (dto.codBroker === '') {
        extra.IdeBroker = null;
      } else {
        const broker = await this.prisma.tBroker.findFirst({ where: { CodBroker: dto.codBroker } });
        if (!broker) {
          throw new NotFoundException(`No existe broker con código "${dto.codBroker}"`);
        }
        extra.IdeBroker = broker.IdeBroker;
      }
    }

    if (dto.idePerson !== undefined) {
      if (dto.idePerson === '') {
        extra.IdePerson = null;
      } else {
        const person = await this.prisma.tPerson.findUnique({ where: { IdePerson: dto.idePerson } });
        if (!person) {
          throw new NotFoundException(`No existe persona con id "${dto.idePerson}"`);
        }
        extra.IdePerson = dto.idePerson;
      }
    }

    return extra;
  }

  /**
   * La jerarquia no puede tener ciclos: un canal no puede ser su propio padre ni colgar de uno de sus descendientes.
   * Se recorre la cadena de ancestros del nuevo padre; si aparece el propio canal, se rechaza.
   */
  private async assertNoCycle(idSelf: string, ideNewParent: string): Promise<void> {
    let current: string | null = ideNewParent;
    const seen = new Set<string>();
    while (current) {
      if (current === idSelf) {
        throw new BadRequestException(
          'Un canal no puede depender de si mismo ni de uno de sus propios canales hijos (la jerarquia no admite ciclos)',
        );
      }
      if (seen.has(current)) return; // ciclo preexistente ajeno a este cambio: no se sigue
      seen.add(current);
      const row: { IdeDistributionChannelParent: string | null } | null = await this.prisma.sDistributionChannel.findUnique({
        where: { IdeDistributionChannel: current },
        select: { IdeDistributionChannelParent: true },
      });
      current = row?.IdeDistributionChannelParent ?? null;
    }
  }
}
