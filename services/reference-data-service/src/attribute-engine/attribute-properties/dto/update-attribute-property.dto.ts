import { IsJSON, IsOptional, IsString } from 'class-validator';

export class UpdateAttributePropertyDto {
  @IsOptional()
  @IsString()
  desAttributeProperty?: string;

  @IsOptional()
  @IsString()
  codModelAttribute?: string;

  @IsOptional()
  @IsString()
  codAttribute?: string;

  @IsOptional()
  @IsJSON()
  attributeContent?: string;
}
