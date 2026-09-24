import { IsOptional, IsString } from 'class-validator';

export class UpdateProductProcessFlowDto {
  @IsOptional()
  @IsString()
  desProductProcessFlow?: string;

  @IsOptional()
  @IsString()
  codProcessFlow?: string;

  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsString()
  codDistributionChannel?: string;

  /** Cadena vacía limpia el comodín (vuelve a aplicar a cualquier riesgo). */
  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  /** Cadena vacía limpia el comodín (vuelve a aplicar a cualquier vía). */
  @IsOptional()
  @IsString()
  codDistributionWay?: string;
}
