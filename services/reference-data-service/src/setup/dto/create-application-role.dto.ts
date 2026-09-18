import { IsString, Matches } from 'class-validator';

export class CreateApplicationRoleDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codApplicationRole solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codApplicationRole!: string;

  @IsString()
  desApplicationRole!: string;

  /** CodApplication de la aplicación a la que pertenece este rol. */
  @IsString()
  codApplication!: string;
}
