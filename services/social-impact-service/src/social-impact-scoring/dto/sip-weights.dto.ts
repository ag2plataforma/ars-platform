import { IsNumber } from 'class-validator';

export class SipWeightsDto {
  @IsNumber()
  pointsPerVolunteerHour!: number;

  @IsNumber()
  maxVolunteerHours!: number;

  @IsNumber()
  recurringCauseBonus!: number;

  @IsNumber()
  donationBonus!: number;
}
