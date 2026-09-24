import { IsString } from 'class-validator';

export class SetCatalogStateDto {
  @IsString()
  codState!: string;
}
