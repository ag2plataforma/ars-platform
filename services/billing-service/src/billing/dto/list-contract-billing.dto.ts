import { IsOptional, IsUUID } from 'class-validator';

/**
 * Filtro de listado de períodos de facturación (`TContractBilling`).
 */
export class ListContractBillingDto {
  @IsOptional()
  @IsUUID()
  ideContract?: string;
}
