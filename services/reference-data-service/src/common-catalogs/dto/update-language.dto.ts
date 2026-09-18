import { IsOptional, IsString } from 'class-validator';

export class UpdateLanguageDto {
  @IsOptional()
  @IsString()
  desLanguage?: string;
}
