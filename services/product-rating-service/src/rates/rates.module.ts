import { Module } from '@nestjs/common';
import { PrismaRateValueResolver } from '@ars-platform/database';
import { ProductRatingStateMachineModule } from '../state-machine/product-rating-state-machine.module';

import { RateTablesController } from './rate-tables.controller';
import { RateTablesService } from './rate-tables.service';
import { RateFactorsController } from './rate-factors.controller';
import { RateFactorsService } from './rate-factors.service';
import { RateValuesController } from './rate-values.controller';
import { RateValuesService } from './rate-values.service';

/**
 * CRUD de configuración de `SRateTable`/`SRateFactor`/`SRateValue`
 * (tablas de tarifa multidimensional, hasta 5 factores) + `getRateValue`
 * (equivalente exacto a `FGetRateValue`, ver `rate-values.service.ts`).
 * `PrismaRateValueResolver` se registra también acá (además de en
 * `ProductRatingRulesEngineModule`, donde se enlaza al motor de reglas
 * como `RATE_VALUE_RESOLVER`) para que `RateValuesService` lo inyecte
 * directamente y no duplique la lógica de búsqueda.
 */
@Module({
  imports: [ProductRatingStateMachineModule],
  controllers: [RateTablesController, RateFactorsController, RateValuesController],
  providers: [RateTablesService, RateFactorsService, RateValuesService, PrismaRateValueResolver],
})
export class RatesModule {}
