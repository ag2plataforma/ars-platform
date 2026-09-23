import { Module } from '@nestjs/common';
import { SocialImpactScoringConfigController } from './social-impact-scoring-config.controller';
import { SocialImpactScoringConfigService } from './social-impact-scoring-config.service';
import { SocialImpactScoringController } from './social-impact-scoring.controller';
import { SocialImpactScoringService } from './social-impact-scoring.service';
import { EmissionsDevClient } from './emissions-dev.client';

@Module({
  controllers: [SocialImpactScoringConfigController, SocialImpactScoringController],
  providers: [SocialImpactScoringConfigService, SocialImpactScoringService, EmissionsDevClient],
})
export class SocialImpactScoringModule {}
