import { IsString, Matches } from 'class-validator';

export class CreateDeductibleTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'codDeductibleType solo puede tener letras, números, puntos, guiones y guion bajo',
  })
  codDeductibleType!: string;

  @IsString()
  desDeductibleType!: string;
}
