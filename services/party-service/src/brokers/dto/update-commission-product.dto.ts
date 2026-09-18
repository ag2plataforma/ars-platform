import { IsBoolean, IsDateString, IsNumber, IsOptional } from 'class-validator';

/**
 * Sin `codProduct`/`codDistributionChannelOrigin`/`codDistributionChannelDestiny`
 * a propósito: cambiar cualquiera de los tres mueve la identidad de la
 * configuración -- para eso se crea una fila nueva. `update()` solo edita
 * en el lugar los datos del split (decisión explícita del usuario, ver
 * `commission-products.service.ts`).
 */
export class UpdateCommissionProductDto {
  @IsOptional()
  @IsNumber()
  percentaje?: number;

  @IsOptional()
  @IsBoolean()
  indMain?: boolean;

  @IsOptional()
  @IsDateString()
  tstInitial?: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
