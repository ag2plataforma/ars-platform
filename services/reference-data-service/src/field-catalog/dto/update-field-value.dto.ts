import { IsOptional, IsString } from 'class-validator';

export class UpdateFieldValueDto {
  @IsOptional()
  @IsString()
  desFieldValue?: string;

  @IsOptional()
  @IsString()
  codFieldDictionary?: string;
}
