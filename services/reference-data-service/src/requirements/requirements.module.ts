import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { RequirementController } from './requirement/requirement.controller';
import { RequirementService } from './requirement/requirement.service';
import { ProductRequirementController } from './product-requirement/product-requirement.controller';
import { ProductRequirementService } from './product-requirement/product-requirement.service';

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
 * La resolución real contra una cotización/contrato concretos
 * (creación de `TQuoteRequirement`/`TContractRequirement`, checklist de
 * "entregado") vive en `underwriting-service` (`RequirementsModule` de
 * ese servicio, no este) -- acá solo está la CONFIGURACIÓN.
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [RequirementController, ProductRequirementController],
  providers: [RequirementService, ProductRequirementService],
})
export class RequirementsModule {}
