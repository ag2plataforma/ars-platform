import { IsOptional, IsString } from 'class-validator';

export class UpdateConceptDto {
  @IsOptional()
  @IsString()
  desConcept?: string;

  @IsOptional()
  @IsString()
  codConceptType?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;
}
