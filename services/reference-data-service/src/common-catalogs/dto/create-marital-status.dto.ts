import { IsString, Matches } from 'class-validator';

export class CreateMaritalStatusDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codMaritalStatus solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codMaritalStatus!: string;

  @IsString()
  desMaritalStatus!: string;
}
