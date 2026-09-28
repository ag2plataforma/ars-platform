import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { ConditionDataDto } from './condition-data.dto';

export class UpdateProductEndorsementDto {
  @IsOptional()
  @IsString()
  desProductEndorsement?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConditionDataDto)
  conditionData?: ConditionDataDto;
}
