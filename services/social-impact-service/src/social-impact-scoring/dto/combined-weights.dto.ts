import { IsNumber } from 'class-validator';

export class CombinedWeightsDto {
  @IsNumber()
  cfp!: number;

  @IsNumber()
  sip!: number;
}
