import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { decodeJwtPayload } from './jwt.util';
import { isTwoFactorRequired, JwtPayload, LoginResponse, LoginResult } from './models';

const TOKEN_KEY = 'ars.backoffice.token';

/**
 * Login de dos pasos contra `iam-service` (vía el gateway real, ver
 * services/gateway). Si `POST /iam/auth/login` devuelve
 * `requiresTwoFactor: true`, hay que completar con
 * `POST /iam/auth/2fa/verify` antes de tener un token utilizable -- mismo
 * contrato que `AuthService`/`TwoFactorService` del backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  readonly payload = computed<JwtPayload | null>(() => {
    const token = this.tokenSignal();
    return token ? decodeJwtPayload(token) : null;
  });

  readonly isAuthenticated = computed(() => this.payload() !== null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  get token(): string | null {
    return this.tokenSignal();
  }

  async login(
    userName: string,
    password: string,
  ): Promise<{ requiresTwoFactor: boolean; twoFactorToken?: string }> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/iam/auth/login`, { userName, password }),
    );
    if (isTwoFactorRequired(res)) {
      return { requiresTwoFactor: true, twoFactorToken: res.twoFactorToken };
    }
    this.setSession(res);
    return { requiresTwoFactor: false };
  }

  async verifyTwoFactor(twoFactorToken: string, code: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResult>(`${environment.apiUrl}/iam/auth/2fa/verify`, { twoFactorToken, code }),
    );
    this.setSession(res);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.tokenSignal.set(null);
    void this.router.navigateByUrl('/login');
  }

  private setSession(result: LoginResult): void {
    localStorage.setItem(TOKEN_KEY, result.token);
    this.tokenSignal.set(result.token);
  }
}
