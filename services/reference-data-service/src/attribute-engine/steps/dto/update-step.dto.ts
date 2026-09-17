import { IsOptional, IsString } from 'class-validator';

export class UpdateStepDto {
  @IsOptional()
  @IsString()
  desStep?: string;
}
