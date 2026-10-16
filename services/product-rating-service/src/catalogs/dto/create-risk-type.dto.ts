import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class CreateRiskTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRiskType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRiskType!: string;

  @IsString()
  desRiskType!: string;

  /** `true` = el riesgo de este tipo ES una persona: al contratar se piden los datos del asegurado. */
  @IsOptional()
  @IsBoolean()
  indPersonRisk?: boolean;
}
