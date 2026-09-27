import { IsNumber, Min } from 'class-validator';

/** Ver el doc-comment de `ClaimsService.updateInvoicedAmount`. */
export class UpdateInvoicedAmountDto {
  @IsNumber()
  @Min(0)
  invoicedAmount!: number;
}
