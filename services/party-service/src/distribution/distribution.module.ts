import { Module } from '@nestjs/common';
import { PartyStateMachineModule } from '../state-machine/party-state-machine.module';
import { ChannelTypesController } from './channel-types.controller';
import { ChannelTypesService } from './channel-types.service';
import { DistributionChannelsController } from './distribution-channels.controller';
import { DistributionChannelsService } from './distribution-channels.service';
import { DistributionWaysController } from './distribution-ways.controller';
import { DistributionWaysService } from './distribution-ways.service';

/**
 * Cuarta parte del alcance de `party-service` (ver `BrokersModule` para
 * las primeras tres): los catálogos de distribución que hasta ahora
 * ningún servicio exponía por API -- `SChannelType`,
 * `SDistributionChannel` y `SDistributionWay` (ver el comentario en
 * `brokers.service.ts`, que ya los daba por "asumidos sembrados", igual
 * que `SBrokerType`). Hacen falta como prerequisito real de Cotización:
 * `CreateQuoteDto.codDistributionChannel`/`codDistributionWay`
 * (`underwriting-service`/`quotes.service.ts`) los resuelve por código
 * contra estas mismas tablas.
 *
 * Van en `party-service` y no en `product-rating-service` porque
 * `SDistributionChannel` referencia `TBroker`/`TPerson`, y este
 * servicio ya los resuelve localmente sin llamada HTTP entre servicios
 * (mismo criterio que `BrokersModule`/`PersonsModule`).
 */
@Module({
  imports: [PartyStateMachineModule],
  controllers: [ChannelTypesController, DistributionChannelsController, DistributionWaysController],
  providers: [ChannelTypesService, DistributionChannelsService, DistributionWaysService],
})
export class DistributionModule {}
