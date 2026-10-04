import { IsOptional, IsString } from 'class-validator';

export class ListProductPaymentFractionsDto {
  @IsOptional()
  @IsString()
  codProduct?: string;
}
