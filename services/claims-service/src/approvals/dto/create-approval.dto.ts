import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class ApprovalDetailInputDto {
  @IsUUID()
  ideCoverageProvision!: string;

  /** Monto que el ajustador propone pagar por ESTA cobertura -- decide el nivel de escalamiento de su propio `TApprovalDetail` (evaluación por cobertura, no por el total de la carpeta). */
  @IsNumber()
  approvedAmount!: number;
}

/**
 * Crea la cabecera `TApproval` + una fila `TApprovalDetail` por cobertura
 * indicada (Fase 4, Etapa 2). Ver el doc-comment de `ApprovalsService`
 * para el diseño completo del escalamiento.
 */
export class CreateApprovalDto {
  @IsString()
  codPaymentType!: string;

  @IsUUID()
  idePersonPayment!: string;

  @IsOptional()
  @IsString()
  desObservation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovalDetailInputDto)
  details!: ApprovalDetailInputDto[];
}
