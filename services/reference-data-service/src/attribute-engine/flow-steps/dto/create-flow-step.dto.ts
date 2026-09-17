import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateFlowStepDto {
  /** CodProcessFlow del flujo al que pertenece este paso (debe existir). */
  @IsString()
  codProcessFlow!: string;

  @IsBoolean()
  indInitialStep!: boolean;

  /** CodStep del paso actual (debe existir). */
  @IsString()
  codStepCurrent!: string;

  /** Resultado que dispara esta transición (true = OK, false = no-OK). */
  @IsBoolean()
  indResultOK!: boolean;

  /** CodStep del paso siguiente cuando ocurre este resultado (debe existir). */
  @IsString()
  codStepForward!: string;

  /** CodScreen de la pantalla a mostrar en este paso (debe existir). */
  @IsString()
  codScreen!: string;

  @IsOptional()
  @IsString()
  flowStepContent?: string;
}
