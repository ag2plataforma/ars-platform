import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateSiteMapDto {
  @IsOptional()
  @IsString()
  desSiteMap?: string;

  @IsOptional()
  @IsInt()
  numOrder?: number;

  @IsOptional()
  @IsString()
  desPathOption?: string;

  @IsOptional()
  @IsString()
  image?: string;

  /** '' desasocia el padre; un código real lo resuelve; no enviado deja el campo intacto. */
  @IsOptional()
  @IsString()
  codSiteMapParent?: string;
}
