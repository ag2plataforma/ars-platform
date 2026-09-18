import { IsString, Matches } from 'class-validator';

export class CreateBusinessActivityDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codBusinessActivity solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codBusinessActivity!: string;

  @IsString()
  desBusinessActivity!: string;
}
