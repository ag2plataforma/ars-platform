import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { FieldCatalogModule } from './field-catalog/field-catalog.module';
import { AttributeEngineModule } from './attribute-engine/attribute-engine.module';
import { CommonCatalogsModule } from './common-catalogs/common-catalogs.module';
import { RequirementsModule } from './requirements/requirements.module';
import { I18nModule } from './i18n/i18n.module';
import { SetupModule } from './setup/setup.module';

/**
 * Módulos de negocio reales de este servicio: `FieldCatalogModule`
 * (`SFieldDictionary`/`SFieldValue`) y `AttributeEngineModule` (motor de
 * atributos personalizables + flujo configurable de cotización -- ver
 * ese módulo para el alcance exacto). El resto sigue siendo scaffold --
 * ver README.md de este servicio y docs/02-roadmap.md para lo que falta
 * migrar en Fase 2.
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
    FieldCatalogModule,
    AttributeEngineModule,
    CommonCatalogsModule,
    RequirementsModule,
    I18nModule,
    SetupModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
