import { IsOptional, IsString } from 'class-validator';

export class UpdateRelationshipDto {
  @IsOptional()
  @IsString()
  desRelationship?: string;
}
