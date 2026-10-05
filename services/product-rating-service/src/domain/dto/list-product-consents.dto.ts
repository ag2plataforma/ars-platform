import { IsOptional, IsString } from 'class-validator';

export class ListProductConsentsDto {
  @IsOptional()
  @IsString()
  codProduct?: string;
}
