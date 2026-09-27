import { IsString, Matches } from 'class-validator';

export class CreatePaymentTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codPaymentType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codPaymentType!: string;

  @IsString()
  desPaymentType!: string;
}
