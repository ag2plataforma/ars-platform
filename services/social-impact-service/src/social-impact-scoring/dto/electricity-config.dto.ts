import { IsString } from 'class-validator';

export class ElectricityConfigDto {
  @IsString()
  defaultCountry!: string;
}
