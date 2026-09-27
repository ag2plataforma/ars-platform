import { IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

/**
 * `SClaimApprovalThreshold` -- catálogo nuevo (no viene del esquema
 * legado, ver `packages/database/scripts/migrate-claims-etapa2-schema.js`)
 * acordado con el usuario 2026-09-24 para configurar, por pantalla, los
 * umbrales de escalamiento de aprobación de siniestros (Fase 4, Etapa 2).
 *
 * Mismo patrón de comodín NULL que `SProductRequirement` (ver su
 * doc-comment): `codProduct` obligatorio, `codPlanProduct`/
 * `ideCoveragePlan` opcionales para reglas más específicas. La
 * resolución real (en `claims-service`, `ApprovalsService`) evalúa el
 * escalamiento POR COBERTURA individual, no por el total de la carpeta
 * (decisión explícita del usuario) -- por eso `IdeCoveragePlan` es la
 * columna de comodín más específica, no `IdeCoverageGuarantee`.
 *
 * `level` + `maxAmount`: un mismo alcance (producto/plan/cobertura +
 * moneda) tiene VARIAS filas, una por nivel (1, 2, 3...). `maxAmount`
 * nulo marca el último nivel (sin techo). `codRol` es el rol de
 * `TRol` que debe aprobar en ese nivel -- así el "rango" de un usuario
 * para un alcance dado se deriva de la configuración, no de una tabla
 * de rangos hardcodeada en el código (ver doc-comment de `ApprovalsService`).
 */
export class CreateClaimApprovalThresholdDto {
  @IsString()
  codProduct!: string;

  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  /** `SCoveragePlan` no tiene código propio -- va directo por id, mismo criterio que `CreateProductRequirementDto.ideCoveragePlan`. */
  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  @IsString()
  codCurrency!: string;

  @IsInt()
  @Min(1)
  level!: number;

  /** Nulo/omitido = sin techo (último nivel de la escalera). */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxAmount?: number;

  @IsString()
  codRol!: string;
}
