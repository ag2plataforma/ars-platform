import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/**
 * Body de `PATCH /background-jobs/:codJob/config` -- horario "simple"
 * acordado con el usuario (hora del día, no una expresión cron
 * completa), igual para cualquier job genérico.
 */
export class UpdateBackgroundJobConfigDto {
  @IsBoolean()
  indActive!: boolean;

  @IsInt()
  @Min(0)
  @Max(23)
  numHour!: number;

  @IsInt()
  @Min(0)
  @Max(59)
  numMinute!: number;
}
