import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListTranslationsDto {
  @IsOptional()
  @IsUUID()
  ideTextContent?: string;

  @IsOptional()
  @IsString()
  codLanguage?: string;
}
