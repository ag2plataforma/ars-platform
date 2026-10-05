import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AiModule, AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { CatalogsModule } from './catalogs/catalogs.module';
import { ClaimRequirementsModule } from './requirements/claim-requirements.module';
import { ClaimsModule } from './claims/claims.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { ClaimTriageModule } from './triage/claim-triage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    PrismaModule,
    AuthModule,
    AiModule, // AI_PROVIDER (Fase 4: triage de siniestros, ver ClaimTriageService)
    CatalogsModule,
    ClaimRequirementsModule,
    ClaimsModule,
    ApprovalsModule,
    ClaimTriageModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
