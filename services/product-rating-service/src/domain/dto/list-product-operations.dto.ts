import { IsOptional, IsString } from 'class-validator';

export class ListProductOperationsDto {
  @IsOptional()
  @IsString()
  codProduct?: string;
}
