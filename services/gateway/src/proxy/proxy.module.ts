import { Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { IamProxyController } from './iam-proxy.controller';
import { PartyProxyController } from './party-proxy.controller';
import { ReferenceDataProxyController } from './reference-data-proxy.controller';
import { ProductRatingProxyController } from './product-rating-proxy.controller';
import { UnderwritingProxyController } from './underwriting-proxy.controller';
import { ClaimsProxyController } from './claims-proxy.controller';
import { BillingProxyController } from './billing-proxy.controller';
import { SocialImpactProxyController } from './social-impact-proxy.controller';

/**
 * Único punto de entrada real para ambos frontends (ver
 * `docs/00-arquitectura.md` §2/§6 y `docs/02-roadmap.md`). Alcance
 * explícito de esta primera versión, con visto bueno del usuario: proxy
 * simple 1:1 por servicio (sin agregación) -- cada controller reenvía su
 * prefijo (`/iam/*`, `/party/*`, etc.) al servicio real correspondiente
 * vía `ProxyService`, propagando el JWT tal cual. La agregación real
 * (combinar respuestas de varios servicios en una) queda deliberadamente
 * afuera hasta que una pantalla real del frontend la necesite -- no hay
 * legado que replicar acá (el sistema v1 nunca tuvo un gateway común de
 * verdad, los frontends le pegaban directo a cada servicio).
 */
@Module({
  controllers: [
    IamProxyController,
    PartyProxyController,
    ReferenceDataProxyController,
    ProductRatingProxyController,
    UnderwritingProxyController,
    ClaimsProxyController,
    BillingProxyController,
    SocialImpactProxyController,
  ],
  providers: [ProxyService],
})
export class ProxyModule {}
