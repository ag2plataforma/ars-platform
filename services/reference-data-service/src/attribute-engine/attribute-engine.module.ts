import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { EntitiesController } from './entities/entities.controller';
import { EntitiesService } from './entities/entities.service';
import { ProcessFlowsController } from './process-flows/process-flows.controller';
import { ProcessFlowsService } from './process-flows/process-flows.service';
import { StepsController } from './steps/steps.controller';
import { StepsService } from './steps/steps.service';
import { ScreensController } from './screens/screens.controller';
import { ScreensService } from './screens/screens.service';
import { AttributesController } from './attributes/attributes.controller';
import { AttributesService } from './attributes/attributes.service';
import { ModelAttributesController } from './model-attributes/model-attributes.controller';
import { ModelAttributesService } from './model-attributes/model-attributes.service';
import { AttributePropertiesController } from './attribute-properties/attribute-properties.controller';
import { AttributePropertiesService } from './attribute-properties/attribute-properties.service';
import { FlowStepsController } from './flow-steps/flow-steps.controller';
import { FlowStepsService } from './flow-steps/flow-steps.service';

/**
 * Motor de atributos personalizables + flujo configurable de cotización,
 * confirmado contra código y datos reales (ver
 * `packages/database/scripts/investigate-attribute-engine.js` y
 * docs/02-roadmap.md). Dos partes:
 *
 *  - Configuración de atributos: `SAttribute` -> `SAttributeProperty` ->
 *    `SModelAttribute` (+ `SEntity` de solo lectura) -- esto es lo que
 *    resuelve `attribute('COD')` en el motor de reglas en tiempo de
 *    ejecución (ver `PrismaAttributeValueResolver` en
 *    `@ars-platform/database`; sin cambios ahí, ya coincide con
 *    `FGetValueAttribute` real).
 *  - Configuración del flujo/wizard: `SProcessFlow`, `SStep`, `SScreen`,
 *    `SFlowStep` -- la CONFIGURACIÓN del flujo (qué pasos existen y en
 *    qué orden), no su ejecución en una sesión concreta
 *    (`TFlowStepInstance`/`FPInstanceFlow`), que queda pendiente de que
 *    `underwriting-service` tenga el flujo real de cotización.
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [
    EntitiesController,
    ProcessFlowsController,
    StepsController,
    ScreensController,
    AttributesController,
    ModelAttributesController,
    AttributePropertiesController,
    FlowStepsController,
  ],
  providers: [
    EntitiesService,
    ProcessFlowsService,
    StepsService,
    ScreensService,
    AttributesService,
    ModelAttributesService,
    AttributePropertiesService,
    FlowStepsService,
  ],
})
export class AttributeEngineModule {}
