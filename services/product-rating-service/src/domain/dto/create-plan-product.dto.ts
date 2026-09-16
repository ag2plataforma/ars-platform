import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePlanProductDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codPlanProduct solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codPlanProduct!: string;

  @IsString()
  desPlanProduct!: string;

  @IsOptional()
  @IsString()
  desShort?: string;

  @IsOptional()
  @IsString()
  desLarge?: string;

  /** CodProduct del producto al que pertenece (debe existir). */
  @IsString()
  codProduct!: string;

  @IsDateString()
  tstInitial!: string;

  @IsOptional()
  @IsDateString()
  tstEnd?: string;
}
