import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { FormsModule } from '@angular/forms';
import { PublicPaymentService, PublicPaymentView } from './public-payment.service';

/**
 * Landing PÚBLICA de pago (`/pago/:token`): el tomador llega desde el correo,
 * ve el resumen de su contrato y el importe del primer recibo, acepta los
 * consentimientos configurados para el producto y, con los obligatorios
 * marcados, pulsa "Ir a pagar" (se registran los consentimientos con sus
 * evidencias y se crea la sesión en la pasarela). La activación del contrato
 * NO ocurre aquí: la dispara el webhook de la pasarela.
 *
 * Diseño visual mínimo a propósito (el diseño final está en el roadmap).
 */
@Component({
  selector: 'app-payment-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CheckboxModule, MessageModule, ProgressSpinnerModule, TranslocoPipe],
  templateUrl: './payment-landing.component.html',
})
export class PaymentLandingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicPaymentService);

  private token = '';
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly notFound = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** `?checkout=success|cancel`: así vuelve la pasarela (Stripe) a la landing. */
  readonly checkoutResult = signal<'success' | 'cancel' | null>(null);
  readonly view = signal<PublicPaymentView | null>(null);
  /** Consentimientos tildados en pantalla (ideConsent -> bool). */
  readonly checked = signal<Record<string, boolean>>({});

  readonly isActive = computed(() => {
    const v = this.view();
    return !!v && !!v.consents && ['ENVIADO', 'ABIERTO', 'CONSENTIDO'].includes(v.status);
  });

  readonly canPay = computed(() => {
    const v = this.view();
    if (!v?.consents) return false;
    const state = this.checked();
    return v.consents.filter((c) => c.mandatory).every((c) => state[c.ideConsent]);
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    const result = this.route.snapshot.queryParamMap.get('checkout');
    this.checkoutResult.set(result === 'success' || result === 'cancel' ? result : null);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getView(this.token).subscribe({
      next: (v) => {
        this.view.set(v);
        const state: Record<string, boolean> = {};
        for (const c of v.consents ?? []) state[c.ideConsent] = c.accepted;
        this.checked.set(state);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 404) this.notFound.set(true);
        else this.errorMessage.set(this.messageOf(err));
      },
    });
  }

  toggle(ideConsent: string, value: boolean): void {
    this.checked.update((s) => ({ ...s, [ideConsent]: value }));
  }

  pay(): void {
    const v = this.view();
    if (!v?.consents || !this.canPay() || this.submitting()) return;
    const accepted = v.consents.filter((c) => this.checked()[c.ideConsent]).map((c) => c.ideConsent);
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.api.acceptConsents(this.token, accepted).subscribe({
      next: () =>
        this.api.checkout(this.token).subscribe({
          next: ({ redirectUrl }) => {
            window.location.href = redirectUrl;
          },
          error: (err: HttpErrorResponse) => this.fail(err),
        }),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  private fail(err: HttpErrorResponse): void {
    this.submitting.set(false);
    this.errorMessage.set(this.messageOf(err));
  }

  private messageOf(err: HttpErrorResponse): string {
    const m = err.error?.message;
    return Array.isArray(m) ? m.join(', ') : (m ?? err.message);
  }
}
