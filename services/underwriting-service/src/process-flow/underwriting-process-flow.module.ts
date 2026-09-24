import { Module } from '@nestjs/common';
import { ProcessFlowModule, PROCESS_FLOW_RESOLVER } from '@ars-platform/shared-common';
import { PrismaProcessFlowResolver } from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que `UnderwritingSocialImpactModule` (ver
 * ese archivo) para el puerto `PROCESS_FLOW_RESOLVER` -- `QuotesService`
 * lo usa para la pregunta "¿el paso Impacto Social está activo para
 * este producto/canal según el flujo configurado?" (ver el doc-comment
 * de `ProcessFlowResolver` en `@ars-platform/shared-common` para el
 * análisis completo), resuelta EN PROCESO
 * (`PrismaProcessFlowResolver` lee `SProductProcessFlow`/`SFlowStep`
 * directamente vía Prisma, sin llamada HTTP) -- decisión explícita del
 * usuario (2026-09-23).
 */
const processFlow = ProcessFlowModule.forRoot({
  provide: PROCESS_FLOW_RESOLVER,
  useClass: PrismaProcessFlowResolver,
});

@Module({
  imports: [processFlow],
  exports: [processFlow],
})
export class UnderwritingProcessFlowModule {}
