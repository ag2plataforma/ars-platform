import { IsString, Matches } from 'class-validator';

export class CreateCommissionTreeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codCommissionTree solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codCommissionTree!: string;

  @IsString()
  desCommissionTree!: string;

  /** Código de `SDistributionChannel` -- el árbol de comisión aplica a este canal. */
  @IsString()
  codDistributionChannel!: string;
}
