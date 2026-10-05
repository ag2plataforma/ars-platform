import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PublicLinkStatus = 'ENVIADO' | 'ABIERTO' | 'CONSENTIDO' | 'PAGADO' | 'VENCIDO' | 'CANCELADO';

export interface PublicConsent {
  ideConsent: string;
  title: string;
  text: string | null;
  url: string | null;
  mandatory: boolean;
  accepted: boolean;
}

/** Respuesta de `GET public/payments/links/:token`. Si el enlace ya no está
 *  activo (pagado/vencido/cancelado) solo vienen `status`, `expiresAt` y
 *  `numContract`. */
export interface PublicPaymentView {
  status: PublicLinkStatus;
  expiresAt: string;
  numContract: string;
  contract?: {
    desProduct: string;
    tstInitial: string;
    tstEnd: string | null;
    desPayer: string | null;
    numFraction: number;
  };
  payment?: { amount: number; currency: string; symbol: string };
  consents?: PublicConsent[];
  canPay?: boolean;
}

export interface SandboxPaymentInfo {
  amount: number;
  currency: string;
  status: string;
  numContract: string;
}

/**
 * Cliente de los endpoints PÚBLICOS de cobranza (sin JWT) que el gateway expone
 * en `/underwriting/public/payments/...`: landing de pago del tomador y página
 * de pago simulada (`PAYMENT_PROVIDER=sandbox`).
 */
@Injectable({ providedIn: 'root' })
export class PublicPaymentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/underwriting/public/payments`;

  getView(token: string): Observable<PublicPaymentView> {
    return this.http.get<PublicPaymentView>(`${this.base}/links/${encodeURIComponent(token)}`);
  }

  acceptConsents(token: string, ideConsents: string[]): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.base}/links/${encodeURIComponent(token)}/consents`, { ideConsents });
  }

  checkout(token: string): Observable<{ redirectUrl: string }> {
    return this.http.post<{ redirectUrl: string }>(`${this.base}/links/${encodeURIComponent(token)}/checkout`, {});
  }

  sandboxInfo(externalId: string): Observable<SandboxPaymentInfo> {
    return this.http.get<SandboxPaymentInfo>(`${this.base}/sandbox/${encodeURIComponent(externalId)}`);
  }

  sandboxWebhook(externalId: string, outcome: 'PAID' | 'FAILED'): Observable<unknown> {
    return this.http.post(`${this.base}/webhook/sandbox`, { externalId, outcome });
  }
}
