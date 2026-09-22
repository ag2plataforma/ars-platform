import { Module } from '@nestjs/common';
import { SocialImpactStateMachineModule } from '../state-machine/social-impact-state-machine.module';
import { SocialImpactConfigController } from './social-impact-config.controller';
import { SocialImpactConfigService } from './social-impact-config.service';

/**
 * `SocialImpactConfigService` depende de `StateMachineService` -- hay
 * que importar acá el módulo que lo expone (`SocialImpactStateMachineModule`),
 * no alcanza con que ambos estén importados como "hermanos" en
 * `AppModule`: Nest resuelve las dependencias de un provider dentro de
 * su propio módulo o de los módulos que ese módulo importa, nunca
 * "hacia arriba" (mismo gotcha ya documentado para `StateMachineModule`,
 * ver ese archivo en `@ars-platform/shared-common`).
 */
@Module({
  imports: [SocialImpactStateMachineModule],
  controllers: [SocialImpactConfigController],
  providers: [SocialImpactConfigService],
})
export class SocialImpactConfigModule {}
