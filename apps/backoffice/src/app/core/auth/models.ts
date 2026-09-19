/** Mismo shape que `JwtPayload` de `@ars-platform/shared-common` (ver services/iam-service). */
export interface JwtPayload {
  /** IdeUser (UUID) */
  sub: string;
  /** CodUser */
  code: string;
  /** CodRol */
  role: string;
  lang?: string;
  exp?: number;
  iat?: number;
}

export interface LoginResult {
  token: string;
  codUser: string;
  userData: unknown;
}

export interface TwoFactorRequiredResult {
  requiresTwoFactor: true;
  twoFactorToken: string;
}

export type LoginResponse = LoginResult | TwoFactorRequiredResult;

export function isTwoFactorRequired(res: LoginResponse): res is TwoFactorRequiredResult {
  return (res as TwoFactorRequiredResult).requiresTwoFactor === true;
}
