import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@ars-platform/shared-common';
import { ProxyService } from './proxy.service';

/**
 * Proxy fiel hacia `party` (ver `ProxyService`) -- solo `health` es
 * público, igual que en el servicio real; todo lo demás exige el mismo
 * JWT que ya exige `party-service` directamente.
 */
@Controller('party')
export class PartyProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Public()
  @All('health')
  health(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('party', req, res);
  }

  @All('*')
  catchAll(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('party', req, res);
  }
}
