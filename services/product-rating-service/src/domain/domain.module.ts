import { Module } from '@nestjs/common';
import { ProductRatingStateMachineModule } from '../state-machine/product-rating-state-machine.module';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { RiskProductsController } from './risk-products.controller';
import { RiskProductsService } from './risk-products.service';
import { PlanProductsController } from './plan-products.controller';
import { PlanProductsService } from './plan-products.service';
import { PlanProductRisksController } from './plan-product-risks.controller';
import { PlanProductRisksService } from './plan-product-risks.service';
import { CoveragesController } from './coverages.controller';
import { CoveragesService } from './coverages.service';
import { CoveragePlansController } from './coverage-plans.controller';
import { CoveragePlansService } from './coverage-plans.service';
import { CalculationRulesController } from './calculation-rules.controller';
import { CalculationRulesService } from './calculation-rules.service';

/**
 * Las 7 entidades "de dominio" (a diferencia de los 8 catálogos de
 * `../catalogs`, estas SÍ dependen unas de otras: Producto > RiskProduct
 * > PlanProduct > PlanProductRisk > CoveragePlan, más Coverage y
 * CalculationRule). Jerarquía real para dar de alta un producto completo:
 *
 *   1. POST /products                (SProduct)
 *   2. POST /risk-products           (SRiskProduct — Producto + Riesgo + TipoRiesgo)
 *   3. POST /plan-products           (SPlanProduct — bajo un Producto)
 *   4. POST /plan-product-risks      (SPlanProductRisk — une Plan + RiskProduct)
 *   5. POST /coverages               (SCoverage — independiente, por línea de seguro)
 *   6. POST /coverage-plans          (SCoveragePlan — Cobertura dentro de un PlanProductRisk, con reglas de negocio)
 *   7. POST /calculation-rules       (SCalculationRule — fórmulas sobre un CoveragePlan)
 *
 * Con esto, `db:seed-example-rules` (packages/database/scripts/) deja de
 * ser necesario para nada que no sea un ejemplo rápido de referencia.
 */
@Module({
  imports: [ProductRatingStateMachineModule],
  controllers: [
    ProductsController,
    RiskProductsController,
    PlanProductsController,
    PlanProductRisksController,
    CoveragesController,
    CoveragePlansController,
    CalculationRulesController,
  ],
  providers: [
    ProductsService,
    RiskProductsService,
    PlanProductsService,
    PlanProductRisksService,
    CoveragesService,
    CoveragePlansService,
    CalculationRulesService,
  ],
})
export class DomainModule {}
