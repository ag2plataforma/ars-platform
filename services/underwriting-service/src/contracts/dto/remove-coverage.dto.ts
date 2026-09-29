import { IsDateString, IsString } from 'class-validator';

/**
 * Payload de POST /contracts/:id/remove-coverage -- suplemento "Baja de
 * cobertura" (Etapa 3). Cancela UNA TRiskCoverage puntual sin tocar el
 * resto del riesgo/contrato -- misma prorrata que "Cambio de monto
 * asegurado" (ContractsService.changeInsuredAmount) pero con el monto
 * final en 0, y además cierra el estado de la cobertura.
 */
export class RemoveCoverageDto {
  @IsString()
  ideRiskCoverage!: string;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;
}
