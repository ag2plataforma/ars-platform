import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateProductValidityTypeDto {
  @IsString()
  codProduct!: string;

  /** Tipo de vigencia del catálogo `SValidityType`. */
  @IsString()
  codValidityType!: string;

  /** Si la vigencia arranca en la fecha de inicio elegida (por defecto `true`). */
  @IsOptional()
  @IsBoolean()
  indInitialDate?: boolean;
}
