import { IsString, Matches } from 'class-validator';

export class CreateRiskTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRiskType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRiskType!: string;

  @IsString()
  desRiskType!: string;
}
