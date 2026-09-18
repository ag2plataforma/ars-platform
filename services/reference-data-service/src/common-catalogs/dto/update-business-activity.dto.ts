import { IsOptional, IsString } from 'class-validator';

export class UpdateBusinessActivityDto {
  @IsOptional()
  @IsString()
  desBusinessActivity?: string;
}
