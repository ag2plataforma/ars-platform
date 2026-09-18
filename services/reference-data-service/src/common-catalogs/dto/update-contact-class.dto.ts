import { IsOptional, IsString } from 'class-validator';

export class UpdateContactClassDto {
  @IsOptional()
  @IsString()
  desContactClass?: string;
}
