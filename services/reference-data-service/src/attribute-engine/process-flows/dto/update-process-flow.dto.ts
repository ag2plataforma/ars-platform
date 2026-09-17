import { IsOptional, IsString } from 'class-validator';

export class UpdateProcessFlowDto {
  @IsOptional()
  @IsString()
  desProcessFlow?: string;
}
