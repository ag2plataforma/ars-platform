import { IsBoolean, IsDateString, IsNumber, IsString } from 'class-validator';

export class CreateCommissionProductDto {
  /** Código de `SProduct` al que aplica esta regla de split. */
  @IsString()
  codProduct!: string;

  /** Código de `SDistributionChannel` de origen (el de la cotización). */
  @IsString()
  codDistributionChannelOrigin!: string;

  /** Código de `SDistributionChannel` de destino (a quién se le acredita). */
  @IsString()
  codDistributionChannelDestiny!: string;

  @IsNumber()
  percentaje!: number;

  @IsBoolean()
  indMain!: boolean;

  @IsDateString()
  tstInitial!: string;

  @IsDateString()
  tstEnd!: string;
}
