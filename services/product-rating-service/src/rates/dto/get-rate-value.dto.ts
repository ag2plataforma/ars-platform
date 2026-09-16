import { IsOptional, IsString } from 'class-validator';

/**
 * Parámetros de `GET /rate-values/lookup` — réplica exacta de la firma de
 * `FGetRateValue(pCodRateTable, pFactor1..pFactor5)` (ver el comentario en
 * `rate-values.service.ts#getRateValue` para la semántica exacta de cada
 * factor, tomada del código fuente original).
 */
export class GetRateValueDto {
  @IsString()
  codRateTable!: string;

  /** Obligatorio y de calce exacto en el original — no admite comodín. */
  @IsString()
  factor1!: string;

  /**
   * Factor2..5: si se envían, deben calzar exacto contra la fila; si se
   * omiten, esa dimensión no se filtra en absoluto (sin importar qué haya
   * guardado la fila en esa columna) — así es como el original implementa
   * el comodín, y por eso son opcionales acá.
   */
  @IsOptional()
  @IsString()
  factor2?: string;

  @IsOptional()
  @IsString()
  factor3?: string;

  @IsOptional()
  @IsString()
  factor4?: string;

  @IsOptional()
  @IsString()
  factor5?: string;
}
