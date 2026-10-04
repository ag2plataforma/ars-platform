import { Component, OnInit, inject, input, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PaymentFractionOption, PaymentFractionOptions, QuotingService } from './quoting.service';

/**
 * Selector de la forma de pago (fracción) al contratar. Lista las fracciones
 * vigentes del producto (`SProductPaymentFraction`) con el importe de cada
 * cuota y el total (recargo incluido), y deja elegida por defecto la de
 * menor orden -- la misma que el backend usaría si no se enviara ninguna.
 *
 * `selected` es un `model`: el padre lo enlaza con `[(selected)]` y lo manda
 * como `codPaymentFraction` al generar el contrato.
 */
@Component({
  selector: 'app-payment-fraction-picker',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './payment-fraction-picker.component.html',
})
export class PaymentFractionPickerComponent implements OnInit {
  readonly ideQuote = input.required<string>();
  /** Código (`CodPaymentFraction`) de la fracción elegida. */
  readonly selected = model<string>('');
  /** Solo lectura (contrato ya generado). */
  readonly readonly = input(false);

  private readonly quoting = inject(QuotingService);
  private readonly transloco = inject(TranslocoService);

  readonly data = signal<PaymentFractionOptions | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  ngOnInit(): void {
    this.quoting.listPaymentFractionOptions(this.ideQuote()).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
        const current = result.options.find((o) => o.codPaymentFraction === this.selected());
        if (!current) {
          const fallback = result.options.find((o) => o.isDefault) ?? result.options[0];
          this.selected.set(fallback?.codPaymentFraction ?? '');
        }
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  choose(option: PaymentFractionOption): void {
    if (this.readonly()) return;
    this.selected.set(option.codPaymentFraction);
  }

  money(value: number): string {
    return `${this.data()?.symbolCurrency ?? ''}${value.toFixed(2)}`;
  }

  detail(option: PaymentFractionOption): string {
    const amount = this.money(option.installmentPrime);
    return option.numFraction === 1
      ? this.transloco.translate('paymentFraction.single', { amount })
      : this.transloco.translate('paymentFraction.installments', { n: option.numFraction, amount });
  }
}
