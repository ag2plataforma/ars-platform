import { IsOptional, IsString } from 'class-validator';

export class ListProductEndorsementsDto {
  @IsOptional()
  @IsString()
  codProduct?: string;
}
