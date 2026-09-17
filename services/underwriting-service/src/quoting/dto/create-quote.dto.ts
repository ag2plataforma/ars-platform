import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { CreateQuoteRiskDto } from './create-quote-risk.dto';

export class CreateQuoteDto {
  /** CodProduct del producto que se está cotizando (debe existir). */
  @IsString()
  codProduct!: string;

  /** CodDistributionChannel del canal de origen de la cotización (debe existir). */
  @IsString()
  codDistributionChannel!: string;

  /** CodDistributionWay de la vía de distribución (debe existir). */
  @IsString()
  codDistributionWay!: string;

  /** Al menos un riesgo a cotizar (ej. una mascota, un smartphone). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteRiskDto)
  risks!: CreateQuoteRiskDto[];
}
