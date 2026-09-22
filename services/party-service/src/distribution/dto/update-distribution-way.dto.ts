import { IsOptional, IsString } from 'class-validator';

export class UpdateDistributionWayDto {
  @IsOptional()
  @IsString()
  desDistributionWay?: string;
}
