import { IsString, Matches } from 'class-validator';

export class CreateDistributionWayDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codDistributionWay solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codDistributionWay!: string;

  @IsString()
  desDistributionWay!: string;
}
