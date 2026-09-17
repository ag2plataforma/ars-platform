import { IsJSON, IsOptional, IsString } from 'class-validator';

export class UpdateAttributeDto {
  @IsOptional()
  @IsString()
  desAttribute?: string;

  @IsOptional()
  @IsString()
  codFieldDictionary?: string;

  @IsOptional()
  @IsJSON()
  attributeContent?: string;
}
