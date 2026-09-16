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
 * `SCoveragePlan` es la tabla más grande del árbol de configuración: fija,
 * para una cobertura dentro de un plan de riesgo concreto, todas las
 * reglas de negocio que antes vivían repartidas en varias funciones
 * PL/pgSQL (deducible, límite, rango de monto/tasa/prima fija,
 * obligatoriedad, devolución de prima, período de carencia). Se refleja
 * tal cual — sin inventar defaults que el esquema no tiene — porque es
 * exactamente la configuración que el motor de reglas (`RulesEngineService`)
 * y el resto del negocio esperan encontrar ya armada.
 */
export class CreateCoveragePlanDto {
  /**
   * `SPlanProductRisk` no tiene código propio (ver `plan-product-risks.service.ts`),
   * así que se referencia directo por el id que devolvió su creación.
   */
  @IsUUID()
  idePlanProductRisk!: string;

  /** CodCoverage de la cobertura a incluir en el plan (debe existir). */
  @IsString()
  codCoverage!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsBoolean()
  indMandatory!: boolean;

  @IsBoolean()
  getPrime!: boolean;

  @IsBoolean()
  refundPrime!: boolean;

  @IsBoolean()
  proratedGetPrime!: boolean;

  @IsBoolean()
  proratedRefundPrime!: boolean;

  @IsInt()
  @Min(0)
  numMonthsWaitingPeriod!: number;

  @IsBoolean()
  indSplitPayment!: boolean;

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

  @IsBoolean()
  indPayPerUse!: boolean;

  @IsBoolean()
  indFixedAmount!: boolean;

  @IsNumber()
  lowerAmount!: number;

  @IsNumber()
  upperAmount!: number;

  @IsBoolean()
  indFixedRate!: boolean;

  @IsNumber()
  lowerRate!: number;

  @IsNumber()
  upperRate!: number;

  @IsBoolean()
  indFixedPrime!: boolean;

  @IsNumber()
  lowerPrime!: number;

  @IsNumber()
  upperPrime!: number;

  @IsDateString()
  tstInitial!: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;

  /** Reglas de inclusión/exclusión de cobertura (forma libre — JSON de negocio, no validado aquí). */
  @IsOptional()
  inclusiveCoverage?: unknown;

  @IsOptional()
  exclusiveCoverage?: unknown;

  /** Orden de despliegue de la cobertura dentro del plan. */
  @IsInt()
  order!: number;
}
