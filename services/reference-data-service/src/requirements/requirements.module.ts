import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { RequirementController } from './requirement/requirement.controller';
import { RequirementService } from './requirement/requirement.service';
import { ProductRequirementController } from './product-requirement/product-requirement.controller';
import { ProductRequirementService } from './product-requirement/product-requirement.service';
import { ClaimApprovalThresholdController } from './claim-approval-threshold/claim-approval-threshold.controller';
import { ClaimApprovalThresholdService } from './claim-approval-threshold/claim-approval-threshold.service';

/**
 * Feature "Requisitos" -- checklist de documentos exigidos por producto,
 * investigada y acordada con el usuario 2026-09-24 justo después de
 * terminar "flujos de proceso configurables por producto" (ver
 * docs/02-roadmap.md). Dos piezas:
 *
 *  - `SRequirement` (`RequirementService`): catálogo simple de tipos de
 *    documento ("qué documento es").
 *  - `SProductRequirement` (`ProductRequirementService`): asigna
 *    requisitos a un producto/proceso real (+ plan/riesgo/cobertura
 *    opcionales como comodines NULL) -- ver su doc-comment para el
 *    análisis completo del modelo de resolución.
 *
 *  - `SClaimApprovalThreshold` (`ClaimApprovalThresholdService`, Fase 4,
 *    Etapa 2, 2026-09-24): umbrales configurables de escalamiento de
 *    aprobación de siniestros por producto/plan/cobertura + moneda. Ver
 *    su doc-comment (en `CreateClaimApprovalThresholdDto`) para el
 *    análisis completo -- la resolución real (cuál nivel/rol hace falta
 *    para un monto dado) vive en `claims-service` (`ApprovalsService`),
 *    acá solo está la CONFIGURACIÓN, mismo criterio que Requisitos.
 *
 * La resolución real contra una cotización/contrato concretos
 * (creación de `TQuoteRequirement`/`TContractRequirement`, checklist de
 * "entregado") vive en `underwriting-service` (`RequirementsModule` de
 * ese servicio, no este) -- acá solo está la CONFIGURACIÓN.
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [RequirementController, ProductRequirementController, ClaimApprovalThresholdController],
  providers: [RequirementService, ProductRequirementService, ClaimApprovalThresholdService],
})
export class RequirementsModule {}
