import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { CatalogsModule } from './catalogs/catalogs.module';
import { DomainModule } from './domain/domain.module';
import { RatesModule } from './rates/rates.module';

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
    CatalogsModule, // CRUD de los 8 catálogos simples (SRiskLevel, SRisk, SRiskType, SCurrency, SInsuranceArea, SInsuranceLine, SDeductibleType, SLimitType)
    DomainModule, // CRUD de las 7 entidades de dominio (SProduct, SRiskProduct, SPlanProduct, SPlanProductRisk, SCoverage, SCoveragePlan, SCalculationRule)
    RatesModule, // CRUD de tablas de tarifa (SRateTable, SRateFactor, SRateValue) -- sin el equivalente a FGetRateValue todavia
  ],
  controllers: [HealthController],
})
export class AppModule {}
