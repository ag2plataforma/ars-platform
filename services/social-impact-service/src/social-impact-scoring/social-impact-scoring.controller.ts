import { Body, Controller, Post } from '@nestjs/common';
import { SocialImpactScoringService } from './social-impact-scoring.service';
import { CalculateSocialImpactScoreDto } from './dto/calculate-social-impact-score.dto';

/**
 * Llamado por `underwriting-service` vía HTTP real (Etapa 2, ver
 * docs/02-roadmap.md) -- reenvía el mismo JWT del usuario que llenó el
 * formulario, así que este endpoint queda protegido por el mismo guard
 * global (`AuthModule`) que el resto del servicio, sin credencial
 * service-to-service aparte.
 */
@Controller('social-impact-score')
export class SocialImpactScoringController {
  constructor(private readonly service: SocialImpactScoringService) {}

  @Post()
  calculate(@Body() dto: CalculateSocialImpactScoreDto) {
    return this.service.calculate(dto);
  }
}
