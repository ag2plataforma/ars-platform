import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class CreateSiteMapDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codSiteMap solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codSiteMap!: string;

  @IsString()
  desSiteMap!: string;

  /** Orden dentro de su nivel -- usado por GET /site-map/menu para ordenar. */
  @IsInt()
  numOrder!: number;

  @IsOptional()
  @IsString()
  desPathOption?: string;

  @IsOptional()
  @IsString()
  image?: string;

  /** CodSiteMap del ítem padre, para armar la jerarquía (opcional -- vacío = ítem de nivel raíz). */
  @IsOptional()
  @IsString()
  codSiteMapParent?: string;
}
