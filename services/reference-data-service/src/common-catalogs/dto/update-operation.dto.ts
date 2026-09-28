import { IsOptional, IsString } from 'class-validator';

export class UpdateOperationDto {
  @IsOptional()
  @IsString()
  desOperation?: string;
}
