import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { BillingModule } from './billing/billing.module';

/**
 * Primer módulo de negocio real: BillingModule (solo lectura sobre
 * recibos/TReceipt y períodos de facturación/TContractBilling -- ver su
 * comentario de cabecera y docs/02-roadmap.md para el detalle completo de
 * la decisión de alcance).
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
    PrismaModule,
    AuthModule, // guard JWT global — mismo JWT_SECRET que iam-service, este servicio solo VERIFICA tokens
    BillingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
