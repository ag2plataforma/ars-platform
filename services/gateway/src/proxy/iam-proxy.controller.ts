import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@ars-platform/shared-common';
import { ProxyService } from './proxy.service';

/**
 * Único servicio cuyo proxy necesita rutas explícitamente públicas: sin
 * `auth/login` accesible sin token, nadie podría obtener uno para
 * empezar (ver `AuthController` real en `iam-service`, mismos 4 casos
 * `@Public()` que ya tiene ahí -- `change-password` NO es público a
 * propósito, requiere estar autenticado).
 */
@Controller('iam')
export class IamProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Public()
  @All('health')
  health(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('iam', req, res);
  }

  @Public()
  @All('auth/login')
  login(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('iam', req, res);
  }

  @Public()
  @All('auth/forgot-password')
  forgotPassword(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('iam', req, res);
  }

  @Public()
  @All('auth/reset-password')
  resetPassword(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('iam', req, res);
  }

  @All('*')
  catchAll(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('iam', req, res);
  }
}
