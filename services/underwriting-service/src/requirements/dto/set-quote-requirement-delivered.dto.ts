import { IsBoolean } from 'class-validator';

export class SetQuoteRequirementDeliveredDto {
  @IsBoolean()
  delivered!: boolean;
}
