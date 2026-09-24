import { IsOptional, IsString } from 'class-validator';

export class UpdateRequirementDto {
  @IsOptional()
  @IsString()
  desRequirement?: string;
}
