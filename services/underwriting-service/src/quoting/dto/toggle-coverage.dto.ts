import { IsBoolean } from 'class-validator';

export class ToggleCoverageDto {
  @IsBoolean()
  selected!: boolean;
}
