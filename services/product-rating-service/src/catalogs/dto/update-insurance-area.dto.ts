import { IsOptional, IsString } from 'class-validator';

export class UpdateInsuranceAreaDto {
  @IsOptional()
  @IsString()
  desInsuranceArea?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  /** Pasar '' (string vacío) para desasociar el padre; omitir para no tocarlo. */
  @IsOptional()
  @IsString()
  codInsuranceAreaParent?: string;
}
