import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * `SCoverageGuarantee` -- la configuración de una garantía (`SGuarantee`)
 * dentro de una cobertura de plan concreta (`SCoveragePlan`): deducible,
 * límite y máximo de usos permitidos por vigencia (`NumApplyUse`, ver el
 * doc-comment de `GuaranteeProvisionsService` en `claims-service`, que ya
 * consume esta tabla desde Siniestros Etapa 2 pero sin ningún CRUD hasta
 * ahora). Mismo criterio bespoke que `CreateCoveragePlanDto` -- sin
 * `Cod`/`Des` propio (`SCoverageGuarantee` no tiene código único, solo
 * `DesShort`/`DesLarge` opcionales), y con la unicidad compuesta real del
 * esquema (`IdeCoveragePlan`+`IdeGuarantee`, `UK_SCoverageGuarantee_01`)
 * dejada al constraint de BD en vez de revalidada acá.
 */
export class CreateCoverageGuaranteeDto {
  @IsUUID()
  ideCoveragePlan!: string;

  /** CodGuarantee de la garantía a incluir en la cobertura (debe existir). */
  @IsString()
  codGuarantee!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsDateString()
  tstInitial!: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  @IsBoolean()
  indCoverageAccumulate!: boolean;

  /** CodDeductibleType del tipo de deducible aplicado (debe existir). */
  @IsString()
  codDeductibleType!: string;

  @IsOptional()
  @IsNumber()
  deductibleTypeValue?: number;

  /** CodLimitType del tipo de límite aplicado (debe existir). */
  @IsString()
  codLimitType!: string;

  @IsOptional()
  @IsNumber()
  limitTypeValue?: number;

  /** Máximo de usos permitidos de esta garantía por vigencia del contrato
   * (ver `GuaranteeProvisionsService.sumUsageInSameVigencia`). Omitir =
   * sin límite de usos. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  numApplyUse?: number;

  /** Orden de despliegue de la garantía dentro de la cobertura. */
  @IsOptional()
  @IsInt()
  order?: number;
}
