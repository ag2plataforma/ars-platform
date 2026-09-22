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
 * `PrismaRateValueResolver` se registra directamente acá para que
 * `RateValuesService` lo inyecte sin duplicar la lógica de búsqueda --
 * `underwriting-service` tiene su propio binding independiente como
 * `RATE_VALUE_RESOLVER` (`UnderwritingRulesEngineModule`) para el motor
 * de reglas real; el `ProductRatingRulesEngineModule`/`/rules-engine/*`
 * de prueba que existía acá se retiró (ver docs/02-roadmap.md), ya
 * cumplida la condición de su propio doc-comment: "se retira cuando
 * exista el CRUD real de cotización/cobertura que lo use".
 */
@Module({
  imports: [ProductRatingStateMachineModule],
  controllers: [RateTablesController, RateFactorsController, RateValuesController],
  providers: [RateTablesService, RateFactorsService, RateValuesService, PrismaRateValueResolver],
})
export class RatesModule {}
