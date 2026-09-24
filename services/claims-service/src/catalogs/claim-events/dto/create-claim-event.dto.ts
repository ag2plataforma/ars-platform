import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

/** Ver el doc-comment de `ClaimEventsService`. `codClaimType` obligatorio -- `SClaimEvent.IdeClaimType` es NOT NULL (un evento siempre pertenece a un tipo de siniestro). */
export class CreateClaimEventDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codClaimEvent solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codClaimEvent!: string;

  @IsString()
  desClaimEvent!: string;

  /** CodClaimType del tipo de siniestro al que pertenece este evento (debe existir). */
  @IsString()
  codClaimType!: string;

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
