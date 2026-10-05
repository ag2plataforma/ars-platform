import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '@ars-platform/shared-common';
import { PAYMENT_GATEWAY, PaymentGateway } from '../payments/gateway/payment-gateway';
import { AcceptConsentsDto } from './dto/accept-consents.dto';
import { PaymentEventsService } from './payment-events.service';
import { PaymentLandingService } from './payment-landing.service';

/**
 * Endpoints PÚBLICOS (sin JWT) de la cobranza: la landing que abre el tomador
 * con el token del enlace y el webhook de la pasarela. El gateway los expone
 * en `/underwriting/public/payments/...`.
 */
@Public()
@Controller('public/payments')
export class PublicPaymentsController {
  constructor(
    private readonly landing: PaymentLandingService,
    private readonly events: PaymentEventsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Get('links/:token')
  view(@Param('token') token: string) {
    return this.landing.getView(token);
  }

  @Post('links/:token/consents')
  acceptConsents(@Param('token') token: string, @Body() dto: AcceptConsentsDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.ip || null;
    const userAgent = (req.headers['user-agent'] ?? '').toString().slice(0, 500) || null;
    return this.landing.acceptConsents(token, dto.ideConsents, ip, userAgent);
  }

  @Post('links/:token/checkout')
  checkout(@Param('token') token: string) {
    return this.landing.startCheckout(token);
  }

  /** Datos de la página de pago simulada (solo `PAYMENT_PROVIDER=sandbox`). */
  @Get('sandbox/:externalId')
  sandbox(@Param('externalId') externalId: string) {
    return this.landing.sandboxInfo(externalId);
  }

  /** Webhook de la pasarela: verifica y normaliza el evento y lo procesa (idempotente). */
  @Post('webhook/:provider')
  @HttpCode(200)
  async webhook(@Param('provider') provider: string, @Body() body: unknown, @Req() req: Request) {
    if (provider !== this.gateway.codProvider) throw new NotFoundException();
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const event = await this.gateway.parseWebhook(body, req.headers, rawBody);
    if (!event) return { received: true };
    return { received: true, ...(await this.events.handle(event)) };
  }
}
