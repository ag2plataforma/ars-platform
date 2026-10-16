import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class CreateRiskDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRisk solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRisk!: string;

  @IsString()
  desRisk!: string;

  /** CodRiskLevel del nivel de riesgo al que pertenece (debe existir). */
  @IsString()
  codRiskLevel!: string;

  /** `true` = el riesgo ES una persona (ej. viajero): al contratar se piden los datos del asegurado. */
  @IsOptional()
  @IsBoolean()
  indPersonRisk?: boolean;
}
