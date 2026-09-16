import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateRiskLevelDto {
  @IsOptional()
  @IsString()
  desRiskLevel?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  image?: string;

  /** Pasar '' (string vacío) para desasociar el padre; omitir para no tocarlo. */
  @IsOptional()
  @IsString()
  codRiskLevelParent?: string;
}
