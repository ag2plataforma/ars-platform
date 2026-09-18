import { IsDateString, IsNumber, IsString } from 'class-validator';

export class CreateCommissionDto {
  /** Código de `SCommissionTable` a la que pertenece esta comisión. */
  @IsString()
  codCommissionTable!: string;

  /** Código de `SProcess` (ej. el proceso de generación de recibo). */
  @IsString()
  codProcess!: string;

  @IsNumber()
  percentaje!: number;

  @IsDateString()
  tstInitial!: string;

  @IsDateString()
  tstEnd!: string;
}
