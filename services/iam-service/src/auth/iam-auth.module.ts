import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor/two-factor.service';

/**
 * Emisión de tokens (login). Distinto del `AuthModule` de shared-common
 * (que solo VERIFICA tokens y aplica el guard global): este módulo es
 * específico de iam-service, el único servicio con acceso de escritura a
 * `TUserCredential`.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET no está configurado. Defínelo en el .env antes de arrancar.',
          );
        }
        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService],
})
export class IamAuthModule {}
