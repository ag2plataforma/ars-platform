import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@ars-platform/shared-common';
import { ProxyService } from './proxy.service';

/**
 * Proxy fiel hacia `product-rating` (ver `ProxyService`) -- solo `health` es
 * público, igual que en el servicio real; todo lo demás exige el mismo
 * JWT que ya exige `product-rating-service` directamente.
 */
@Controller('product-rating')
export class ProductRatingProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Public()
  @All('health')
  health(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('product-rating', req, res);
  }

  @All('*')
  catchAll(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('product-rating', req, res);
  }
}
