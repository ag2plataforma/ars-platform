import { IsString, Matches } from 'class-validator';

export class CreateIdentificationTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codIdentificationType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codIdentificationType!: string;

  @IsString()
  desIdentificationType!: string;
}
