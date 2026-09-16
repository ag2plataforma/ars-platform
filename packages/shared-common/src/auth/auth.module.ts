import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Autenticación JWT compartida por todos los servicios: cada request HTTP
 * requiere un Bearer token válido por defecto (guard global), salvo las
 * rutas marcadas con `@Public()` (health checks, login).
 *
 * Este módulo solo VERIFICA tokens — misma firma/secreto para todos los
 * servicios. La EMISIÓN de tokens (login, comparación de contraseña con
 * bcrypt) vive únicamente en iam-service, el único servicio con acceso de
 * escritura a `TUserCredential`. Cualquier otro servicio solo necesita
 * importar este módulo para quedar protegido, sin volver a implementar
 * nada.
 *
 * También registra `RolesGuard` (después de `JwtAuthGuard`, en ese orden)
 * para el control de acceso por `@Roles(...)`.
 */
@Global()
@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PassportModule],
})
export class AuthModule {}
