import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  desAddressLine1?: string;

  @IsOptional()
  @IsString()
  desAddressLine2?: string;

  @IsOptional()
  @IsUUID()
  ideCountry?: string;

  @IsOptional()
  @IsString()
  codPostal?: string;

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
