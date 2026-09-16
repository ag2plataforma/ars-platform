import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint (o un controller completo) a uno o más `CodRol`.
 * Requiere que `RolesGuard` esté activo (lo registra `AuthModule` junto
 * con `JwtAuthGuard`) y que el request ya esté autenticado — se apoya en
 * `req.user.role`, poblado por `JwtStrategy`.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
