import { Module } from '@nestjs/common';
import { ProductRatingStateMachineModule } from '../state-machine/product-rating-state-machine.module';

import { RiskLevelsController } from './risk-levels.controller';
import { RiskLevelsService } from './risk-levels.service';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';
import { RiskTypesController } from './risk-types.controller';
import { RiskTypesService } from './risk-types.service';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { InsuranceAreasController } from './insurance-areas.controller';
import { InsuranceAreasService } from './insurance-areas.service';
import { InsuranceLinesController } from './insurance-lines.controller';
import { InsuranceLinesService } from './insurance-lines.service';
import { DeductibleTypesController } from './deductible-types.controller';
import { DeductibleTypesService } from './deductible-types.service';
import { LimitTypesController } from './limit-types.controller';
import { LimitTypesService } from './limit-types.service';

/**
 * Los 8 catálogos "simples" necesarios para poder configurar
 * `SProduct`/`SCoverage`/`SCoveragePlan` sin tocar la base de datos a
 * mano (ver `CatalogCrudService` en `@ars-platform/shared-common` para
 * el porqué de la clase genérica que comparten). `SProduct`/`SRiskProduct`/`SPlanProduct`/
 * `SPlanProductRisk`/`SCoverage`/`SCoveragePlan`/`SCalculationRule`
 * (las 7 entidades "reales" del dominio) quedan para una siguiente
 * fase — ver docs/02-roadmap.md.
 */
@Module({
  imports: [ProductRatingStateMachineModule], // StateMachineService, usado por los 8 *.service.ts
  controllers: [
    RiskLevelsController,
    RisksController,
    RiskTypesController,
    CurrenciesController,
    InsuranceAreasController,
    InsuranceLinesController,
    DeductibleTypesController,
    LimitTypesController,
  ],
  providers: [
    RiskLevelsService,
    RisksService,
    RiskTypesService,
    CurrenciesService,
    InsuranceAreasService,
    InsuranceLinesService,
    DeductibleTypesService,
    LimitTypesService,
  ],
})
export class CatalogsModule {}
