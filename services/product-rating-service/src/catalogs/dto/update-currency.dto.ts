import { IsOptional, IsString } from 'class-validator';

export class UpdateCurrencyDto {
  @IsOptional()
  @IsString()
  desCurrency?: string;

  @IsOptional()
  @IsString()
  symbolCurrency?: string;
}
