import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CfpBandDto } from './cfp-band.dto';
import { CfpFactorsDto } from './cfp-factors.dto';
import { ElectricityConfigDto } from './electricity-config.dto';
import { SipWeightsDto } from './sip-weights.dto';
import { CombinedWeightsDto } from './combined-weights.dto';
import { ScoreTierDto } from './score-tier.dto';

/**
 * Reemplaza la fórmula completa de `SSocialImpactScoring` -- se
 * reemplaza entera (no hay merge parcial), mismo criterio que
 * `SCalculationRule.FormulaJSON`: es más simple y menos propenso a
 * errores que un PATCH parcial de una estructura anidada.
 */
export class UpdateSocialImpactFormulaDto {
  @ValidateNested({ each: true })
  @Type(() => CfpBandDto)
  cfpBands!: CfpBandDto[];

  @ValidateNested()
  @Type(() => CfpFactorsDto)
  cfpFactors!: CfpFactorsDto;

  @ValidateNested()
  @Type(() => ElectricityConfigDto)
  electricity!: ElectricityConfigDto;

  @ValidateNested()
  @Type(() => SipWeightsDto)
  sipWeights!: SipWeightsDto;

  @ValidateNested()
  @Type(() => CombinedWeightsDto)
  combinedWeights!: CombinedWeightsDto;

  @ValidateNested({ each: true })
  @Type(() => ScoreTierDto)
  scoreTiers!: ScoreTierDto[];
}
