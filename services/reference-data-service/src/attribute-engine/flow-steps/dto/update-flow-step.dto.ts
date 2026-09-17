import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * No se permite cambiar `codProcessFlow`/`codStepCurrent`/`indResultOK`
 * en un update -- son parte de la identidad de la fila
 * (`@@unique([IdeProcessFlow, IdeStepCurrent, IndResultOK, IdeStepForward])`
 * en el schema real); para eso, borrar y crear de nuevo.
 */
export class UpdateFlowStepDto {
  @IsOptional()
  @IsBoolean()
  indInitialStep?: boolean;

  @IsOptional()
  @IsString()
  codStepForward?: string;

  @IsOptional()
  @IsString()
  codScreen?: string;

  @IsOptional()
  @IsString()
  flowStepContent?: string;
}
