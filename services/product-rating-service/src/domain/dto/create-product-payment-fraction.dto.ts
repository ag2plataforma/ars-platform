import { IsDateString, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateProductPaymentFractionDto {
  /** Producto al que se le ofrece la fracción. */
  @IsString()
  codProduct!: string;

  /** Fracción del catálogo `SPaymentFraction`. */
  @IsString()
  codPaymentFraction!: string;

  /** Inicio de vigencia (`YYYY-MM-DD`). */
  @IsDateString()
  tstInitial!: string;

  /** Fin de vigencia (`YYYY-MM-DD`). */
  @IsDateString()
  tstEnd!: string;

  /** Recargo por fraccionar, en % (ej. 5 = +5% sobre la prima; 0 = sin recargo). */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  porSurCharge!: number;
}
