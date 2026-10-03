import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Pedido explícito del usuario (2026-09-27): si el token vence MIENTRAS
 * el usuario ya está en una pantalla (no navegando -- eso ya lo cubre
 * `AuthService.isAuthenticated`/`authGuard`), el primer request que el
 * backend rechace con 401 ahora fuerza el mismo `logout()` que el botón
 * de salir (limpia el token guardado y redirige a `/login`), en vez de
 * dejar el error sin manejar en la pantalla que lo disparó.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  if (!token) return next(req);
  const authorizedReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(authorizedReq).pipe(
    catchError((err: unknown) => {
      // Solo dispara logout automático en requests que SÍ llevaban token
      // -- así un 401 de `POST /iam/auth/login` (contraseña incorrecta,
      // sin ningún token todavía) no dispara un logout de mentira; ese
      // caso lo sigue manejando `login.component.ts` como siempre.
      if (err instanceof HttpErrorResponse && err.status === 401) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
