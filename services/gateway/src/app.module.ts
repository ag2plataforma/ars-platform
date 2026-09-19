import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { ProxyModule } from './proxy/proxy.module';

/**
 * Sin PrismaModule a propósito: un BFF/gateway no tiene su propio modelo
 * de datos, enruta y agrega respuestas de los otros servicios (ver
 * README.md de este servicio y docs/00-arquitectura.md §2/§6).
 * `ProxyModule` es la primera versión real: proxy simple 1:1 por
 * servicio (`/iam/*`, `/party/*`, etc.), sin agregación todavía -- ver
 * su doc comment y docs/02-roadmap.md para el detalle de alcance.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    AuthModule, // guard JWT global — mismo JWT_SECRET que iam-service, este servicio solo VERIFICA/propaga tokens
    ProxyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
