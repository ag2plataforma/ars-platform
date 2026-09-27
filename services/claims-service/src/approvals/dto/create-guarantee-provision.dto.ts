import { IsNumber, IsOptional, IsUUID } from 'class-validator';

/**
 * Ver el doc-comment de `GuaranteeProvisionsService`. `ideCoverageGuarantee`
 * va directo por id porque `SCoverageGuarantee` no tiene código propio
 * (mismo motivo que `ideCoveragePlan` en `CreateProductRequirementDto`).
 */
export class CreateGuaranteeProvisionDto {
  @IsUUID()
  ideCoverageGuarantee!: string;

  @IsNumber()
  invoicedAmount!: number;

  @IsNumber()
  coveredAmount!: number;

  @IsNumber()
  approvedAmount!: number;

  @IsNumber()
  indemnifiedAmount!: number;

  @IsNumber()
  noCoveredAmount!: number;

  /** Deducible manual (sin fórmula automática en Etapa 2, decisión del usuario) -- lo digita el ajustador. */
  @IsOptional()
  @IsNumber()
  manualDeductibleAmount?: number;

  /** Cuántos usos de esta garantía consume ESTE siniestro -- se valida contra `SCoverageGuarantee.NumApplyUse` acumulado en la misma vigencia (`TContractFile`). */
  @IsOptional()
  @IsNumber()
  numApplyUse?: number;
}
