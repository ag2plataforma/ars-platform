import { IsOptional, IsString } from 'class-validator';

export class UpdateTranslationDto {
  @IsOptional()
  @IsString()
  desTranslation?: string;

  @IsOptional()
  @IsString()
  desTranslationShort?: string;

  @IsOptional()
  @IsString()
  desTranslationLarge?: string;
}
