import { IsOptional, IsUUID } from 'class-validator';

/**
 * Filtros de listado de recibos (`TReceipt`). Ambos opcionales, pero en la
 * práctica casi siempre se va a filtrar al menos por `ideContract` -- sin
 * ningún filtro devuelve todos los recibos de la base.
 */
export class ListReceiptsDto {
  @IsOptional()
  @IsUUID()
  ideContract?: string;

  @IsOptional()
  @IsUUID()
  ideContractFile?: string;
}
