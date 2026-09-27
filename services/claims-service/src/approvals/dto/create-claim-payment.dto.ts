import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateClaimPaymentDto {
  @IsNumber()
  amount!: number;

  @IsDateString()
  tstPayment!: string;

  @IsOptional()
  @IsString()
  numExternalPayment?: string;

  @IsOptional()
  @IsString()
  desObservation?: string;
}
