import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateProductProcessFlowDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codProductProcessFlow solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codProductProcessFlow!: string;

  @IsString()
  desProductProcessFlow!: string;

  /** CodProcessFlow del flujo a asignar (debe existir). */
  @IsString()
  codProcessFlow!: string;

  /** CodProduct del producto al que aplica (debe existir). */
  @IsString()
  codProduct!: string;

  /** CodDistributionChannel del canal al que aplica (debe existir). */
  @IsString()
  codDistributionChannel!: string;

  /**
   * CodRiskProduct opcional -- si se omite, la fila aplica a CUALQUIER
   * riesgo del producto (comodín NULL, ver el doc-comment de
   * `ProcessFlowResolver` en `@ars-platform/shared-common` sobre la
   * regla de especificidad "más específica gana").
   */
  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  /** CodDistributionWay opcional -- mismo comodín NULL que codRiskProduct. */
  @IsOptional()
  @IsString()
  codDistributionWay?: string;
}
