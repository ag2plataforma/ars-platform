import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@ars-platform/shared-common';
import { ProxyService } from './proxy.service';

/**
 * Proxy fiel hacia `claims` (ver `ProxyService`) -- solo `health` es
 * público, igual que en el servicio real; todo lo demás exige el mismo
 * JWT que ya exige `claims-service` directamente.
 */
@Controller('claims')
export class ClaimsProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Public()
  @All('health')
  health(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('claims', req, res);
  }

  @All('*')
  catchAll(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('claims', req, res);
  }
}
