import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  desAddressLine1!: string;

  @IsOptional()
  @IsString()
  desAddressLine2?: string;

  @IsOptional()
  @IsUUID()
  ideCountry?: string;

  @IsString()
  codPostal!: string;

  /**
   * Si se omite o se envía `true`, y es la primera dirección de la
   * persona, o se quiere que sea la principal: desmarca las demás
   * direcciones de esta persona como principal -- ver el comentario de
   * `PersonsService.addAddress` (regla agregada, no hay función
   * PL/pgSQL que la exija en el original).
   */
  @IsOptional()
  @IsBoolean()
  indMain?: boolean;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;
}
