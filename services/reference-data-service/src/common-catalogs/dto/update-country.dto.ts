import { IsOptional, IsString } from 'class-validator';

export class UpdateCountryDto {
  @IsOptional()
  @IsString()
  desCountry?: string;

  @IsOptional()
  @IsString()
  codDDI?: string;

  @IsOptional()
  @IsString()
  codLanguage?: string;
}
