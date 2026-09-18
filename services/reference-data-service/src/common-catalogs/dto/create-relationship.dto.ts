import { IsString, Matches } from 'class-validator';

export class CreateRelationshipDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRelationship solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRelationship!: string;

  @IsString()
  desRelationship!: string;
}
