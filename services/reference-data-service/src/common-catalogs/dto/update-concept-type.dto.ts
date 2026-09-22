import { IsOptional, IsString } from 'class-validator';

export class UpdateConceptTypeDto {
  @IsOptional()
  @IsString()
  desConceptType?: string;
}
