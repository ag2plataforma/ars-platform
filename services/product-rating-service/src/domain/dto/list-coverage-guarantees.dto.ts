import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListCoverageGuaranteesDto {
  @IsOptional()
  @IsUUID()
  ideCoveragePlan?: string;

  @IsOptional()
  @IsString()
  codGuarantee?: string;
}
