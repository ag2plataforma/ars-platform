import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateContactDataDto {
  @IsOptional()
  @IsString()
  codContactClass?: string;

  @IsOptional()
  @IsString()
  desContactData?: string;

  @IsOptional()
  @IsBoolean()
  indMain?: boolean;
}
