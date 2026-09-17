import { IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateScreenDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codScreen solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codScreen!: string;

  @IsString()
  desScreen!: string;

  /**
   * Contenido real de la pantalla (JSON libre, ej. `{"screen":"personal-data"}`
   * en los datos reales investigados) -- lo consume el frontend del
   * wizard de cotización para saber qué pantalla renderizar en este paso.
   * A diferencia de `SAttribute`/`SAttributeProperty`, acá la columna
   * real (`ScreenContent`) ya es `json` en Postgres, no texto.
   */
  @IsOptional()
  @IsObject()
  screenContent?: Record<string, unknown>;
}
