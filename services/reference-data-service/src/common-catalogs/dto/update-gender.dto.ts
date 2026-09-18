import { IsOptional, IsString } from 'class-validator';

export class UpdateGenderDto {
  @IsOptional()
  @IsString()
  desGender?: string;
}
