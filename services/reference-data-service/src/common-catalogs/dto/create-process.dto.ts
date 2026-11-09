import { IsString, Matches } from 'class-validator';

export class CreateProcessDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codProcess solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codProcess!: string;

  @IsString()
  desProcess!: string;
}
