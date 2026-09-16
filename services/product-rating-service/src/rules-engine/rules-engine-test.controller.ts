import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RulesEngineService } from '@ars-platform/shared-common';
import { ApplicableRulesQueryDto } from './dto/applicable-rules-query.dto';
import { EvaluateRulesDto } from './dto/evaluate-rules.dto';

/**
 * Controller temporal para validar en caliente el motor de reglas contra
 * Postgres real, igual que `StateMachineTestController` en iam-service.
 * No es API de negocio — se retira cuando exista el CRUD real de
 * cotización/cobertura que lo use (underwriting-service/product-rating-service,
 * Fase 2).
 *
 * Requiere Bearer token (como cualquier ruta sin @Public()).
 *
 * Hoy no hay `SCalculationRule` cargadas en `ars_platform` (la migración
 * no trajo datos de configuración) — estos endpoints están listos para
 * probarse en cuanto exista al menos una regla configurada.
 *
 * Ejemplo:
 *   GET /rules-engine/applicable-rules?ideCoveragePlan=<uuid>
 *   POST /rules-engine/evaluate
 *     { "ideCoveragePlan": "...", "origin": "Quote",
 *       "ideOriginRisk": "...", "ideCoverageOrMovement": "..." }
 */
@Controller('rules-engine')
export class RulesEngineTestController {
  constructor(private readonly rulesEngine: RulesEngineService) {}

  @Get('applicable-rules')
  getApplicableRules(@Query() query: ApplicableRulesQueryDto) {
    return this.rulesEngine.getApplicableRules({
      ideProduct: query.ideProduct ?? null,
      idePlanProductRisk: query.idePlanProductRisk ?? null,
      ideCoveragePlan: query.ideCoveragePlan,
    });
  }

  @Post('evaluate')
  async evaluate(@Body() dto: EvaluateRulesDto) {
    const rules = await this.rulesEngine.getApplicableRules({
      ideProduct: dto.ideProduct ?? null,
      idePlanProductRisk: dto.idePlanProductRisk ?? null,
      ideCoveragePlan: dto.ideCoveragePlan,
    });
    return this.rulesEngine.evaluateChain(rules, {
      origin: dto.origin,
      ideOriginRisk: dto.ideOriginRisk,
      ideCoverageOrMovement: dto.ideCoverageOrMovement,
    });
  }
}
