import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule, EmailModule, SmsModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { OperationProductsModule } from './operation-products/operation-products.module';
import { TemplatesModule } from './templates/templates.module';
import { GenerationModule } from './generation/generation.module';
import { QueueModule } from './queue/queue.module';

/**
 * Servicio nuevo (2026-10-01): "Gestión de plantillas de documentos
 * físicos" (ver docs/02-roadmap.md, item 5). Decisión explícita del
 * usuario tras evaluar reusar `ag2-printer-api` (v1, Python/Flask, no
 * desplegado hoy): construir un servicio propio del monorepo, mismo
 * patrón que el resto (scaffold idéntico a `product-rating-service`),
 * en vez de depender de desplegar/mantener un segundo stack aparte.
 *
 * `OperationProductsModule`: catálogo de solo lectura para la pantalla
 * de plantillas (qué operaciones existen configuradas para un producto).
 * `TemplatesModule`: CRUD de `SOperationProductTemplate` (qué .docx usar
 * por producto+operación+rol+tipo de documento).
 * `GenerationModule`: arma el PDF real para un contrato puntual
 * (`renderDocxTemplate` + `convertDocxToPdf`, ver `src/rendering/`) y lo
 * guarda en `TContractOperationDocument`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    PrismaModule,
    AuthModule, // guard JWT global — mismo JWT_SECRET que iam-service, este servicio solo VERIFICA tokens
    EmailModule, // EMAIL_SENDER (Brevo) -- correo de bienvenida con la póliza adjunta al activar un contrato
    SmsModule, // SMS_SENDER (Brevo SMS) -- SMS de bienvenida y avisos de renovación desde la cola
    OperationProductsModule,
    TemplatesModule,
    GenerationModule,
    QueueModule, // cola de tareas en segundo plano (correo de bienvenida, generación de documentos)
  ],
  controllers: [HealthController],
})
export class AppModule {}
