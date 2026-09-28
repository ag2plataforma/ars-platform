import { IsString, Matches } from 'class-validator';

export class CreateOperationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codOperation solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codOperation!: string;

  @IsString()
  desOperation!: string;
}
