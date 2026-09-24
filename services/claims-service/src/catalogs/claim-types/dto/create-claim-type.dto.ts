import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * Ver el doc-comment de `ClaimTypesService`. Sin patrón "comodín NULL"
 * como `SProductRequirement` -- acá `codPlanProduct`/`codRiskProduct`/
 * `codCoverage` son metadatos de alcance simples del catálogo (opcional
 * = "no aplica a ningún plan/riesgo/cobertura en particular"), no
 * candidatos que compitan en una resolución. `IdeTextContent` (columna
 * real de la tabla) no se expone -- mismo criterio que `codOperation` en
 * `SProductRequirement`: sin catálogo/endpoint de contenido de texto
 * usado en ningún lado todavía.
 */
export class CreateClaimTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codClaimType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codClaimType!: string;

  @IsString()
  desClaimType!: string;

  /** CodProduct del producto al que aplica este tipo de siniestro (debe existir). */
  @IsString()
  codProduct!: string;

  @IsOptional()
  @IsString()
  codPlanProduct?: string;

  @IsOptional()
  @IsString()
  codRiskProduct?: string;

  /** CodCoverage (catálogo `SCoverage` de `product-rating-service`), opcional. */
  @IsOptional()
  @IsString()
  codCoverage?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  /** Límite de siniestros por año que admite este tipo (uso real: Etapa 2, límite de uso). */
  @IsInt()
  @Min(0)
  numClaimsPerYear!: number;

  /** Monto sugerido de provisión inicial -- ver `ClaimsService.declare` (se usa como `CoveredAmount` inicial de cada `TCoverageProvision` creada). */
  @IsNumber()
  @Min(0)
  initialProvisionAmount!: number;

  /** Plazo (días) para reportar el siniestro tras la ocurrencia. */
  @IsInt()
  @Min(0)
  numDeadLineReport!: number;

  @IsOptional()
  @IsInt()
  order?: number;
}
