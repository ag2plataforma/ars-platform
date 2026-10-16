import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

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

  /**
   * Tipo de objeto asegurado: `PERSON` = el riesgo ES una persona (ej. viajero) y al contratar se piden los
   * datos del asegurado; `NONE` = sin ficha propia. (`VEHICLE`/`PROPERTY` se admitiran cuando existan.)
   */
  @IsOptional()
  @IsIn(['NONE', 'PERSON'])
  codInsuredObject?: string;
}
