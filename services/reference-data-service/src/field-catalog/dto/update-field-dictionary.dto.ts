import { IsOptional, IsString } from 'class-validator';

export class UpdateFieldDictionaryDto {
  @IsOptional()
  @IsString()
  desFieldDictionary?: string;
}
