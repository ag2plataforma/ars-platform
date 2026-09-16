import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Verifica la firma y expiración del JWT emitido por iam-service. No
 * accede a la base de datos — solo valida el token con el mismo
 * JWT_SECRET que usó iam-service para firmarlo (variable de entorno
 * obligatoria, sin valor por defecto: un secreto hardcodeado en el
 * código, como tenía el sistema v1, es justamente lo que se quiere evitar).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no está configurado. Defínelo en el .env del servicio antes de arrancar.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload & { purpose?: string }): JwtPayload {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido');
    }
    if (payload.purpose) {
      // Tokens de un solo propósito (ej. reseteo de contraseña, ver
      // AuthService.requestPasswordReset) no sirven para autenticar
      // requests normales — solo los consume el endpoint que los emitió.
      throw new UnauthorizedException('Token inválido para esta operación');
    }
    return payload;
  }
}
