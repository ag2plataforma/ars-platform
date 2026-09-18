import { IsOptional, IsString } from 'class-validator';

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  desLocation?: string;

  /** '' desasocia el padre; un código real lo resuelve; no enviado deja el campo intacto. */
  @IsOptional()
  @IsString()
  codLocationParent?: string;
}
