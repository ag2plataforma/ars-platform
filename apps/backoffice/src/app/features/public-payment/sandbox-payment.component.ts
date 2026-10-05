import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PublicPaymentService, SandboxPaymentInfo } from './public-payment.service';

/**
 * Pasarela SIMULADA (`/pago/sandbox/:externalId`, solo con
 * `PAYMENT_PROVIDER=sandbox`): reemplaza a la página de Stripe para poder
 * probar el flujo completo. "Pago correcto/fallido" envía el mismo webhook
 * que enviaría la pasarela real y luego vuelve a la landing (`?return=`).
 */
@Component({
  selector: 'app-sandbox-payment',
  standalone: true,
  imports: [CommonModule, ButtonModule, MessageModule, TranslocoPipe],
  templateUrl: './sandbox-payment.component.html',
})
export class SandboxPaymentComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicPaymentService);

  private externalId = '';
  private returnUrl: string | null = null;
  readonly info = signal<SandboxPaymentInfo | null>(null);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.externalId = this.route.snapshot.paramMap.get('externalId') ?? '';
    this.returnUrl = this.route.snapshot.queryParamMap.get('return');
    this.api.sandboxInfo(this.externalId).subscribe({
      next: (i) => this.info.set(i),
      error: (err: HttpErrorResponse) => this.errorMessage.set(err.error?.message ?? err.message),
    });
  }

  resolve(outcome: 'PAID' | 'FAILED'): void {
    this.submitting.set(true);
    this.api.sandboxWebhook(this.externalId, outcome).subscribe({
      next: () => this.goBack(),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? err.message);
      },
    });
  }

  goBack(): void {
    // Solo vuelve a URLs http(s) (el valor llega por query string).
    if (this.returnUrl && /^https?:\/\//i.test(this.returnUrl)) window.location.href = this.returnUrl;
    else window.history.back();
  }
}
