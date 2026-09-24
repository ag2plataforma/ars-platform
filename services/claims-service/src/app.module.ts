import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { CatalogsModule } from './catalogs/catalogs.module';
import { ClaimRequirementsModule } from './requirements/claim-requirements.module';
import { ClaimsModule } from './claims/claims.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    PrismaModule,
    AuthModule,
    CatalogsModule,
    ClaimRequirementsModule,
    ClaimsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
