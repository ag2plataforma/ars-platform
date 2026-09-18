import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTranslationDto {
  @IsUUID()
  ideTextContent!: string;

  @IsString()
  codLanguage!: string;

  @IsString()
  desTranslation!: string;

  @IsOptional()
  @IsString()
  desTranslationShort?: string;

  @IsOptional()
  @IsString()
  desTranslationLarge?: string;
}
