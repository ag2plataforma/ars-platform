import { IsBoolean, IsString, Matches } from 'class-validator';

export class CreateValidityTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codValidityType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codValidityType!: string;

  @IsString()
  desValidityType!: string;

  /** `true` = vigencia anual (un año desde el inicio). Los demás tipos (temporal) hoy caen a +1 año, igual que el sistema original. */
  @IsBoolean()
  indAnnual!: boolean;
}
