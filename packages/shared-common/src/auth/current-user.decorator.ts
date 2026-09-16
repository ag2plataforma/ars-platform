import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Inyecta el payload del JWT ya validado (`req.user`, poblado por
 * `JwtStrategy`) en un parámetro del controller: `@CurrentUser() user: JwtPayload`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
