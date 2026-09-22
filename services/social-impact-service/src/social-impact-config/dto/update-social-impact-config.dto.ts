import { IsNumber, IsOptional } from 'class-validator';

export class UpdateSocialImpactConfigDto {
  /** Ver `CreateSocialImpactConfigDto.pctPrimaAdjustment`. */
  @IsOptional()
  @IsNumber()
  pctPrimaAdjustment?: number;
}
