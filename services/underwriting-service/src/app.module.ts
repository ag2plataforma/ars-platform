import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { QuotingModule } from './quoting/quoting.module';
import { ContractsModule } from './contracts/contracts.module';
import { BackgroundJobsModule } from './background-jobs/background-jobs.module';
import { RenewalsModule } from './renewals/renewals.module';

/**
 * Fase 1 de su migracion real ya en marcha: motor de cotizacion
 * (QuotingModule) y cascada de creacion de contrato (ContractsModule,
 * "el trabajo de mayor riesgo del proyecto" -- ver docs/02-roadmap.md y
 * el README de este servicio para el detalle de alcance/lo
 * deliberadamente diferido). El resto sigue como scaffold minimo, misma
 * plantilla que product-rating-service/iam-service.
 *
 * `ScheduleModule.forRoot()` -- Etapa 3 de "Gestión de renovaciones"
 * (ver docs/02-roadmap.md): habilita `SchedulerRegistry` para la
 * infraestructura GENÉRICA de trabajos en segundo plano
 * (`BackgroundJobsModule`), de la que `RenewalsModule` es el primer
 * consumidor real (`RenewalBatchJobHandler`).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Ruta absoluta a partir de __dirname (no relativa al cwd del
      // proceso) — mismo gotcha ya resuelto en iam-service, ver su
      // app.module.ts / README raíz para el detalle completo.
      envFilePath: join(__dirname, '..', '.env'),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule, // guard JWT global — mismo JWT_SECRET que iam-service, este servicio solo VERIFICA tokens
    QuotingModule,
    ContractsModule,
    BackgroundJobsModule,
    RenewalsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
