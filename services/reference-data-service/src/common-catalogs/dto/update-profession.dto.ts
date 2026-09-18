import { IsOptional, IsString } from 'class-validator';

export class UpdateProfessionDto {
  @IsOptional()
  @IsString()
  desProfession?: string;
}
