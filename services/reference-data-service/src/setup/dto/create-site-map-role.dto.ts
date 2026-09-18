import { IsString } from 'class-validator';

export class CreateSiteMapRoleDto {
  @IsString()
  codSiteMap!: string;

  @IsString()
  codApplicationRole!: string;
}
