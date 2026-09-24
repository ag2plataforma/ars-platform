import { IsOptional, IsString } from 'class-validator';

/**
 * Query params de `GET /product-process-flows/resolve-steps` -- misma
 * combinación que `ProductStepsQuery` en `@ars-platform/shared-common`,
 * pero por CÓDIGO (esta capa habla en códigos hacia afuera, igual que
 * el resto de este módulo).
 */
export class ResolveStepsQueryDto {
  @IsString()
  codProduct!: string;

  @IsString()
  codDistributionChannel!: string;

  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  @IsOptional()
  @IsString()
  codDistributionWay?: string;
}
