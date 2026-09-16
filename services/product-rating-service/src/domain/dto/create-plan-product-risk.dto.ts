import { IsDateString, IsString } from 'class-validator';

export class CreatePlanProductRiskDto {
  /** CodPlanProduct del plan al que se agrega el riesgo (debe existir). */
  @IsString()
  codPlanProduct!: string;

  /** CodRiskProduct del riesgo de producto a incluir en el plan (debe existir). */
  @IsString()
  codRiskProduct!: string;

  @IsDateString()
  tstInitial!: string;

  /** A diferencia de otras entidades, aquí `TstEnd` es NOT NULL en la BD. */
  @IsDateString()
  tstEnd!: string;
}
