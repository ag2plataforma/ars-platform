import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { QuotingModule } from './quoting/quoting.module';

/**
 * Fase 1 de su migracion real ya en marcha: motor de cotizacion
 * (QuotingModule, ver docs/02-roadmap.md y el README de este servicio
 * para el detalle de alcance/lo deliberadamente diferido). El resto
 * sigue como scaffold minimo, misma plantilla que
 * product-rating-service/iam-service.
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
    QuotingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
