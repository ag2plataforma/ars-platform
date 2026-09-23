import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { SocialImpactScoringConfigService } from './social-impact-scoring-config.service';
import { UpdateSocialImpactFormulaDto } from './dto/update-social-impact-formula.dto';

@Controller('social-impact-scoring')
export class SocialImpactScoringConfigController {
  constructor(private readonly service: SocialImpactScoringConfigService) {}

  @Get()
  getCurrent() {
    return this.service.getCurrent();
  }

  @Roles('ADMIN')
  @Patch()
  update(@Body() dto: UpdateSocialImpactFormulaDto, @CurrentUser() actor: JwtPayload) {
    return this.service.updateFormula(dto, actor.code);
  }
}
