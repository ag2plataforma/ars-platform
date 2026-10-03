import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** Códigos de estado en MAYÚSCULAS: `StateRuleRepository.findStateByCode`
 *  busca con `toUpperCase()`, así que un código con minúsculas nunca se
 *  podría resolver por código desde el código de negocio. */
export class CreateStateDto {
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: 'codState solo puede tener MAYÚSCULAS, números y guion bajo' })
  @MaxLength(30)
  codState!: string;

  @IsString()
  @MaxLength(200)
  desState!: string;
}

/** El código de un estado NO se edita: el código de negocio lo busca por
 *  código (`getStateByCode('ACTIVO')`), renombrarlo rompería esas llamadas. */
export class UpdateStateDto {
  @IsString()
  @MaxLength(200)
  desState!: string;
}

/** `CodEntity` es el nombre de la tabla/entidad que usa el código de negocio
 *  (`getNextState('TContract', ...)`) -- literal, respeta mayúsculas. */
export class CreateEntityDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'codEntity solo puede tener letras, números y guion bajo' })
  @MaxLength(30)
  codEntity!: string;

  @IsString()
  @MaxLength(200)
  desEntity!: string;
}

export class UpdateEntityDto {
  @IsString()
  @MaxLength(200)
  desEntity!: string;
}

export class CreateRuleDto {
  @IsUUID()
  ideEntity!: string;

  @IsUUID()
  ideStateFrom!: string;

  @IsUUID()
  ideStateTo!: string;

  /** Código operativo EXACTO que usa el código de negocio (distingue
   *  mayúsculas: `Activar` ≠ `ACTIVAR`). Opcional solo para la regla
   *  inicial (sin transición). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  desOperativeCode?: string;

  @IsBoolean()
  indInitialState!: boolean;
}

export class UpdateRuleDto {
  @IsUUID()
  ideStateFrom!: string;

  @IsUUID()
  ideStateTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  desOperativeCode?: string;

  @IsBoolean()
  indInitialState!: boolean;
}
