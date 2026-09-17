import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateScreenDto {
  @IsOptional()
  @IsString()
  desScreen?: string;

  @IsOptional()
  @IsObject()
  screenContent?: Record<string, unknown>;
}
