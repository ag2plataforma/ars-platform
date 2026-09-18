import { IsString } from 'class-validator';

/**
 * Mismo criterio de entrada que el `FGetSiteMap` real: un string con uno
 * o más `CodApplicationRole` separados por coma (ej. "ADMIN,BROKER").
 */
export class GetSiteMapMenuDto {
  @IsString()
  codApplicationRole!: string;
}
