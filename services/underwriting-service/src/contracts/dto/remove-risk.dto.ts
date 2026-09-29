import { IsDateString, IsString } from 'class-validator';

/**
 * Suplemento "Baja de riesgo" (Etapa 4): cancela TODAS las coberturas
 * activas de un `TFileRisk` (mismo mecanismo que "Baja de cobertura",
 * repetido por cada una, devolución proporcional al tiempo) y cierra el
 * riesgo mismo.
 */
export class RemoveRiskDto {
  @IsString()
  ideFileRisk!: string;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;
}
