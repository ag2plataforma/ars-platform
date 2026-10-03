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

  /** Pedido explícito del usuario (2026-09-27): antes solo miraba que
   *  hubiera un token guardado, sin fijarse si ya venció (`exp`, en
   *  segundos epoch) -- así que un token vencido dejaba pasar el
   *  `authGuard` igual y recién fallaba (sin redirigir a ningún lado) en
   *  el primer request real que hiciera esa pantalla. Ahora un token
   *  vencido cuenta como no autenticado, así que `authGuard` redirige al
   *  login al navegar. Para el caso de que venza a mitad de sesión
   *  (usuario ya en una pantalla, sin navegar) ver `authInterceptor`,
   *  que fuerza el mismo `logout()` ante cualquier 401 del backend. */
  readonly isAuthenticated = computed(() => {
    const payload = this.payload();
    if (!payload) return false;
    if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) return false;
    return true;
  });

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
