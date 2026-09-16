import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';

/**
 * Scaffold minimo. Sin PrismaModule a proposito: un BFF/gateway no tiene
 * su propio modelo de datos, enruta y agrega respuestas de los otros
 * servicios (ver README.md de este servicio y docs/00-arquitectura.md
 * §2/§6). Cuando exista logica real de proxy/agregacion, este modulo
 * crece con eso, no con acceso a Postgres.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    AuthModule, // guard JWT global — mismo JWT_SECRET que iam-service, este servicio solo VERIFICA/propaga tokens
  ],
  controllers: [HealthController],
})
export class AppModule {}
