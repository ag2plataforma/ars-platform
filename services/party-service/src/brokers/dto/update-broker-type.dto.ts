import { IsOptional, IsString } from 'class-validator';

export class UpdateBrokerTypeDto {
  @IsOptional()
  @IsString()
  desBrokerType?: string;
}
