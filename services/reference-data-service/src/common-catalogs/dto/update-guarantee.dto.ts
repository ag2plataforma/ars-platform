import { IsOptional, IsString } from 'class-validator';

export class UpdateGuaranteeDto {
  @IsOptional()
  @IsString()
  desGuarantee?: string;
}
