import { IsString, Matches } from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codCurrency solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codCurrency!: string;

  @IsString()
  desCurrency!: string;

  /** Ej. "$", "US$", "€". */
  @IsString()
  symbolCurrency!: string;
}
