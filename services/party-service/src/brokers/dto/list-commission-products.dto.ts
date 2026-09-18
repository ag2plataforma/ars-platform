import { IsOptional, IsString } from 'class-validator';

export class ListCommissionProductsDto {
  @IsOptional()
  @IsString()
  codProduct?: string;

  @IsOptional()
  @IsString()
  codDistributionChannelOrigin?: string;
}
