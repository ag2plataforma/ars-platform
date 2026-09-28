import { IsIn, IsOptional } from 'class-validator';

/**
 * `SProductEndorsement.ConditionData` -- forma real confirmada contra el
 * código de `ContractsService.cancel()`/`setCancelPrime` en
 * `underwriting-service` (única lectora hoy): tres flags de devolución
 * (`'SI'`/`'NO'`), uno por concepto (`CALCPRIMA`/`CALCCOMISION`/
 * `CALCIMPUESTO`). Omitir un campo equivale a `'NO'` en la lectura real
 * (comparación estricta `=== 'SI'`), así que los tres quedan opcionales acá.
 */
export class ConditionDataDto {
  @IsOptional()
  @IsIn(['SI', 'NO'])
  refundPremium?: 'SI' | 'NO';

  @IsOptional()
  @IsIn(['SI', 'NO'])
  refundCommission?: 'SI' | 'NO';

  @IsOptional()
  @IsIn(['SI', 'NO'])
  refundTax?: 'SI' | 'NO';
}
