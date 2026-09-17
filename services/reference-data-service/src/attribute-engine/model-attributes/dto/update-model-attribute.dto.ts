import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateModelAttributeDto {
  @IsOptional()
  @IsString()
  desModelAttribute?: string;

  @IsOptional()
  @IsString()
  codEntityApply?: string;

  @IsOptional()
  @IsString()
  codEntityReference?: string;

  /** Pasar string vacío no está soportado -- para limpiarlo, usar null explícito no es posible vía JSON; se deja tal cual si no se manda. */
  @IsOptional()
  @IsUUID()
  ideFlowStep?: string;

  @IsOptional()
  @IsUUID()
  ideReference?: string;
}
