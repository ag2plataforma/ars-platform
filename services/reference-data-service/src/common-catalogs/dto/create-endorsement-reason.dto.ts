import { IsString, Matches } from 'class-validator';

export class CreateEndorsementReasonDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codEndorsementReason solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codEndorsementReason!: string;

  @IsString()
  desEndorsementReason!: string;
}
