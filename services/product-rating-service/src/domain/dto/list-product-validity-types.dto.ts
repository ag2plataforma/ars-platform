import { IsOptional, IsString } from 'class-validator';

export class ListProductValidityTypesDto {
  @IsOptional()
  @IsString()
  codProduct?: string;
}
