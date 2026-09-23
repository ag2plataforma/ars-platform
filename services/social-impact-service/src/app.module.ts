import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { SocialImpactConfigModule } from './social-impact-config/social-impact-config.module';
import { SocialImpactScoringModule } from './social-impact-scoring/social-impact-scoring.module';

/**
 * Impacto Social (Fase 3, ver docs/02-roadmap.md) -- SIP (puntos de
 * impacto social), CFP (huella de carbono) y SP (sostenibilidad), y el
 * ajuste dinámico de primas resultante. Servicio nuevo, sin equivalente
 * en v1 -- no hay legado que auditar como referencia de comportamiento.
 *
 * Etapa 1 (andamiaje): este servicio hoy solo administra qué productos
 * participan (`SocialImpactConfigModule`, CRUD de `SSocialImpactConfig`)
 * -- el cálculo real (SIP/CFP/SP y el ajuste de prima) vive en
 * `SocialImpactCalculatorService` (`@ars-platform/shared-common`) y hoy
 * lo consume `underwriting-service` EN PROCESO, leyendo esta misma tabla
 * directamente vía Prisma, no llamando a este servicio por HTTP --
 * decisión explícita del usuario (2026-09-22), ver el pendiente
 * documentado en el roadmap para cuando se reemplace por una llamada
 * real entre servicios. Este servicio sí queda disponible desde ya para
 * cualquier otro consumidor (por ejemplo, la futura Store App de
 * Fase 5) que necesite consultarlo por HTTP.
 *
 * Etapa 2 (formulas reales): SocialImpactScoringModule agrega el
 * calculo real de CFP/SIP/score combinado (SocialImpactScoringService),
 * la config de la formula (SSocialImpactScoring.FormulaJSON, mismo
 * patron que SCalculationRule.FormulaJSON) y el cliente de la API
 * externa emissions.dev (huella de carbono por electricidad). Esta
 * etapa SI introduce la llamada HTTP real entre servicios: ahora
 * underwriting-service llama a POST /social-impact-score de este
 * servicio en vez de calcular en proceso -- decision explicita del
 * usuario (2026-09-22). El endpoint queda protegido por el mismo
 * AuthModule (JWT) de arriba, reenviando el JWT del usuario.
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
    SocialImpactConfigModule,
    SocialImpactScoringModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
