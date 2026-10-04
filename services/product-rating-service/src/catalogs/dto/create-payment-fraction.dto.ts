import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CreatePaymentFractionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codPaymentFraction solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codPaymentFraction!: string;

  @IsString()
  desPaymentFraction!: string;

  /** Cantidad de cuotas en que se divide la vigencia (ej. 1 anual, 2 semestral, 4 trimestral, 12 mensual). */
  @IsInt()
  @Min(1)
  @Max(60)
  numFraction!: number;

  /** Orden de presentación; la de menor orden es la fracción por defecto al contratar. */
  @IsInt()
  @Min(0)
  numOrder!: number;
}
