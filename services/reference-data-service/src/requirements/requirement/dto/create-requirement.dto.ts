import { IsString, Matches } from 'class-validator';

export class CreateRequirementDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codRequirement solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codRequirement!: string;

  @IsString()
  desRequirement!: string;
}
