import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class CreateRiskLevelDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRiskLevel solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRiskLevel!: string;

  @IsString()
  desRiskLevel!: string;

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

  /** CodRiskLevel del nivel padre, para armar la jerarquía (opcional). */
  @IsOptional()
  @IsString()
  codRiskLevelParent?: string;
}
