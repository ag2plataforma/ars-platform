import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * Payload de POST /contracts/:id/add-coverage -- suplemento "Alta de
 * cobertura" (Etapa 3 de "Movimientos y suplementos del contrato").
 * Agrega una SCoveragePlan nueva a un TFileRisk que ya existe en el
 * contrato. `newAmount` es opcional: si no se manda, el monto sale del
 * default de SCoveragePlan (IndFixedAmount ? UpperAmount : 0), igual
 * criterio que usa `populateQuoteCoverages` al cotizar.
 */
export class AddCoverageDto {
  @IsString()
  ideFileRisk!: string;

  @IsString()
  ideCoveragePlan!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  newAmount?: number;

  @IsString()
  ideProductEndorsement!: string;

  @IsDateString()
  tstSupplement!: string;

  @IsString()
  desSupplement!: string;
}
