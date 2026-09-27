import { IsString, Matches } from 'class-validator';

export class CreateGuaranteeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codGuarantee solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codGuarantee!: string;

  @IsString()
  desGuarantee!: string;
}
