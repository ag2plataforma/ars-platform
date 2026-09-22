import { IsOptional, IsString } from 'class-validator';

export class UpdateChannelTypeDto {
  @IsOptional()
  @IsString()
  desChannelType?: string;
}
