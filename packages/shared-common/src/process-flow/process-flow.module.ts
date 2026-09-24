import { DynamicModule, Module, Provider } from '@nestjs/common';
import { PROCESS_FLOW_RESOLVER } from './process-flow.interface';

/**
 * Mismo patrón `forRoot()` que `SocialImpactModule`/`StateMachineModule`
 * (ver esos archivos): `shared-common` no depende de Prisma, cada
 * servicio conecta la implementación real
 * (`PrismaProcessFlowResolver` de `@ars-platform/database`).
 */
@Module({})
export class ProcessFlowModule {
  static forRoot(resolverProvider: Provider): DynamicModule {
    return {
      module: ProcessFlowModule,
      providers: [resolverProvider],
      exports: [PROCESS_FLOW_RESOLVER],
    };
  }
}
