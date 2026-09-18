import { IsOptional, IsString } from 'class-validator';

export class ListLocationsDto {
  @IsOptional()
  @IsString()
  codCountry?: string;

  /** '' filtra las de nivel raíz (sin padre); un código real filtra hijas directas de esa ubicación. */
  @IsOptional()
  @IsString()
  codLocationParent?: string;
}
