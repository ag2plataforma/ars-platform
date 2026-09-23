import { IsNumber, IsObject } from 'class-validator';

export class CfpFactorsDto {
  /** kg CO2/km por tipo de combustible (ej. `{ gasolina: 0.192, ... }`)
   *  -- claves libres a propósito, no se valida cada una individualmente. */
  @IsObject()
  carKgPerKm!: Record<string, number>;

  @IsNumber()
  avgFlightKg!: number;
}
