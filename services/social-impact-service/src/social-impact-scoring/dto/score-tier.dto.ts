import { IsNumber } from 'class-validator';

export class ScoreTierDto {
  @IsNumber()
  minScore!: number;

  @IsNumber()
  maxScore!: number;

  @IsNumber()
  pctPrimaAdjustment!: number;
}
