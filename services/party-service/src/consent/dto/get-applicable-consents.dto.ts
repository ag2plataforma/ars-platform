import { IsString } from 'class-validator';

export class GetApplicableConsentsDto {
  @IsString()
  codProduct!: string;
}
