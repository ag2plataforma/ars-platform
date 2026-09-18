import { IsOptional, IsString } from 'class-validator';

export class ListSiteMapRolesDto {
  @IsOptional()
  @IsString()
  codSiteMap?: string;

  @IsOptional()
  @IsString()
  codApplicationRole?: string;
}
