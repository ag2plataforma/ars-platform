/**
 * Forma del contenido del JWT emitido por iam-service (único servicio con
 * acceso de escritura a credenciales) y verificado por todos los demás.
 *
 * Equivalente al `UserProfile` que el sistema v1 (LoopBack) construía en
 * `UserSecurityService.convertToUserProfile` — mismos campos (`code`,
 * `role`, `lang`), pero `sub` en vez de `[securityId]` (estándar JWT).
 */
export interface JwtPayload {
  /** IdeUser (UUID) */
  sub: string;
  /** CodUser */
  code: string;
  /** CodRol */
  role: string;
  lang?: string;
}
