import { IsString, Matches } from 'class-validator';

export class CreateGenderDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codGender solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codGender!: string;

  @IsString()
  desGender!: string;
}
