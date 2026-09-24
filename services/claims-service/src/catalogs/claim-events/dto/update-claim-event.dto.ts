import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateClaimEventDto {
  @IsOptional()
  @IsString()
  desClaimEvent?: string;

  @IsOptional()
  @IsString()
  codClaimType?: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
