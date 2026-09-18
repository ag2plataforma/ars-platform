import { IsString, Matches } from 'class-validator';

export class CreateContactClassDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codContactClass solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codContactClass!: string;

  @IsString()
  desContactClass!: string;
}
