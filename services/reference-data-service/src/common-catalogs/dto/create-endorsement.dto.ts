import { IsString, Matches } from 'class-validator';

export class CreateEndorsementDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codEndorsement solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codEndorsement!: string;

  @IsString()
  desEndorsement!: string;
}
