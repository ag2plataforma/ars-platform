import { IsString, Matches } from 'class-validator';

export class CreateConceptTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codConceptType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codConceptType!: string;

  @IsString()
  desConceptType!: string;
}
