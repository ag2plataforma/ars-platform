import { IsOptional, IsString } from 'class-validator';

export class UpdateCommissionTreeDto {
  @IsOptional()
  @IsString()
  desCommissionTree?: string;

  @IsOptional()
  @IsString()
  codDistributionChannel?: string;
}
